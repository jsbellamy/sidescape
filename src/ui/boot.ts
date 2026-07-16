import { createEngine } from "../core/engine";
import { resolveContent } from "../core/validate-content";
import type { Content, Snapshot } from "../core/types";
import { mountApp } from "./app";
import type { WorkspaceChrome } from "./workspace-chrome";
import { mountSfx } from "./sfx";
import {
  buildAwayCard,
  computeOfflineTicks,
  OFFLINE_CAP_TICKS,
  pumpOffline,
  showAwayCard,
} from "./offline-progress";
import { decodeSave, encodeSave } from "./save-transfer";

export const SAVE_KEY = "sidescape-save-v1";
export const TICK_MS = 600;
export const AUTOSAVE_MS = 10_000;

function loadSave(): Snapshot | undefined {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? (JSON.parse(raw) as Snapshot) : undefined;
  } catch {
    return undefined;
  }
}

/** Looks up a required element by selector, throwing (rather than returning a nullable type)
 * so callers — including nested closures, which TS does not narrow across — get a non-null
 * reference straight away. */
function requireElement<T extends Element>(root: HTMLElement, selector: string): T {
  const el = root.querySelector<T>(selector);
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

export interface BootDeps {
  content: Content; // production: content from ../data
  rng: Parameters<typeof createEngine>[1]; // production: mathRandomRng
  now: () => number; // production: Date.now
  createChrome: (root: HTMLElement) => WorkspaceChrome; // production: createTauriWindowChrome
  closeWindow: () => Promise<void>; // production: () => getCurrentWindow().close()
  reload: () => void; // production: () => location.reload()
  confirm: (message: string) => boolean; // production: (m) => window.confirm(m)
}

/**
 * The real boot sequence (moved out of main.ts's DOMContentLoaded body so it can be imported by
 * tests): load save → create engine → compute/pump offline ticks → mountApp → mountSfx → wire
 * close/export/import buttons → show away card → start tick + autosave intervals. Preserve this
 * order exactly — it encodes #69's invariant (offline pump BEFORE mountApp, away-card shown after)
 * and #138 §4's (button wiring after mountApp builds the DOM, including #widget-controls — the
 * floating cluster #219 substituted for the deleted titlebar).
 */
export function boot(
  root: HTMLElement,
  deps: BootDeps,
): {
  engine: ReturnType<typeof createEngine>;
  app: ReturnType<typeof mountApp>;
  dispose(): void;
} {
  const savedSnapshot = loadSave();
  // Resolve once for UI by-id maps (#185). `createEngine` also calls the idempotent
  // `resolveContent`, so passing this same object reuses it without re-validating or rebuilding
  // maps — the private marker short-circuits the second pass.
  const resolved = resolveContent(deps.content);
  const engine = createEngine(resolved, deps.rng, savedSnapshot);

  // Offline progress (#69): simulate away-time BEFORE mounting the UI, so the pump's Ticks never
  // reach mountApp's/mountSfx's per-event handlers (they haven't subscribed yet) and never appear
  // in the first render (which mountApp does at the end of its own setup, below). A save missing
  // `savedAt` (pre-#69) or one saved just now both yield 0 Ticks — the pump is skipped entirely.
  const bootNow = deps.now();
  const offlineTicks = computeOfflineTicks(savedSnapshot?.savedAt, bootNow, TICK_MS);
  let awayCard = null;
  if (offlineTicks > 0) {
    const awayMs = bootNow - (savedSnapshot?.savedAt as number);
    const capped = offlineTicks >= OFFLINE_CAP_TICKS;
    const summary = pumpOffline(engine, offlineTicks);
    awayCard = buildAwayCard(summary, awayMs, capped);
  }

  // Mount first: the whole composition — including the compact widget's floating
  // `#widget-controls` cluster and the Settings popover's export/import/mute controls — is built
  // inside `#app` by `mountApp` (#138 §4 moved these into the opaque compact/Character cards;
  // #219 later replaced the compact widget's titlebar bar with `#widget-controls`), so the
  // button wiring below must run after this.
  const app = mountApp(engine, root, resolved, deps.createChrome(root));

  const muteToggle = requireElement<HTMLButtonElement>(root, "#mute-toggle");
  mountSfx(engine, muteToggle);

  requireElement<HTMLButtonElement>(root, "#close-btn").addEventListener("click", () => {
    localStorage.setItem(SAVE_KEY, JSON.stringify(engine.snapshot()));
    deps.closeWindow().catch((err) => console.error("window close failed:", err));
  });

  const exportBtn = requireElement<HTMLButtonElement>(root, "#export-save");
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

  const importBtn = requireElement<HTMLButtonElement>(root, "#import-save");
  const importPanel = requireElement<HTMLElement>(root, "#import-panel");
  const importTextarea = requireElement<HTMLTextAreaElement>(root, "#import-textarea");
  const importError = requireElement<HTMLElement>(root, "#import-error");
  const importApplyBtn = requireElement<HTMLButtonElement>(root, "#import-apply");
  const importCancelBtn = requireElement<HTMLButtonElement>(root, "#import-cancel");

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
    if (!deps.confirm("Overwrite your current save with this pasted save?")) return;
    localStorage.setItem(SAVE_KEY, JSON.stringify(decoded));
    deps.reload();
  });

  // Shown only after mountApp (so #toast-container exists) and only once the pump above is fully
  // done — one aggregate card, never per-event Loot Feed/toast spam from the away Ticks.
  if (awayCard) showAwayCard(root, awayCard);

  const tickInterval = setInterval(() => {
    engine.tick();
    app.render();
  }, TICK_MS);

  const autosaveInterval = setInterval(() => {
    localStorage.setItem(SAVE_KEY, JSON.stringify(engine.snapshot()));
  }, AUTOSAVE_MS);

  return {
    engine,
    app,
    dispose(): void {
      clearInterval(tickInterval);
      clearInterval(autosaveInterval);
    },
  };
}
