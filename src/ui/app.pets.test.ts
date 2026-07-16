// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEngine } from "../core/engine";
import { fixtureContent } from "../core/fixture-content";
import { makeSnapshot } from "../core/make-snapshot";
import { seededRng } from "../core/rng";
import type { Rng } from "../core/types";
import { resolveContent } from "../core/validate-content";
import { mountApp } from "./app";
import type { WorkspaceChrome } from "./workspace-chrome";

const resolvedFixtureContent = resolveContent(fixtureContent);

const noopWindowChrome: WorkspaceChrome = {
  getCapacity: () => Promise.resolve(2),
  setCardCount: () => Promise.resolve(),
};

/**
 * Deterministic Rng adapter for Pet-drop tests (#234, local to this test file — mirrors
 * engine.test.ts's own copy): replays `values` in order, then repeats `fallback` forever.
 */
function sequenceRng(values: number[], fallback = 0): Rng {
  let index = 0;
  return { next: () => values[index++] ?? fallback };
}

function mountWith(overrides: Parameters<typeof makeSnapshot>[0] = {}, rng: Rng = seededRng(1)) {
  const engine = createEngine(fixtureContent, rng, makeSnapshot(overrides));
  const root = document.createElement("main");
  const app = mountApp(engine, root, resolvedFixtureContent, noopWindowChrome);
  return { engine, root, app };
}

describe("Pet-drop toast (#120)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * Scripted Rng that forces a real 3-hit kill of "dummy" (hp 3, maxHit 1, attackSpeed 4 —
   * matching the player's own UNARMED_SPEED, so both cooldowns reach 0 on the same Tick) through
   * the injected `Rng` seam, then forces the resulting "combat" Pet roll to succeed against the
   * real PET_DROP_CHANCE. Per attack: an accuracy draw low enough to always hit, a damage draw of
   * 0.999 (floor(0.999 * (maxHit=1 + 1)) = 1 damage every swing), then — once dummy's own
   * cooldown also elapses on that Tick — an accuracy draw of 0.999 high enough to always miss the
   * player back (so no extra damage draw is consumed). The final draw (0) forces the "combat" Pet
   * roll below the real 1-in-2000 chance the instant dummy's hp reaches 0.
   */
  function forcedDummyKillRng(): Rng {
    return sequenceRng([
      0,
      0.999,
      0.999, // hit 1 (dummy hp 3 -> 2), dummy's own swing misses
      0,
      0.999,
      0.999, // hit 2 (dummy hp 2 -> 1), dummy's own swing misses
      0,
      0.999, // hit 3 (dummy hp 1 -> 0, kill)
      0, // "combat" Pet roll: forced success
    ]);
  }

  it("shows a celebratory toast + feed line + screen flash on pet-dropped, that auto-dismisses", () => {
    const { engine, root, app } = mountWith({}, forcedDummyKillRng());
    root.querySelector<HTMLButtonElement>('[data-monster="dummy"]')?.click();

    let dropped = false;
    engine.on("pet-dropped", () => {
      dropped = true;
    });
    for (let i = 0; i < 50 && !dropped; i++) engine.tick();
    app.render();
    expect(dropped).toBe(true);

    const toast = root.querySelector("#toast-container .toast");
    expect(toast).not.toBeNull();
    expect(toast?.textContent).toMatch(/new pet/i);

    const feedLine = root.querySelector("#feed li.pet-dropped");
    expect(feedLine?.textContent).toMatch(/new pet/i);

    expect(root.querySelector("#flash-overlay")?.classList.contains("flash-rare")).toBe(true);

    vi.advanceTimersByTime(5000); // > both the toast dismiss delay and the flash duration
    expect(root.querySelector("#toast-container .toast")).toBeNull();
    expect(root.querySelector("#flash-overlay")?.classList.contains("flash-rare")).toBe(false);
  });
});
