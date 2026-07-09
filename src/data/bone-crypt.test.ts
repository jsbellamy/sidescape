import { describe, expect, it } from "vitest";
import { createEngine } from "../core/engine";
import { makeSnapshot } from "../core/make-snapshot";
import { seededRng } from "../core/rng";
import { xpForLevel } from "../core/xp";
import { content } from "./index";

const SEWER_KING_WAVES = ["giant-rat", "zombie", "skeleton", "sewer-king"];

describe("Sewer King Dungeon", () => {
  it("is hosted in Old Sewers with Old-Sewers-Monster waves plus the Sewer King boss", () => {
    const dungeon = content.dungeons.find((d) => d.id === "sewer-king");
    expect(dungeon).toBeDefined();
    expect(dungeon?.areaId).toBe("old-sewers");
    expect(dungeon?.waves).toEqual(SEWER_KING_WAVES);
    // The boss (last wave) is dungeon-only: absent from every Area's monsterIds.
    expect(content.areas.some((a) => a.monsterIds.includes("sewer-king"))).toBe(false);
    const boss = content.monsters.find((m) => m.id === "sewer-king");
    expect(boss).toBeDefined();
    expect(boss!.hp).toBeGreaterThan(content.monsters.find((m) => m.id === "skeleton")!.hp);
  });

  it("its Chest bridges the steel -> mithril transition", () => {
    const dungeon = content.dungeons.find((d) => d.id === "sewer-king")!;
    const chestItemIds = dungeon.chest.map((e) => e.itemId);
    const steelItems = chestItemIds.filter((id) => id.startsWith("steel-"));
    const mithrilItems = chestItemIds.filter((id) => id.startsWith("mithril-"));
    expect(steelItems.length).toBeGreaterThan(0);
    expect(mithrilItems.length).toBeGreaterThan(0);
    for (const entry of dungeon.chest) {
      const item = content.items.find((i) => i.id === entry.itemId);
      expect(item, `chest entry ${entry.itemId} not found`).toBeDefined();
    }
  });

  it("entering it requires Old Sewers unlocked (a fresh player is locked out)", () => {
    expect(() => createEngine(content, seededRng(1)).enterDungeon("sewer-king")).toThrow(
      /Old Sewers is locked — defeat Darkroot Hollow/,
    );
  });

  it("a player who unlocked Old Sewers but hasn't cleared it can still enter Sewer King (Dungeon entry only requires the host Area unlocked)", () => {
    const engine = createEngine(content, seededRng(1), darkrootGraduateSave());
    expect(() => engine.enterDungeon("sewer-king")).not.toThrow();
  });
});

