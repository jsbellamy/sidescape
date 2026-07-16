import { describe, expect, it } from "vitest";
import { createEngine } from "../core/engine";
import { makeSnapshot } from "../core/make-snapshot";
import { seededRng } from "../core/rng";
import { xpForLevel } from "../core/xp";
import { content } from "./index";

describe("Smithing content", () => {
  it("Bronze Bar and Iron Bar are stackable, unequippable, uneatable Materials", () => {
    const bronzeBar = content.items.find((i) => i.id === "bronze-bar");
    expect(bronzeBar).toEqual({
      kind: "material",
      id: "bronze-bar",
      name: "Bronze Bar",
      icon: "bronze-bar",
      value: 8,
    });

    const ironBar = content.items.find((i) => i.id === "iron-bar");
    expect(ironBar).toEqual({
      kind: "material",
      id: "iron-bar",
      name: "Iron Bar",
      icon: "iron-bar",
      value: 20,
    });
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

  // Issue #251 retired the referential "every Recipe's inputs and outputItemId resolve to real
  // Items" check from here — it duplicated validateContent, the single owner of referential
  // integrity (src/core/validate-content.ts).

  it("defines the five starter Recipes with the documented level gates and inputs (#251: bronze reproduces exactly; iron's levelReq/bar-cost move as part of the deliberate rebalance)", () => {
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
    // #251: dagger's uniform bar-cost-1 (FAMILY_BAR_COST) drops iron-dagger from 2 bars to 1;
    // levelReq (15) is unaffected, since the dagger family's level offset is 0 at every tier.
    expect(byId["iron-dagger"]).toMatchObject({
      levelReq: 15,
      inputs: [{ itemId: "iron-bar", qty: 1 }],
      outputItemId: "iron-dagger",
    });
    // #251: chainbody's FAMILY_LEVEL_OFFSET (9) moves iron-chainbody's levelReq from 20 to 24.
    expect(byId["iron-chainbody"]).toMatchObject({
      levelReq: 24,
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
    expect(engine.snapshot().production).toEqual({
      recipeId: "bronze-dagger",
      name: "Bronze Dagger",
      skill: "smithing",
      progress: 0,
    });
  });

  it("a fresh (level 1) player is gated out of the level-24 Iron Chainbody recipe even with enough bars (#251: levelReq 20 -> 24)", () => {
    const engine = createEngine(
      content,
      seededRng(1),
      makeSnapshot({ bank: { items: [{ itemId: "iron-bar", qty: 5 }] } }),
    );
    expect(() => engine.selectRecipe("iron-chainbody")).toThrow(/smithing level 24/i);
  });

  it("a veteran Smith crafts an Iron Chainbody end-to-end: bars consumed, item granted, Smithing XP granted (#251: levelReq 20 -> 24, craftTicks 15 -> 13)", () => {
    const engine = createEngine(
      content,
      seededRng(1),
      makeSnapshot({
        player: {
          skills: { smithing: { level: 24, xp: xpForLevel(24) } },
        },
        bank: { items: [{ itemId: "iron-bar", qty: 3 }] },
      }),
    );
    engine.selectRecipe("iron-chainbody");
    for (let i = 0; i < 13; i++) engine.tick(); // craftTicks === 13

    const snap = engine.snapshot();
    expect(snap.bank.items.find((s) => s.itemId === "iron-bar")).toBeUndefined();
    expect(snap.bank.items.find((s) => s.itemId === "iron-chainbody")?.qty).toBe(1);
    expect(snap.player.skills.smithing.xp).toBeGreaterThan(xpForLevel(24));
    expect(snap.production).toBeNull(); // no bars left for another craft
  });

  it("all six platelegs smithing recipes exist with pinned level/bars/ticks/xp and output ids (#342)", () => {
    const byId = Object.fromEntries(content.recipes.map((r) => [r.id, r]));
    const expected = [
      { id: "bronze-platelegs", levelReq: 7, bars: 3, craftTicks: 11, xp: 36 },
      { id: "iron-platelegs", levelReq: 21, bars: 3, craftTicks: 12, xp: 84 },
      { id: "steel-platelegs", levelReq: 36, bars: 3, craftTicks: 13, xp: 150 },
      { id: "mithril-platelegs", levelReq: 51, bars: 3, craftTicks: 14, xp: 240 },
      { id: "adamant-platelegs", levelReq: 66, bars: 3, craftTicks: 15, xp: 360 },
      { id: "rune-platelegs", levelReq: 81, bars: 3, craftTicks: 16, xp: 510 },
    ] as const;
    for (const row of expected) {
      const tier = row.id.split("-")[0]!;
      const barId = `${tier}-bar`;
      expect(byId[row.id]).toMatchObject({
        skill: "smithing",
        levelReq: row.levelReq,
        inputs: [{ itemId: barId, qty: row.bars }],
        outputItemId: row.id,
        xp: row.xp,
        craftTicks: row.craftTicks,
      });
      const item = content.items.find((i) => i.id === row.id);
      expect(item).toMatchObject({ kind: "equipment", icon: row.id, slot: "legs" });
    }
  });

  it("a Smith at level 7 crafts bronze platelegs end-to-end, then equips them to legs (#342)", () => {
    const engine = createEngine(
      content,
      seededRng(1),
      makeSnapshot({
        player: {
          skills: { smithing: { level: 7, xp: xpForLevel(7) } },
        },
        bank: { items: [{ itemId: "bronze-bar", qty: 3 }] },
      }),
    );
    engine.selectRecipe("bronze-platelegs");
    for (let i = 0; i < 11; i++) engine.tick();

    const afterCraft = engine.snapshot();
    expect(afterCraft.bank.items.find((s) => s.itemId === "bronze-bar")).toBeUndefined();
    expect(afterCraft.bank.items.find((s) => s.itemId === "bronze-platelegs")?.qty).toBe(1);
    expect(afterCraft.player.skills.smithing.xp).toBe(xpForLevel(7) + 36);

    engine.equip("bronze-platelegs");
    expect(engine.snapshot().player.equipment.legs).toBe("bronze-platelegs");
  });

  it("leather chaps crafting and equip behavior is unchanged (#342)", () => {
    const byId = Object.fromEntries(content.recipes.map((r) => [r.id, r]));
    expect(byId["craft-leather-chaps"]).toMatchObject({
      outputItemId: "leather-chaps",
    });
    const chaps = content.items.find((i) => i.id === "leather-chaps");
    expect(chaps).toMatchObject({ kind: "equipment", slot: "legs" });
  });
});
