import { describe, expect, it } from "vitest";
import { createEngine } from "../core/engine";
import { makeSnapshot } from "../core/testing/make-snapshot";
import { seededRng } from "../core/rng";
import { resolveContent } from "../core/validate-content";
import { xpForLevel } from "../core/xp";
import { content } from "./index";

const OLD_SEWERS_MONSTER_IDS = ["giant-rat", "zombie", "skeleton", "sewer-slime", "grave-robber"];
const DARKROOT_HOLLOW_WAVES = ["wolf", "goblin-warrior", "bandit", "hollow-warden"];

describe("Old Sewers content", () => {
  it("appears in the picker, locked until Darkroot Hollow is completed", () => {
    const fresh = createEngine(content, seededRng(1));
    const areas = fresh.snapshot().areas;
    const oldSewers = areas.find((a) => a.id === "old-sewers");
    expect(oldSewers).toBeDefined();
    expect(oldSewers?.name).toBe("Old Sewers");
    expect(oldSewers?.monsterIds).toEqual(OLD_SEWERS_MONSTER_IDS);
    expect(oldSewers?.unlocked).toBe(false);
  });

  it("gates a fresh player out of every Old Sewers Monster", () => {
    for (const monsterId of OLD_SEWERS_MONSTER_IDS) {
      expect(() => createEngine(content, seededRng(1)).selectMonster(monsterId)).toThrow(
        /Old Sewers is locked — defeat Darkroot Hollow/,
      );
    }
  });

  it("Giant Rat, Zombie, Skeleton, Sewer Slime, and Grave Robber exist with roughly-doubled Darkroot Forest stats", () => {
    const giantRat = content.monsters.find((m) => m.id === "giant-rat");
    const zombie = content.monsters.find((m) => m.id === "zombie");
    const skeleton = content.monsters.find((m) => m.id === "skeleton");
    const sewerSlime = content.monsters.find((m) => m.id === "sewer-slime");
    const graveRobber = content.monsters.find((m) => m.id === "grave-robber");
    expect(giantRat).toBeDefined();
    expect(zombie).toBeDefined();
    expect(skeleton).toBeDefined();
    expect(sewerSlime).toBeDefined();
    expect(graveRobber).toBeDefined();
    // Darkroot Forest tops out at hp 24 / maxHit 5 (Bandit); Old Sewers is roughly double.
    for (const monster of [giantRat, zombie, skeleton, sewerSlime, graveRobber]) {
      expect(monster!.hp).toBeGreaterThanOrEqual(32);
      expect(monster!.maxHit).toBeGreaterThanOrEqual(6);
    }
  });

  it("Sewer Slime's Defence Vector punishes crush and rewards slash — its weak-spot lesson", () => {
    const sewerSlime = content.monsters.find((m) => m.id === "sewer-slime")!;
    const defValues = Object.values(sewerSlime.def);
    expect(sewerSlime.def.slash).toBe(Math.min(...defValues));
    expect(sewerSlime.def.crush).toBe(Math.max(...defValues));
  });

  it("Grave Robber is the only new Old Sewers Monster dropping raw-pike; Sewer Slime drops no raw fish", () => {
    const sewerSlime = content.monsters.find((m) => m.id === "sewer-slime")!;
    const graveRobber = content.monsters.find((m) => m.id === "grave-robber")!;
    expect(sewerSlime.dropTable.some((e) => e.itemId === "raw-pike")).toBe(false);
    expect(graveRobber.dropTable).toContainEqual({
      itemId: "raw-pike",
      qty: 1,
      chance: 0.3,
      band: "common",
    });
  });

  it("resolveContent(content) does not throw with Sewer Slime and Grave Robber added", () => {
    expect(() => resolveContent(content)).not.toThrow();
  });

  it("each Old Sewers Monster's Drop Table has guaranteed/common bands, and steel Equipment plus the stronger raw catch (#115: Cooking's Material, not Food directly) appear", () => {
    let steelEquipmentSeen = false;
    let rawPikeSeen = false;
    for (const monsterId of OLD_SEWERS_MONSTER_IDS) {
      const monster = content.monsters.find((m) => m.id === monsterId)!;
      const bands = new Set(monster.dropTable.map((e) => e.band));
      expect(bands.has("guaranteed")).toBe(true);
      expect(bands.has("common")).toBe(true);
      if (monsterId === "sewer-slime" || monsterId === "grave-robber") {
        expect(bands.has("uncommon"), `${monsterId} missing uncommon`).toBe(true);
      }

      for (const entry of monster.dropTable) {
        const item = content.items.find((i) => i.id === entry.itemId);
        expect(item, `${monsterId} drops unknown item ${entry.itemId}`).toBeDefined();
        if (item?.kind === "equipment" && item.id.startsWith("steel-")) steelEquipmentSeen = true;
        if (item?.id === "raw-pike") rawPikeSeen = true;
      }
    }
    expect(steelEquipmentSeen).toBe(true);
    expect(rawPikeSeen).toBe(true);
  });

  it("Cooked Pike heals more than every earlier Food and steel Equipment out-bonuses its iron equivalent", () => {
    const cookedPike = content.items.find((i) => i.id === "cooked-pike");
    expect(cookedPike?.kind).toBe("food");
    const earlierFood = ["cooked-meat", "cooked-trout", "cooked-shrimp"]
      .map((id) => content.items.find((i) => i.id === id))
      .filter((i) => i?.kind === "food");
    expect(earlierFood.length).toBeGreaterThan(0);
    for (const food of earlierFood) {
      expect((cookedPike as { heals: number }).heals).toBeGreaterThan(
        (food as { heals: number }).heals,
      );
    }

    const ironKiteshield = content.items.find((i) => i.id === "iron-kiteshield");
    const steelKiteshield = content.items.find((i) => i.id === "steel-kiteshield");
    expect(ironKiteshield?.kind).toBe("equipment");
    expect(steelKiteshield?.kind).toBe("equipment");
    expect((steelKiteshield as { def: { stab: number } }).def.stab).toBeGreaterThan(
      (ironKiteshield as { def: { stab: number } }).def.stab,
    );
  });

  it("new items are appended after iron-bar (append-only: existing entries never reorder)", () => {
    const ids = content.items.map((i) => i.id);
    expect(ids.indexOf("iron-bar")).toBeLessThan(ids.indexOf("steel-dagger"));
    expect(ids.indexOf("iron-bar")).toBeLessThan(ids.indexOf("cooked-pike"));
  });
});

