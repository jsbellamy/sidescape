import {
  currentMonitor,
  getCurrentWindow,
  LogicalPosition,
  LogicalSize,
} from "@tauri-apps/api/window";
import { createEngine } from "./core/engine";
import { mathRandomRng } from "./core/rng";
import { content } from "./data";
import { mountApp } from "./ui/app";
import type { WorkspaceChrome } from "./ui/app";
import { mountSfx } from "./ui/sfx";
import {
  buildAwayCard,
  computeOfflineTicks,
  OFFLINE_CAP_TICKS,
  pumpOffline,
  showAwayCard,
} from "./ui/offline-progress";
import { decodeSave, encodeSave } from "./ui/save-transfer";
import type { Snapshot } from "./core/types";
import {
  DEFAULT_CARD_H,
  DEFAULT_COMPACT_H,
  DEFAULT_COMPACT_W,
  workspaceCapacity,
  workspaceRect,
} from "./ui/window-geometry";

const SAVE_KEY = "sidescape-save-v1";
const TICK_MS = 600;

/**
 * The real WindowChrome (#62): resizes the always-on-top window around the fixed-width main
 * column as side panels open/close, and shifts `x` so the main column stays visually anchored
 * while the LEFT panel appears to its left (opening LEFT moves the window left by PANEL_W;
 * closing it moves back right). Every call reads the window's current position/size fresh
 * (rather than tracking an internal anchor) so an in-between user drag of the always-on-top
 * window is respected on the next toggle.
 *
 * Screen-edge clamp (amendment): clamps the target `x` within `currentMonitor()`'s bounds, so at
 * the left edge of the screen (x=0) the window can't be pushed off-screen when LEFT opens — it
 * stays flush and the main column effectively slides right inside the (now wider) window instead.
 * Wrapped in `.catch(console.error)` exactly like the existing close-button guard, so `npm run
 * dev` in a plain browser (no Tauri APIs) degrades to in-page flex layout with no window resize.
 *
 * Reconciling with `tauri-plugin-window-state` (#66, registered Rust-side in src-tauri/src/lib.rs):
 * the plugin restores the window's last-seen x/y/width/height on window creation, before this
 * module's `mountApp` call runs — so its restored width may be stale (e.g. expanded, if a panel
 * was open at last close). No extra boot wiring is needed here: `mountApp` (src/ui/app.ts) already
 * calls `syncPanels()` once at the end of mount, which reads the persisted panel state from
 * localStorage (`sidescape-ui-panels`, independent of the plugin's save file) and calls this
 * adapter's `setPanels`, above — recomputing width from `BASE_W` + open panels and overriding
 * whatever width the plugin restored. Because `applyPanels` always re-queries `outerPosition()`
 * fresh (see above) rather than caching an anchor, that first post-restore call already derives
 * its x-shift from the plugin-restored position, so repeated open/close/relaunch cycles don't
 * drift the window. Only width is ever app-owned this way; x/y otherwise stay as the plugin
 * restored them (aside from the panel x-shift), clamped by the screen-edge rule above.
 */
function createTauriWindowChrome(): WorkspaceChrome {
  let cardCount = 0;
  let anchor: "top" | "bottom" | null = null;
  const compact = { width: DEFAULT_COMPACT_W, height: DEFAULT_COMPACT_H };

  async function applyCards(nextCardCount: number): Promise<void> {
    const win = getCurrentWindow();

    const scaleFactor = await win.scaleFactor();
    const currentPos = (await win.outerPosition()).toLogical(scaleFactor);

    const monitor = await currentMonitor();
    const monitorRect = monitor
      ? {
          x: monitor.position.toLogical(monitor.scaleFactor).x,
          y: monitor.position.toLogical(monitor.scaleFactor).y,
          width: monitor.size.toLogical(monitor.scaleFactor).width,
          height: monitor.size.toLogical(monitor.scaleFactor).height,
        }
      : null;

    const size = await win.outerSize();
    const currentSize = size.toLogical(scaleFactor);
    const result = workspaceRect({
      current: {
        x: currentPos.x,
        y: currentPos.y,
        width: currentSize.width,
        height: currentSize.height,
      },
      compact,
      cardHeight: DEFAULT_CARD_H,
      wasCardCount: cardCount,
      cardCount: nextCardCount,
      anchor,
      monitor: monitorRect,
    });
    await win.setSize(new LogicalSize(result.width, result.height));
    await win.setPosition(new LogicalPosition(result.x, result.y));
    cardCount = nextCardCount;
    anchor = result.anchor;
  }

  return {
    async getCapacity(): Promise<1 | 2 | 3> {
      const monitor = await currentMonitor();
      return monitor ? workspaceCapacity(monitor.size.toLogical(monitor.scaleFactor).width) : 3;
    },
    setCardCount(nextCardCount: number): void {
      applyCards(nextCardCount).catch(console.error);
    },
  };
}

