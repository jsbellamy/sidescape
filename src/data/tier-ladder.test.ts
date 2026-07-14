import { describe, expect, it } from "vitest";
import {
  ARMOUR_FAMILIES,
  BAR_ITEM_ID,
  GEAR_TIERS,
  ladderArmour,
  ladderRecipe,
  ladderWeapon,
  METAL_FAMILIES,
  WEAPON_FAMILIES,
} from "./tier-ladder";

/** Issue #251: the Gear Tier ladder ("Full generated Equipment" table) expressed by construction.
 * Every worked value below is copied verbatim from the issue body, an independent source of truth
 * — not recomputed the way the builder computes it. These replace the invariants retired from
 * gap-fill-weapons.test.ts, armour-directional.test.ts, and ranged-magic-progression.test.ts (see
 * the issue's own "Tests to retire" section). */

// atk/str per tier, copied verbatim from the issue's "Full generated Equipment" table.
const WEAPON_ATK_STR: Record<string, [number, number][]> = {
  dagger: [
    [4, 3],
    [9, 7],
    [14, 11],
    [19, 15],
  ],
  mace: [
    [6, 5],
    [11, 9],
    [16, 13],
    [21, 17],
  ],
  sword: [
    [7, 6],
    [12, 10],
    [17, 14],
    [22, 18],
  ],
  shortbow: [
    [5, 4],
    [11, 9],
    [17, 14],
    [23, 19],
  ],
  staff: [
    [4, 5],
    [9, 11],
    [14, 17],
    [19, 23],
  ],
};

// def vectors per tier, copied verbatim from the issue's "Full generated Equipment" table.
const ARMOUR_DEF: Record<string, [number, number, number, number, number][]> = {
  chainbody: [
    [4, 4, 2, 3, 0],
    [10, 10, 5, 8, -1],
    [16, 16, 8, 13, -2],
    [22, 22, 11, 18, -3],
  ],
  kiteshield: [
    [4, 4, 2, 3, 0],
    [9, 9, 4, 7, -1],
    [14, 14, 6, 11, -2],
    [19, 19, 8, 15, -3],
  ],
  "full-helm": [
    [2, 2, 1, 2, 0],
    [5, 5, 2, 4, -1],
    [8, 8, 3, 6, -2],
    [11, 11, 4, 8, -3],
  ],
};

const VALUES: Record<string, number[]> = {
  dagger: [10, 20, 40, 80],
  mace: [15, 30, 60, 120],
  sword: [20, 40, 80, 160],
  shortbow: [25, 50, 100, 200],
  staff: [25, 50, 100, 200],
  chainbody: [30, 60, 120, 240],
  kiteshield: [12, 24, 48, 96],
  "full-helm": [25, 50, 100, 200],
};

