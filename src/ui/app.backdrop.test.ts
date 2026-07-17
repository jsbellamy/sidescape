// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createEngine } from "../core/engine";
import { fixtureContent } from "../core/testing/fixture-content";
import { makeSnapshot } from "../core/testing/make-snapshot";
import { content as meadowsContent } from "../data";
import { seededRng } from "../core/rng";
import { resolveContent } from "../core/validate-content";
import { mountApp } from "./app";
import type { WorkspaceChrome } from "./workspace-chrome";

const resolvedMeadowsContent = resolveContent(meadowsContent);
const resolvedFixtureContent = resolveContent(fixtureContent);
const stylesheet = readFileSync("src/styles.css", "utf8");

const noopWindowChrome: WorkspaceChrome = {
  getCapacity: () => Promise.resolve(2),
  setCardCount: () => Promise.resolve(),
};

describe("scene backdrop (#80)", () => {
  it("uses one fixed, pixelated 2× near-scene overlay plane for every activity focus", () => {
    const overlayNames = ["anvil", "cooking", "crafting", "cauldron", "fishing"];
    for (const name of overlayNames) {
      expect(stylesheet).toContain(`.prop-${name}`);
      expect(stylesheet).toContain(`url("./assets/activity-overlays/activity-${name}-near.png")`);
    }
    expect(stylesheet).toMatch(/#activity-prop\s*\{[\s\S]*?inset:\s*0;/);
    expect(stylesheet).toMatch(/#activity-prop\s*\{[\s\S]*?background-size:\s*160px 120px;/);
    expect(stylesheet).toMatch(/#activity-prop\s*\{[\s\S]*?image-rendering:\s*pixelated;/);
    const planeRule = stylesheet.match(/#activity-prop\s*\{([\s\S]*?)\}/)?.[1];
    expect(planeRule).toBeDefined();
    expect(planeRule).not.toContain("animation:");
  });
  it("references a pixel-art sky, mid, and near tile for every theme", () => {
    const themes = ["meadow", "forest", "sewer", "crypt", "town", "glacier"];
    const layers = ["sky", "mid", "near"];

    for (const theme of themes) {
      for (const layer of layers) {
        expect(stylesheet).toContain(`#backdrop[data-theme="${theme}"] .layer-${layer}`);
        expect(stylesheet).toContain(`url("./assets/backdrops/${theme}-${layer}.png")`);
      }
    }
  });

  it("keeps the meadow sky cool and confines saturated green to the foreground", () => {
    const meadowSky = stylesheet.match(
      /#backdrop\[data-theme="meadow"\] \.layer-sky\s*\{([\s\S]*?)\n\}/,
    )?.[1];
    const meadowMid = stylesheet.match(
      /#backdrop\[data-theme="meadow"\] \.layer-mid\s*\{([\s\S]*?)\n\}/,
    )?.[1];
    const meadowNear = stylesheet.match(
      /#backdrop\[data-theme="meadow"\] \.layer-near\s*\{([\s\S]*?)\n\}/,
    )?.[1];

    const meadowSkyDeclarations = meadowSky?.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(meadowSkyDeclarations).toContain("#86b6d8 0%, #a6cbdd 55%, #c8dfe2 100%");
    expect(meadowSkyDeclarations).not.toContain("#cfe6a8");
    expect(meadowMid).toContain("rgba(95, 138, 79, 0) var(--mid-fade)");
    expect(meadowMid).toContain("filter: saturate(0.28) brightness(0.88)");
    expect(meadowNear).toContain("rgba(44, 74, 38, 0) var(--near-fade)");
    expect(stylesheet).toContain("--mid-fade: 70px;");
    expect(stylesheet).toContain("--near-fade: 58px;");
  });

  it("drifts only the mid and near layers at different slow speeds, with a seamless tile-width loop", () => {
    expect(stylesheet).toContain("inset: 0 -160px 0 0");
    expect(stylesheet).toContain("animation: backdrop-drift 90s linear infinite;");
    expect(stylesheet).toContain("animation: backdrop-drift 60s linear infinite;");
    expect(stylesheet).toMatch(/@keyframes backdrop-drift\s*\{/);
    expect(stylesheet).toContain("transform: translateX(0);");
    expect(stylesheet).toContain("transform: translateX(-160px);");
  });

  it("disables backdrop drift when reduced motion is requested", () => {
    expect(stylesheet).toContain("@media (prefers-reduced-motion: reduce)");
    expect(stylesheet).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*#backdrop \.layer-mid,[\s\S]*#backdrop \.layer-near[\s\S]*animation: none;/,
    );
  });

  it("prepends #backdrop, with its three parallax layers, as the first child of #scene — ahead of #sprite-row/bars/toasts in DOM order (the z-order pin, alongside styles.css's negative z-index)", () => {
    const engine = createEngine(meadowsContent, seededRng(1));
    const root = document.createElement("main");
    mountApp(engine, root, resolvedMeadowsContent, noopWindowChrome);

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
    mountApp(engine, root, resolvedMeadowsContent, noopWindowChrome);

    expect(root.querySelector("#monster-splats")).not.toBeNull();
    expect(root.querySelector("#player-splats")).not.toBeNull();
    expect(root.querySelector("#monster-sprite-wrap.sprite-wrap")).not.toBeNull();
    expect(root.querySelector("#player-sprite-wrap.sprite-wrap")).not.toBeNull();
  });

  it("shows a sensible theme immediately on mount, idle, before anything is selected (no blank/flash)", () => {
    const engine = createEngine(meadowsContent, seededRng(1));
    const root = document.createElement("main");
    mountApp(engine, root, resolvedMeadowsContent, noopWindowChrome);

    expect(root.querySelector<HTMLElement>("#backdrop")?.dataset["theme"]).toBe("meadow");
  });

  it("shows the current Area's theme while fighting one of its Monsters", () => {
    const engine = createEngine(meadowsContent, seededRng(1));
    const root = document.createElement("main");
    const app = mountApp(engine, root, resolvedMeadowsContent, noopWindowChrome);

    engine.selectMonster("chicken"); // lumbry-meadows
    app.render();
    expect(root.querySelector<HTMLElement>("#backdrop")?.dataset["theme"]).toBe("meadow");
  });

  it("shows the current Area's theme while fishing one of its Fishing Spots", () => {
    const engine = createEngine(meadowsContent, seededRng(1));
    const root = document.createElement("main");
    const app = mountApp(engine, root, resolvedMeadowsContent, noopWindowChrome);

    engine.selectFishingSpot("shrimp-pool"); // lumbry-meadows
    app.render();
    expect(root.querySelector<HTMLElement>("#backdrop")?.dataset["theme"]).toBe("meadow");
    expect(root.querySelector<HTMLElement>("#activity-prop")?.className).toBe("prop-fishing");
    expect(root.querySelector<HTMLElement>("#activity-prop")?.hidden).toBe(false);
  });

  it("pins prop-left / player-right offset rules in the stylesheet (#433)", () => {
    expect(stylesheet).toMatch(
      /#activity-prop\s*\{[\s\S]*?background-position:\s*bottom 0 left 15%;/,
    );
    expect(stylesheet).toContain("#scene.prop-active #player-sprite-wrap");
    expect(stylesheet).toMatch(
      /#scene\.prop-active #player-sprite-wrap\s*\{[\s\S]*?transform:\s*translateX\(56px\);/,
    );
  });

  it("sets prop-active on #scene while Smithing (or any Production / fishing prop) is visible, and clears it during combat", () => {
    const smithingEngine = createEngine(
      fixtureContent,
      seededRng(1),
      makeSnapshot({ bank: { items: [{ itemId: "bar", qty: 5 }] } }),
    );
    const smithingRoot = document.createElement("main");
    const smithingApp = mountApp(
      smithingEngine,
      smithingRoot,
      resolvedFixtureContent,
      noopWindowChrome,
    );

    const scene = smithingRoot.querySelector<HTMLElement>("#scene");
    expect(scene?.classList.contains("prop-active")).toBe(false);

    smithingEngine.selectRecipe("test-sword");
    smithingApp.render();
    expect(scene?.classList.contains("prop-active")).toBe(true);

    const combatEngine = createEngine(meadowsContent, seededRng(1));
    const combatRoot = document.createElement("main");
    const combatApp = mountApp(combatEngine, combatRoot, resolvedMeadowsContent, noopWindowChrome);

    combatEngine.selectMonster("chicken");
    combatApp.render();
    const combatScene = combatRoot.querySelector<HTMLElement>("#scene");
    expect(combatScene?.classList.contains("prop-active")).toBe(false);
    expect(combatRoot.querySelector<HTMLElement>("#activity-prop")?.hidden).toBe(true);
  });

  it("switches to the town theme and shows the anvil prop when Smithing starts, switching cleanly from whatever theme was showing before", () => {
    const engine = createEngine(
      fixtureContent,
      seededRng(1),
      makeSnapshot({ bank: { items: [{ itemId: "bar", qty: 5 }] } }),
    );
    const root = document.createElement("main");
    const app = mountApp(engine, root, resolvedFixtureContent, noopWindowChrome);

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
    const app = mountApp(engine, root, resolvedFixtureContent, noopWindowChrome);

    engine.selectRecipe("test-cook");
    app.render();

    const backdrop = root.querySelector<HTMLElement>("#backdrop");
    expect(backdrop?.dataset["theme"]).toBe("town");
    const prop = root.querySelector<HTMLElement>("#activity-prop");
    expect(prop?.hidden).toBe(false);
    expect(prop?.classList.contains("prop-cooking")).toBe(true);
  });

  it("shows exactly the mapped near-scene overlay for every Production Skill", () => {
    const activities = [
      { recipeId: "test-sword", itemId: "bar", prop: "anvil" },
      { recipeId: "test-cook", itemId: "raw-fish", prop: "cooking" },
      { recipeId: "test-craft", itemId: "hide", prop: "crafting" },
      { recipeId: "test-brew", itemId: "herb", prop: "cauldron" },
    ];
    for (const activity of activities) {
      const engine = createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({ bank: { items: [{ itemId: activity.itemId, qty: 1 }] } }),
      );
      const root = document.createElement("main");
      const app = mountApp(engine, root, resolvedFixtureContent, noopWindowChrome);
      engine.selectRecipe(activity.recipeId);
      app.render();
      const prop = root.querySelector<HTMLElement>("#activity-prop");
      expect(prop?.className).toBe(`prop-${activity.prop}`);
      expect(prop?.hidden).toBe(false);
    }
  });

  it("shows the host Area's theme for the whole Dungeon run, including on its dungeon-only Boss wave", () => {
    const engine = createEngine(meadowsContent, seededRng(1));
    const root = document.createElement("main");
    const app = mountApp(engine, root, resolvedMeadowsContent, noopWindowChrome);

    engine.enterDungeon("meadow-depths"); // hosted in lumbry-meadows, waves end on goblin-chief
    app.render();
    expect(root.querySelector<HTMLElement>("#backdrop")?.dataset["theme"]).toBe("meadow");
  });

  it("does not change #scene's own children count/structure beyond the new #backdrop node and #219's absolutely-positioned #widget-controls overlay (320px layout budget: no new scene-height-affecting siblings)", () => {
    const engine = createEngine(meadowsContent, seededRng(1));
    const root = document.createElement("main");
    mountApp(engine, root, resolvedMeadowsContent, noopWindowChrome);

    const scene = root.querySelector<HTMLElement>("#scene");
    const ids = Array.from(scene!.children).map((c) => c.id);
    // #widget-controls is last so it paints above everything else in DOM-order-as-paint-order,
    // without disturbing #backdrop staying first (the z-order pin the sibling test above checks).
    // It's `position: absolute` (see styles.css), so — unlike a flow sibling — it never adds to
    // #scene's own layout height.
    expect(ids).toEqual(["backdrop", "toast-container", "sprite-row", "widget-controls"]);
  });
});
