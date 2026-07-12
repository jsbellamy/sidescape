import { LogicalPosition, LogicalSize } from "@tauri-apps/api/dpi";
import type { PhysicalPosition, PhysicalSize } from "@tauri-apps/api/dpi";
import { currentMonitor, getCurrentWindow, type Monitor } from "@tauri-apps/api/window";
import type { WorkspaceChrome } from "./workspace-chrome";
import {
  CARD_GAP,
  CARD_W,
  DEFAULT_CARD_H,
  DEFAULT_COMPACT_H,
  DEFAULT_COMPACT_W,
  MIN_COMPACT_H,
  MIN_COMPACT_W,
  workspaceCapacity,
  workspaceRect,
} from "./window-geometry";

/** Presentation-only window geometry (#138 §3), persisted in localStorage — never the Engine
 * Snapshot/transferable save (same boundary as the panel/sort/mute preferences). Remembers the
 * user's compact widget size and their preferred expanded card height; it deliberately never
 * remembers which cards were open, so a relaunch always starts closed. */
export const GEOMETRY_KEY = "sidescape-ui-geometry-v2";
/** Tauri `maxWidth` from tauri.conf.json — persisted compact width clamps to it on load. */
export const TAURI_MAX_W = 920;

export interface StoredGeometry {
  compact: { width: number; height: number };
  cardHeight: number;
}

