import { describe, expect, it } from "vitest";
import { content } from "./index";

/**
 * Issue #321: composition must preserve every global collection's id order byte-for-byte.
 * Captured from pre-refactor `src/data/index.ts` at main tip — independent of composeContent.
 */

const GOLDEN_AREA_IDS = [
  "lumbry-meadows",
  "darkroot-forest",
  "old-sewers",
  "bone-crypt",
  "frostspire",
] as const;

const GOLDEN_MONSTER_IDS = [
  "chicken",
  "cow",
  "goblin",
  "spider",
  "boar",
  "wolf",
  "goblin-warrior",
  "bandit",
  "goblin-brute",
  "goblin-chief",
  "giant-rat",
  "zombie",
  "skeleton",
  "hollow-warden",
  "sewer-king",
  "crypt-ghoul",
  "bone-knight",
  "crypt-shade",
  "frost-wolf",
  "ice-wraith",
  "frost-giant",
  "frost-warden",
] as const;

const GOLDEN_FISHING_SPOT_IDS = [
  "shrimp-pool",
  "trout-run",
  "sewer-outflow",
  "flooded-ossuary",
  "glacial-melt",
] as const;

const GOLDEN_DUNGEON_IDS = [
  "meadow-depths",
  "darkroot-hollow",
  "sewer-king",
  "shade-crypt",
  "frost-warden",
] as const;

const GOLDEN_SPELL_IDS = [
  "air-strike",
  "water-strike",
  "earth-strike",
  "fire-strike",
  "air-bolt",
  "water-bolt",
  "earth-bolt",
  "fire-bolt",
  "air-blast",
  "water-blast",
  "earth-blast",
  "fire-blast",
] as const;

const GOLDEN_VENDOR_ITEM_IDS = [
  "bronze-arrow",
  "iron-arrow",
  "steel-arrow",
  "mithril-arrow",
  "air-rune",
  "water-rune",
  "earth-rune",
  "fire-rune",
  "adamant-arrow",
  "rune-arrow",
  "air-bolt-rune",
  "water-bolt-rune",
  "earth-bolt-rune",
  "fire-bolt-rune",
  "air-blast-rune",
  "water-blast-rune",
  "earth-blast-rune",
  "fire-blast-rune",
] as const;

const GOLDEN_PET_IDS = ["rock-golem", "fishing-frog", "kiln-cat", "shade-wisp"] as const;

/** Dungeon-only monsters must never appear in any Area's open-world monsterIds. */
const DUNGEON_ONLY_MONSTER_IDS = [
  "goblin-brute",
  "goblin-chief",
  "hollow-warden",
  "sewer-king",
  "crypt-shade",
  "frost-warden",
] as const;

describe("Area content composition (#321): global collection ordering parity", () => {
  it("areas, monsters, fishing spots, and dungeons keep their pre-refactor id order", () => {
    expect(content.areas.map((a) => a.id)).toEqual([...GOLDEN_AREA_IDS]);
    expect(content.monsters.map((m) => m.id)).toEqual([...GOLDEN_MONSTER_IDS]);
    expect(content.fishingSpots.map((f) => f.id)).toEqual([...GOLDEN_FISHING_SPOT_IDS]);
    expect(content.dungeons.map((d) => d.id)).toEqual([...GOLDEN_DUNGEON_IDS]);
  });

  it("spells, vendor entries, and pets keep their pre-refactor id order", () => {
    expect(content.spells.map((s) => s.id)).toEqual([...GOLDEN_SPELL_IDS]);
    expect(content.vendor.map((v) => v.itemId)).toEqual([...GOLDEN_VENDOR_ITEM_IDS]);
    expect(content.pets.map((p) => p.id)).toEqual([...GOLDEN_PET_IDS]);
  });

  it("composition derives open-world monsterIds and never lists dungeon-only monsters", () => {
    for (const dungeonOnlyId of DUNGEON_ONLY_MONSTER_IDS) {
      for (const area of content.areas) {
        expect(
          area.monsterIds,
          `"${dungeonOnlyId}" must not be an open-world monster in "${area.id}"`,
        ).not.toContain(dungeonOnlyId);
      }
    }

    const meadows = content.areas.find((a) => a.id === "lumbry-meadows")!;
    expect(meadows.monsterIds).toEqual(["chicken", "cow", "goblin", "spider", "boar"]);
    expect(meadows.fishingSpotIds).toEqual(["shrimp-pool"]);

    const forest = content.areas.find((a) => a.id === "darkroot-forest")!;
    expect(forest.monsterIds).toEqual(["wolf", "goblin-warrior", "bandit"]);
    expect(forest.fishingSpotIds).toEqual(["trout-run"]);

    const sewers = content.areas.find((a) => a.id === "old-sewers")!;
    expect(sewers.monsterIds).toEqual(["giant-rat", "zombie", "skeleton"]);
    expect(sewers.fishingSpotIds).toEqual(["sewer-outflow"]);

    const crypt = content.areas.find((a) => a.id === "bone-crypt")!;
    expect(crypt.monsterIds).toEqual(["crypt-ghoul", "bone-knight"]);
    expect(crypt.fishingSpotIds).toEqual(["flooded-ossuary"]);

    const frost = content.areas.find((a) => a.id === "frostspire")!;
    expect(frost.monsterIds).toEqual(["frost-wolf", "ice-wraith", "frost-giant"]);
    expect(frost.fishingSpotIds).toEqual(["glacial-melt"]);
  });

  it("hosted dungeons receive areaId from their enclosing Area bundle", () => {
    expect(content.dungeons.find((d) => d.id === "meadow-depths")!.areaId).toBe("lumbry-meadows");
    expect(content.dungeons.find((d) => d.id === "darkroot-hollow")!.areaId).toBe(
      "darkroot-forest",
    );
    expect(content.dungeons.find((d) => d.id === "sewer-king")!.areaId).toBe("old-sewers");
    expect(content.dungeons.find((d) => d.id === "shade-crypt")!.areaId).toBe("bone-crypt");
    expect(content.dungeons.find((d) => d.id === "frost-warden")!.areaId).toBe("frostspire");
  });

  it("dungeon-only monsters remain globally resolvable", () => {
    const monsterIds = new Set(content.monsters.map((m) => m.id));
    for (const id of DUNGEON_ONLY_MONSTER_IDS) {
      expect(monsterIds.has(id), `"${id}" missing from global monsters`).toBe(true);
    }
  });
});
