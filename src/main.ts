import { getCurrentWindow } from "@tauri-apps/api/window";
import { createEngine } from "./core/engine";
import { mathRandomRng } from "./core/rng";
import { content } from "./data";
import { mountApp } from "./ui/app";
import { mountSfx } from "./ui/sfx";
import { decodeSave, encodeSave } from "./ui/save-transfer";
import type { Snapshot } from "./core/types";

const SAVE_KEY = "sidescape-save-v1";
const TICK_MS = 600;

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
  const app = mountApp(engine, root, content);

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
