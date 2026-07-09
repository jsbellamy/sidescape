// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
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
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
