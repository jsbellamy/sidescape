import type { PhysicalPosition, PhysicalSize } from "@tauri-apps/api/dpi";
import { invoke } from "@tauri-apps/api/core";
import { currentMonitor, getCurrentWindow, type Monitor } from "@tauri-apps/api/window";
import type { WorkspaceChrome } from "./workspace-chrome";
import {
  CARD_H,
  COMPACT_H,
  COMPACT_W,
  DEFAULT_UI_SCALE,
  scaleFitsMonitorHeight,
  UI_SCALE_KEY,
  UI_SCALES,
  type UiScale,
  workspaceCapacity,
  workspaceRect,
} from "./window-geometry";

export function isUiScale(value: unknown): value is UiScale {
  return UI_SCALES.some((scale) => scale === value);
}

export function loadUiScale(): UiScale {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(UI_SCALE_KEY) ?? "null");
    return isUiScale(value) ? value : DEFAULT_UI_SCALE;
  } catch {
    return DEFAULT_UI_SCALE;
  }
}

export function saveUiScale(scale: UiScale): void {
  try {
    localStorage.setItem(UI_SCALE_KEY, JSON.stringify(scale));
  } catch {
    /* optional preference */
  }
}

export interface NativeWindowPort {
  scaleFactor(): Promise<number>;
  outerPosition(): Promise<PhysicalPosition>;
  outerSize(): Promise<PhysicalSize>;
  currentMonitor(): Promise<Monitor | null>;
  beginTransition(): Promise<void>;
  setFrame(frame: { x: number; y: number; width: number; height: number }): Promise<void>;
  endTransition(): Promise<void>;
}

/** The webview-side half of a native resize. Tauri's window mutation Promise confirms that the
 * IPC command finished, but the webview can receive its new viewport and perform layout later.
 * Keeping this as a port makes that second boundary deterministic in tests. */
export interface WebviewLayoutPort {
  viewportSize(): { width: number; height: number };
  nextFrame(): Promise<void>;
}

export function tauriNativeWindowPort(): NativeWindowPort {
  return {
    scaleFactor: () => getCurrentWindow().scaleFactor(),
    outerPosition: () => getCurrentWindow().outerPosition(),
    outerSize: () => getCurrentWindow().outerSize(),
    currentMonitor: () => currentMonitor(),
    beginTransition: () => invoke("begin_window_transition"),
    setFrame: ({ x, y, width, height }) => invoke("set_window_frame", { x, y, width, height }),
    endTransition: () => invoke("end_window_transition"),
  };
}

export function browserWebviewLayoutPort(): WebviewLayoutPort {
  return {
    viewportSize: () => ({ width: window.innerWidth, height: window.innerHeight }),
    nextFrame: () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      }),
  };
}

export interface TauriWindowChrome extends WorkspaceChrome {
  present(): Promise<void>;
  settled(): Promise<void>;
}

