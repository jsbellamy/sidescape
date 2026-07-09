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
import type { WindowChrome } from "./ui/app";
import { mountSfx } from "./ui/sfx";
import { decodeSave, encodeSave } from "./ui/save-transfer";
import type { Snapshot } from "./core/types";

const SAVE_KEY = "sidescape-save-v1";
const TICK_MS = 600;

// Window sizing tuning constants (#62) — not spec, chosen to look right around the shrunk
// activity-core main column at 320px wide. See the PR description for the exact rationale.
const PANEL_W = 300;
const BASE_W = 320;
const BASE_H = 460;

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
 */
function createTauriWindowChrome(): WindowChrome {
  let wasLeftOpen = false;

  async function applyPanels(left: boolean, right: boolean): Promise<void> {
    const win = getCurrentWindow();
    const width = BASE_W + (left ? PANEL_W : 0) + (right ? PANEL_W : 0);

    const scaleFactor = await win.scaleFactor();
    const currentPos = (await win.outerPosition()).toLogical(scaleFactor);
    let x = currentPos.x;
    if (left && !wasLeftOpen) x -= PANEL_W;
    else if (!left && wasLeftOpen) x += PANEL_W;

    const monitor = await currentMonitor();
    if (monitor) {
      const monitorPos = monitor.position.toLogical(monitor.scaleFactor);
      const monitorSize = monitor.size.toLogical(monitor.scaleFactor);
      const minX = monitorPos.x;
      const maxX = Math.max(minX, monitorPos.x + monitorSize.width - width);
      x = Math.min(Math.max(x, minX), maxX);
    }

    await win.setSize(new LogicalSize(width, BASE_H));
    await win.setPosition(new LogicalPosition(x, currentPos.y));
    wasLeftOpen = left;
  }

  return {
    setPanels(left: boolean, right: boolean): void {
      applyPanels(left, right).catch(console.error);
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

const engine = createEngine(content, mathRandomRng, loadSave());

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

  const root = document.querySelector<HTMLElement>("#app");
  if (!root) throw new Error("#app root element missing");
  const app = mountApp(engine, root, content, createTauriWindowChrome());

  const muteToggle = document.querySelector<HTMLButtonElement>("#mute-toggle");
  if (!muteToggle) throw new Error("#mute-toggle element missing");
  mountSfx(engine, muteToggle);

  setInterval(() => {
    engine.tick();
    app.render();
  }, TICK_MS);

  setInterval(() => {
    localStorage.setItem(SAVE_KEY, JSON.stringify(engine.snapshot()));
  }, 10_000);
});
