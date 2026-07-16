import { describe, expect, it } from "vitest";
import { createEngine } from "../core/engine";
import { makeSnapshot } from "../core/testing/make-snapshot";
import { seededRng } from "../core/rng";
import { xpForLevel } from "../core/xp";
import { content } from "./index";
import type { Snapshot } from "../core/types";

const DARKROOT_MONSTER_IDS = ["wolf", "goblin-warrior", "bandit"];

describe("Darkroot Forest content", () => {
  it("appears in the picker, locked until Meadow Depths is completed", () => {
    const fresh = createEngine(content, seededRng(1));
    const areas = fresh.snapshot().areas;
    const darkroot = areas.find((a) => a.id === "darkroot-forest");
    expect(darkroot).toBeDefined();
    expect(darkroot?.name).toBe("Darkroot Forest");
    expect(darkroot?.monsterIds).toEqual(DARKROOT_MONSTER_IDS);
    expect(darkroot?.unlocked).toBe(false);
  });

  it("gates a fresh player out of every Darkroot Forest Monster", () => {
    for (const monsterId of DARKROOT_MONSTER_IDS) {
      expect(() => createEngine(content, seededRng(1)).selectMonster(monsterId)).toThrow(
        /Darkroot Forest is locked — defeat Meadow Depths/,
      );
    }
  });

  it("combat leveling alone never unlocks Darkroot Forest, even far past the old combat-level requirement", () => {
    const veteran = createEngine(
      content,
      seededRng(1),
      makeSnapshot({
        player: {
          hp: 99,
          maxHp: 99,
          skills: {
            attack: { level: 99, xp: xpForLevel(99) },
            strength: { level: 99, xp: xpForLevel(99) },
            defence: { level: 99, xp: xpForLevel(99) },
            hitpoints: { level: 99, xp: xpForLevel(99) },
          },
          // completedDungeonIds deliberately left empty: Meadow Depths was never completed.
        },
      }),
    );
    expect(veteran.snapshot().areas.find((a) => a.id === "darkroot-forest")?.unlocked).toBe(false);
    expect(() => veteran.selectMonster("wolf")).toThrow(
      /Darkroot Forest is locked — defeat Meadow Depths/,
    );
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

/** A saved Snapshot for a player who just graduated Lumbry Meadows: cleared its Meadow Depths
 * Dungeon (unlocking Darkroot Forest), bronze-geared. */
function meadowsGraduateSave() {
  return makeSnapshot({
    player: {
      hp: 16,
      maxHp: 16,
      skills: {
        attack: { level: 13, xp: xpForLevel(13) },
        strength: { level: 15, xp: xpForLevel(15) },
        defence: { level: 10, xp: xpForLevel(10) },
        hitpoints: { level: 16, xp: xpForLevel(16) },
      },
      equipment: { weapon: "bronze-sword", shield: "bronze-shield" },
      completedDungeonIds: ["meadow-depths"],
    },
  });
}

describe("Darkroot Forest tier balance", () => {
  it("a bronze-geared Meadows graduate who cleared Meadow Depths is unlocked and progresses against the Wolf (kills outpace deaths)", () => {
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
      /Darkroot Forest is locked — defeat Meadow Depths/,
    );
  });
});

describe("Gating migration (#24): pre-wave saves derive completedDungeonIds from areas[].unlocked", () => {
  /** A pre-#24 save (predates Dungeon-boss gating): no `completedDungeonIds` key, and Darkroot's
   * `unlocked` flag was still the old combat-level-derived one. */
  function preWaveSave(darkrootUnlocked: boolean) {
    return {
      player: {
        hp: 16,
        maxHp: 16,
        combatLevel: 13,
        combatStyle: "aggressive",
        autoEatThreshold: 0.5,
        skills: {
          attack: { level: 13, xp: xpForLevel(13) },
          strength: { level: 15, xp: xpForLevel(15) },
          defence: { level: 10, xp: xpForLevel(10) },
          hitpoints: { level: 16, xp: xpForLevel(16) },
        },
        equipment: { weapon: null, shield: null, head: null, body: null, legs: null },
        inventory: [],
        respawning: false,
        // no completedDungeonIds key at all
      },
      monster: null,
      areas: [
        {
          id: "lumbry-meadows",
          name: "Lumbry Meadows",
          unlocked: true,
          monsterIds: ["chicken", "cow", "goblin"],
          fishingSpots: [{ id: "shrimp-pool", unlocked: true }],
        },
        {
          id: "darkroot-forest",
          name: "Darkroot Forest",
          unlocked: darkrootUnlocked,
          monsterIds: DARKROOT_MONSTER_IDS,
          fishingSpots: [{ id: "trout-run", unlocked: false }],
        },
      ],
      // no dungeon key either
    };
  }

  it("Darkroot unlocked:true migrates meadow-depths into completedDungeonIds and unlocks the Area", () => {
    const restored = createEngine(
      content,
      seededRng(1),
      JSON.parse(JSON.stringify(preWaveSave(true))),
    );
    expect(restored.snapshot().player.completedDungeonIds).toEqual(["meadow-depths"]);
    expect(restored.snapshot().areas.find((a) => a.id === "darkroot-forest")?.unlocked).toBe(true);
  });

  it("Darkroot unlocked:false stays locked (nothing migrated)", () => {
    const restored = createEngine(
      content,
      seededRng(1),
      JSON.parse(JSON.stringify(preWaveSave(false))),
    );
    expect(restored.snapshot().player.completedDungeonIds).toEqual([]);
    expect(restored.snapshot().areas.find((a) => a.id === "darkroot-forest")?.unlocked).toBe(false);
  });

  it("completedDungeonIds round-trips through a subsequent save/load once migrated", () => {
    const restored = createEngine(
      content,
      seededRng(1),
      JSON.parse(JSON.stringify(preWaveSave(true))),
    );
    const savedAgain: Snapshot = restored.snapshot();

    const restoredAgain = createEngine(
      content,
      seededRng(1),
      JSON.parse(JSON.stringify(savedAgain)),
    );
    expect(restoredAgain.snapshot().player.completedDungeonIds).toEqual(["meadow-depths"]);
    expect(restoredAgain.snapshot().areas.find((a) => a.id === "darkroot-forest")?.unlocked).toBe(
      true,
    );
  });
});
