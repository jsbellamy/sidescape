import { LogicalPosition, LogicalSize } from "@tauri-apps/api/dpi";
import type { PhysicalPosition, PhysicalSize } from "@tauri-apps/api/dpi";
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
  setSize(size: LogicalSize): Promise<void>;
  setPosition(position: LogicalPosition): Promise<void>;
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
    setSize: (size) => getCurrentWindow().setSize(size),
    setPosition: (position) => getCurrentWindow().setPosition(position),
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
    const expanding = result.width > size.width || result.height > size.height;
    // #242 follow-up: issue the position and size native calls back-to-back — starting the second
    // one immediately rather than `await`ing the first's full IPC round trip first — instead of
    // fully sequencing them. Tauri's IPC command queue is FIFO, so the *order* Rust applies these
    // two native mutations in is unaffected (still position-then-size when expanding, size-then-
    // position when contracting — see the two `await Promise.all` calls below and their own
    // comments). What changes is how long only one of the two is applied: awaiting the first call's
    // full round trip before even sending the second left a real (if brief) window during which the
    // OS had moved the window but not yet grown it (or vice versa on contraction) — invisible while
    // opening the very first card (nothing was on screen yet to show it), but a visible "jump to an
    // intermediate rect, then snap" once a card was already painted (e.g. Character during a 1->2
    // Management-card expansion), which manual testing in `npm run tauri dev` confirmed. Dispatching
    // both requests together shrinks that half-applied window to the two commands' own arrival gap
    // on the same FIFO queue, instead of a full extra IPC round trip.
    if (expanding) {
      // Move the compact rect to its final anchor before growing it. Resizing first briefly paints
      // the expanded glass/cards over the old compact location, then visibly pops into place.
      const move = port.setPosition(new LogicalPosition(result.x, result.y));
      const grow = port.setSize(new LogicalSize(result.width, result.height));
      await Promise.all([move, grow]);
    } else {
      // Contract before moving so a closing bottom-anchored workspace does not sweep a large,
      // still-expanded window across the monitor.
      const shrink = port.setSize(new LogicalSize(result.width, result.height));
      const move = port.setPosition(new LogicalPosition(result.x, result.y));
      await Promise.all([shrink, move]);
    }
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
    settled: () => queue,
  };
}
