// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { createEngine } from "../core/engine";
import { fixtureContent } from "../core/testing/fixture-content";
import { makeSnapshot } from "../core/testing/make-snapshot";
import {
  content as cryptContent,
  content as darkrootContent,
  content as meadowsContent,
} from "../data";
import { seededRng } from "../core/rng";
import { resolveContent } from "../core/validate-content";
import { mountApp } from "./app";
import type { WorkspaceChrome } from "./workspace-chrome";
import { playerFishingSprite, playerSprite, spriteEdgePx, playerSpriteSize } from "./sprites";

const resolvedMeadowsContent = resolveContent(meadowsContent);
const resolvedDarkrootContent = resolveContent(darkrootContent);
const resolvedCryptContent = resolveContent(cryptContent);
const resolvedFixtureContent = resolveContent(fixtureContent);

const noopWindowChrome: WorkspaceChrome = {
  getCapacity: () => Promise.resolve(2),
  setCardCount: () => Promise.resolve(),
};

describe("combat scene sprites", () => {
  it("shows a pixelated player sprite as soon as the app mounts", () => {
    const engine = createEngine(meadowsContent, seededRng(1));
    const root = document.createElement("main");
    mountApp(engine, root, resolvedMeadowsContent, noopWindowChrome);

    const playerImg = root.querySelector<HTMLImageElement>("#player-sprite");
    expect(playerImg).not.toBeNull();
    expect(playerImg?.getAttribute("src")).toBe(playerSprite);
    expect(playerImg?.classList.contains("pixel")).toBe(true);
  });

  it("renders a distinct, pixelated sprite for every Meadow Depths Monster", () => {
    const seen = new Set<string>();
    for (const monsterId of ["chicken", "cow", "goblin", "goblin-brute", "goblin-chief"]) {
      const engine = createEngine(meadowsContent, seededRng(1));
      const root = document.createElement("main");
      const app = mountApp(engine, root, resolvedMeadowsContent, noopWindowChrome);

      engine.selectMonster(monsterId);
      app.render();

      const monsterImg = root.querySelector<HTMLImageElement>("#monster-sprite");
      const src = monsterImg?.getAttribute("src");
      expect(src, `${monsterId} should render a sprite`).toBeTruthy();
      expect(monsterImg?.classList.contains("pixel")).toBe(true);
      seen.add(src!);
    }
    expect(seen.size).toBe(5);
  });

  it("renders a distinct, pixelated sprite for every Darkroot Forest Monster and its Dungeon Boss", () => {
    const seen = new Set<string>();
    for (const monsterId of ["wolf", "goblin-warrior", "bandit", "hollow-warden"]) {
      const engine = createEngine(
        darkrootContent,
        seededRng(1),
        makeSnapshot({ player: { completedDungeonIds: ["meadow-depths"] } }),
      );
      const root = document.createElement("main");
      const app = mountApp(engine, root, resolvedDarkrootContent, noopWindowChrome);

      engine.selectMonster(monsterId);
      app.render();

      const monsterImg = root.querySelector<HTMLImageElement>("#monster-sprite");
      const src = monsterImg?.getAttribute("src");
      expect(src, `${monsterId} should render a sprite`).toBeTruthy();
      expect(monsterImg?.classList.contains("pixel")).toBe(true);
      seen.add(src!);
    }
    expect(seen.size).toBe(4);
  });

  it("renders a distinct, pixelated sprite for every Old Sewers Monster and its Dungeon Boss", () => {
    const seen = new Set<string>();
    for (const monsterId of ["giant-rat", "zombie", "skeleton", "sewer-king"]) {
      const engine = createEngine(
        darkrootContent,
        seededRng(1),
        makeSnapshot({ player: { completedDungeonIds: ["darkroot-hollow"] } }),
      );
      const root = document.createElement("main");
      const app = mountApp(engine, root, resolvedDarkrootContent, noopWindowChrome);

      engine.selectMonster(monsterId);
      app.render();

      const monsterImg = root.querySelector<HTMLImageElement>("#monster-sprite");
      const src = monsterImg?.getAttribute("src");
      expect(src, `${monsterId} should render a sprite`).toBeTruthy();
      expect(monsterImg?.classList.contains("pixel")).toBe(true);
      seen.add(src!);
    }
    expect(seen.size).toBe(4);
  });

  it("renders a distinct, pixelated sprite for every Bone Crypt Monster and its Dungeon Boss", () => {
    const seen = new Set<string>();
    for (const monsterId of ["crypt-ghoul", "bone-knight", "crypt-shade"]) {
      const engine = createEngine(
        cryptContent,
        seededRng(1),
        makeSnapshot({ player: { completedDungeonIds: ["sewer-king"] } }),
      );
      const root = document.createElement("main");
      const app = mountApp(engine, root, resolvedCryptContent, noopWindowChrome);

      engine.selectMonster(monsterId);
      app.render();

      const monsterImg = root.querySelector<HTMLImageElement>("#monster-sprite");
      const src = monsterImg?.getAttribute("src");
      expect(src, `${monsterId} should render a sprite`).toBeTruthy();
      expect(monsterImg?.classList.contains("pixel")).toBe(true);
      seen.add(src!);
    }
    expect(seen.size).toBe(3);
  });

  it("renders a distinct, pixelated sprite for every Frostspire Monster and its Dungeon Boss", () => {
    const seen = new Set<string>();
    for (const monsterId of ["frost-wolf", "ice-wraith", "frost-giant", "frost-warden"]) {
      const engine = createEngine(
        cryptContent,
        seededRng(1),
        makeSnapshot({ player: { completedDungeonIds: ["shade-crypt"] } }),
      );
      const root = document.createElement("main");
      const app = mountApp(engine, root, resolvedCryptContent, noopWindowChrome);

      engine.selectMonster(monsterId);
      app.render();

      const monsterImg = root.querySelector<HTMLImageElement>("#monster-sprite");
      const src = monsterImg?.getAttribute("src");
      expect(src, `${monsterId} should render a sprite`).toBeTruthy();
      expect(monsterImg?.classList.contains("pixel")).toBe(true);
      seen.add(src!);
    }
    expect(seen.size).toBe(4);
  });

  it("hides the Monster sprite before a Monster is selected", () => {
    const engine = createEngine(meadowsContent, seededRng(1));
    const root = document.createElement("main");
    mountApp(engine, root, resolvedMeadowsContent, noopWindowChrome);

    const monsterImg = root.querySelector<HTMLImageElement>("#monster-sprite");
    expect(monsterImg?.hidden).toBe(true);
  });

  it("does not break on a fixture Monster with no mapped sprite", () => {
    const engine = createEngine(fixtureContent, seededRng(1));
    const root = document.createElement("main");
    const app = mountApp(engine, root, resolvedFixtureContent, noopWindowChrome);

    engine.selectMonster("dummy");
    app.render();

    const monsterImg = root.querySelector<HTMLImageElement>("#monster-sprite");
    expect(monsterImg?.hidden).toBe(true);
  });
});

