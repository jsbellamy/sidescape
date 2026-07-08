import type { Engine } from "../core/engine";

const MUTE_STORAGE_KEY = "sidescape-sfx-muted";

/** CC0 sound effects; provenance recorded in docs/assets.md under "Audio packs". */
const SOUND_SRC = {
  kill: "/audio/kill.wav",
  eat: "/audio/eat.wav",
  levelup: "/audio/levelup.wav",
  "rare-drop": "/audio/rare-drop.wav",
  death: "/audio/death.wav",
} as const;

type SoundName = keyof typeof SOUND_SRC;

/** Handle returned by `mountSfx`; exposes read-only mute state for other UI to reflect. */
export interface SfxHandle {
  isMuted(): boolean;
}

function loadMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function saveMuted(muted: boolean): void {
  try {
    localStorage.setItem(MUTE_STORAGE_KEY, String(muted));
  } catch {
    // localStorage may be unavailable (private mode, disabled); mute just won't persist.
  }
}

/**
 * Subscribes to Engine events and plays a distinct CC0 sound effect for each
 * (kill, food-eaten, levelup, rare drop, death), and wires the titlebar mute
 * toggle button. Mute state persists in localStorage under its own key,
 * separate from the game save. UI-side only: makes no Engine changes and adds
 * no timers of its own (ADR-0001) — it purely reacts to events the Engine already emits.
 */
export function mountSfx(engine: Engine, toggleButton: HTMLButtonElement): SfxHandle {
  let muted = loadMuted();

  function render(): void {
    toggleButton.textContent = muted ? "🔇" : "🔊";
    toggleButton.setAttribute("aria-pressed", String(muted));
    toggleButton.title = muted ? "Unmute sound" : "Mute sound";
  }

  function play(name: SoundName): void {
    if (muted) return;
    const audio = new Audio(SOUND_SRC[name]);
    audio.play().catch(() => {
      // Best-effort playback: autoplay policies or unsupported formats may reject.
    });
  }

  toggleButton.addEventListener("click", () => {
    muted = !muted;
    saveMuted(muted);
    render();
  });

  engine.on("kill", () => play("kill"));
  engine.on("food-eaten", () => play("eat"));
  engine.on("levelup", () => play("levelup"));
  engine.on("drop", (event) => {
    if (event.band === "rare") play("rare-drop");
  });
  engine.on("death", () => play("death"));

  render();

  return { isMuted: () => muted };
}
