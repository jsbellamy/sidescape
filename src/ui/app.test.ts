// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { createEngine } from "../core/engine";
import { fixtureContent } from "../core/fixture-content";
import { seededRng } from "../core/rng";
import { mountApp } from "./app";

function mount(seed: number) {
  const engine = createEngine(fixtureContent, seededRng(seed));
  const root = document.createElement("main");
  const app = mountApp(engine, root, fixtureContent);
  return { engine, root, app };
}

describe("mountApp", () => {
  it("renders the Monster picker for every unlocked Area, gating locked ones", () => {
    const { root } = mount(1);
    const dummyBtn = root.querySelector<HTMLButtonElement>('[data-monster="dummy"]');
    const bruteBtn = root.querySelector<HTMLButtonElement>('[data-monster="brute"]');
    expect(dummyBtn?.textContent).toBe("Training Dummy");
    expect(dummyBtn?.disabled).toBe(false);
    expect(bruteBtn?.disabled).toBe(true); // Test Crypt requires combat level 40
  });

  it("selecting a Monster renders its name and a full HP bar", () => {
    const { root } = mount(1);
    root.querySelector<HTMLButtonElement>('[data-monster="dummy"]')?.click();

    expect(root.querySelector("#monster-name")?.textContent).toBe("Training Dummy");
    expect((root.querySelector("#monster-hp-fill") as HTMLElement).style.width).toBe("100%");
    expect(root.querySelector("#monster-hp-text")?.textContent).toBe("3/3");
  });

  it("pumping Ticks visibly reduces the selected Monster's HP", () => {
    const { engine, root, app } = mount(99);
    root.querySelector<HTMLButtonElement>('[data-monster="dummy"]')?.click();
    expect(root.querySelector("#monster-hp-text")?.textContent).toBe("3/3");

    for (let i = 0; i < 4; i++) {
      engine.tick();
      app.render();
    }

    expect(root.querySelector("#monster-hp-text")?.textContent).toBe("2/3");
    expect((root.querySelector("#monster-hp-fill") as HTMLElement).style.width).not.toBe("100%");
  });

  it("clicking Food in the Inventory panel eats it and logs a feed line", () => {
    const { engine, root, app } = mount(1);
    root.querySelector<HTMLButtonElement>('[data-monster="dummy"]')?.click();

    // grind until a Cooked Meat drops and the player has taken some damage
    for (let i = 0; i < 2000; i++) {
      engine.tick();
      if (engine.snapshot().player.inventory.some((s) => s.itemId === "meat")) break;
    }
    app.render();
    const before = engine.snapshot().player;
    const meatQty = before.inventory.find((s) => s.itemId === "meat")?.qty ?? 0;
    expect(meatQty).toBeGreaterThan(0);

    const meatLi = root.querySelector<HTMLLIElement>('#inventory li[data-item="meat"]');
    expect(meatLi).not.toBeNull();
    meatLi?.click();

    const after = engine.snapshot().player;
    const remaining = after.inventory.find((s) => s.itemId === "meat")?.qty ?? 0;
    expect(remaining).toBe(meatQty - 1);
    expect(root.querySelector("#feed li")?.textContent).toMatch(/ate.*meat/i);
  });
});
