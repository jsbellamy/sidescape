import { describe, expect, it } from "vitest";
import { createEngine } from "../core/engine";
import { seededRng } from "../core/rng";
import type { Snapshot } from "../core/types";
import { xpForLevel } from "../core/xp";
import { content } from "./index";

const DARKROOT_MONSTER_IDS = ["wolf", "goblin-warrior", "bandit"];

describe("Darkroot Forest content", () => {
  it("appears in the picker, locked below combat level 10", () => {
    const fresh = createEngine(content, seededRng(1));
    const areas = fresh.snapshot().areas;
    const darkroot = areas.find((a) => a.id === "darkroot-forest");
    expect(darkroot).toBeDefined();
    expect(darkroot?.name).toBe("Darkroot Forest");
    expect(darkroot?.monsterIds).toEqual(DARKROOT_MONSTER_IDS);
    // fresh player: combat level floor((1+1+1+10)/4) = 3, below the Area's requirement of 10
    expect(fresh.snapshot().player.combatLevel).toBe(3);
    expect(darkroot?.unlocked).toBe(false);
  });

  it("gates a fresh player out of every Darkroot Forest Monster", () => {
    for (const monsterId of DARKROOT_MONSTER_IDS) {
      expect(() => createEngine(content, seededRng(1)).selectMonster(monsterId)).toThrow(
        /combat level 10/i,
      );
    }
  });

  it("Wolf, Goblin Warrior, and Bandit exist with the roughly-doubled Lumbry Meadows stats", () => {
    const wolf = content.monsters.find((m) => m.id === "wolf");
    const goblinWarrior = content.monsters.find((m) => m.id === "goblin-warrior");
    const bandit = content.monsters.find((m) => m.id === "bandit");
    expect(wolf).toBeDefined();
    expect(goblinWarrior).toBeDefined();
    expect(bandit).toBeDefined();
    // Lumbry Meadows tops out at hp 8 / maxHit 2 (Cow / Goblin); Darkroot Forest is roughly double.
    for (const monster of [wolf, goblinWarrior, bandit]) {
      expect(monster!.hp).toBeGreaterThanOrEqual(16);
      expect(monster!.maxHit).toBeGreaterThanOrEqual(3);
    }
  });

  it("each Darkroot Forest Monster's Drop Table has guaranteed/common/uncommon bands and iron Equipment appears", () => {
    let ironEquipmentSeen = false;
    for (const monsterId of DARKROOT_MONSTER_IDS) {
      const monster = content.monsters.find((m) => m.id === monsterId)!;
      const bands = new Set(monster.dropTable.map((e) => e.band));
      expect(bands.has("guaranteed")).toBe(true);
      expect(bands.has("common")).toBe(true);
      expect(bands.has("uncommon")).toBe(true);

      for (const entry of monster.dropTable) {
        const item = content.items.find((i) => i.id === entry.itemId);
        expect(item, `${monsterId} drops unknown item ${entry.itemId}`).toBeDefined();
        if (
          entry.band === "uncommon" &&
          item?.kind === "equipment" &&
          item.id.startsWith("iron-")
        ) {
          ironEquipmentSeen = true;
        }
      }
    }
    expect(ironEquipmentSeen).toBe(true);
  });
});

/** A saved Snapshot for a player who just graduated Lumbry Meadows: combat level 13, bronze-geared. */
function meadowsGraduateSave(): Snapshot {
  return {
    player: {
      hp: 16,
      maxHp: 16,
      combatLevel: 13,
      combatStyle: "aggressive",
      skills: {
        attack: { level: 13, xp: xpForLevel(13) },
        strength: { level: 15, xp: xpForLevel(15) },
        defence: { level: 10, xp: xpForLevel(10) },
        hitpoints: { level: 16, xp: xpForLevel(16) },
      },
      equipment: {
        weapon: "bronze-sword",
        shield: "bronze-shield",
        head: null,
        body: null,
        legs: null,
      },
      inventory: [],
      respawning: false,
    },
    monster: null,
    areas: [],
  };
}

describe("Darkroot Forest tier balance", () => {
  it("a bronze-geared Meadows graduate is unlocked and progresses against the Wolf (kills outpace deaths)", () => {
    const engine = createEngine(content, seededRng(2024), meadowsGraduateSave());
    expect(() => engine.selectMonster("wolf")).not.toThrow();

    let kills = 0;
    let deaths = 0;
    engine.on("kill", () => kills++);
    engine.on("death", () => deaths++);
    for (let i = 0; i < 6000; i++) engine.tick();

    expect(kills).toBeGreaterThan(0);
    expect(kills).toBeGreaterThan(deaths * 2);
  });

  it("a fresh (unequipped, level-1) player cannot even select a Darkroot Forest Monster", () => {
    expect(() => createEngine(content, seededRng(2024)).selectMonster("wolf")).toThrow(
      /combat level 10/i,
    );
  });
});
