import { describe, expect, it } from "vitest";
import { createEngine } from "../core/engine";
import { seededRng } from "../core/rng";
import { content } from "./index";

const RAW_FISH_IDS = ["raw-pike", "raw-trout", "raw-cave-eel", "raw-icefin"] as const;

const UNDEAD_MONSTER_IDS = [
  "zombie",
  "skeleton",
  "crypt-ghoul",
  "bone-knight",
  "ice-wraith",
] as const;

describe("Drop Table thematic pass (#388)", () => {
  it("no undead Monster drops any raw fish", () => {
    for (const monsterId of UNDEAD_MONSTER_IDS) {
      const monster = content.monsters.find((m) => m.id === monsterId)!;
      for (const entry of monster.dropTable) {
        expect(
          RAW_FISH_IDS,
          `${monsterId} must not drop raw fish (found ${entry.itemId})`,
        ).not.toContain(entry.itemId);
      }
    }
  });

  it("Chicken drops raw-chicken and no longer drops beef, cowhide, or a bronze dagger", () => {
    const chicken = content.monsters.find((m) => m.id === "chicken")!;
    expect(chicken.dropTable).toEqual([
      { itemId: "gold", qty: 2, chance: 1, band: "guaranteed" },
      { itemId: "raw-chicken", qty: 1, chance: 0.45, band: "common" },
      { itemId: "guam-herb", qty: 1, chance: 0.15, band: "uncommon" },
    ]);
  });

  it("raw-chicken is reachable from a Chicken kill (seeded Rng, real Content)", () => {
    const engine = createEngine(content, seededRng(42));
    engine.selectMonster("chicken");

    let rawChickenDrops = 0;
    engine.on("drop", (e) => {
      if (e.itemId === "raw-chicken") rawChickenDrops++;
    });
    for (let i = 0; i < 6000; i++) engine.tick();

    expect(rawChickenDrops).toBeGreaterThan(0);
  });

  it("Cow cowhide chance is raised to 0.65 (compensation for chicken no longer supplying hide)", () => {
    const cow = content.monsters.find((m) => m.id === "cow")!;
    expect(cow.dropTable).toContainEqual({
      itemId: "cowhide",
      qty: 1,
      chance: 0.65,
      band: "common",
    });
  });

  it("raw-pike is retained on giant-rat, frost-wolf, and frost-giant only among the affected Monsters", () => {
    const keepers = ["giant-rat", "frost-wolf", "frost-giant"] as const;
    for (const monsterId of keepers) {
      const monster = content.monsters.find((m) => m.id === monsterId)!;
      expect(monster.dropTable.some((e) => e.itemId === "raw-pike")).toBe(true);
    }
  });

  it("every touched Monster still has guaranteed, common, and uncommon bands", () => {
    const touchedIds = [
      "chicken",
      "cow",
      "zombie",
      "skeleton",
      "crypt-ghoul",
      "bone-knight",
      "ice-wraith",
    ] as const;
    for (const monsterId of touchedIds) {
      const monster = content.monsters.find((m) => m.id === monsterId)!;
      const bands = new Set(monster.dropTable.map((e) => e.band));
      expect(bands.has("guaranteed"), `${monsterId} missing guaranteed`).toBe(true);
      expect(bands.has("common"), `${monsterId} missing common`).toBe(true);
      expect(bands.has("uncommon"), `${monsterId} missing uncommon`).toBe(true);
    }
  });
});