export const DEFAULT_GEOMETRY: StoredGeometry = {
  compact: { width: DEFAULT_COMPACT_W, height: DEFAULT_COMPACT_H },
  cardHeight: DEFAULT_CARD_H,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** A finite, positive number, else the fallback — the tolerant-load primitive (#138 §3): any
 * missing / malformed / non-finite / non-positive stored value collapses to its default. */
export function finiteOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

/** Loads `sidescape-ui-geometry-v2` tolerantly: a missing key, unparseable JSON, or any bad field
 * falls back to defaults; compact dimensions clamp to the supported minima and the Tauri maxima;
 * `cardHeight` defaults to 600 (its final clamp to the monitor's available height happens in
 * `workspaceRect` at apply time). */
export function loadGeometry(): StoredGeometry {
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

export function saveGeometry(geometry: StoredGeometry): void {
  try {
    localStorage.setItem(GEOMETRY_KEY, JSON.stringify(geometry));
  } catch {
    // localStorage may be unavailable (private mode); the preference just won't persist.
  }
}

/** Raw native-window surface, exactly the @tauri-apps/api shapes (physical px + scale
 * factors). Keep this port raw: the physical→logical conversion stays inside
 * createTauriWindowChrome so tests exercise it; the real port is pure forwarding. */
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
  /** Resolves once every setCardCount issued so far has fully applied (or failed). Test seam;
   * production callers never await it. */
  settled(): Promise<void>;
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
 *
 * `setCardCount` applications are serialized through an internal promise chain so two rapid calls
 * never interleave their reads/writes of the live window rect; `settled()` resolves once that
 * chain has fully drained (production callers never await it — it exists for tests).
 */
export function createTauriWindowChrome(
  root: HTMLElement,
  port: NativeWindowPort = tauriNativeWindowPort(),
): TauriWindowChrome {
  let cardCount = 0;
  let anchor: "top" | "bottom" | null = null;
  const stored = loadGeometry();
  let queue: Promise<void> = Promise.resolve();
  // False only until the very first `applyCards` call completes. Guards the closed → closed
  // capture case below: on a fresh boot, `currentSize` is whatever `tauri-plugin-window-state`
  // restored — which can be an arbitrary (possibly card-expanded) rect with no relationship to the
  // user's compact-width/height preference — not a rect our own code produced. Every later call,
  // by contrast, reflects our own prior `setSize` plus, at most, a real user drag on top of it.
  let appliedOnce = false;

  async function applyCards(nextCardCount: number): Promise<void> {
    const scaleFactor = await port.scaleFactor();
    const currentPos = (await port.outerPosition()).toLogical(scaleFactor);
    const currentSize = (await port.outerSize()).toLogical(scaleFactor);

    const monitor = await port.currentMonitor();
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

    // Capture geometry from the window's *actual current* rect — set by whatever the last
    // `setSize` call was, but possibly since widened/heightened by the user dragging a native
    // resize handle — before we (re)compute and re-apply a rect from `stored`. Previously this
    // only ran on the very first closed → open transition, so any live resize made while a card
    // stayed open (open → open) or made just before closing (open → closed) was silently dropped:
    // the next `workspaceRect` call re-applied the stale stored size, snapping the window back.
    //
    // Width: `workspaceRect` sets `width = Math.max(compact.width, rowWidth)` (`#compact-widget`
    // never stretches to a wider card row — see its own CSS comment). Reversing that formula, the
    // *previous* card row's own width (`wasRowWidth`, 0 while closed) is the only part of the
    // current width the row could explain by itself; whenever the live width exceeds it, the
    // excess is unambiguously the compact widget's own width, safe to persist regardless of
    // whether cards are open, opening, or closing this call.
    const capacity = monitorRect ? workspaceCapacity(monitorRect.width) : 2;
    const wasEffective = Math.min(Math.max(0, cardCount), capacity);
    const wasRowWidth =
      wasEffective > 0 ? wasEffective * CARD_W + Math.max(0, wasEffective - 1) * CARD_GAP : 0;
    // Trust `currentSize` as a real geometry signal once a card was already open (`wasOpen`) or
    // we're opening one now (`willOpen`) — both already-established-safe cases (the latter is
    // #138's original closed → open capture) — or once our own code has run before at least once
    // (`appliedOnce`). The one untrusted case is the very first call ever while staying closed:
    // see `appliedOnce`'s own comment above.
    const trustCurrentSize = wasOpen || willOpen || appliedOnce;
    let changed = false;
    if (trustCurrentSize && currentSize.width > wasRowWidth) {
      stored.compact.width = clamp(currentSize.width, MIN_COMPACT_W, TAURI_MAX_W);
      changed = true;
    }

    // Height: while no card was showing, the live height *is* the compact height directly. While a
    // card was showing, #138 clamps the compact widget's own height to its stored floor — height
    // changes are the user's card-row preference (`cardHeight`) instead. This applies whether we're
    // about to open further, stay open, or close, so a drag-then-close no longer loses cardHeight.
    if (!wasOpen) {
      if (trustCurrentSize) {
        stored.compact.height = Math.max(MIN_COMPACT_H, currentSize.height);
        changed = true;
      }
    } else {
      const compactVisibleH = Math.max(MIN_COMPACT_H, stored.compact.height);
      const derivedCardH = currentSize.height - compactVisibleH - CARD_GAP;
      if (Number.isFinite(derivedCardH) && derivedCardH > 0) {
        stored.cardHeight = derivedCardH;
        changed = true;
      }
    }
    if (changed) saveGeometry(stored);
    appliedOnce = true;

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

    await port.setSize(new LogicalSize(result.width, result.height));
    await port.setPosition(new LogicalPosition(result.x, result.y));
    cardCount = nextCardCount;
    anchor = result.anchor;

    // Drive the DOM composition from the resolved geometry: the anchor orders the management row
    // relative to the compact widget, the live (clamped) card height sizes the row so the CSS union
    // matches the native window exactly, and `--compact-w` sizes `#compact-widget` itself — every
    // call, open or closed, since (unlike the card row) the compact widget's width never depends on
    // card state. Previously nothing set this at all: `#compact-widget` was a hardcoded 320px in
    // styles.css, so a user's widened window never visibly widened the card, regardless of what
    // `stored.compact.width` held.
    if (result.anchor) root.dataset["anchor"] = result.anchor;
    else delete root.dataset["anchor"];
    root.style.setProperty("--compact-w", `${stored.compact.width}px`);
    if (willOpen) {
      const compactVisibleH = Math.max(MIN_COMPACT_H, stored.compact.height);
      root.style.setProperty("--card-h", `${result.height - compactVisibleH - CARD_GAP}px`);
    }
  }

  return {
    // #136 is the first real caller of getCapacity() (a launcher click awaits it before opening a
    // card): guarded the same way setCardCount already is below, so a rejected Tauri call in the
    // browser-degraded `npm run dev` path (no `__TAURI_INTERNALS__`) degrades to the most
    // permissive capacity instead of leaving the launcher's click handler's promise to reject
    // uncaught.
    async getCapacity(): Promise<1 | 2> {
      try {
        const monitor = await port.currentMonitor();
        return monitor ? workspaceCapacity(monitor.size.toLogical(monitor.scaleFactor).width) : 2;
      } catch (error) {
        console.error(error);
        return 2;
      }
    },
    setCardCount(nextCardCount: number): void {
      queue = queue.then(() => applyCards(nextCardCount)).catch(console.error);
    },
    settled(): Promise<void> {
      return queue;
    },
  };
}
