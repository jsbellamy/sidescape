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
  CARD_GAP,
  DEFAULT_CARD_H,
  DEFAULT_COMPACT_H,
  DEFAULT_COMPACT_W,
  MIN_COMPACT_H,
  MIN_COMPACT_W,
  workspaceCapacity,
  workspaceRect,
} from "./ui/window-geometry";

const SAVE_KEY = "sidescape-save-v1";
const TICK_MS = 600;

/** Presentation-only window geometry (#138 §3), persisted in localStorage — never the Engine
 * Snapshot/transferable save (same boundary as the panel/sort/mute preferences). Remembers the
 * user's compact widget size and their preferred expanded card height; it deliberately never
 * remembers which cards were open, so a relaunch always starts closed. */
const GEOMETRY_KEY = "sidescape-ui-geometry-v2";
/** Tauri `maxWidth` from tauri.conf.json — persisted compact width clamps to it on load. */
const TAURI_MAX_W = 920;

interface StoredGeometry {
  compact: { width: number; height: number };
  cardHeight: number;
}

const DEFAULT_GEOMETRY: StoredGeometry = {
  compact: { width: DEFAULT_COMPACT_W, height: DEFAULT_COMPACT_H },
  cardHeight: DEFAULT_CARD_H,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** A finite, positive number, else the fallback — the tolerant-load primitive (#138 §3): any
 * missing / malformed / non-finite / non-positive stored value collapses to its default. */
function finiteOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

/** Loads `sidescape-ui-geometry-v2` tolerantly: a missing key, unparseable JSON, or any bad field
 * falls back to defaults; compact dimensions clamp to the supported minima and the Tauri maxima;
 * `cardHeight` defaults to 600 (its final clamp to the monitor's available height happens in
 * `workspaceRect` at apply time). */
function loadGeometry(): StoredGeometry {
  try {
    const raw = localStorage.getItem(GEOMETRY_KEY);
    if (!raw) return structuredClone(DEFAULT_GEOMETRY);
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return structuredClone(DEFAULT_GEOMETRY);
    const compact = (parsed as { compact?: unknown }).compact;
    const c = (typeof compact === "object" && compact !== null ? compact : {}) as {
      width?: unknown;
      height?: unknown;
    };
    return {
      compact: {
        width: clamp(finiteOr(c.width, DEFAULT_COMPACT_W), MIN_COMPACT_W, TAURI_MAX_W),
        height: Math.max(MIN_COMPACT_H, finiteOr(c.height, DEFAULT_COMPACT_H)),
      },
      cardHeight: finiteOr((parsed as { cardHeight?: unknown }).cardHeight, DEFAULT_CARD_H),
    };
  } catch {
    return structuredClone(DEFAULT_GEOMETRY);
  }
}

function saveGeometry(geometry: StoredGeometry): void {
  try {
    localStorage.setItem(GEOMETRY_KEY, JSON.stringify(geometry));
  } catch {
    // localStorage may be unavailable (private mode); the preference just won't persist.
  }
}

/**
 * The real WorkspaceChrome (#138): the compact widget and the floating management cards live in one
 * transparent always-on-top window. This adapter resizes/repositions that single window as cards
 * open and close, and drives the DOM composition (`data-anchor` for card ordering, `--card-h` for
 * the management row's height) so the CSS union always matches the native window.
 *
 * It reads the window's live position/size fresh on every call — never a cached anchor for the
 * geometry — so an in-between user drag or resize is respected on the next toggle. All Tauri calls
 * are `.catch(console.error)`-guarded via `setCardCount`, so `npm run dev` in a plain browser (no
 * Tauri APIs) degrades to the in-page vertical layout with no window resize.
 *
 * Persistence (#138 §3): remembers only compact width/height and the preferred card height in
 * `sidescape-ui-geometry-v2`. On a closed→open transition it captures the live compact size (which
 * is what the window currently *is*); on open→open it treats the user's current expanded height
 * (minus the compact floor + gap) as the new card-height preference; open→closed restores the
 * stored compact size via the inverse geometry. At boot it is called with zero cards, so the window
 * snaps back to the stored compact size — overriding whatever (possibly expanded) width/height
 * `tauri-plugin-window-state` restored.
 */
function createTauriWindowChrome(root: HTMLElement): WorkspaceChrome {
  let cardCount = 0;
  let anchor: "top" | "bottom" | null = null;
  const stored = loadGeometry();

  async function applyCards(nextCardCount: number): Promise<void> {
    const win = getCurrentWindow();

    const scaleFactor = await win.scaleFactor();
    const currentPos = (await win.outerPosition()).toLogical(scaleFactor);
    const currentSize = (await win.outerSize()).toLogical(scaleFactor);

    const monitor = await currentMonitor();
    const monitorRect = monitor
      ? {
          x: monitor.position.toLogical(monitor.scaleFactor).x,
          y: monitor.position.toLogical(monitor.scaleFactor).y,
          width: monitor.size.toLogical(monitor.scaleFactor).width,
          height: monitor.size.toLogical(monitor.scaleFactor).height,
        }
      : null;

    const wasOpen = cardCount > 0;
    const willOpen = nextCardCount > 0;

    if (!wasOpen && willOpen) {
      // closed → open: the native window currently *is* the compact rect — persist its real size so
      // a user's widen/heighten while closed survives relaunch.
      stored.compact = {
        width: clamp(currentSize.width, MIN_COMPACT_W, TAURI_MAX_W),
        height: Math.max(MIN_COMPACT_H, currentSize.height),
      };
      saveGeometry(stored);
    } else if (wasOpen && willOpen) {
      // open → open: the user's current expanded height, minus the compact floor + gap, is their new
      // card-height preference.
      const compactVisibleH = Math.max(MIN_COMPACT_H, stored.compact.height);
      const derivedCardH = currentSize.height - compactVisibleH - CARD_GAP;
      if (Number.isFinite(derivedCardH) && derivedCardH > 0) {
        stored.cardHeight = derivedCardH;
        saveGeometry(stored);
      }
    }

    const result = workspaceRect({
      current: {
        x: currentPos.x,
        y: currentPos.y,
        width: currentSize.width,
        height: currentSize.height,
      },
      compact: stored.compact,
      cardHeight: stored.cardHeight,
      wasCardCount: cardCount,
      cardCount: nextCardCount,
      anchor,
      monitor: monitorRect,
    });

    await win.setSize(new LogicalSize(result.width, result.height));
    await win.setPosition(new LogicalPosition(result.x, result.y));
    cardCount = nextCardCount;
    anchor = result.anchor;

    // Drive the DOM composition from the resolved geometry: the anchor orders the management row
    // relative to the compact widget, and the live (clamped) card height sizes the row so the CSS
    // union matches the native window exactly.
    if (result.anchor) root.dataset["anchor"] = result.anchor;
    else delete root.dataset["anchor"];
    if (willOpen) {
      const compactVisibleH = Math.max(MIN_COMPACT_H, stored.compact.height);
      root.style.setProperty("--card-h", `${result.height - compactVisibleH - CARD_GAP}px`);
    }
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

  // Mount first: the whole composition — including the compact widget's titlebar and its
  // export/import/mute/close controls — is built inside `#app` by `mountApp` (#138 §4 moved the
  // titlebar into the opaque compact card), so the button wiring below must run after this.
  const root = document.querySelector<HTMLElement>("#app");
  if (!root) throw new Error("#app root element missing");
  const app = mountApp(engine, root, content, createTauriWindowChrome(root));

  const muteToggle = requireElement<HTMLButtonElement>("#mute-toggle");
  mountSfx(engine, muteToggle);

  requireElement<HTMLButtonElement>("#close-btn").addEventListener("click", () => {
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