export function createTauriWindowChrome(
  root: HTMLElement,
  port: NativeWindowPort = tauriNativeWindowPort(),
  layoutPort: WebviewLayoutPort = browserWebviewLayoutPort(),
): TauriWindowChrome {
  let cardCount = 0;
  let anchor: "top" | "bottom" | null = null;
  let scale = loadUiScale();
  let queue: Promise<void> = Promise.resolve();

  /** Wait until the webview reports the target logical viewport on two consecutive animation
   * frames. The first matching frame proves the resize reached the webview; the second gives CSS
   * layout one complete frame before callers reveal staged cards. A bounded fallback prevents an
   * unexpected platform metric mismatch from leaving the Management Row invisible forever. */
  async function waitForWebviewLayout(width: number, height: number): Promise<void> {
    const matches = () => {
      const viewport = layoutPort.viewportSize();
      return Math.abs(viewport.width - width) <= 1 && Math.abs(viewport.height - height) <= 1;
    };
    let consecutiveMatches = 0;
    for (let frame = 0; frame < 60; frame++) {
      await layoutPort.nextFrame();
      consecutiveMatches = matches() ? consecutiveMatches + 1 : 0;
      if (consecutiveMatches >= 2) return;
    }
    console.warn(`[window-chrome] webview did not settle at ${width}x${height} within 60 frames`);
  }

  const monitorRect = async () => {
    const monitor = await port.currentMonitor();
    return monitor
      ? {
          x: monitor.position.toLogical(monitor.scaleFactor).x,
          y: monitor.position.toLogical(monitor.scaleFactor).y,
          width: monitor.size.toLogical(monitor.scaleFactor).width,
          height: monitor.size.toLogical(monitor.scaleFactor).height,
        }
      : null;
  };

  async function apply(nextCardCount: number): Promise<void> {
    const factor = await port.scaleFactor();
    const position = (await port.outerPosition()).toLogical(factor);
    const size = (await port.outerSize()).toLogical(factor);
    const monitor = await monitorRect();
    const result = workspaceRect({
      current: { x: position.x, y: position.y, width: size.width, height: size.height },
      scale,
      wasCardCount: cardCount,
      cardCount: nextCardCount,
      anchor,
      monitor,
    });
    // A previous, superseded expansion can leave its cover alive until the next queued action.
    // Retiring it here also makes every non-expanding path self-cleaning.
    try {
      await port.endTransition();
    } catch (error) {
      console.error(error);
    }
    const preservesPaintedWorkspace = cardCount === 1 && nextCardCount === 2;
    if (preservesPaintedWorkspace) {
      // On macOS, WindowServer can present the old WKWebView backing texture at the new frame for
      // one compositor tick even though setFrame is atomic. Freeze the current one-card pixels at
      // their old screen position before moving the real window underneath them.
      try {
        await port.beginTransition();
      } catch (error) {
        // Snapshotting is a visual best-effort workaround. A capture failure must not prevent the
        // requested card from opening; the atomic native frame mutation remains the fallback.
        console.error(error);
      }
    }

    // #242 follow-up: position and size are one native frame mutation. Two Tauri window calls,
    // even dispatched back-to-back, still expose one compositor frame with only the first mutation
    // applied. That transient is visible on 1->2 because Character is already painted. The Rust
    // command uses AppKit's single setFrame call on macOS (and keeps the platform fallback behind
    // the same port), so JavaScript cannot create a position-only or size-only intermediate rect.
    await port.setFrame({ x: result.x, y: result.y, width: result.width, height: result.height });
    cardCount = nextCardCount;
    anchor = result.anchor;
    if (anchor) root.dataset["anchor"] = anchor;
    else delete root.dataset["anchor"];
    root.style.setProperty("--ui-scale", String(scale));
    root.style.setProperty("--compact-w", `${COMPACT_W}px`);
    root.style.setProperty("--compact-h", `${COMPACT_H}px`);
    root.style.setProperty("--card-h", `${CARD_H}px`);
    root.style.setProperty("--workspace-w", `${result.width / scale}px`);
    await waitForWebviewLayout(result.width, result.height);
  }

  return {
    async getCapacity() {
      try {
        const monitor = await monitorRect();
        return monitor ? workspaceCapacity(monitor.width, scale) : 2;
      } catch (error) {
        console.error(error);
        return 2;
      }
    },
    async getScaleOptions() {
      try {
        const monitor = await monitorRect();
        return UI_SCALES.map((value) => ({
          value,
          supported: !monitor || scaleFitsMonitorHeight(monitor.height, value),
        }));
      } catch {
        return UI_SCALES.map((value) => ({ value, supported: true }));
      }
    },
    getScale: () => scale,
    setScale(next) {
      if (!isUiScale(next)) return Promise.resolve();
      queue = queue
        .then(async () => {
          const monitor = await monitorRect();
          if (monitor && !scaleFitsMonitorHeight(monitor.height, next)) return;
          scale = next;
          saveUiScale(scale);
          await apply(cardCount);
        })
        .catch(console.error);
      return queue;
    },
    setCardCount(next) {
      queue = queue.then(() => apply(next)).catch(console.error);
      return queue;
    },
    present() {
      queue = queue
        .then(async () => {
          // `present()` is called immediately after the incoming card's DOM is revealed. Give
          // WebKit two complete paint opportunities before removing the native snapshot cover.
          await layoutPort.nextFrame();
          await layoutPort.nextFrame();
          await port.endTransition();
        })
        .catch(console.error);
      return queue;
    },
    settled: () => queue,
  };
}
