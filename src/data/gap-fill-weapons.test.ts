import { describe, expect, it } from "vitest";
import { createEngine } from "../core/engine";
import { makeSnapshot } from "../core/make-snapshot";
import { seededRng } from "../core/rng";
import { xpForLevel } from "../core/xp";
import { content } from "./index";

/** Combat Depth wave 4/4 (#102): fills the melee type gap so every Gear Tier offers stab, slash,
 * and crush weapons (daggers existed at every tier; only bronze had a sword; no tier had a mace).
 *
 * Issue #251 retired three assertions from this file into src/data/tier-ladder.test.ts, where they
 * now hold by construction instead of being re-checked after the fact: "every Gear Tier offers a
 * stab, slash, and crush melee weapon", "each tier's mace atkBonus/strBonus sits between that
 * tier's dagger and sword", and "each tier's new mace/sword shares its attackSpeed with that
 * tier's sword". It also deleted the "steel/mithril maces and swords have no Recipe" assertion —
 * now FALSE, since #251's builder generates a Smithing Recipe for every metal family at every
 * tier — and the referential "every Recipe's inputs/outputItemId resolve to real Items" check,
 * which duplicated validateContent (the single owner of referential integrity).
 */
describe("Gap-fill melee weapons (Combat Depth #102)", () => {
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
    // iron-mace/iron-sword's level band sits between iron-dagger (15) and iron-chainbody (#251:
    // now 24, up from 20 — the deliberate iron-tier rebalance).
    expect(byId["iron-mace"]!.levelReq).toBeGreaterThan(byId["iron-dagger"]!.levelReq);
    expect(byId["iron-sword"]!.levelReq).toBeLessThan(byId["iron-chainbody"]!.levelReq);
  });

  it("a Smithing-20 crafter can select and craft the Iron Mace recipe end-to-end (#251: levelReq 16 -> 20, craftTicks 13 -> 10)", () => {
    const engine = createEngine(
      content,
      seededRng(1),
      makeSnapshot({
        player: { skills: { smithing: { level: 20, xp: xpForLevel(20) } } },
        bank: { items: [{ itemId: "iron-bar", qty: 2 }] },
      }),
    );
    expect(() => engine.selectRecipe("iron-mace")).not.toThrow();
    for (let i = 0; i < 10; i++) engine.tick(); // craftTicks === 10

    const snap = engine.snapshot();
    expect(snap.bank.items.find((s) => s.itemId === "iron-bar")).toBeUndefined();
    expect(snap.bank.items.find((s) => s.itemId === "iron-mace")?.qty).toBe(1);
  });

  // Guards the fixture above: a level-19 Smith (one below the new #251 levelReq 20) is still gated
  // out of Iron Mace, proving the test above exercises a real gate, not an already-open one.
  it("a Smithing-19 crafter is still gated out of Iron Mace", () => {
    const engine = createEngine(
      content,
      seededRng(1),
      makeSnapshot({
        player: { skills: { smithing: { level: 19, xp: xpForLevel(19) } } },
        bank: { items: [{ itemId: "iron-bar", qty: 2 }] },
      }),
    );
    expect(() => engine.selectRecipe("iron-mace")).toThrow(/smithing level 20/i);
  });
});
