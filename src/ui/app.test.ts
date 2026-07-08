// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { createEngine } from "../core/engine";
import { fixtureContent } from "../core/fixture-content";
import { xpForLevel } from "../core/xp";
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

  it("shows a sell button with price only for items with a value", () => {
    const noValueContent = {
      ...fixtureContent,
      items: fixtureContent.items.map((i) => {
        if (i.id !== "lucky-charm" || i.kind === "currency") return i;
        const { value: _value, ...rest } = i;
        return rest;
      }),
    };
    const engine = createEngine(noValueContent, seededRng(1), {
      player: {
        hp: 10,
        maxHp: 10,
        combatLevel: 3,
        combatStyle: "aggressive",
        skills: {
          attack: { level: 1, xp: 0 },
          strength: { level: 1, xp: 0 },
          defence: { level: 1, xp: 0 },
          hitpoints: { level: 10, xp: xpForLevel(10) },
        },
        equipment: { weapon: null, shield: null, head: null, body: null, legs: null },
        inventory: [
          { itemId: "meat", qty: 1 },
          { itemId: "lucky-charm", qty: 1 },
        ],
        respawning: false,
      },
      monster: null,
      areas: [],
    });
    const root = document.createElement("main");
    mountApp(engine, root, noValueContent);

    const meatLi = root.querySelector('#inventory li[data-item="meat"]');
    expect(meatLi?.querySelector('[data-sell="meat"]')?.textContent).toBe("Sell 3g");

    const charmLi = root.querySelector('#inventory li[data-item="lucky-charm"]');
    expect(charmLi?.querySelector('[data-sell="lucky-charm"]')).toBeNull();
  });

  it("clicking sell sells exactly one unit of Equipment, credits gold, logs a feed line, and does not equip it", () => {
    const { engine, root, app } = mount(1);
    root.querySelector<HTMLButtonElement>('[data-monster="dummy"]')?.click();

    for (let i = 0; i < 20_000; i++) {
      engine.tick();
      if (engine.snapshot().player.inventory.some((s) => s.itemId === "bronze-sword")) break;
    }
    app.render();
    const before = engine.snapshot().player;
    const swordQty = before.inventory.find((s) => s.itemId === "bronze-sword")?.qty ?? 0;
    const goldBefore = before.inventory.find((s) => s.itemId === "gold")?.qty ?? 0;
    expect(swordQty).toBeGreaterThan(0);

    const sellBtn = root.querySelector<HTMLButtonElement>('[data-sell="bronze-sword"]');
    expect(sellBtn?.textContent).toBe("Sell 20g");
    sellBtn?.click();

    const after = engine.snapshot().player;
    expect(after.inventory.find((s) => s.itemId === "bronze-sword")?.qty ?? 0).toBe(swordQty - 1);
    expect(after.inventory.find((s) => s.itemId === "gold")?.qty).toBe(goldBefore + 20);
    expect(after.equipment.weapon).toBeNull(); // sold, not equipped
    expect(root.querySelector("#feed li")?.textContent).toMatch(/sold.*bronze sword.*\+20g/i);
    expect(root.querySelector("#gold")?.textContent).toContain(String(goldBefore + 20));
  });

  it("clicking sell on Food sells it instead of eating it (no HP change, no food-eaten line)", () => {
    const { engine, root, app } = mount(1);
    root.querySelector<HTMLButtonElement>('[data-monster="dummy"]')?.click();

    for (let i = 0; i < 2000; i++) {
      engine.tick();
      if (engine.snapshot().player.inventory.some((s) => s.itemId === "meat")) break;
    }
    app.render();
    const before = engine.snapshot().player;
    const meatQty = before.inventory.find((s) => s.itemId === "meat")?.qty ?? 0;
    const hpBefore = before.hp;

    const sellBtn = root.querySelector<HTMLButtonElement>('[data-sell="meat"]');
    expect(sellBtn?.textContent).toBe("Sell 3g");
    sellBtn?.click();

    const after = engine.snapshot().player;
    expect(after.inventory.find((s) => s.itemId === "meat")?.qty ?? 0).toBe(meatQty - 1);
    expect(after.hp).toBe(hpBefore); // not eaten, so no healing
    expect(root.querySelector("#feed li")?.textContent).toMatch(/sold.*meat.*\+3g/i);
    expect(root.querySelector("#feed li")?.textContent).not.toMatch(/ate/i);
  });
});

describe("Combat Style selector", () => {
  function styleButtons(root: HTMLElement) {
    return [...root.querySelectorAll<HTMLButtonElement>("#style-row button")];
  }

  it("renders one button per Combat Style, generated from the label map (not hard-coded)", () => {
    const { root } = mount(1);
    const buttons = styleButtons(root);
    expect(buttons).toHaveLength(3);
    const styles = buttons.map((b) => b.dataset["style"]).sort();
    expect(styles).toEqual(["accurate", "aggressive", "defensive"]);
  });

  it("the active button reflects the Engine's default Combat Style on mount", () => {
    const { root } = mount(1);
    const buttons = styleButtons(root);
    const active = buttons.filter((b) => b.classList.contains("active"));
    expect(active).toHaveLength(1);
    expect(active[0]?.dataset["style"]).toBe("aggressive");
  });

  it("highlights a non-default Combat Style when mounted from a saved Snapshot", () => {
    const engine = createEngine(fixtureContent, seededRng(1), {
      player: {
        hp: 10,
        maxHp: 10,
        combatLevel: 3,
        combatStyle: "defensive",
        skills: {
          attack: { level: 1, xp: 0 },
          strength: { level: 1, xp: 0 },
          defence: { level: 1, xp: 0 },
          hitpoints: { level: 10, xp: xpForLevel(10) },
        },
        equipment: { weapon: null, shield: null, head: null, body: null, legs: null },
        inventory: [],
        respawning: false,
      },
      monster: null,
      areas: [],
    });
    const root = document.createElement("main");
    mountApp(engine, root, fixtureContent);

    const active = styleButtons(root).filter((b) => b.classList.contains("active"));
    expect(active).toHaveLength(1);
    expect(active[0]?.dataset["style"]).toBe("defensive");
  });

  it("clicking a style updates the active button and calls setCombatStyle on the Engine", () => {
    const { engine, root } = mount(1);
    root.querySelector<HTMLButtonElement>('[data-style="accurate"]')?.click();

    expect(engine.snapshot().player.combatStyle).toBe("accurate");
    const active = styleButtons(root).filter((b) => b.classList.contains("active"));
    expect(active).toHaveLength(1);
    expect(active[0]?.dataset["style"]).toBe("accurate");
  });

  it("routes subsequent kill XP to the matching Skill, with Hitpoints XP still trickling", () => {
    const { engine, root } = mount(7);
    root.querySelector<HTMLButtonElement>('[data-style="accurate"]')?.click();
    root.querySelector<HTMLButtonElement>('[data-monster="dummy"]')?.click();

    for (let i = 0; i < 400; i++) engine.tick();

    const { skills } = engine.snapshot().player;
    expect(skills.attack.xp).toBeGreaterThan(0);
    expect(skills.strength.xp).toBe(0);
    expect(skills.hitpoints.xp).toBeGreaterThan(xpForLevel(10));
  });
});
