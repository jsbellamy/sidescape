import { getCurrentWindow } from "@tauri-apps/api/window";
import { createEngine } from "./core/engine";
import { mathRandomRng } from "./core/rng";
import { content } from "./data";
import { mountApp } from "./ui/app";
import { mountSfx } from "./ui/sfx";
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

window.addEventListener("DOMContentLoaded", () => {
  document.querySelector("#close-btn")?.addEventListener("click", () => {
    localStorage.setItem(SAVE_KEY, JSON.stringify(engine.snapshot()));
    getCurrentWindow()
      .close()
      .catch((err) => console.error("window close failed:", err));
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
