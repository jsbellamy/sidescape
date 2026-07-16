import { describe, expect, it } from "vitest";
import { createEngine } from "../core/engine";
import { makeSnapshot } from "../core/testing/make-snapshot";
import { seededRng } from "../core/rng";
import { xpForLevel } from "../core/xp";
import { content } from "./index";

describe("Herblore content (#118): herbs and charge potions", () => {
  it("Guam/Marrentill/Tarromin/Harralander Herb are stackable, unequippable, uneatable Materials", () => {
    expect(content.items.find((i) => i.id === "guam-herb")).toEqual({
      kind: "material",
      id: "guam-herb",
      name: "Guam Herb",
      icon: "guam-herb",
      value: 4,
    });
    expect(content.items.find((i) => i.id === "marrentill-herb")).toEqual({
      kind: "material",
      id: "marrentill-herb",
      name: "Marrentill Herb",
      icon: "marrentill-herb",
      value: 6,
    });
    expect(content.items.find((i) => i.id === "tarromin-herb")).toEqual({
      kind: "material",
      id: "tarromin-herb",
      name: "Tarromin Herb",
      icon: "tarromin-herb",
      value: 8,
    });
    expect(content.items.find((i) => i.id === "harralander-herb")).toEqual({
      kind: "material",
      id: "harralander-herb",
      name: "Harralander Herb",
      icon: "harralander-herb",
      value: 10,
    });
  });

  it("defines four charge Potions, one combat-stat pair and one skilling-speed pair", () => {
    expect(content.items.find((i) => i.id === "strength-potion")).toEqual({
      kind: "potion",
      id: "strength-potion",
      name: "Strength Potion",
      icon: "strength-potion",
      target: "strength",
      boostPct: 0.2,
      charges: 50,
      value: 30,
    });
    expect(content.items.find((i) => i.id === "attack-potion")).toMatchObject({
      kind: "potion",
      target: "attack",
    });
    expect(content.items.find((i) => i.id === "fishing-potion")).toEqual({
      kind: "potion",
      id: "fishing-potion",
      name: "Fishing Potion",
      icon: "fishing-potion",
      target: "fishing-speed",
      boostPct: 0.15,
      charges: 40,
      value: 25,
    });
    expect(content.items.find((i) => i.id === "production-potion")).toMatchObject({
      kind: "potion",
      target: "production-speed",
    });
  });

  it("Lumbry Meadows' beasts drop Guam Herb, Darkroot Forest's drop Marrentill Herb", () => {
    for (const id of ["chicken", "cow", "goblin"]) {
      const def = content.monsters.find((m) => m.id === id)!;
      expect(def.dropTable).toContainEqual({
        itemId: "guam-herb",
        qty: 1,
        chance: 0.15,
        band: "uncommon",
      });
    }
    for (const id of ["wolf", "goblin-warrior", "bandit"]) {
      const def = content.monsters.find((m) => m.id === id)!;
      expect(def.dropTable).toContainEqual({
        itemId: "marrentill-herb",
        qty: 1,
        chance: 0.15,
        band: "uncommon",
      });
    }
  });

  it("Old Sewers' Giant Rat/Zombie drop Tarromin Herb; Skeleton and Crypt Shade drop Harralander Herb", () => {
    for (const id of ["giant-rat", "zombie"]) {
      const def = content.monsters.find((m) => m.id === id)!;
      expect(def.dropTable).toContainEqual({
        itemId: "tarromin-herb",
        qty: 1,
        chance: 0.15,
        band: "uncommon",
      });
    }
    for (const id of ["skeleton", "crypt-shade"]) {
      const def = content.monsters.find((m) => m.id === id)!;
      expect(def.dropTable).toContainEqual({
        itemId: "harralander-herb",
        qty: 1,
        chance: 0.15,
        band: "uncommon",
      });
    }
  });

  it("defines the Herblore Recipes with the documented level gates, inputs, and outputs", () => {
    const byId = Object.fromEntries(content.recipes.map((r) => [r.id, r]));
    expect(byId["brew-strength-potion"]).toMatchObject({
      skill: "herblore",
      levelReq: 1,
      inputs: [{ itemId: "guam-herb", qty: 1 }],
      outputItemId: "strength-potion",
    });
    expect(byId["brew-attack-potion"]).toMatchObject({
      skill: "herblore",
      levelReq: 12,
      inputs: [{ itemId: "marrentill-herb", qty: 1 }],
      outputItemId: "attack-potion",
    });
    expect(byId["brew-fishing-potion"]).toMatchObject({
      skill: "herblore",
      levelReq: 22,
      inputs: [{ itemId: "tarromin-herb", qty: 1 }],
      outputItemId: "fishing-potion",
    });
    expect(byId["brew-production-potion"]).toMatchObject({
      skill: "herblore",
      levelReq: 32,
      inputs: [{ itemId: "harralander-herb", qty: 1 }],
      outputItemId: "production-potion",
    });
  });

  it("a fresh (level 1) player with guam-herb can select the Strength Potion recipe", () => {
    const engine = createEngine(
      content,
      seededRng(1),
      makeSnapshot({ bank: { items: [{ itemId: "guam-herb", qty: 1 }] } }),
    );
    engine.selectRecipe("brew-strength-potion");
    expect(engine.snapshot().production).toMatchObject({
      recipeId: "brew-strength-potion",
      name: "Strength Potion",
      skill: "herblore",
    });
  });

  it("a fresh (level 1) player is still gated out of the level-12 Attack Potion recipe", () => {
    const engine = createEngine(
      content,
      seededRng(1),
      makeSnapshot({ bank: { items: [{ itemId: "marrentill-herb", qty: 1 }] } }),
    );
    expect(() => engine.selectRecipe("brew-attack-potion")).toThrow(/herblore level 12/i);
  });

  it("a Herblore-3 player crafts a Strength Potion end-to-end: herb consumed, potion granted, HERBLORE xp granted (not Smithing)", () => {
    const engine = createEngine(
      content,
      seededRng(1),
      makeSnapshot({
        player: { skills: { herblore: { level: 3, xp: xpForLevel(3) } } },
        bank: { items: [{ itemId: "guam-herb", qty: 1 }] },
      }),
    );
    engine.selectRecipe("brew-strength-potion");
    for (let i = 0; i < 5; i++) engine.tick(); // craftTicks === 5

    const snap = engine.snapshot();
    expect(snap.bank.items.find((s) => s.itemId === "guam-herb")).toBeUndefined();
    expect(snap.bank.items.find((s) => s.itemId === "strength-potion")?.qty).toBe(1);
    expect(snap.player.skills.herblore.xp).toBeGreaterThan(xpForLevel(3));
    expect(snap.player.skills.smithing.xp).toBe(0);
    expect(snap.production).toBeNull(); // no herb left for another craft
  });

  it("assigning the brewed Strength Potion to the Potion Slot raises the observed player max hit (feeds the #114 modifier layer)", () => {
    function maxObservedHit(withPotion: boolean): number {
      const engine = createEngine(
        content,
        seededRng(99),
        makeSnapshot({
          player: {
            skills: {
              attack: { level: 90, xp: xpForLevel(90) },
              strength: { level: 90, xp: xpForLevel(90) },
              hitpoints: { level: 40, xp: xpForLevel(40) },
            },
            // Unlocks Bone Crypt (crypt-shade's Area) without actually clearing its gating
            // Dungeon runs — this test only cares about the max-hit ceiling, not progression.
            completedDungeonIds: ["meadow-depths", "darkroot-hollow", "sewer-king"],
          },
          // A huge stack so the buff never lapses mid-sample (auto-continue, #118).
          bank: { items: withPotion ? [{ itemId: "strength-potion", qty: 1000 }] : [] },
        }),
      );
      if (withPotion) engine.assignLoadoutSlot("potion", "strength-potion");
      // "crypt-shade" has a large HP pool (110) relative to any single hit, so most sampled
      // swings land un-clamped; the rare finishing blow that DOES clamp can only ever read low,
      // never artificially high, so it can't inflate Math.max below.
      engine.selectMonster("crypt-shade");
      const damages: number[] = [];
      engine.on("attack", (e) => {
        if (e.actor === "player") damages.push(e.damage);
      });
      for (let i = 0; i < 3000; i++) engine.tick();
      expect(damages.length).toBeGreaterThan(0);
      return Math.max(...damages);
    }

    const baseline = maxObservedHit(false);
    const boosted = maxObservedHit(true);
    expect(boosted).toBeGreaterThan(baseline);
  });

  it("a herblore recipe's output resolves to a real PotionDef in Content.items (validateContent's own icon/shape invariants apply)", () => {
    for (const recipe of content.recipes.filter((r) => r.skill === "herblore")) {
      const output = content.items.find((i) => i.id === recipe.outputItemId);
      expect(output?.kind).toBe("potion");
    }
  });
});
