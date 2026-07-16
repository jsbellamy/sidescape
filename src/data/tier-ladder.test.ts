import { describe, expect, it } from "vitest";
import { MAX_LEVEL } from "../core/xp";
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

/** Issue #251/#252: the Gear Tier ladder ("Full generated Equipment" table) expressed by
 * construction. Every worked value below is copied verbatim from the issue body, an independent
 * source of truth — not recomputed the way the builder computes it. These replace the invariants
 * retired from gap-fill-weapons.test.ts, armour-directional.test.ts, and
 * ranged-magic-progression.test.ts (see the issue's own "Tests to retire" section).
 *
 * #252 appends adamant/rune (tier indices 4/5). The step steepens above mithril — see the issue's
 * own "step (adamant, rune)" table — so bronze/iron/steel/mithril (indices 0-3) below are
 * BYTE-IDENTICAL to what #251 shipped, and adamant/rune are the issue's own new numbers. */

// atk/str per tier, copied verbatim from the issue's "Full generated Equipment" table.
const WEAPON_ATK_STR: Record<string, [number, number][]> = {
  dagger: [
    [4, 3],
    [9, 7],
    [14, 11],
    [19, 15],
    [27, 22],
    [35, 29],
  ],
  mace: [
    [6, 5],
    [11, 9],
    [16, 13],
    [21, 17],
    [29, 24],
    [37, 31],
  ],
  sword: [
    [7, 6],
    [12, 10],
    [17, 14],
    [22, 18],
    [30, 25],
    [38, 32],
  ],
  shortbow: [
    [5, 4],
    [11, 9],
    [17, 14],
    [23, 19],
    [32, 27],
    [41, 35],
  ],
  staff: [
    [4, 0],
    [9, 3],
    [14, 5],
    [19, 8],
    [27, 12],
    [35, 15],
  ],
};

// def vectors per tier, copied verbatim from the issue's "Full generated Equipment" table.
const ARMOUR_DEF: Record<string, [number, number, number, number, number][]> = {
  chainbody: [
    [4, 4, 2, 3, 0],
    [10, 10, 5, 8, -1],
    [16, 16, 8, 13, -2],
    [22, 22, 11, 18, -3],
    [31, 31, 16, 26, -4],
    [40, 40, 21, 34, -5],
  ],
  kiteshield: [
    [4, 4, 2, 3, 0],
    [9, 9, 4, 7, -1],
    [14, 14, 6, 11, -2],
    [19, 19, 8, 15, -3],
    [27, 27, 11, 21, -4],
    [35, 35, 14, 27, -5],
  ],
  "full-helm": [
    [2, 2, 1, 2, 0],
    [5, 5, 2, 4, -1],
    [8, 8, 3, 6, -2],
    [11, 11, 4, 8, -3],
    [16, 16, 6, 11, -4],
    [21, 21, 8, 14, -5],
  ],
  platelegs: [
    [3, 3, 2, 2, 0],
    [7, 7, 4, 5, -1],
    [11, 11, 6, 8, -2],
    [15, 15, 8, 11, -3],
    [22, 22, 11, 16, -4],
    [29, 29, 14, 21, -5],
  ],
};

const VALUES: Record<string, number[]> = {
  dagger: [10, 20, 40, 80, 160, 320],
  mace: [15, 30, 60, 120, 240, 480],
  sword: [20, 40, 80, 160, 320, 640],
  shortbow: [25, 50, 100, 200, 400, 800],
  staff: [25, 50, 100, 200, 400, 800],
  chainbody: [30, 60, 120, 240, 480, 960],
  kiteshield: [12, 24, 48, 96, 192, 384],
  "full-helm": [25, 50, 100, 200, 400, 800],
  platelegs: [28, 56, 112, 224, 448, 896],
};

