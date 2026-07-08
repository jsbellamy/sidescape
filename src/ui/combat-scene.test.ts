// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { createEngine } from "../core/engine";
import { fixtureContent } from "../core/fixture-content";
import { content as meadowsContent } from "../data";
import { seededRng } from "../core/rng";
import { mountApp } from "./app";
import { playerSprite } from "./sprites";

describe("combat scene sprites", () => {
  it("shows a pixelated player sprite as soon as the app mounts", () => {
    const engine = createEngine(meadowsContent, seededRng(1));
    const root = document.createElement("main");
    mountApp(engine, root, meadowsContent);

    const playerImg = root.querySelector<HTMLImageElement>("#player-sprite");
    expect(playerImg).not.toBeNull();
    expect(playerImg?.getAttribute("src")).toBe(playerSprite);
    expect(playerImg?.classList.contains("pixel")).toBe(true);
  });

  it("renders a distinct, pixelated sprite for Chicken, Cow, and Goblin", () => {
    const seen = new Set<string>();
    for (const monsterId of ["chicken", "cow", "goblin"]) {
      const engine = createEngine(meadowsContent, seededRng(1));
      const root = document.createElement("main");
      const app = mountApp(engine, root, meadowsContent);

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
    mountApp(engine, root, meadowsContent);

    const monsterImg = root.querySelector<HTMLImageElement>("#monster-sprite");
    expect(monsterImg?.hidden).toBe(true);
  });

  it("does not break on a fixture Monster with no mapped sprite", () => {
    const engine = createEngine(fixtureContent, seededRng(1));
    const root = document.createElement("main");
    const app = mountApp(engine, root, fixtureContent);

    engine.selectMonster("dummy");
    app.render();

    const monsterImg = root.querySelector<HTMLImageElement>("#monster-sprite");
    expect(monsterImg?.hidden).toBe(true);
  });
});