function loadSave(): Snapshot | undefined {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? (JSON.parse(raw) as Snapshot) : undefined;
  } catch {
    return undefined;
  }
}

const savedSnapshot = loadSave();
const engine = createEngine(content, mathRandomRng, savedSnapshot);

/** Looks up a required element by selector, throwing (rather than returning a nullable type)
 * so callers — including nested closures, which TS does not narrow across — get a non-null
 * reference straight away. */
function requireElement<T extends Element>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`${selector} element missing`);
  return el;
}

/** Copies `text` to the clipboard, preferring the async Clipboard API and falling back to a
 * hidden textarea + document.execCommand("copy") (older/unsupported Clipboard API contexts). */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fall through to the execCommand fallback below.
  }
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

window.addEventListener("DOMContentLoaded", () => {
  document.querySelector("#close-btn")?.addEventListener("click", () => {
    localStorage.setItem(SAVE_KEY, JSON.stringify(engine.snapshot()));
    getCurrentWindow()
      .close()
      .catch((err) => console.error("window close failed:", err));
  });

  const exportBtn = requireElement<HTMLButtonElement>("#export-save");
  const exportBtnLabel = exportBtn.textContent ?? "";
  exportBtn.addEventListener("click", () => {
    copyToClipboard(encodeSave(engine.snapshot()))
      .then((ok) => {
        exportBtn.textContent = ok ? "Copied!" : "Copy failed";
        setTimeout(() => {
          exportBtn.textContent = exportBtnLabel;
        }, 1500);
      })
      .catch((err) => console.error("save export failed:", err));
  });

  const importBtn = requireElement<HTMLButtonElement>("#import-save");
  const importPanel = requireElement<HTMLElement>("#import-panel");
  const importTextarea = requireElement<HTMLTextAreaElement>("#import-textarea");
  const importError = requireElement<HTMLElement>("#import-error");
  const importApplyBtn = requireElement<HTMLButtonElement>("#import-apply");
  const importCancelBtn = requireElement<HTMLButtonElement>("#import-cancel");

  function closeImportPanel(): void {
    importPanel.hidden = true;
    importTextarea.value = "";
    importError.hidden = true;
    importError.textContent = "";
  }

  importBtn.addEventListener("click", () => {
    importPanel.hidden = !importPanel.hidden;
    if (importPanel.hidden) closeImportPanel();
  });

  importCancelBtn.addEventListener("click", () => closeImportPanel());

  importApplyBtn.addEventListener("click", () => {
    const decoded = decodeSave(importTextarea.value);
    if (!decoded) {
      importError.hidden = false;
      importError.textContent = "That doesn't look like a valid save. Save left untouched.";
      return;
    }
    if (!window.confirm("Overwrite your current save with this pasted save?")) return;
    localStorage.setItem(SAVE_KEY, JSON.stringify(decoded));
    location.reload();
  });

  // Offline progress (#69): simulate away-time BEFORE mounting the UI, so the pump's Ticks never
  // reach mountApp's/mountSfx's per-event handlers (they haven't subscribed yet) and never appear
  // in the first render (which mountApp does at the end of its own setup, below). A save missing
  // `savedAt` (pre-#69) or one saved just now both yield 0 Ticks — the pump is skipped entirely.
  const bootNow = Date.now();
  const offlineTicks = computeOfflineTicks(savedSnapshot?.savedAt, bootNow, TICK_MS);
  let awayCard = null;
  if (offlineTicks > 0) {
    const awayMs = bootNow - (savedSnapshot?.savedAt as number);
    const capped = offlineTicks >= OFFLINE_CAP_TICKS;
    const summary = pumpOffline(engine, offlineTicks);
    awayCard = buildAwayCard(summary, awayMs, capped);
  }

  const root = document.querySelector<HTMLElement>("#app");
  if (!root) throw new Error("#app root element missing");
  const app = mountApp(engine, root, content, createTauriWindowChrome());

  const muteToggle = document.querySelector<HTMLButtonElement>("#mute-toggle");
  if (!muteToggle) throw new Error("#mute-toggle element missing");
  mountSfx(engine, muteToggle);

  // Shown only after mountApp (so #toast-container exists) and only once the pump above is fully
  // done — one aggregate card, never per-event Loot Feed/toast spam from the away Ticks.
  if (awayCard) showAwayCard(root, awayCard);

  setInterval(() => {
    engine.tick();
    app.render();
  }, TICK_MS);

  setInterval(() => {
    localStorage.setItem(SAVE_KEY, JSON.stringify(engine.snapshot()));
  }, 10_000);
});