describe("ladderWeapon", () => {
  it("every generated weapon stat equals base + step * tierIndex against the issue's table", () => {
    for (const family of WEAPON_FAMILIES) {
      GEAR_TIERS.forEach((tier, tierIndex) => {
        const item = ladderWeapon(tier, family);
        const [atk, str] = WEAPON_ATK_STR[family]![tierIndex]!;
        expect(item.atkBonus, `${tier}-${family} atkBonus`).toBe(atk);
        if (family === "shortbow") {
          expect(item.rangedStr, `${tier}-${family} rangedStr`).toBe(str);
          expect(item.strBonus).toBeUndefined();
          expect(item.magicDamage).toBeUndefined();
        } else if (family === "staff") {
          expect(item.magicDamage, `${tier}-${family} magicDamage`).toBe(str);
          expect(item.strBonus).toBeUndefined();
          expect(item.rangedStr).toBeUndefined();
        } else {
          expect(item.strBonus, `${tier}-${family} strBonus`).toBe(str);
          expect(item.rangedStr).toBeUndefined();
          expect(item.magicDamage).toBeUndefined();
        }
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

  it("every new ranged/magic tier out-bonuses its predecessor, all the way to rune", () => {
    for (const family of ["shortbow", "staff"] as const) {
      const items = GEAR_TIERS.map((tier) => ladderWeapon(tier, family));
      for (let i = 1; i < items.length; i++) {
        expect(items[i]!.atkBonus).toBeGreaterThan(items[i - 1]!.atkBonus!);
        const strStat = family === "shortbow" ? "rangedStr" : "magicDamage";
        expect(items[i]![strStat]).toBeGreaterThan(items[i - 1]![strStat]!);
      }
    }
  });

  // #252: the step steepens above mithril specifically so a rune sword — the tier's flagship
  // melee weapon — stays just under shade-blade (the Bone Crypt boss unique, "the best weapon in
  // the game") rather than out-classing it with routine ladder content. shade-blade's 40/34 is
  // copied verbatim from src/data/index.ts, an independent source of truth from this builder.
  it("rune-sword sits strictly below shade-blade (40/34) on both atkBonus and strBonus", () => {
    const runeSword = ladderWeapon("rune", "sword");
    expect(runeSword.atkBonus).toBe(38);
    expect(runeSword.strBonus).toBe(32);
    expect(runeSword.atkBonus).toBeLessThan(40);
    expect(runeSword.strBonus).toBeLessThan(34);
  });

  it("iron/steel/mithril steps are unchanged by the adamant/rune extension (#252)", () => {
    // Recomputed independently of the builder's own step table: the mithril entry (tierIndex 3)
    // must still equal #251's shipped mithril-tier numbers now that two more tiers exist above it.
    expect(ladderWeapon("mithril", "sword").atkBonus).toBe(22);
    expect(ladderWeapon("mithril", "sword").strBonus).toBe(18);
    expect(ladderWeapon("mithril", "dagger").atkBonus).toBe(19);
    expect(ladderWeapon("mithril", "shortbow").atkBonus).toBe(23);
    expect(ladderWeapon("mithril", "shortbow").rangedStr).toBe(19);
    expect(ladderWeapon("mithril", "staff").magicDamage).toBe(8);
  });

  it("every shortbow is two-handed; staves and melee weapons are one-handed (#340)", () => {
    for (const family of ["dagger", "mace", "sword"] as const) {
      for (const tier of GEAR_TIERS) {
        expect(ladderWeapon(tier, family).twoHanded).toBeUndefined();
      }
    }
    for (const tier of GEAR_TIERS) {
      expect(ladderWeapon(tier, "shortbow").twoHanded).toBe(true);
      expect(ladderWeapon(tier, "staff").twoHanded).toBeUndefined();
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

  it("metal armour def.magic is strictly decreasing across all six tiers (0, -1, -2, -3, -4, -5)", () => {
    for (const family of ARMOUR_FAMILIES) {
      const magics = GEAR_TIERS.map((tier) => ladderArmour(tier, family).def.magic);
      expect(magics).toEqual([0, -1, -2, -3, -4, -5]);
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
  it("generates 42 Smithing recipes: 7 metal families x 6 tiers, id equals outputItemId, skill smithing", () => {
    let count = 0;
    for (const family of METAL_FAMILIES) {
      for (const tier of GEAR_TIERS) {
        const recipe = ladderRecipe(tier, family);
        expect(recipe.skill).toBe("smithing");
        expect(recipe.id).toBe(recipe.outputItemId);
        count++;
      }
    }
    expect(count).toBe(42);
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

  // #252: extending TIER_BASE_LEVEL to [1,15,30,45,60,75] puts the highest recipe (rune
  // chainbody: 75 + chainbody's own +9 family offset) at level 84, comfortably under MAX_LEVEL 99
  // — the issue's own worked example, copied verbatim.
  it("platelegs: bronze levelReq 7 / 3 bars / 36 xp / 11 craftTicks, slot legs; rune level 81 / 510 xp / 16 craftTicks", () => {
    const bronze = ladderRecipe("bronze", "platelegs");
    expect(bronze.levelReq).toBe(7);
    expect(bronze.inputs).toEqual([{ itemId: "bronze-bar", qty: 3 }]);
    expect(bronze.xp).toBe(36);
    expect(bronze.craftTicks).toBe(11);
    expect(bronze.id).toBe("bronze-platelegs");
    expect(ladderArmour("bronze", "platelegs").slot).toBe("legs");

    const rune = ladderRecipe("rune", "platelegs");
    expect(rune.levelReq).toBe(81);
    expect(rune.inputs).toEqual([{ itemId: "rune-bar", qty: 3 }]);
    expect(rune.xp).toBe(510);
    expect(rune.craftTicks).toBe(16);
    expect(rune.id).toBe("rune-platelegs");
  });

  it("rune-chainbody is the highest-level recipe at 84, under MAX_LEVEL", () => {
    const runeChainbody = ladderRecipe("rune", "chainbody");
    expect(runeChainbody.levelReq).toBe(84);
    expect(runeChainbody.levelReq).toBeLessThan(MAX_LEVEL);

    for (const family of METAL_FAMILIES) {
      for (const tier of GEAR_TIERS) {
        expect(ladderRecipe(tier, family).levelReq).toBeLessThanOrEqual(84);
        expect(ladderRecipe(tier, family).levelReq).toBeLessThan(MAX_LEVEL);
      }
    }
  });
});

describe("BAR_ITEM_ID (#252)", () => {
  it("extends with adamant-bar and rune-bar", () => {
    expect(BAR_ITEM_ID.adamant).toBe("adamant-bar");
    expect(BAR_ITEM_ID.rune).toBe("rune-bar");
  });
});
