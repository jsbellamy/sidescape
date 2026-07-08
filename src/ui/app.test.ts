// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { createEngine } from "../core/engine";
import { fixtureContent } from "../core/fixture-content";
import { makeSnapshot } from "../core/make-snapshot";
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
    const engine = createEngine(
      noValueContent,
      seededRng(1),
      makeSnapshot({
        player: {
          hp: 10,
          maxHp: 10,
          skills: { hitpoints: { level: 10, xp: xpForLevel(10) } },
          inventory: [
            { itemId: "meat", qty: 1 },
            { itemId: "lucky-charm", qty: 1 },
          ],
        },
      }),
    );
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

describe("Monster stats line", () => {
  it("shows attack level, defence level, max hit, and attack speed for the selected Monster", () => {
    const { root } = mount(1);
    root.querySelector<HTMLButtonElement>('[data-monster="dummy"]')?.click();

    const stats = root.querySelector<HTMLElement>("#monster-stats");
    expect(stats?.hidden).toBe(false);
    expect(stats?.textContent).toBe("Atk 1 · Def 1 · Max hit 1 · Speed 4t");
  });

  it("updates the stats line when a different Monster is selected", () => {
    // Test Crypt requires combat level 40 (avg of attack/strength/defence/hitpoints), so raise
    // all four to unlock the "brute" button.
    const engine = createEngine(
      fixtureContent,
      seededRng(1),
      makeSnapshot({
        player: {
          hp: 40,
          maxHp: 40,
          skills: {
            attack: { level: 40, xp: xpForLevel(40) },
            strength: { level: 40, xp: xpForLevel(40) },
            defence: { level: 40, xp: xpForLevel(40) },
            hitpoints: { level: 40, xp: xpForLevel(40) },
          },
        },
      }),
    );
    const root = document.createElement("main");
    mountApp(engine, root, fixtureContent);
    root.querySelector<HTMLButtonElement>('[data-monster="brute"]')?.click();

    expect(root.querySelector("#monster-stats")?.textContent).toBe(
      "Atk 40 · Def 40 · Max hit 8 · Speed 4t",
    );
  });

  it("is absent (hidden, no text) before any Monster is selected", () => {
    const { root } = mount(1);
    const stats = root.querySelector<HTMLElement>("#monster-stats");
    expect(stats?.hidden).toBe(true);
    expect(stats?.textContent).toBe("");
  });

  it("is absent while Fishing", () => {
    const { root } = mount(1);
    root.querySelector<HTMLButtonElement>('[data-monster="dummy"]')?.click();
    root.querySelector<HTMLButtonElement>('[data-spot="pond"]')?.click();

    const stats = root.querySelector<HTMLElement>("#monster-stats");
    expect(stats?.hidden).toBe(true);
    expect(stats?.textContent).toBe("");
  });
});