describe("Bone Crypt content", () => {
  it("appears in the picker, locked until Sewer King is completed", () => {
    const fresh = createEngine(content, seededRng(1));
    const areas = fresh.snapshot().areas;
    const boneCrypt = areas.find((a) => a.id === "bone-crypt");
    expect(boneCrypt).toBeDefined();
    expect(boneCrypt?.name).toBe("Bone Crypt");
    expect(boneCrypt?.monsterIds).toEqual(["crypt-shade"]);
    expect(boneCrypt?.unlocked).toBe(false);
  });

  it("gates a fresh player out of the Crypt Shade", () => {
    expect(() => createEngine(content, seededRng(1)).selectMonster("crypt-shade")).toThrow(
      /Bone Crypt is locked — defeat Sewer King/,
    );
  });

  it("Crypt Shade exists with roughly double Old Sewers' top stats (Skeleton: hp 48 / maxHit 10)", () => {
    const cryptShade = content.monsters.find((m) => m.id === "crypt-shade");
    expect(cryptShade).toBeDefined();
    expect(cryptShade!.hp).toBeGreaterThanOrEqual(96);
    expect(cryptShade!.maxHit).toBeGreaterThanOrEqual(20);
  });

  it("Crypt Shade's Drop Table has guaranteed/common/uncommon/rare bands, carries mithril Equipment, and the Shade Blade at a ~1/512 rare band", () => {
    const cryptShade = content.monsters.find((m) => m.id === "crypt-shade")!;
    const bands = new Set(cryptShade.dropTable.map((e) => e.band));
    expect(bands.has("guaranteed")).toBe(true);
    expect(bands.has("common")).toBe(true);
    expect(bands.has("uncommon")).toBe(true);
    expect(bands.has("rare")).toBe(true);

    let mithrilEquipmentSeen = false;
    for (const entry of cryptShade.dropTable) {
      const item = content.items.find((i) => i.id === entry.itemId);
      expect(item, `crypt-shade drops unknown item ${entry.itemId}`).toBeDefined();
      if (item?.kind === "equipment" && item.id.startsWith("mithril-")) mithrilEquipmentSeen = true;
    }
    expect(mithrilEquipmentSeen).toBe(true);

    const shadeBladeEntry = cryptShade.dropTable.find((e) => e.itemId === "shade-blade");
    expect(shadeBladeEntry).toBeDefined();
    expect(shadeBladeEntry?.band).toBe("rare");
    // "~1/512": within a factor of 2 either side of the declared rare band.
    expect(shadeBladeEntry!.chance).toBeGreaterThanOrEqual(1 / 1024);
    expect(shadeBladeEntry!.chance).toBeLessThanOrEqual(1 / 256);
  });

  it("the Shade Blade out-bonuses every mithril weapon and every earlier weapon in the game", () => {
    const shadeBlade = content.items.find((i) => i.id === "shade-blade");
    const mithrilDagger = content.items.find((i) => i.id === "mithril-dagger");
    expect(shadeBlade?.kind).toBe("equipment");
    expect(mithrilDagger?.kind).toBe("equipment");
    const weapons = content.items.filter(
      (i) => i.kind === "equipment" && i.slot === "weapon" && i.id !== "shade-blade",
    ) as { atkBonus: number; strBonus: number }[];
    expect(weapons.length).toBeGreaterThan(0);
    for (const weapon of weapons) {
      expect((shadeBlade as { atkBonus: number }).atkBonus).toBeGreaterThan(weapon.atkBonus);
      expect((shadeBlade as { strBonus: number }).strBonus).toBeGreaterThan(weapon.strBonus);
    }
  });

  it("mithril Equipment out-bonuses its steel equivalent", () => {
    const steelChainbody = content.items.find((i) => i.id === "steel-chainbody");
    const mithrilChainbody = content.items.find((i) => i.id === "mithril-chainbody");
    expect((mithrilChainbody as { defBonus: number }).defBonus).toBeGreaterThan(
      (steelChainbody as { defBonus: number }).defBonus,
    );
    const steelKiteshield = content.items.find((i) => i.id === "steel-kiteshield");
    const mithrilKiteshield = content.items.find((i) => i.id === "mithril-kiteshield");
    expect((mithrilKiteshield as { defBonus: number }).defBonus).toBeGreaterThan(
      (steelKiteshield as { defBonus: number }).defBonus,
    );
  });

  it("new items are appended after cooked-pike (append-only: existing entries never reorder)", () => {
    const ids = content.items.map((i) => i.id);
    expect(ids.indexOf("cooked-pike")).toBeLessThan(ids.indexOf("mithril-dagger"));
    expect(ids.indexOf("cooked-pike")).toBeLessThan(ids.indexOf("shade-blade"));
  });
});

/** A saved Snapshot for a player who just graduated Darkroot Forest: cleared Darkroot Hollow
 * (so Old Sewers is unlocked), iron-geared — mirrors old-sewers.test.ts's fixture, used here
 * only to prove Sewer King entry requires nothing more than its host Area (Old Sewers) unlocked. */
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
      completedDungeonIds: ["darkroot-hollow"],
    },
    bank: { items: [{ itemId: "cooked-trout", qty: 30 }] },
  });
}

/** A saved Snapshot for a steel-geared tier-3 (Old Sewers) graduate: cleared Darkroot Hollow (so
 * Old Sewers is unlocked) and steel-geared, but has NOT yet completed Sewer King itself. */
