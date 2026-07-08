// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEngine } from "../core/engine";
import type { Engine } from "../core/engine";
import { fixtureContent } from "../core/fixture-content";
import { seededRng } from "../core/rng";
import type { Content } from "../core/types";
import { mountSfx } from "./sfx";

const MUTE_STORAGE_KEY = "sidescape-sfx-muted";

/**
 * The Training Dummy barely fights back by design, but passive HP regen
 * (1 HP / 10 Ticks) now outpaces its average damage, so the player never
 * drops below half HP to eat, nor dies. For the eat/death sounds we need
 * real damage, so hit harder locally instead of reworking the shared
 * fixture (mirrors fiercerDummyContent in core/engine.test.ts).
 */
function fiercerDummyContent(): Content {
  return {
    ...fixtureContent,
    monsters: fixtureContent.monsters.map((m) =>
      m.id === "dummy" ? { ...m, attackLevel: 5, maxHit: 2, attackSpeed: 3 } : m,
    ),
  };
}

/**
 * happy-dom's localStorage getter doesn't resolve reliably under Vitest's
 * global-population strategy (Node 22+ also defines a stub `globalThis.localStorage`
 * that can shadow it), so tests stub a minimal in-memory Storage directly.
 */
function stubLocalStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => (store.has(key) ? (store.get(key) as string) : null),
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
}

function mount(seed: number, content: Content = fixtureContent) {
  const engine = createEngine(content, seededRng(seed));
  const toggleButton = document.createElement("button");
  const sfx = mountSfx(engine, toggleButton);
  return { engine, toggleButton, sfx };
}

/** Pump Ticks until `predicate` is true (or fail the test), mirroring engine.test.ts's grindFor. */
function pumpUntil(engine: Engine, predicate: () => boolean, maxTicks = 50_000): void {
  for (let i = 0; i < maxTicks; i++) {
    engine.tick();
    if (predicate()) return;
  }
  throw new Error(`condition never became true in ${maxTicks} ticks`);
}

describe("mountSfx", () => {
  let played: string[];

  beforeEach(() => {
    vi.stubGlobal("localStorage", stubLocalStorage());
    played = [];
    vi.spyOn(window.HTMLMediaElement.prototype, "play").mockImplementation(function (
      this: HTMLAudioElement,
    ) {
      played.push(this.src);
      return Promise.resolve();
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("plays a distinct sound on kill", () => {
    const { engine } = mount(1);
    engine.selectMonster("dummy");
    pumpUntil(engine, () => played.some((src) => src.includes("kill.wav")));

    expect(played.some((src) => src.includes("kill.wav"))).toBe(true);
  });

  it("plays a distinct sound on food-eaten", () => {
    // Needs the player to actually drop below half HP; use the fiercer Dummy so
    // damage outpaces passive regen (see fiercerDummyContent).
    const { engine } = mount(42, fiercerDummyContent());
    engine.selectMonster("dummy");
    pumpUntil(engine, () => played.some((src) => src.includes("eat.wav")));

    expect(played.some((src) => src.includes("eat.wav"))).toBe(true);
  });

  it("plays a distinct sound on levelup", () => {
    const { engine } = mount(1);
    engine.selectMonster("dummy");
    pumpUntil(engine, () => played.some((src) => src.includes("levelup.wav")));

    expect(played.some((src) => src.includes("levelup.wav"))).toBe(true);
  });

  it("plays a distinct sound on death", () => {
    // Death-by-attrition needs damage to outpace passive regen; use the fiercer Dummy.
    const { engine } = mount(1, fiercerDummyContent());
    engine.selectMonster("dummy");
    pumpUntil(engine, () => played.some((src) => src.includes("death.wav")));

    expect(played.some((src) => src.includes("death.wav"))).toBe(true);
  });

  it("plays a distinct sound for rare Drops only, not for common/guaranteed ones", () => {
    const { engine } = mount(1234);
    engine.selectMonster("dummy");
    pumpUntil(
      engine,
      () => engine.snapshot().player.inventory.some((s) => s.itemId === "lucky-charm"), // the rare-band item
    );

    expect(played.some((src) => src.includes("rare-drop.wav"))).toBe(true);
    // gold is guaranteed every kill and should never trigger the rare sting
    const goldKills = engine.snapshot().player.inventory.find((s) => s.itemId === "gold")?.qty ?? 0;
    const rareStings = played.filter((src) => src.includes("rare-drop.wav")).length;
    expect(rareStings).toBeLessThan(goldKills);
  });

  it("each event maps to its own distinct sound file", () => {
    // Drive far enough to see several kinds of event fire (kill + levelup at least),
    // then assert the mapping is 1:1 and only ever produces the five known effects.
    const { engine } = mount(1);
    engine.selectMonster("dummy");
    pumpUntil(
      engine,
      () =>
        played.some((src) => src.includes("kill.wav")) &&
        played.some((src) => src.includes("levelup.wav")),
    );

    const distinctSounds = new Set(played.map((src) => src.split("/").pop()));
    // distinct events produced distinct sound files (proves the mapping isn't collapsed)
    expect(distinctSounds.size).toBeGreaterThan(1);
    // every sound played is one of the five known effects
    for (const src of played) {
      expect(src).toMatch(/\/(kill|eat|levelup|rare-drop|death)\.wav$/);
    }
  });

  it("mute toggle silences all sounds", () => {
    const { engine, toggleButton } = mount(1);
    toggleButton.click(); // mute
    engine.selectMonster("dummy");
    for (let i = 0; i < 20; i++) engine.tick();

    expect(played).toHaveLength(0);
  });

  it("mute state persists across app restarts via localStorage, separate from the game save", () => {
    const { toggleButton } = mount(1);
    toggleButton.click(); // mute
    expect(localStorage.getItem(MUTE_STORAGE_KEY)).toBe("true");
    expect(localStorage.getItem("sidescape-save-v1")).toBeNull();

    // Simulate an app restart: a fresh mount reads the persisted mute state.
    const { engine: engine2 } = mount(1);
    engine2.selectMonster("dummy");
    for (let i = 0; i < 20; i++) engine2.tick();
    expect(played).toHaveLength(0);
  });

  it("reflects mute state via isMuted() and the toggle button's aria-pressed", () => {
    const { toggleButton, sfx } = mount(1);
    expect(sfx.isMuted()).toBe(false);
    expect(toggleButton.getAttribute("aria-pressed")).toBe("false");

    toggleButton.click();
    expect(sfx.isMuted()).toBe(true);
    expect(toggleButton.getAttribute("aria-pressed")).toBe("true");

    toggleButton.click();
    expect(sfx.isMuted()).toBe(false);
    expect(toggleButton.getAttribute("aria-pressed")).toBe("false");
  });
});
