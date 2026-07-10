import { describe, expect, it } from "vitest";
import { createEngine } from "../core/engine";
import { makeSnapshot } from "../core/make-snapshot";
import { seededRng } from "../core/rng";
import { xpForLevel } from "../core/xp";
import { content } from "./index";

describe("Jewelry content (#117): gems, amulet/ring Equipment, Crafting recipes", () => {
  it("Sapphire, Emerald, and Ruby are stackable, unequippable, uneatable Materials", () => {
    expect(content.items.find((i) => i.id === "sapphire")).toEqual({
      kind: "material",
      id: "sapphire",
      name: "Sapphire",
      icon: "sapphire",
      value: 15,
    });
    expect(content.items.find((i) => i.id === "emerald")).toEqual({
      kind: "material",
      id: "emerald",
      name: "Emerald",
      icon: "emerald",
      value: 30,
    });
    expect(content.items.find((i) => i.id === "ruby")).toEqual({
      kind: "material",
      id: "ruby",
      name: "Ruby",
      icon: "ruby",
      value: 60,
    });
  });

  it("Darkroot Forest's Monsters (wolf, goblin-warrior, bandit) drop Sapphire at a rare band", () => {
    for (const id of ["wolf", "goblin-warrior", "bandit"]) {
      const monster = content.monsters.find((m) => m.id === id)!;
      expect(monster.dropTable.some((e) => e.itemId === "sapphire" && e.band === "rare")).toBe(
        true,
      );
    }
  });

  it("Old Sewers' Monsters (giant-rat, zombie, skeleton) drop Emerald at a rare band", () => {
    for (const id of ["giant-rat", "zombie", "skeleton"]) {
      const monster = content.monsters.find((m) => m.id === id)!;
      expect(monster.dropTable.some((e) => e.itemId === "emerald" && e.band === "rare")).toBe(true);
    }
  });

  it("Bone Crypt's Crypt Shade drops Ruby at a rare band", () => {
    const cryptShade = content.monsters.find((m) => m.id === "crypt-shade")!;
    expect(cryptShade.dropTable.some((e) => e.itemId === "ruby" && e.band === "rare")).toBe(true);
  });

  it("sapphire-amulet/-ring carry modest atk/str bonuses (vs a weapon's) plus a small def vector, in the amulet/ring slots", () => {
    expect(content.items.find((i) => i.id === "sapphire-amulet")).toEqual({
      kind: "equipment",
      id: "sapphire-amulet",
      name: "Sapphire Amulet",
      icon: "sapphire-amulet",
      slot: "amulet",
      atkBonus: 3,
      strBonus: 2,
      def: { stab: 0, slash: 0, crush: 0, ranged: 0, magic: 1 },
      value: 60,
    });
    expect(content.items.find((i) => i.id === "sapphire-ring")).toEqual({
      kind: "equipment",
      id: "sapphire-ring",
      name: "Sapphire Ring",
      icon: "sapphire-ring",
      slot: "ring",
      atkBonus: 2,
      strBonus: 1,
      def: { stab: 0, slash: 0, crush: 0, ranged: 0, magic: 0 },
      value: 50,
    });
  });

  it("emerald and ruby jewelry tiers scale atk/str upward, still modest against the matching-tier weapon", () => {
    const emeraldAmulet = content.items.find((i) => i.id === "emerald-amulet");
    const rubyAmulet = content.items.find((i) => i.id === "ruby-amulet");
    expect(emeraldAmulet).toMatchObject({ slot: "amulet", atkBonus: 6, strBonus: 4 });
    expect(rubyAmulet).toMatchObject({ slot: "amulet", atkBonus: 10, strBonus: 7 });
    // mithril-dagger (best weapon-tier dagger reachable alongside ruby jewelry): atk 19 / str 15 —
    // ruby-amulet stays well under it, "augments rather than dominates" (owner's tuning note).
    const mithrilDagger = content.items.find((i) => i.id === "mithril-dagger");
    if (mithrilDagger?.kind !== "equipment") throw new Error("mithril-dagger must be equipment");
    if (rubyAmulet?.kind !== "equipment") throw new Error("ruby-amulet must be equipment");
    expect(rubyAmulet.atkBonus).toBeLessThan(mithrilDagger.atkBonus!);
    expect(rubyAmulet.strBonus).toBeLessThan(mithrilDagger.strBonus!);

    expect(content.items.find((i) => i.id === "emerald-ring")).toMatchObject({
      slot: "ring",
      atkBonus: 4,
      strBonus: 2,
    });
    expect(content.items.find((i) => i.id === "ruby-ring")).toMatchObject({
      slot: "ring",
      atkBonus: 6,
      strBonus: 4,
    });
  });

  it("defines the jewelry Crafting Recipes, interleaved with the leather ladder's levelReqs", () => {
    const byId = Object.fromEntries(content.recipes.map((r) => [r.id, r]));
    expect(byId["craft-sapphire-ring"]).toMatchObject({
      skill: "crafting",
      levelReq: 12,
      inputs: [{ itemId: "sapphire", qty: 1 }],
      outputItemId: "sapphire-ring",
    });
    expect(byId["craft-sapphire-amulet"]).toMatchObject({
      skill: "crafting",
      levelReq: 16,
      inputs: [{ itemId: "sapphire", qty: 1 }],
      outputItemId: "sapphire-amulet",
    });
    expect(byId["craft-emerald-ring"]).toMatchObject({
      skill: "crafting",
      levelReq: 35,
      inputs: [{ itemId: "emerald", qty: 1 }],
      outputItemId: "emerald-ring",
    });
    expect(byId["craft-emerald-amulet"]).toMatchObject({
      skill: "crafting",
      levelReq: 40,
      inputs: [{ itemId: "emerald", qty: 1 }],
      outputItemId: "emerald-amulet",
    });
    expect(byId["craft-ruby-ring"]).toMatchObject({
      skill: "crafting",
      levelReq: 45,
      inputs: [{ itemId: "ruby", qty: 1 }],
      outputItemId: "ruby-ring",
    });
    expect(byId["craft-ruby-amulet"]).toMatchObject({
      skill: "crafting",
      levelReq: 50,
      inputs: [{ itemId: "ruby", qty: 1 }],
      outputItemId: "ruby-amulet",
    });
  });

  it("a Wolf kill drops Sapphire into the Loot Zone/Bank flow (seeded Rng, real Content)", () => {
    // Darkroot Forest is gated behind Meadow Depths (see darkroot-forest.test.ts) — mark it
    // completed so selectMonster("wolf") doesn't throw.
    const engine = createEngine(
      content,
      seededRng(3),
      makeSnapshot({ player: { completedDungeonIds: ["meadow-depths"] } }),
    );
    engine.selectMonster("wolf");

    let sapphireDrops = 0;
    engine.on("drop", (e) => {
      if (e.itemId === "sapphire") sapphireDrops++;
    });
    for (let i = 0; i < 40_000; i++) engine.tick();

    expect(sapphireDrops).toBeGreaterThan(0);
    engine.lootAll();
    const bankedSapphire = engine.snapshot().bank.items.find((s) => s.itemId === "sapphire");
    expect(bankedSapphire?.qty).toBeGreaterThan(0);
  });

  it("a fresh (level 1) player is gated out of craft-sapphire-ring (levelReq 12) even with a Sapphire", () => {
    const engine = createEngine(
      content,
      seededRng(1),
      makeSnapshot({ bank: { items: [{ itemId: "sapphire", qty: 1 }] } }),
    );
    expect(() => engine.selectRecipe("craft-sapphire-ring")).toThrow(/crafting level 12/i);
  });

  it("crafts a Sapphire Ring end-to-end: Sapphire consumed, jewelry granted to the ring slot, Crafting xp granted", () => {
    const engine = createEngine(
      content,
      seededRng(1),
      makeSnapshot({
        player: { skills: { crafting: { level: 12, xp: xpForLevel(12) } } },
        bank: { items: [{ itemId: "sapphire", qty: 1 }] },
      }),
    );
    engine.selectRecipe("craft-sapphire-ring");
    for (let i = 0; i < 5; i++) engine.tick(); // craftTicks === 5

    const snap = engine.snapshot();
    expect(snap.bank.items.find((s) => s.itemId === "sapphire")).toBeUndefined();
    expect(snap.bank.items.find((s) => s.itemId === "sapphire-ring")?.qty).toBe(1);
    expect(snap.player.skills.crafting.xp).toBeGreaterThan(xpForLevel(12));

    engine.equip("sapphire-ring");
    expect(engine.snapshot().player.equipment.ring).toBe("sapphire-ring");
  });
});
