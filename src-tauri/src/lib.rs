// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg(target_os = "macos")]
thread_local! {
    /// Main-thread-only storage for the non-interactive snapshot window used during card-count
    /// geometry transitions. Keeping it independent from the game window is important: AppKit
    /// automatically moves child windows with their parent, which would recreate the defect.
    static WINDOW_TRANSITION_OVERLAY: std::cell::RefCell<
        Option<objc2::rc::Retained<objc2_app_kit::NSWindow>>
    > = const { std::cell::RefCell::new(None) };
}

#[cfg(target_os = "macos")]
fn close_window_transition_overlay() {
    WINDOW_TRANSITION_OVERLAY.with_borrow_mut(|slot| {
        if let Some(overlay) = slot.take() {
            overlay.close();
        }
    });
}

/// Captures the already-painted WKWebView into a click-through window at its current screen
/// position. The real game window can then move and grow underneath without exposing macOS's
/// one-frame reuse of the old WebView backing texture.
#[tauri::command]
async fn begin_window_transition(window: tauri::WebviewWindow) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        use block2::RcBlock;
        use futures_channel::oneshot;
        use objc2::{MainThreadMarker, MainThreadOnly};
        use objc2_app_kit::{
            NSBackingStoreType, NSColor, NSImage, NSImageScaling, NSImageView, NSWindow,
            NSWindowStyleMask,
        };
        use objc2_foundation::{NSError, NSPoint, NSRect};
        use objc2_web_kit::{WKSnapshotConfiguration, WKWebView};
        use std::sync::{Arc, Mutex};

        let (sender, receiver) = oneshot::channel::<Result<(), String>>();
        let sender = Arc::new(Mutex::new(Some(sender)));
        window
            .with_webview(move |webview| unsafe {
                close_window_transition_overlay();

                let mtm = MainThreadMarker::new_unchecked();
                let main_window: *mut NSWindow = webview.ns_window().cast();
                let ns_window: &NSWindow = &*main_window;
                let web_view: &WKWebView = &*webview.inner().cast();
                let frame = ns_window.frame();
                let level = ns_window.level();
                let configuration = WKSnapshotConfiguration::new(mtm);
                // Capture exactly what is already on screen. Waiting for pending screen updates
                // could accidentally capture the post-resize layout this cover is meant to hide.
                configuration.setAfterScreenUpdates(false);

                let completion: RcBlock<dyn Fn(*mut NSImage, *mut NSError)> = RcBlock::new({
                    let sender = Arc::clone(&sender);
                    move |image: *mut NSImage, _error: *mut NSError| {
                        let result = if image.is_null() {
                            Err("WKWebView returned no transition snapshot".to_string())
                        } else {
                            let mtm = MainThreadMarker::new_unchecked();
                            let overlay = NSWindow::initWithContentRect_styleMask_backing_defer(
                                NSWindow::alloc(mtm),
                                frame,
                                NSWindowStyleMask::Borderless,
                                NSBackingStoreType::Buffered,
                                false,
                            );
                            overlay.setReleasedWhenClosed(false);
                            overlay.setOpaque(false);
                            overlay.setBackgroundColor(Some(&NSColor::clearColor()));
                            overlay.setHasShadow(false);
                            overlay.setIgnoresMouseEvents(true);
                            overlay.setLevel(level + 1);

                            let image_view = NSImageView::imageViewWithImage(&*image, mtm);
                            image_view.setFrame(NSRect::new(NSPoint::new(0.0, 0.0), frame.size));
                            image_view.setImageScaling(NSImageScaling::ScaleAxesIndependently);
                            overlay.setContentView(Some(&image_view));
                            overlay.orderFrontRegardless();

                            // The snapshot contains transparency, so leaving the resized game
                            // window visible underneath exposes both surfaces: a duplicate card on
                            // expansion and black/stale WebView regions on contraction. Hide the
                            // real window until `end_window_transition` swaps the two surfaces in
                            // one AppKit turn.
                            (&*main_window).setAlphaValue(0.0);

                            WINDOW_TRANSITION_OVERLAY.with_borrow_mut(|slot| {
                                *slot = Some(overlay);
                            });
                            Ok(())
                        };
                        if let Some(sender) = sender.lock().expect("snapshot sender poisoned").take()
                        {
                            let _ = sender.send(result);
                        }
                    }
                });
                web_view.takeSnapshotWithConfiguration_completionHandler(
                    Some(&configuration),
                    &completion,
                );
            })
            .map_err(|error| error.to_string())?;

        return receiver
            .await
            .map_err(|_| "WKWebView snapshot callback was cancelled".to_string())?;
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = window;
        Ok(())
    }
}

/// Removes the temporary transition cover after the frontend confirms the final layout painted.
#[tauri::command]
fn end_window_transition(window: tauri::WebviewWindow) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        window
            .with_webview(|webview| unsafe {
                let ns_window: &objc2_app_kit::NSWindow = &*webview.ns_window().cast();
                ns_window.setAlphaValue(1.0);
                close_window_transition_overlay();
            })
            .map_err(|error| error.to_string())?;
    }
    #[cfg(not(target_os = "macos"))]
    let _ = window;
    Ok(())
}