describe("Monster picker Drop Table tooltip", () => {
  it("lists every Drop Table entry with its band and a human-readable chance", () => {
    const { root } = mount(1);
    const dummyBtn = root.querySelector<HTMLButtonElement>('[data-monster="dummy"]');

    expect(dummyBtn?.title).toBe(
      [
        "Gold ×5 — always",
        "Cooked Meat ×1 — common 1/4",
        "Bronze Sword ×1 — uncommon 1/16",
        "Lucky Charm ×1 — rare 1/128",
      ].join("\n"),
    );
  });

  it("gives each Monster its own tooltip, keyed off its Drop Table", () => {
    const { root } = mount(1);
    const bruteBtn = root.querySelector<HTMLButtonElement>('[data-monster="brute"]');

    expect(bruteBtn?.title).toBe("Gold ×200 — always");
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
    const engine = createEngine(
      fixtureContent,
      seededRng(1),
      makeSnapshot({
        player: {
          hp: 10,
          maxHp: 10,
          combatStyle: "defensive",
          skills: { hitpoints: { level: 10, xp: xpForLevel(10) } },
        },
      }),
    );
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

describe("Auto-eat threshold selector", () => {
  function thresholdButtons(root: HTMLElement) {
    return [...root.querySelectorAll<HTMLButtonElement>("#autoeat-row button")];
  }

  it("renders one button per threshold, generated from the label map (not hard-coded)", () => {
    const { root } = mount(1);
    const buttons = thresholdButtons(root);
    expect(buttons).toHaveLength(4);
    const labels = buttons.map((b) => b.textContent);
    expect(labels).toEqual(["Off", "25%", "50%", "75%"]);
  });

  it("the active button reflects the Engine's default threshold (50%) on mount", () => {
    const { root } = mount(1);
    const active = thresholdButtons(root).filter((b) => b.classList.contains("active"));
    expect(active).toHaveLength(1);
    expect(active[0]?.dataset["threshold"]).toBe("0.5");
  });

  it("highlights a non-default threshold when mounted from a saved Snapshot", () => {
    const engine = createEngine(
      fixtureContent,
      seededRng(1),
      makeSnapshot({
        player: {
          hp: 10,
          maxHp: 10,
          autoEatThreshold: 0.25,
          skills: { hitpoints: { level: 10, xp: xpForLevel(10) } },
        },
      }),
    );
    const root = document.createElement("main");
    mountApp(engine, root, fixtureContent);

    const active = thresholdButtons(root).filter((b) => b.classList.contains("active"));
    expect(active).toHaveLength(1);
    expect(active[0]?.dataset["threshold"]).toBe("0.25");
  });

  it("clicking a threshold updates the active button and calls setAutoEatThreshold on the Engine", () => {
    const { engine, root } = mount(1);
    root.querySelector<HTMLButtonElement>('[data-threshold="0"]')?.click();

    expect(engine.snapshot().player.autoEatThreshold).toBe(0);
    const active = thresholdButtons(root).filter((b) => b.classList.contains("active"));
    expect(active).toHaveLength(1);
    expect(active[0]?.dataset["threshold"]).toBe("0");
  });
});

describe("XP progress bars", () => {
  it("shows a fill bar at 0% right at a level threshold", () => {
    const engine = createEngine(
      fixtureContent,
      seededRng(1),
      makeSnapshot({
        player: {
          hp: 10,
          maxHp: 10,
          skills: { hitpoints: { level: 10, xp: xpForLevel(10) } },
        },
      }),
    );
    const root = document.createElement("main");
    mountApp(engine, root, fixtureContent);

    const fill = root.querySelector<HTMLElement>('[data-skill="hitpoints"] .skill-bar-fill');
    expect(fill?.style.width).toBe("0%");
  });

  it("shows a fill bar approaching 100% just below the next level threshold", () => {
    const nextFloor = xpForLevel(11);
    const engine = createEngine(
      fixtureContent,
      seededRng(1),
      makeSnapshot({
        player: {
          hp: 10,
          maxHp: 10,
          skills: { hitpoints: { level: 10, xp: nextFloor - 1 } },
        },
      }),
    );
    const root = document.createElement("main");
    mountApp(engine, root, fixtureContent);

    const fill = root.querySelector<HTMLElement>('[data-skill="hitpoints"] .skill-bar-fill');
    expect(fill?.style.width).toBe("99%");
  });

  it("bar fill changes after XP-granting Ticks", () => {
    const { engine, root, app } = mount(7);
    root.querySelector<HTMLButtonElement>('[data-monster="dummy"]')?.click();

    const before = root.querySelector<HTMLElement>('[data-skill="hitpoints"] .skill-bar-fill')
      ?.style.width;

    for (let i = 0; i < 400; i++) engine.tick();
    app.render();

    const after = root.querySelector<HTMLElement>('[data-skill="hitpoints"] .skill-bar-fill')?.style
      .width;
    expect(after).not.toBe(before);
  });

  it("shows exact XP in a tooltip on the Skill chip", () => {
    const { engine, root } = mount(1);
    const xp = Math.floor(engine.snapshot().player.skills.attack.xp);

    const attackSkill = root.querySelector<HTMLElement>('[data-skill="attack"]');
    expect(attackSkill?.title).toBe(`attack: ${xp} xp`);
  });
});

describe("Panel tabs", () => {
  function tabButtons(root: HTMLElement) {
    return [...root.querySelectorAll<HTMLButtonElement>("#tab-row button")];
  }

  it("renders one tab per panel — Loot Feed, Equipment, Inventory — Loot Feed active by default", () => {
    const { root } = mount(1);
    const buttons = tabButtons(root);
    expect(buttons.map((b) => b.textContent)).toEqual(["Loot Feed", "Equipment", "Inventory"]);

    const active = buttons.filter((b) => b.classList.contains("active"));
    expect(active).toHaveLength(1);
    expect(active[0]?.dataset["tab"]).toBe("loot");
  });

  it("only the active tab's panel is visible on mount", () => {
    const { root } = mount(1);
    expect(root.querySelector<HTMLElement>('[data-tab-panel="loot"]')?.hidden).toBe(false);
    expect(root.querySelector<HTMLElement>('[data-tab-panel="equipment"]')?.hidden).toBe(true);
    expect(root.querySelector<HTMLElement>('[data-tab-panel="inventory"]')?.hidden).toBe(true);
  });

  it("clicking a tab swaps the visible panel and highlights the clicked tab", () => {
    const { root } = mount(1);
    root.querySelector<HTMLButtonElement>('[data-tab="equipment"]')?.click();

    expect(root.querySelector<HTMLElement>('[data-tab-panel="equipment"]')?.hidden).toBe(false);
    expect(root.querySelector<HTMLElement>('[data-tab-panel="loot"]')?.hidden).toBe(true);
    expect(root.querySelector<HTMLElement>('[data-tab-panel="inventory"]')?.hidden).toBe(true);

    const active = tabButtons(root).filter((b) => b.classList.contains("active"));
    expect(active).toHaveLength(1);
    expect(active[0]?.dataset["tab"]).toBe("equipment");
  });

  it("the active tab persists visually across re-renders", () => {
    const { engine, root, app } = mount(1);
    root.querySelector<HTMLButtonElement>('[data-tab="inventory"]')?.click();

    engine.tick();
    app.render();

    expect(root.querySelector<HTMLElement>('[data-tab-panel="inventory"]')?.hidden).toBe(false);
    const active = tabButtons(root).filter((b) => b.classList.contains("active"));
    expect(active[0]?.dataset["tab"]).toBe("inventory");
  });

  it("existing panel content (Equipment, Inventory, Loot Feed) still renders inside its tab panel", () => {
    const { root } = mount(1);
    expect(root.querySelector("#equipment")).not.toBeNull();
    expect(root.querySelector("#inventory")).not.toBeNull();
    expect(root.querySelector("#feed")).not.toBeNull();
    expect(root.querySelector("#gold")).not.toBeNull();
  });
});

describe("Fishing", () => {
  it("renders a 🎣 Fishing Spot button under each Area, disabled when locked", () => {
    const { root } = mount(1);
    const pondBtn = root.querySelector<HTMLButtonElement>('[data-spot="pond"]');
    const deepPondBtn = root.querySelector<HTMLButtonElement>('[data-spot="deep-pond"]');
    expect(pondBtn?.textContent).toBe("🎣 Test Pond");
    expect(pondBtn?.disabled).toBe(false);
    expect(deepPondBtn?.disabled).toBe(true); // behind the Test Crypt's combat-level gate
  });

  it("XP row shows 5 chips, including a FIS chip for Fishing", () => {
    const { root } = mount(1);
    const abbrs = [...root.querySelectorAll(".skill-abbr")].map((el) => el.textContent);
    expect(abbrs).toEqual(["ATT", "STR", "DEF", "HIT", "FIS"]);
  });

  it("selecting a Fishing Spot shows the fishing scene, hiding the Monster HP bar and sprite", () => {
    const { root } = mount(1);
    root.querySelector<HTMLButtonElement>('[data-spot="pond"]')?.click();

    expect(root.querySelector("#monster-name")?.textContent).toBe("🎣 Fishing at Test Pond");
    expect((root.querySelector("#monster-bar") as HTMLElement).hidden).toBe(true);
    expect((root.querySelector("#monster-sprite") as HTMLElement).hidden).toBe(true);
  });

  it("selecting a Monster afterwards restores the normal combat scene", () => {
    const { root } = mount(1);
    root.querySelector<HTMLButtonElement>('[data-spot="pond"]')?.click();
    root.querySelector<HTMLButtonElement>('[data-monster="dummy"]')?.click();

    expect(root.querySelector("#monster-name")?.textContent).toBe("Training Dummy");
    expect((root.querySelector("#monster-bar") as HTMLElement).hidden).toBe(false);
  });

  it("logs a feed line when a Catch lands and grants Fishing XP (fixture pond has catchChance 1)", () => {
    const { engine, root, app } = mount(1);
    root.querySelector<HTMLButtonElement>('[data-spot="pond"]')?.click();

    for (let i = 0; i < 3; i++) engine.tick(); // pond.catchTicks === 3
    app.render();

    expect(root.querySelector("#feed li")?.textContent).toMatch(/caught.*meat/i);
    expect(engine.snapshot().player.skills.fishing.xp).toBeGreaterThan(0);
    expect(engine.snapshot().player.inventory.find((s) => s.itemId === "meat")?.qty).toBe(1);
  });
});
