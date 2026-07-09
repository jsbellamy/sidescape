import { describe, expect, it } from "vitest";
import { createEngine } from "../core/engine";
import { makeSnapshot } from "../core/make-snapshot";
import { seededRng } from "../core/rng";
import { xpForLevel } from "../core/xp";
import { content } from "./index";

describe("Smithing content", () => {
  it("Bronze Bar and Iron Bar are stackable, unequippable, uneatable Materials", () => {
    const bronzeBar = content.items.find((i) => i.id === "bronze-bar");
    expect(bronzeBar).toEqual({ kind: "material", id: "bronze-bar", name: "Bronze Bar", value: 8 });

    const ironBar = content.items.find((i) => i.id === "iron-bar");
    expect(ironBar).toEqual({ kind: "material", id: "iron-bar", name: "Iron Bar", value: 20 });
  });

  it("materials are appended after existing items (append-only: cooked-shrimp still precedes them)", () => {
    const ids = content.items.map((i) => i.id);
    expect(ids.indexOf("cooked-shrimp")).toBeLessThan(ids.indexOf("bronze-bar"));
    expect(ids.indexOf("bronze-bar")).toBeLessThan(ids.indexOf("iron-bar"));
  });

  it("no second currency-kind item exists once Materials are added", () => {
    const currencyItems = content.items.filter((i) => i.kind === "currency");
    expect(currencyItems).toHaveLength(1);
    expect(currencyItems[0]?.id).toBe("gold");
  });

  it("Bronze Bar drops from Goblin (0.25, common) and Cow (0.2, common)", () => {
    const goblin = content.monsters.find((m) => m.id === "goblin")!;
    expect(goblin.dropTable).toContainEqual({
      itemId: "bronze-bar",
      qty: 1,
      chance: 0.25,
      band: "common",
    });
    const cow = content.monsters.find((m) => m.id === "cow")!;
    expect(cow.dropTable).toContainEqual({
      itemId: "bronze-bar",
      qty: 1,
      chance: 0.2,
      band: "common",
    });
  });

  it("Iron Bar drops from Goblin Warrior (0.25, common) and Bandit (0.3, common)", () => {
    const goblinWarrior = content.monsters.find((m) => m.id === "goblin-warrior")!;
    expect(goblinWarrior.dropTable).toContainEqual({
      itemId: "iron-bar",
      qty: 1,
      chance: 0.25,
      band: "common",
    });
    const bandit = content.monsters.find((m) => m.id === "bandit")!;
    expect(bandit.dropTable).toContainEqual({
      itemId: "iron-bar",
      qty: 1,
      chance: 0.3,
      band: "common",
    });
  });

  it("every Recipe's inputs and outputItemId resolve to real Items", () => {
    for (const recipe of content.recipes) {
      for (const input of recipe.inputs) {
        const item = content.items.find((i) => i.id === input.itemId);
        expect(item, `${recipe.id} input ${input.itemId} not found`).toBeDefined();
      }
      const output = content.items.find((i) => i.id === recipe.outputItemId);
      expect(output, `${recipe.id} outputItemId ${recipe.outputItemId} not found`).toBeDefined();
    }
  });

  it("defines the five starter Recipes with the documented level gates and inputs", () => {
    const byId = Object.fromEntries(content.recipes.map((r) => [r.id, r]));
    expect(byId["bronze-dagger"]).toMatchObject({
      levelReq: 1,
      inputs: [{ itemId: "bronze-bar", qty: 1 }],
      outputItemId: "bronze-dagger",
    });
    expect(byId["bronze-shield"]).toMatchObject({
      levelReq: 5,
      inputs: [{ itemId: "bronze-bar", qty: 2 }],
      outputItemId: "bronze-shield",
    });
    expect(byId["bronze-sword"]).toMatchObject({
      levelReq: 8,
      inputs: [{ itemId: "bronze-bar", qty: 2 }],
      outputItemId: "bronze-sword",
    });
    expect(byId["iron-dagger"]).toMatchObject({
      levelReq: 15,
      inputs: [{ itemId: "iron-bar", qty: 2 }],
      outputItemId: "iron-dagger",
    });
    expect(byId["iron-chainbody"]).toMatchObject({
      levelReq: 20,
      inputs: [{ itemId: "iron-bar", qty: 3 }],
      outputItemId: "iron-chainbody",
    });
  });

  it("a fresh (level 1) player can select the level-1 Bronze Dagger recipe once they own a Bronze Bar", () => {
    const engine = createEngine(
      content,
      seededRng(1),
      makeSnapshot({ bank: { items: [{ itemId: "bronze-bar", qty: 1 }] } }),
    );
    expect(() => engine.selectRecipe("bronze-dagger")).not.toThrow();
    expect(engine.snapshot().smithing).toEqual({
      recipeId: "bronze-dagger",
      name: "Bronze Dagger",
    });
  });

  it("a fresh (level 1) player is gated out of the level-20 Iron Chainbody recipe even with enough bars", () => {
    const engine = createEngine(
      content,
      seededRng(1),
      makeSnapshot({ bank: { items: [{ itemId: "iron-bar", qty: 5 }] } }),
    );
    expect(() => engine.selectRecipe("iron-chainbody")).toThrow(/smithing level 20/i);
  });

  it("a veteran Smith crafts an Iron Chainbody end-to-end: bars consumed, item granted, Smithing XP granted", () => {
    const engine = createEngine(
      content,
      seededRng(1),
      makeSnapshot({
        player: {
          skills: { smithing: { level: 20, xp: xpForLevel(20) } },
        },
        bank: { items: [{ itemId: "iron-bar", qty: 3 }] },
      }),
    );
    engine.selectRecipe("iron-chainbody");
    for (let i = 0; i < 15; i++) engine.tick(); // craftTicks === 15

    const snap = engine.snapshot();
    expect(snap.bank.items.find((s) => s.itemId === "iron-bar")).toBeUndefined();
    expect(snap.bank.items.find((s) => s.itemId === "iron-chainbody")?.qty).toBe(1);
    expect(snap.player.skills.smithing.xp).toBeGreaterThan(xpForLevel(20));
    expect(snap.smithing).toBeNull(); // no bars left for another craft
  });
});