#[cfg(target_os = "macos")]
const REDRAW_VIEWS_DURING_FRAME_CHANGE: bool = false;

#[cfg(target_os = "macos")]
fn appkit_frame_from_tauri(
    current_native: objc2_foundation::NSRect,
    current_tauri_x: f64,
    current_tauri_y: f64,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> objc2_foundation::NSRect {
    use objc2_foundation::{NSPoint, NSRect, NSSize};

    NSRect::new(
        NSPoint::new(
            current_native.origin.x + (x - current_tauri_x),
            current_native.origin.y + current_native.size.height
                - (y - current_tauri_y)
                - height,
        ),
        NSSize::new(width, height),
    )
}

/// Applies position and size as one native frame mutation. Separate frontend `setPosition` and
/// `setSize` IPC calls can be composited independently, exposing a one-frame intermediate window
/// during 1 -> 2 card expansion.
#[tauri::command]
fn set_window_frame(
    window: tauri::WebviewWindow,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        use objc2_app_kit::NSWindow;

        let scale_factor = window.scale_factor().map_err(|error| error.to_string())?;
        let current_tauri = window
            .outer_position()
            .map_err(|error| error.to_string())?
            .to_logical::<f64>(scale_factor);

        window
            .with_webview(move |webview| unsafe {
                let ns_window: &NSWindow = &*webview.ns_window().cast();
                let current_native = ns_window.frame();
                // Tauri reports a top-left origin; AppKit uses a bottom-left origin. Deriving the
                // target from the current frame's top edge avoids assumptions about which monitor
                // owns the window or where that monitor sits in the global coordinate space.
                let target_native = appkit_frame_from_tauri(
                    current_native,
                    current_tauri.x,
                    current_tauri.y,
                    x,
                    y,
                    width,
                    height,
                );
                // `display: true` immediately sends `displayIfNeeded` through the old WebView
                // hierarchy. During 1 -> 2 expansion that presents the one-card backing texture
                // at the expanded window's new origin for one frame. WebKit invalidates and draws
                // naturally when its viewport catches up; do not force the stale surface here.
                ns_window.setFrame_display(target_native, REDRAW_VIEWS_DURING_FRAME_CHANGE);
            })
            .map_err(|error| error.to_string())?;
        return Ok(());
    }

    #[cfg(not(target_os = "macos"))]
    {
        use tauri::{LogicalPosition, LogicalSize};

        // Other platforms keep a single frontend IPC seam. Their window APIs do not expose an
        // AppKit-equivalent atomic frame setter through Tauri today.
        window
            .set_position(LogicalPosition::new(x, y))
            .map_err(|error| error.to_string())?;
        window
            .set_size(LogicalSize::new(width, height))
            .map_err(|error| error.to_string())?;
        Ok(())
    }
}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    use super::{appkit_frame_from_tauri, REDRAW_VIEWS_DURING_FRAME_CHANGE};
    use objc2_foundation::{NSPoint, NSRect, NSSize};

    #[test]
    fn atomic_frame_keeps_the_top_edge_fixed_when_expanding_around_the_compact_widget() {
        let current = NSRect::new(NSPoint::new(100.0, 400.0), NSSize::new(320.0, 220.0));
        let target = appkit_frame_from_tauri(current, 100.0, 100.0, -44.0, 100.0, 608.0, 828.0);

        assert_eq!(target.origin.x, -44.0);
        assert_eq!(target.origin.y, -208.0);
        assert_eq!(target.size.width, 608.0);
        assert_eq!(target.size.height, 828.0);
        assert_eq!(target.origin.y + target.size.height, 620.0);
    }

    #[test]
    fn atomic_frame_converts_a_downward_tauri_move_to_a_lower_appkit_top_edge() {
        let current = NSRect::new(NSPoint::new(40.0, 300.0), NSSize::new(320.0, 220.0));
        let target = appkit_frame_from_tauri(current, 40.0, 80.0, 70.0, 110.0, 320.0, 220.0);

        assert_eq!(target.origin.x, 70.0);
        assert_eq!(target.origin.y, 270.0);
    }

    #[test]
    fn frame_change_does_not_force_the_old_webview_backing_texture_to_redraw() {
        assert!(!REDRAW_VIEWS_DURING_FRAME_CHANGE);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        // Persists window position/size across launches (#66). Restores geometry on window
        // creation, before the frontend loads — including a possibly-stale width from whichever
        // side panels were open at last close. The frontend (src/main.ts's WindowChrome adapter,
        // via src/ui/app.ts's boot-time `syncPanels()`) recomputes width from the persisted panel
        // state right after mount and overrides it, so the app — not this plugin — owns width;
        // only x/y position is left as this plugin restored it (aside from the panel x-shift).
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            greet,
            begin_window_transition,
            set_window_frame,
            end_window_transition
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