describe("Darkroot Hollow Dungeon", () => {
  it("is hosted in Darkroot Forest with Darkroot-Monster waves plus the Hollow Warden boss", () => {
    const dungeon = content.dungeons.find((d) => d.id === "darkroot-hollow");
    expect(dungeon).toBeDefined();
    expect(dungeon?.areaId).toBe("darkroot-forest");
    expect(dungeon?.waves).toEqual(DARKROOT_HOLLOW_WAVES);
    // The boss (last wave) is dungeon-only: absent from every Area's monsterIds.
    expect(content.areas.some((a) => a.monsterIds.includes("hollow-warden"))).toBe(false);
    const boss = content.monsters.find((m) => m.id === "hollow-warden");
    expect(boss).toBeDefined();
    expect(boss!.hp).toBeGreaterThan(content.monsters.find((m) => m.id === "bandit")!.hp);
  });

  it("its Chest bridges the iron -> steel transition", () => {
    const dungeon = content.dungeons.find((d) => d.id === "darkroot-hollow")!;
    const chestItemIds = dungeon.chest.map((e) => e.itemId);
    const ironItems = chestItemIds.filter((id) => id.startsWith("iron-"));
    const steelItems = chestItemIds.filter((id) => id.startsWith("steel-"));
    expect(ironItems.length).toBeGreaterThan(0);
    expect(steelItems.length).toBeGreaterThan(0);
    for (const entry of dungeon.chest) {
      const item = content.items.find((i) => i.id === entry.itemId);
      expect(item, `chest entry ${entry.itemId} not found`).toBeDefined();
    }
  });

  it("entering it requires Darkroot Forest unlocked (a fresh player is locked out)", () => {
    expect(() => createEngine(content, seededRng(1)).enterDungeon("darkroot-hollow")).toThrow(
      /Darkroot Forest is locked — defeat Meadow Depths/,
    );
  });
});

/** A saved Snapshot for a player who just graduated Darkroot Forest: cleared Meadow Depths
 * (so Darkroot Forest is unlocked, letting them enter Darkroot Hollow) and geared in iron —
 * but has NOT yet completed Darkroot Hollow itself. */
function darkrootGraduateSave() {
  return makeSnapshot({
    player: {
      hp: 30,
      maxHp: 30,
      skills: {
        attack: { level: 26, xp: xpForLevel(26) },
        strength: { level: 28, xp: xpForLevel(28) },
        defence: { level: 22, xp: xpForLevel(22) },
        hitpoints: { level: 30, xp: xpForLevel(30) },
      },
      equipment: {
        weapon: "iron-dagger",
        shield: "iron-kiteshield",
        body: "iron-chainbody",
        head: "iron-full-helm",
      },
      autoEatThreshold: 0.5,
      completedDungeonIds: ["meadow-depths"],
    },
    bank: { items: [{ itemId: "cooked-trout", qty: 30 }] },
  });
}

