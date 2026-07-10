import { describe, expect, it } from "vitest";
import { createEngine } from "../core/engine";
import { makeSnapshot } from "../core/make-snapshot";
import { seededRng } from "../core/rng";
import { xpForLevel } from "../core/xp";
import { content } from "./index";

/** Combat Depth wave 4/4 (#102): fills the melee type gap so every Gear Tier offers stab, slash,
 * and crush weapons (daggers existed at every tier; only bronze had a sword; no tier had a mace).
 */
const TIERS = ["bronze", "iron", "steel", "mithril"] as const;
const MELEE_FAMILIES: Record<string, "stab" | "slash" | "crush"> = {
  dagger: "stab",
  sword: "slash",
  mace: "crush",
};

function weapon(id: string) {
  const item = content.items.find((i) => i.id === id);
  expect(item, `${id} not found in Content`).toBeDefined();
  expect(item!.kind).toBe("equipment");
  return item as Extract<(typeof content.items)[number], { kind: "equipment" }>;
}

describe("Gap-fill melee weapons (Combat Depth #102)", () => {
  it("every Gear Tier offers a stab, slash, and crush melee weapon", () => {
    for (const tier of TIERS) {
      for (const [family, attackType] of Object.entries(MELEE_FAMILIES)) {
        const id = `${tier}-${family}`;
        const item = weapon(id);
        expect(item.attackType, id).toBe(attackType);
      }
    }
  });

  it("each tier's mace atkBonus/strBonus sit between that tier's dagger and sword", () => {
    for (const tier of TIERS) {
      const dagger = weapon(`${tier}-dagger`);
      const sword = weapon(`${tier}-sword`);
      const mace = weapon(`${tier}-mace`);
      expect(mace.atkBonus, `${tier}-mace atkBonus`).toBeGreaterThan(dagger.atkBonus!);
      expect(mace.atkBonus, `${tier}-mace atkBonus`).toBeLessThan(sword.atkBonus!);
      expect(mace.strBonus, `${tier}-mace strBonus`).toBeGreaterThan(dagger.strBonus!);
      expect(mace.strBonus, `${tier}-mace strBonus`).toBeLessThan(sword.strBonus!);
    }
  });

  it("each tier's new mace/sword shares its attackSpeed with that tier's sword", () => {
    for (const tier of TIERS) {
      const sword = weapon(`${tier}-sword`);
      const mace = weapon(`${tier}-mace`);
      expect(mace.attackSpeed).toBe(sword.attackSpeed);
    }
  });

  it("bronze-mace, iron-mace, and iron-sword each have a Smithing Recipe (bar-tier weapons stay recipe-sourced)", () => {
    const byId = Object.fromEntries(content.recipes.map((r) => [r.id, r]));
    expect(byId["bronze-mace"]).toMatchObject({
      inputs: [{ itemId: "bronze-bar", qty: 2 }],
      outputItemId: "bronze-mace",
    });
    expect(byId["iron-mace"]).toMatchObject({
      inputs: [{ itemId: "iron-bar", qty: 2 }],
      outputItemId: "iron-mace",
    });
    expect(byId["iron-sword"]).toMatchObject({
      inputs: [{ itemId: "iron-bar", qty: 2 }],
      outputItemId: "iron-sword",
    });
    // bronze-mace's level band sits between bronze-dagger (1) and bronze-sword (8).
    expect(byId["bronze-mace"]!.levelReq).toBeGreaterThan(byId["bronze-dagger"]!.levelReq);
    expect(byId["bronze-mace"]!.levelReq).toBeLessThan(byId["bronze-sword"]!.levelReq);
    // iron-mace/iron-sword's level band sits between iron-dagger (15) and iron-chainbody (20).
    expect(byId["iron-mace"]!.levelReq).toBeGreaterThan(byId["iron-dagger"]!.levelReq);
    expect(byId["iron-sword"]!.levelReq).toBeLessThan(byId["iron-chainbody"]!.levelReq);
  });

  it("steel/mithril maces and swords have no Recipe (no steel/mithril-bar Material exists) — sourced from a Drop Table instead", () => {
    const recipeIds = new Set(content.recipes.map((r) => r.id));
    for (const id of ["steel-mace", "steel-sword", "mithril-mace", "mithril-sword"]) {
      expect(recipeIds.has(id), `${id} unexpectedly has a Recipe`).toBe(false);
      const droppedSomewhere = content.monsters.some((m) =>
        m.dropTable.some((e) => e.itemId === id),
      );
      expect(droppedSomewhere, `${id} has no Drop Table source`).toBe(true);
    }
  });

  it("every Recipe's inputs and outputItemId still resolve to real Items", () => {
    for (const recipe of content.recipes) {
      for (const input of recipe.inputs) {
        expect(
          content.items.some((i) => i.id === input.itemId),
          `${recipe.id} input ${input.itemId}`,
        ).toBe(true);
      }
      expect(
        content.items.some((i) => i.id === recipe.outputItemId),
        `${recipe.id} output ${recipe.outputItemId}`,
      ).toBe(true);
    }
  });

  it("a Smithing-16 crafter can select and craft the new Iron Mace recipe end-to-end", () => {
    const engine = createEngine(
      content,
      seededRng(1),
      makeSnapshot({
        player: { skills: { smithing: { level: 16, xp: xpForLevel(16) } } },
        bank: { items: [{ itemId: "iron-bar", qty: 2 }] },
      }),
    );
    expect(() => engine.selectRecipe("iron-mace")).not.toThrow();
    for (let i = 0; i < 13; i++) engine.tick(); // craftTicks === 13

    const snap = engine.snapshot();
    expect(snap.bank.items.find((s) => s.itemId === "iron-bar")).toBeUndefined();
    expect(snap.bank.items.find((s) => s.itemId === "iron-mace")?.qty).toBe(1);
  });
});
