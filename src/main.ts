import { getCurrentWindow } from "@tauri-apps/api/window";
import { mathRandomRng } from "./core/rng";
import { content } from "./data";
import { boot } from "./ui/boot";
import { createTauriWindowChrome } from "./ui/window-chrome";

window.addEventListener("DOMContentLoaded", () => {
  const root = document.querySelector<HTMLElement>("#app");
  if (!root) throw new Error("#app root element missing");
  boot(root, {
    content,
    rng: mathRandomRng,
    now: Date.now,
    createChrome: (r) => createTauriWindowChrome(r),
    closeWindow: () => getCurrentWindow().close(),
    reload: () => location.reload(),
    confirm: (message) => window.confirm(message),
  });
});