describe("ladderWeapon", () => {
  it("every generated weapon stat equals base + step * tierIndex against the issue's table", () => {
    for (const family of WEAPON_FAMILIES) {
      GEAR_TIERS.forEach((tier, tierIndex) => {
        const item = ladderWeapon(tier, family);
        const [atk, str] = WEAPON_ATK_STR[family]![tierIndex]!;
        expect(item.atkBonus, `${tier}-${family} atkBonus`).toBe(atk);
        expect(item.strBonus, `${tier}-${family} strBonus`).toBe(str);
        expect(item.value, `${tier}-${family} value`).toBe(VALUES[family]![tierIndex]);
      });
    }
  });

  it("melee weapon atk/str are byte-identical to today's shipped values at all four tiers", () => {
    for (const family of ["dagger", "mace", "sword"] as const) {
      GEAR_TIERS.forEach((tier, tierIndex) => {
        const item = ladderWeapon(tier, family);
        const [atk, str] = WEAPON_ATK_STR[family]![tierIndex]!;
        expect(item.atkBonus).toBe(atk);
        expect(item.strBonus).toBe(str);
      });
    }
  });

  it("value === baseValue * 2^tierIndex for every generated weapon", () => {
    for (const family of WEAPON_FAMILIES) {
      const bronzeValue = ladderWeapon("bronze", family).value!;
      GEAR_TIERS.forEach((tier, tierIndex) => {
        expect(ladderWeapon(tier, family).value).toBe(bronzeValue * 2 ** tierIndex);
      });
    }
  });

  it("legacy id overrides: bronze kiteshield/shortbow/staff keep their shipped non-conforming ids", () => {
    const shield = ladderArmour("bronze", "kiteshield");
    expect(shield.id).toBe("bronze-shield");
    expect(shield.name).toBe("Bronze Shield");
    expect(shield.def).toEqual({ stab: 4, slash: 4, crush: 2, ranged: 3, magic: 0 });
    expect(shield.value).toBe(12);

    const bow = ladderWeapon("bronze", "shortbow");
    expect(bow.id).toBe("shortbow");
    expect(bow.name).toBe("Shortbow");

    const staff = ladderWeapon("bronze", "staff");
    expect(staff.id).toBe("apprentice-staff");
    expect(staff.name).toBe("Apprentice Staff");
  });

  it("every non-overridden weapon id follows the ${tier}-${family} convention, icon equals id", () => {
    for (const family of WEAPON_FAMILIES) {
      for (const tier of GEAR_TIERS) {
        const item = ladderWeapon(tier, family);
        if (item.id !== "shortbow" && item.id !== "apprentice-staff") {
          expect(item.id).toBe(`${tier}-${family}`);
        }
        expect(item.icon).toBe(item.id);
      }
    }
  });

  it("every Gear Tier offers a stab, slash, and crush melee weapon (dagger/sword/mace)", () => {
    const attackTypeOf = { dagger: "stab", sword: "slash", mace: "crush" } as const;
    for (const tier of GEAR_TIERS) {
      for (const [family, attackType] of Object.entries(attackTypeOf)) {
        expect(ladderWeapon(tier, family as "dagger" | "sword" | "mace").attackType).toBe(
          attackType,
        );
      }
    }
  });

  it("each tier's mace atk/str sits between that tier's dagger and sword, sharing the sword's attackSpeed", () => {
    for (const tier of GEAR_TIERS) {
      const dagger = ladderWeapon(tier, "dagger");
      const sword = ladderWeapon(tier, "sword");
      const mace = ladderWeapon(tier, "mace");
      expect(mace.atkBonus).toBeGreaterThan(dagger.atkBonus!);
      expect(mace.atkBonus).toBeLessThan(sword.atkBonus!);
      expect(mace.strBonus).toBeGreaterThan(dagger.strBonus!);
      expect(mace.strBonus).toBeLessThan(sword.strBonus!);
      expect(mace.attackSpeed).toBe(sword.attackSpeed);
    }
  });

  it("every new ranged/magic tier out-bonuses its predecessor (iron < steel < mithril)", () => {
    for (const family of ["shortbow", "staff"] as const) {
      const [, iron, steel, mithril] = GEAR_TIERS.map((tier) => ladderWeapon(tier, family));
      expect(steel!.atkBonus).toBeGreaterThan(iron!.atkBonus!);
      expect(mithril!.atkBonus).toBeGreaterThan(steel!.atkBonus!);
      expect(steel!.strBonus).toBeGreaterThan(iron!.strBonus!);
      expect(mithril!.strBonus).toBeGreaterThan(steel!.strBonus!);
    }
  });
});

