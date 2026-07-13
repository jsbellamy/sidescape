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

export interface TauriWindowChrome extends WorkspaceChrome {
  settled(): Promise<void>;
}

export function createTauriWindowChrome(
  root: HTMLElement,
  port: NativeWindowPort = tauriNativeWindowPort(),
): TauriWindowChrome {
  let cardCount = 0;
  let anchor: "top" | "bottom" | null = null;
  let scale = loadUiScale();
  let queue: Promise<void> = Promise.resolve();

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
    await port.setSize(new LogicalSize(result.width, result.height));
    await port.setPosition(new LogicalPosition(result.x, result.y));
    cardCount = nextCardCount;
    anchor = result.anchor;
    if (anchor) root.dataset["anchor"] = anchor;
    else delete root.dataset["anchor"];
    root.style.setProperty("--ui-scale", String(scale));
    root.style.setProperty("--compact-w", `${COMPACT_W}px`);
    root.style.setProperty("--compact-h", `${COMPACT_H}px`);
    root.style.setProperty("--card-h", `${CARD_H}px`);
    root.style.setProperty("--workspace-w", `${result.width / scale}px`);
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
      if (!isUiScale(next)) return;
      queue = queue
        .then(async () => {
          const monitor = await monitorRect();
          if (monitor && !scaleFitsMonitorHeight(monitor.height, next)) return;
          scale = next;
          saveUiScale(scale);
          await apply(cardCount);
        })
        .catch(console.error);
    },
    setCardCount(next) {
      queue = queue.then(() => apply(next)).catch(console.error);
    },
    settled: () => queue,
  };
}
