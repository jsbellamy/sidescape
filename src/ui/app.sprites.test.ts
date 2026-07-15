// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { createEngine } from "../core/engine";
import { fixtureContent } from "../core/fixture-content";
import { makeSnapshot } from "../core/make-snapshot";
import {
  content as cryptContent,
  content as darkrootContent,
  content as meadowsContent,
} from "../data";
import { seededRng } from "../core/rng";
import { resolveContent } from "../core/validate-content";
import { mountApp } from "./app";
import type { WorkspaceChrome } from "./workspace-chrome";
import { playerSprite } from "./sprites";

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
