// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __setPetDropChanceForTest, createEngine } from "../core/engine";
import { fixtureContent } from "../core/fixture-content";
import { makeSnapshot } from "../core/make-snapshot";
import { seededRng } from "../core/rng";
import { resolveContent } from "../core/validate-content";
import { mountApp } from "./app";
import type { WorkspaceChrome } from "./workspace-chrome";

const resolvedFixtureContent = resolveContent(fixtureContent);

const noopWindowChrome: WorkspaceChrome = {
  getCapacity: () => Promise.resolve(3),
  setCardCount: () => {},
};

function mountWith(overrides: Parameters<typeof makeSnapshot>[0] = {}) {
  const engine = createEngine(fixtureContent, seededRng(1), makeSnapshot(overrides));
  const root = document.createElement("main");
  const app = mountApp(engine, root, resolvedFixtureContent, noopWindowChrome);
  root.querySelector<HTMLButtonElement>('[data-tab="character"]')?.click();
  return { engine, root, app };
}

describe("Owned-pets collection grid (#120)", () => {
  it("renders one tile per Content pet, owned pets lit and unobtained pets greyed via tile-unowned", () => {
    const { root } = mountWith({ player: { ownedPets: ["test-combat-pet"] } });

    const grid = root.querySelector<HTMLElement>("#pets-grid");
    expect(grid?.classList.contains("tile-grid")).toBe(true);

    // fixtureContent.pets has 4 entries — every one renders, owned or not.
    const tiles = [...grid!.querySelectorAll<HTMLElement>("[data-pet]")];
    expect(tiles.map((t) => t.dataset["pet"])).toEqual([
      "test-combat-pet",
      "test-fishing-pet",
      "test-production-pet",
      "test-boss-pet",
    ]);

    const owned = root.querySelector<HTMLElement>('[data-pet="test-combat-pet"]');
    expect(owned?.classList.contains("tile-unowned")).toBe(false);

    const unowned = root.querySelector<HTMLElement>('[data-pet="test-fishing-pet"]');
    expect(unowned?.classList.contains("tile-unowned")).toBe(true);

    // Every tile still shows a real icon, owned or not (never hidden, per the issue's "owned lit,
    // unobtained greyed" instruction — a greyed tile still previews the collectible).
    expect(unowned?.querySelector("img.pixel")).not.toBeNull();
  });

  it("renders every pet greyed on a fresh save with no owned pets", () => {
    const { root } = mountWith();
    const grid = root.querySelector<HTMLElement>("#pets-grid");
    const tiles = [...grid!.querySelectorAll<HTMLElement>("[data-pet]")];
    expect(tiles.every((t) => t.classList.contains("tile-unowned"))).toBe(true);
  });
});

describe("Pet-drop toast (#120)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    __setPetDropChanceForTest(null); // never leak an override into later tests
  });

  it("shows a celebratory toast + feed line + screen flash on pet-dropped, that auto-dismisses", () => {
    __setPetDropChanceForTest({ action: 1, boss: 1 }); // force the drop deterministically
    const { engine, root, app } = mountWith();
    root.querySelector<HTMLButtonElement>('[data-monster="dummy"]')?.click();

    let dropped = false;
    engine.on("pet-dropped", () => {
      dropped = true;
    });
    for (let i = 0; i < 2000 && !dropped; i++) engine.tick();
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

  it("a newly-dropped pet's tile lights up on the very next render", () => {
    __setPetDropChanceForTest({ action: 1, boss: 1 });
    const { engine, root, app } = mountWith();
    root.querySelector<HTMLButtonElement>('[data-monster="dummy"]')?.click();

    for (let i = 0; i < 2000; i++) {
      engine.tick();
      if (engine.snapshot().player.ownedPets.includes("test-combat-pet")) break;
    }
    app.render();

    const tile = root.querySelector<HTMLElement>('[data-pet="test-combat-pet"]');
    expect(tile?.classList.contains("tile-unowned")).toBe(false);
  });
});