describe("Old Sewers tier balance", () => {
  it("a player who hasn't completed Darkroot Hollow stays gated out of Old Sewers, even iron-geared at Darkroot level", () => {
    const engine = createEngine(content, seededRng(2024), darkrootGraduateSave());
    expect(engine.snapshot().areas.find((a) => a.id === "old-sewers")?.unlocked).toBe(false);
    expect(() => engine.selectMonster("giant-rat")).toThrow(
      /Old Sewers is locked — defeat Darkroot Hollow/,
    );
  });

  it("an iron-geared tier-2 (Darkroot) graduate completes Darkroot Hollow, flipping Old Sewers unlocked on dungeon-completed, then progresses against the Giant Rat", () => {
    const engine = createEngine(content, seededRng(2024), darkrootGraduateSave());

    let hollowCompleted = false;
    engine.on("dungeon-completed", (e) => {
      if (e.dungeonId === "darkroot-hollow") hollowCompleted = true;
    });
    expect(() => engine.enterDungeon("darkroot-hollow")).not.toThrow();

    for (let i = 0; i < 20000 && !hollowCompleted; i++) {
      engine.tick();
      const snap = engine.snapshot();
      // Re-enter if a death ejected the run back to idle before it completed.
      if (!hollowCompleted && snap.dungeon === null && snap.monster === null) {
        engine.enterDungeon("darkroot-hollow");
      }
    }

    expect(hollowCompleted).toBe(true);
    const afterHollow = engine.snapshot();
    expect(afterHollow.player.completedDungeonIds).toContain("darkroot-hollow");
    expect(afterHollow.areas.find((a) => a.id === "old-sewers")?.unlocked).toBe(true);

    expect(() => engine.selectMonster("giant-rat")).not.toThrow();
    let kills = 0;
    let deaths = 0;
    engine.on("kill", () => kills++);
    engine.on("death", () => deaths++);
    for (let i = 0; i < 6000; i++) engine.tick();

    expect(kills).toBeGreaterThan(0);
    expect(kills).toBeGreaterThan(deaths * 2);
  });

  it("a fresh (unequipped, level-1) player cannot even enter Darkroot Hollow or select a Giant Rat", () => {
    expect(() => createEngine(content, seededRng(2024)).enterDungeon("darkroot-hollow")).toThrow(
      /Darkroot Forest is locked — defeat Meadow Depths/,
    );
    expect(() => createEngine(content, seededRng(2024)).selectMonster("giant-rat")).toThrow(
      /Old Sewers is locked — defeat Darkroot Hollow/,
    );
  });
});

/** Old Sewers unlocked — cleared Darkroot Hollow, iron-geared at Darkroot level. */
function oldSewersUnlockedSave() {
  return makeSnapshot({
    player: {
      hp: 30,
      maxHp: 30,
      skills: {
        attack: { level: 26, xp: xpForLevel(26) },
        strength: { level: 28, xp: xpForLevel(28) },
        defence: { level: 22, xp: xpForLevel(22) },
        hitpoints: { level: 30, xp: xpForLevel(30) },
      },
      equipment: {
        weapon: "iron-dagger",
        shield: "iron-kiteshield",
        body: "iron-chainbody",
        head: "iron-full-helm",
      },
      autoEatThreshold: 0.5,
      completedDungeonIds: ["meadow-depths", "darkroot-hollow"],
    },
    bank: { items: [{ itemId: "cooked-trout", qty: 30 }] },
  });
}

describe("Sewer Slime and Grave Robber kills", () => {
  it("a Sewer Slime kill drops its guaranteed gold (seeded Rng, real Content)", () => {
    const engine = createEngine(content, seededRng(3961), oldSewersUnlockedSave());
    engine.selectMonster("sewer-slime");

    let kills = 0;
    let goldDrops = 0;
    engine.on("kill", (e) => {
      if (e.monsterId === "sewer-slime") kills++;
    });
    engine.on("drop", (e) => {
      if (e.itemId === "gold") goldDrops++;
    });
    for (let i = 0; i < 8000; i++) engine.tick();

    expect(kills).toBeGreaterThan(0);
    expect(goldDrops).toBeGreaterThanOrEqual(kills);
  });

  it("a Grave Robber kill drops its guaranteed gold (seeded Rng, real Content)", () => {
    const engine = createEngine(content, seededRng(3962), oldSewersUnlockedSave());
    engine.selectMonster("grave-robber");

    let kills = 0;
    let goldDrops = 0;
    engine.on("kill", (e) => {
      if (e.monsterId === "grave-robber") kills++;
    });
    engine.on("drop", (e) => {
      if (e.itemId === "gold") goldDrops++;
    });
    for (let i = 0; i < 8000; i++) engine.tick();

    expect(kills).toBeGreaterThan(0);
    expect(goldDrops).toBeGreaterThanOrEqual(kills);
  });

  it("gates Sewer Slime and Grave Robber behind Old Sewers' unlock (cleared Darkroot Hollow)", () => {
    const engine = createEngine(content, seededRng(2024), darkrootGraduateSave());
    expect(engine.snapshot().areas.find((a) => a.id === "old-sewers")?.unlocked).toBe(false);
    for (const monsterId of ["sewer-slime", "grave-robber"]) {
      expect(() => engine.selectMonster(monsterId)).toThrow(
        /Old Sewers is locked — defeat Darkroot Hollow/,
      );
    }
  });
});
