// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { createEngine } from "../core/engine";
import { fixtureContent } from "../core/fixture-content";
import { makeSnapshot } from "../core/make-snapshot";
import { content as meadowsContent } from "../data";
import { seededRng } from "../core/rng";
import { mountApp } from "./app";
import type { WindowChrome } from "./app";

const noopWindowChrome: WindowChrome = { setPanels: () => {} };

describe("scene backdrop (#80)", () => {
  it("prepends #backdrop, with its three parallax layers, as the first child of #scene — ahead of #sprite-row/bars/toasts in DOM order (the z-order pin, alongside styles.css's negative z-index)", () => {
    const engine = createEngine(meadowsContent, seededRng(1));
    const root = document.createElement("main");
    mountApp(engine, root, meadowsContent, noopWindowChrome);

    const scene = root.querySelector<HTMLElement>("#scene");
    expect(scene).not.toBeNull();
    const children = Array.from(scene!.children).map((c) => c.id);
    expect(children[0]).toBe("backdrop");
    expect(children.indexOf("backdrop")).toBeLessThan(children.indexOf("toast-container"));
    expect(children.indexOf("backdrop")).toBeLessThan(children.indexOf("sprite-row"));

    const backdrop = root.querySelector<HTMLElement>("#backdrop");
    expect(backdrop?.querySelector(".layer-sky")).not.toBeNull();
    expect(backdrop?.querySelector(".layer-mid")).not.toBeNull();
    expect(backdrop?.querySelector(".layer-near")).not.toBeNull();
  });

  it("does not disturb #98's splat layers or sprite-wrap structure", () => {
    const engine = createEngine(meadowsContent, seededRng(1));
    const root = document.createElement("main");
    mountApp(engine, root, meadowsContent, noopWindowChrome);

    expect(root.querySelector("#monster-splats")).not.toBeNull();
    expect(root.querySelector("#player-splats")).not.toBeNull();
    expect(root.querySelector("#monster-sprite-wrap.sprite-wrap")).not.toBeNull();
    expect(root.querySelector("#player-sprite-wrap.sprite-wrap")).not.toBeNull();
  });

  it("shows a sensible theme immediately on mount, idle, before anything is selected (no blank/flash)", () => {
    const engine = createEngine(meadowsContent, seededRng(1));
    const root = document.createElement("main");
    mountApp(engine, root, meadowsContent, noopWindowChrome);

    expect(root.querySelector<HTMLElement>("#backdrop")?.dataset["theme"]).toBe("meadow");
  });

  it("shows the current Area's theme while fighting one of its Monsters", () => {
    const engine = createEngine(meadowsContent, seededRng(1));
    const root = document.createElement("main");
    const app = mountApp(engine, root, meadowsContent, noopWindowChrome);

    engine.selectMonster("chicken"); // lumbry-meadows
    app.render();
    expect(root.querySelector<HTMLElement>("#backdrop")?.dataset["theme"]).toBe("meadow");
  });

  it("shows the current Area's theme while fishing one of its Fishing Spots", () => {
    const engine = createEngine(meadowsContent, seededRng(1));
    const root = document.createElement("main");
    const app = mountApp(engine, root, meadowsContent, noopWindowChrome);

    engine.selectFishingSpot("shrimp-pool"); // lumbry-meadows
    app.render();
    expect(root.querySelector<HTMLElement>("#backdrop")?.dataset["theme"]).toBe("meadow");
  });

  it("switches to the town theme and shows the anvil prop when Smithing starts, switching cleanly from whatever theme was showing before", () => {
    const engine = createEngine(
      fixtureContent,
      seededRng(1),
      makeSnapshot({ bank: { items: [{ itemId: "bar", qty: 5 }] } }),
    );
    const root = document.createElement("main");
    const app = mountApp(engine, root, fixtureContent, noopWindowChrome);

    // Idle, before Smithing: fixtureContent's first (and only unlocked) Area's own theme.
    expect(root.querySelector<HTMLElement>("#backdrop")?.dataset["theme"]).toBe("meadow");
    expect(root.querySelector<HTMLElement>("#activity-prop")?.hidden).toBe(true);

    engine.selectRecipe("test-sword");
    app.render();

    const backdrop = root.querySelector<HTMLElement>("#backdrop");
    expect(backdrop?.dataset["theme"]).toBe("town");
    const prop = root.querySelector<HTMLElement>("#activity-prop");
    expect(prop?.hidden).toBe(false);
    expect(prop?.classList.contains("prop-anvil")).toBe(true);
  });

  it("switches to the town theme and shows the cooking prop when Cooking starts (#115)", () => {
    const engine = createEngine(
      fixtureContent,
      seededRng(1),
      makeSnapshot({ bank: { items: [{ itemId: "raw-fish", qty: 5 }] } }),
    );
    const root = document.createElement("main");
    const app = mountApp(engine, root, fixtureContent, noopWindowChrome);

    engine.selectRecipe("test-cook");
    app.render();

    const backdrop = root.querySelector<HTMLElement>("#backdrop");
    expect(backdrop?.dataset["theme"]).toBe("town");
    const prop = root.querySelector<HTMLElement>("#activity-prop");
    expect(prop?.hidden).toBe(false);
    expect(prop?.classList.contains("prop-cooking")).toBe(true);
  });

  it("shows the host Area's theme for the whole Dungeon run, including on its dungeon-only Boss wave", () => {
    const engine = createEngine(meadowsContent, seededRng(1));
    const root = document.createElement("main");
    const app = mountApp(engine, root, meadowsContent, noopWindowChrome);

    engine.enterDungeon("meadow-depths"); // hosted in lumbry-meadows, waves end on goblin-chief
    app.render();
    expect(root.querySelector<HTMLElement>("#backdrop")?.dataset["theme"]).toBe("meadow");
  });

  it("does not change #scene's own children count/structure beyond the new #backdrop node (320px layout budget: no new scene-height-affecting siblings)", () => {
    const engine = createEngine(meadowsContent, seededRng(1));
    const root = document.createElement("main");
    mountApp(engine, root, meadowsContent, noopWindowChrome);

    const scene = root.querySelector<HTMLElement>("#scene");
    const ids = Array.from(scene!.children).map((c) => c.id);
    expect(ids).toEqual([
      "backdrop",
      "toast-container",
      "sprite-row",
      "dungeon-header",
      "monster-name",
      "monster-stats",
      "monster-bar",
      "",
      "food-slots",
    ]);
  });
});