describe("ladderArmour", () => {
  it("every generated armour def vector equals base + step * tierIndex against the issue's table", () => {
    for (const family of ARMOUR_FAMILIES) {
      GEAR_TIERS.forEach((tier, tierIndex) => {
        const item = ladderArmour(tier, family);
        const [stab, slash, crush, ranged, magic] = ARMOUR_DEF[family]![tierIndex]!;
        expect(item.def, `${tier}-${family} def`).toEqual({ stab, slash, crush, ranged, magic });
        expect(item.value, `${tier}-${family} value`).toBe(VALUES[family]![tierIndex]);
      });
    }
  });

  it("value === baseValue * 2^tierIndex for every generated armour piece", () => {
    for (const family of ARMOUR_FAMILIES) {
      const bronzeValue = ladderArmour("bronze", family).value!;
      GEAR_TIERS.forEach((tier, tierIndex) => {
        expect(ladderArmour(tier, family).value).toBe(bronzeValue * 2 ** tierIndex);
      });
    }
  });

  it("metal armour def.magic is strictly decreasing across tiers (0, -1, -2, -3)", () => {
    for (const family of ARMOUR_FAMILIES) {
      const magics = GEAR_TIERS.map((tier) => ladderArmour(tier, family).def.magic);
      expect(magics).toEqual([0, -1, -2, -3]);
    }
  });

  it("each metal body tier dominates the previous tier's def in stab/slash/crush/ranged", () => {
    for (const family of ARMOUR_FAMILIES) {
      const items = GEAR_TIERS.map((tier) => ladderArmour(tier, family));
      for (const type of ["stab", "slash", "crush", "ranged"] as const) {
        for (let i = 1; i < items.length; i++) {
          expect(items[i]!.def[type]).toBeGreaterThan(items[i - 1]!.def[type]);
        }
      }
    }
  });

  it("armour never declares attackType/atkBonus/strBonus/attackSpeed", () => {
    for (const family of ARMOUR_FAMILIES) {
      for (const tier of GEAR_TIERS) {
        const item = ladderArmour(tier, family);
        expect(item.attackType).toBeUndefined();
        expect(item.atkBonus).toBeUndefined();
        expect(item.strBonus).toBeUndefined();
        expect(item.attackSpeed).toBeUndefined();
      }
    }
  });
});

describe("ladderRecipe", () => {
  it("generates 24 Smithing recipes: 6 metal families x 4 tiers, id equals outputItemId, skill smithing", () => {
    let count = 0;
    for (const family of METAL_FAMILIES) {
      for (const tier of GEAR_TIERS) {
        const recipe = ladderRecipe(tier, family);
        expect(recipe.skill).toBe("smithing");
        expect(recipe.id).toBe(recipe.outputItemId);
        count++;
      }
    }
    expect(count).toBe(24);
  });

  it("shortbow and staff are not MetalFamily members — no recipe accessor exists for them", () => {
    expect((METAL_FAMILIES as readonly string[]).includes("shortbow")).toBe(false);
    expect((METAL_FAMILIES as readonly string[]).includes("staff")).toBe(false);
  });

  it("bronze Smithing reproduces exactly: dagger lvl1/1bar/12xp/8ticks; shield(kiteshield) lvl5/2bars/10ticks; mace lvl6/2bars/9ticks; sword lvl8/2bars/10ticks", () => {
    const dagger = ladderRecipe("bronze", "dagger");
    expect(dagger.levelReq).toBe(1);
    expect(dagger.inputs).toEqual([{ itemId: "bronze-bar", qty: 1 }]);
    expect(dagger.xp).toBe(12);
    expect(dagger.craftTicks).toBe(8);
    expect(dagger.id).toBe("bronze-dagger");

    const shield = ladderRecipe("bronze", "kiteshield");
    expect(shield.levelReq).toBe(5);
    expect(shield.inputs).toEqual([{ itemId: "bronze-bar", qty: 2 }]);
    expect(shield.craftTicks).toBe(10);
    expect(shield.id).toBe("bronze-shield");

    const mace = ladderRecipe("bronze", "mace");
    expect(mace.levelReq).toBe(6);
    expect(mace.inputs).toEqual([{ itemId: "bronze-bar", qty: 2 }]);
    expect(mace.craftTicks).toBe(9);

    const sword = ladderRecipe("bronze", "sword");
    expect(sword.levelReq).toBe(8);
    expect(sword.inputs).toEqual([{ itemId: "bronze-bar", qty: 2 }]);
    expect(sword.craftTicks).toBe(10);
  });

  it("every recipe's inputs draw the correct tier's Bar material", () => {
    for (const family of METAL_FAMILIES) {
      for (const tier of GEAR_TIERS) {
        const recipe = ladderRecipe(tier, family);
        expect(recipe.inputs[0]!.itemId).toBe(BAR_ITEM_ID[tier]);
      }
    }
  });

  it("levelReq strictly increases from tier to tier within a family", () => {
    for (const family of METAL_FAMILIES) {
      const levels = GEAR_TIERS.map((tier) => ladderRecipe(tier, family).levelReq);
      for (let i = 1; i < levels.length; i++) {
        expect(levels[i]).toBeGreaterThan(levels[i - 1]!);
      }
    }
  });
});
