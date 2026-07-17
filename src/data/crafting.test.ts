import { describe, expect, it } from "vitest";
import { createEngine } from "../core/engine";
import { makeSnapshot } from "../core/testing/make-snapshot";
import { seededRng } from "../core/rng";
import { xpForLevel } from "../core/xp";
import { content } from "./index";

describe("Crafting content (#116): hides and ranged/light armour", () => {
  it("Cowhide, Wolf Hide, and Thick Hide are stackable, unequippable, uneatable Materials", () => {
    expect(content.items.find((i) => i.id === "cowhide")).toEqual({
      kind: "material",
      id: "cowhide",
      name: "Cowhide",
      icon: "cowhide",
      value: 2,
    });
    expect(content.items.find((i) => i.id === "wolf-hide")).toEqual({
      kind: "material",
      id: "wolf-hide",
      name: "Wolf Hide",
      icon: "wolf-hide",
      value: 4,
    });
    expect(content.items.find((i) => i.id === "thick-hide")).toEqual({
      kind: "material",
      id: "thick-hide",
      name: "Thick Hide",
      icon: "thick-hide",
      value: 8,
    });
  });

  it("Cow drops Cowhide, Wolf drops Wolf Hide, Giant Rat drops Thick Hide (chicken no longer supplies hide — #388)", () => {
    const cow = content.monsters.find((m) => m.id === "cow")!;
    expect(cow.dropTable).toContainEqual({
      itemId: "cowhide",
      qty: 1,
      chance: 0.65,
      band: "common",
    });
    const wolf = content.monsters.find((m) => m.id === "wolf")!;
    expect(wolf.dropTable).toContainEqual({
      itemId: "wolf-hide",
      qty: 1,
      chance: 0.4,
      band: "common",
    });
    const giantRat = content.monsters.find((m) => m.id === "giant-rat")!;
    expect(giantRat.dropTable).toContainEqual({
      itemId: "thick-hide",
      qty: 1,
      chance: 0.35,
      band: "common",
    });
  });

  it("Cow still carries its rare pre-made Leather Body drop alongside the new Cowhide drop", () => {
    const cow = content.monsters.find((m) => m.id === "cow")!;
    expect(cow.dropTable).toContainEqual({
      itemId: "leather-body",
      qty: 1,
      chance: 1 / 20,
      band: "uncommon",
    });
  });

  it("a Cow kill drops Cowhide into the Loot Zone/Bank flow (seeded Rng, real Content)", () => {
    const engine = createEngine(content, seededRng(7));
    engine.selectMonster("cow");

    let kills = 0;
    let cowhideDrops = 0;
    engine.on("kill", () => kills++);
    engine.on("drop", (e) => {
      if (e.itemId === "cowhide") cowhideDrops++;
    });
    for (let i = 0; i < 6000; i++) engine.tick();

    expect(kills).toBeGreaterThan(0);
    expect(cowhideDrops).toBeGreaterThan(0);

    // The Loot Zone accumulates combat Drops first; lootAll() sweeps it into the Bank.
    engine.lootAll();
    const bankedHide = engine.snapshot().bank.items.find((s) => s.itemId === "cowhide");
    expect(bankedHide?.qty).toBeGreaterThan(0);
  });

  it("leather-body carries a light-armour Defence Vector: low melee, higher ranged/magic, no atk/str", () => {
    const leatherBody = content.items.find((i) => i.id === "leather-body");
    expect(leatherBody).toEqual({
      kind: "equipment",
      id: "leather-body",
      name: "Leather Body",
      icon: "leather-body",
      slot: "body",
      def: { stab: 2, slash: 2, crush: 3, ranged: 6, magic: 5 },
      value: 20,
    });
  });

  it("Leather Chaps and Leather Coif exist with light-armour Defence Vectors", () => {
    expect(content.items.find((i) => i.id === "leather-chaps")).toEqual({
      kind: "equipment",
      id: "leather-chaps",
      name: "Leather Chaps",
      icon: "leather-chaps",
      slot: "legs",
      def: { stab: 1, slash: 1, crush: 2, ranged: 4, magic: 3 },
      value: 15,
    });
    expect(content.items.find((i) => i.id === "leather-coif")).toEqual({
      kind: "equipment",
      id: "leather-coif",
      name: "Leather Coif",
      icon: "leather-coif",
      slot: "head",
      def: { stab: 1, slash: 1, crush: 1, ranged: 3, magic: 2 },
      value: 12,
    });
  });

  it("the hard-leather tier (wolf-hide/thick-hide) beats the base leather tier's ranged/magic def", () => {
    const base = content.items.find((i) => i.id === "leather-body")!;
    const hard = content.items.find((i) => i.id === "hard-leather-body");
    expect(hard).toBeDefined();
    if (hard?.kind !== "equipment") throw new Error("hard-leather-body must be equipment");
    expect(hard.slot).toBe("body");
    expect(hard.def.ranged).toBeGreaterThan((base as typeof hard).def.ranged);
    expect(hard.def.magic).toBeGreaterThan((base as typeof hard).def.magic);
    // Still light armour: melee def stays low, well under its own ranged/magic def.
    expect(hard.def.stab).toBeLessThan(hard.def.ranged);
    expect(hard.atkBonus).toBeUndefined();
    expect(hard.strBonus).toBeUndefined();

    expect(content.items.find((i) => i.id === "hard-leather-chaps")).toMatchObject({
      kind: "equipment",
      slot: "legs",
    });
    expect(content.items.find((i) => i.id === "hard-leather-coif")).toMatchObject({
      kind: "equipment",
      slot: "head",
    });
  });

  it("defines the Crafting Recipes with the documented level gates, inputs, and skill", () => {
    const byId = Object.fromEntries(content.recipes.map((r) => [r.id, r]));
    expect(byId["craft-leather-body"]).toMatchObject({
      skill: "crafting",
      levelReq: 1,
      inputs: [{ itemId: "cowhide", qty: 1 }],
      outputItemId: "leather-body",
    });
    expect(byId["craft-leather-chaps"]).toMatchObject({
      skill: "crafting",
      levelReq: 5,
      inputs: [{ itemId: "cowhide", qty: 1 }],
      outputItemId: "leather-chaps",
    });
    expect(byId["craft-leather-coif"]).toMatchObject({
      skill: "crafting",
      levelReq: 8,
      inputs: [{ itemId: "cowhide", qty: 1 }],
      outputItemId: "leather-coif",
    });
    expect(byId["craft-hard-leather-coif"]).toMatchObject({
      skill: "crafting",
      levelReq: 20,
      inputs: [{ itemId: "wolf-hide", qty: 1 }],
      outputItemId: "hard-leather-coif",
    });
    expect(byId["craft-hard-leather-chaps"]).toMatchObject({
      skill: "crafting",
      levelReq: 25,
      inputs: [{ itemId: "wolf-hide", qty: 2 }],
      outputItemId: "hard-leather-chaps",
    });
    expect(byId["craft-hard-leather-body"]).toMatchObject({
      skill: "crafting",
      levelReq: 30,
      inputs: [{ itemId: "thick-hide", qty: 2 }],
      outputItemId: "hard-leather-body",
    });
  });

  it("a fresh (level 1) player can select the level-1 Leather Body recipe once they own a Cowhide", () => {
    const engine = createEngine(
      content,
      seededRng(1),
      makeSnapshot({ bank: { items: [{ itemId: "cowhide", qty: 1 }] } }),
    );
    expect(() => engine.selectRecipe("craft-leather-body")).not.toThrow();
    expect(engine.snapshot().production).toEqual({
      recipeId: "craft-leather-body",
      name: "Leather Body",
      skill: "crafting",
      progress: 0,
    });
  });

  it("a fresh (level 1) player is gated out of the level-20 hard-leather recipe even with enough hides", () => {
    const engine = createEngine(
      content,
      seededRng(1),
      makeSnapshot({ bank: { items: [{ itemId: "wolf-hide", qty: 5 }] } }),
    );
    expect(() => engine.selectRecipe("craft-hard-leather-coif")).toThrow(/crafting level 20/i);
  });

  it("crafts a Leather Body end-to-end: Cowhide consumed, item granted, CRAFTING xp granted (not Smithing)", () => {
    const engine = createEngine(
      content,
      seededRng(1),
      makeSnapshot({ bank: { items: [{ itemId: "cowhide", qty: 1 }] } }),
    );
    engine.selectRecipe("craft-leather-body");
    for (let i = 0; i < 5; i++) engine.tick(); // craftTicks === 5

    const snap = engine.snapshot();
    expect(snap.bank.items.find((s) => s.itemId === "cowhide")).toBeUndefined();
    expect(snap.bank.items.find((s) => s.itemId === "leather-body")?.qty).toBe(1);
    expect(snap.player.skills.crafting.xp).toBeGreaterThan(0);
    expect(snap.player.skills.smithing.xp).toBe(0);
    expect(snap.production).toBeNull(); // no cowhide left for another craft
  });

  it("a veteran Crafter crafts a Hard Leather Body from Thick Hide, granting Crafting xp", () => {
    const engine = createEngine(
      content,
      seededRng(1),
      makeSnapshot({
        player: { skills: { crafting: { level: 30, xp: xpForLevel(30) } } },
        bank: { items: [{ itemId: "thick-hide", qty: 2 }] },
      }),
    );
    engine.selectRecipe("craft-hard-leather-body");
    for (let i = 0; i < 8; i++) engine.tick(); // craftTicks === 8

    const snap = engine.snapshot();
    expect(snap.bank.items.find((s) => s.itemId === "thick-hide")).toBeUndefined();
    expect(snap.bank.items.find((s) => s.itemId === "hard-leather-body")?.qty).toBe(1);
    expect(snap.player.skills.crafting.xp).toBeGreaterThan(xpForLevel(30));
  });
});