describe("player pose per activity", () => {
  function playerImg(root: HTMLElement) {
    return root.querySelector<HTMLImageElement>("#player-sprite");
  }

  it("shows the standing pose on idle boot", () => {
    const engine = createEngine(fixtureContent, seededRng(1));
    const root = document.createElement("main");
    mountApp(engine, root, resolvedFixtureContent, noopWindowChrome);

    expect(playerImg(root)?.getAttribute("src")).toBe(playerSprite);
    expect(playerImg(root)?.style.getPropertyValue("--sprite-edge")).toBe(
      `${spriteEdgePx(playerSpriteSize)}px`,
    );
  });

  it("swaps to the fishing pose while fishing", () => {
    const engine = createEngine(fixtureContent, seededRng(1));
    const root = document.createElement("main");
    const app = mountApp(engine, root, resolvedFixtureContent, noopWindowChrome);

    engine.selectFishingSpot("pond");
    app.render();

    expect(playerImg(root)?.getAttribute("src")).toBe(playerFishingSprite);
    expect(playerImg(root)?.style.getPropertyValue("--sprite-edge")).toBe(
      `${spriteEdgePx(playerSpriteSize)}px`,
    );
  });

  it("restores the standing pose when switching from fishing to combat", () => {
    const engine = createEngine(fixtureContent, seededRng(1));
    const root = document.createElement("main");
    const app = mountApp(engine, root, resolvedFixtureContent, noopWindowChrome);

    engine.selectFishingSpot("pond");
    app.render();
    expect(playerImg(root)?.getAttribute("src")).toBe(playerFishingSprite);

    engine.selectMonster("dummy");
    app.render();
    expect(playerImg(root)?.getAttribute("src")).toBe(playerSprite);
  });

  it("restores the standing pose when switching from fishing to production", () => {
    const engine = createEngine(
      fixtureContent,
      seededRng(1),
      makeSnapshot({ bank: { items: [{ itemId: "bar", qty: 5 }] } }),
    );
    const root = document.createElement("main");
    const app = mountApp(engine, root, resolvedFixtureContent, noopWindowChrome);

    engine.selectFishingSpot("pond");
    app.render();
    expect(playerImg(root)?.getAttribute("src")).toBe(playerFishingSprite);

    engine.selectRecipe("test-sword");
    app.render();
    expect(playerImg(root)?.getAttribute("src")).toBe(playerSprite);
  });

  it("does not reassign the player sprite src on ticks where the pose is unchanged", () => {
    const engine = createEngine(fixtureContent, seededRng(1));
    const root = document.createElement("main");
    const app = mountApp(engine, root, resolvedFixtureContent, noopWindowChrome);

    engine.selectFishingSpot("pond");
    app.render();

    const img = playerImg(root)!;
    const setAttribute = vi.spyOn(img, "setAttribute");

    app.render();
    app.render();

    const srcAssignments = setAttribute.mock.calls.filter(([name]) => name === "src");
    expect(srcAssignments).toHaveLength(0);
  });
});