function sewersGraduateSave() {
  return makeSnapshot({
    player: {
      hp: 55,
      maxHp: 55,
      skills: {
        attack: { level: 45, xp: xpForLevel(45) },
        strength: { level: 47, xp: xpForLevel(47) },
        defence: { level: 42, xp: xpForLevel(42) },
        hitpoints: { level: 55, xp: xpForLevel(55) },
      },
      equipment: {
        weapon: "steel-dagger",
        shield: "steel-kiteshield",
        body: "steel-chainbody",
        head: "steel-full-helm",
      },
      autoEatThreshold: 0.5,
      completedDungeonIds: ["darkroot-hollow"],
    },
    bank: { items: [{ itemId: "cooked-pike", qty: 400 }] },
  });
}

/** Same as sewersGraduateSave, but already cleared Sewer King (Bone Crypt unlocked) and stocked
 * with a huge Food supply — used only by the convergence test so it can farm the Crypt Shade for
 * millions of Ticks without a food-driven death skewing the sample. */
function boneCryptFarmerSave() {
  const base = sewersGraduateSave();
  return {
    ...base,
    player: {
      ...base.player,
      completedDungeonIds: ["darkroot-hollow", "sewer-king"],
    },
    bank: { ...base.bank, items: [{ itemId: "cooked-pike", qty: 5_000_000 }] },
  };
}

describe("Bone Crypt tier balance", () => {
  it(
    "a steel-geared tier-3 (Sewers) graduate completes the Sewer King dungeon run, flipping " +
      "Bone Crypt unlocked on dungeon-completed, then farms the Crypt Shade",
    () => {
      const engine = createEngine(content, seededRng(2024), sewersGraduateSave());

      let sewerKingCompleted = false;
      engine.on("dungeon-completed", (e) => {
        if (e.dungeonId === "sewer-king") sewerKingCompleted = true;
      });
      expect(() => engine.enterDungeon("sewer-king")).not.toThrow();

      for (let i = 0; i < 40000 && !sewerKingCompleted; i++) {
        engine.tick();
        const snap = engine.snapshot();
        // Re-enter if a death ejected the run back to idle before it completed.
        if (!sewerKingCompleted && snap.dungeon === null && snap.monster === null) {
          engine.enterDungeon("sewer-king");
        }
      }

      expect(sewerKingCompleted).toBe(true);
      const afterDungeon = engine.snapshot();
      expect(afterDungeon.player.completedDungeonIds).toContain("sewer-king");
      expect(afterDungeon.areas.find((a) => a.id === "bone-crypt")?.unlocked).toBe(true);

      expect(() => engine.selectMonster("crypt-shade")).not.toThrow();
      let kills = 0;
      engine.on("kill", (e) => {
        if (e.monsterId === "crypt-shade") kills++;
      });
      for (let i = 0; i < 40000; i++) engine.tick();

      expect(kills).toBeGreaterThan(10);
    },
  );

  it("a fresh (unequipped, level-1) player cannot even enter Sewer King or select a Crypt Shade", () => {
    expect(() => createEngine(content, seededRng(2024)).enterDungeon("sewer-king")).toThrow(
      /Old Sewers is locked — defeat Darkroot Hollow/,
    );
    expect(() => createEngine(content, seededRng(2024)).selectMonster("crypt-shade")).toThrow(
      /Bone Crypt is locked — defeat Sewer King/,
    );
  });
});

describe("Shade Blade drop-rate convergence", () => {
  it("the ~1/512 rare Shade Blade lands at roughly its declared rate over many seeded Crypt Shade kills", () => {
    const engine = createEngine(content, seededRng(99), boneCryptFarmerSave());
    expect(() => engine.selectMonster("crypt-shade")).not.toThrow();

    const declaredChance = content.monsters
      .find((m) => m.id === "crypt-shade")!
      .dropTable.find((e) => e.itemId === "shade-blade")!.chance;

    let kills = 0;
    let shadeBlades = 0;
    engine.on("kill", (e) => {
      if (e.monsterId === "crypt-shade") kills++;
    });
    engine.on("drop", (e) => {
      if (e.itemId === "shade-blade") shadeBlades++;
    });

    for (let i = 0; i < 3_000_000; i++) engine.tick();

    expect(kills).toBeGreaterThan(5000);
    const expected = kills * declaredChance;
    expect(shadeBlades).toBeGreaterThan(expected * 0.5);
    expect(shadeBlades).toBeLessThan(expected * 1.5);
  }, 15000);
});
