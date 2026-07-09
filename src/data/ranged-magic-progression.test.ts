import { describe, expect, it } from "vitest";
import { createEngine } from "../core/engine";
import { makeSnapshot } from "../core/make-snapshot";
import { seededRng } from "../core/rng";
import { xpForLevel } from "../core/xp";
import { content } from "./index";

/** Issue #13: iron/steel/mithril bows and staves enter the Darkroot Forest, Old Sewers, and Bone
 * Crypt Drop Tables, giving Ranged and Magic (added in #7) a full progression path alongside
 * melee. Per the clarifying comment on #13, "progress through the tiers" means completing each
 * tier's gating Dungeon (Darkroot Hollow, Sewer King) to unlock the next Area — the same
 * Dungeon-boss gating #24 already established for the melee balance tests in #10/#11 — not
 * leveling past a combat-level threshold. */

describe("Ranged/Magic tier weapons in Drop Tables (#13)", () => {
  it("Darkroot Forest's Drop Tables include the iron-tier bow and staff", () => {
    const wolf = content.monsters.find((m) => m.id === "wolf")!;
    const goblinWarrior = content.monsters.find((m) => m.id === "goblin-warrior")!;
    expect(wolf.dropTable.some((e) => e.itemId === "iron-shortbow")).toBe(true);
    expect(goblinWarrior.dropTable.some((e) => e.itemId === "iron-staff")).toBe(true);

    const bow = content.items.find((i) => i.id === "iron-shortbow");
    const staff = content.items.find((i) => i.id === "iron-staff");
    expect(bow?.kind === "equipment" && bow.attackType).toBe("ranged");
    expect(staff?.kind === "equipment" && staff.attackType).toBe("magic");
  });

  it("Old Sewers' Drop Tables include the steel-tier bow and staff", () => {
    const giantRat = content.monsters.find((m) => m.id === "giant-rat")!;
    const zombie = content.monsters.find((m) => m.id === "zombie")!;
    expect(giantRat.dropTable.some((e) => e.itemId === "steel-shortbow")).toBe(true);
    expect(zombie.dropTable.some((e) => e.itemId === "steel-staff")).toBe(true);

    const bow = content.items.find((i) => i.id === "steel-shortbow");
    const staff = content.items.find((i) => i.id === "steel-staff");
    expect(bow?.kind === "equipment" && bow.attackType).toBe("ranged");
    expect(staff?.kind === "equipment" && staff.attackType).toBe("magic");
  });

  it("Bone Crypt's Drop Tables include the mithril-tier bow and staff", () => {
    const cryptShade = content.monsters.find((m) => m.id === "crypt-shade")!;
    expect(cryptShade.dropTable.some((e) => e.itemId === "mithril-shortbow")).toBe(true);
    expect(cryptShade.dropTable.some((e) => e.itemId === "mithril-staff")).toBe(true);

    const bow = content.items.find((i) => i.id === "mithril-shortbow");
    const staff = content.items.find((i) => i.id === "mithril-staff");
    expect(bow?.kind === "equipment" && bow.attackType).toBe("ranged");
    expect(staff?.kind === "equipment" && staff.attackType).toBe("magic");
  });

  it("every new tier weapon out-bonuses its predecessor tier (iron < steel < mithril, bow and staff alike)", () => {
    const ironBow = content.items.find((i) => i.id === "iron-shortbow") as {
      atkBonus: number;
      strBonus: number;
    };
    const steelBow = content.items.find((i) => i.id === "steel-shortbow") as {
      atkBonus: number;
      strBonus: number;
    };
    const mithrilBow = content.items.find((i) => i.id === "mithril-shortbow") as {
      atkBonus: number;
      strBonus: number;
    };
    expect(steelBow.atkBonus).toBeGreaterThan(ironBow.atkBonus);
    expect(mithrilBow.atkBonus).toBeGreaterThan(steelBow.atkBonus);

    const ironStaff = content.items.find((i) => i.id === "iron-staff") as { strBonus: number };
    const steelStaff = content.items.find((i) => i.id === "steel-staff") as { strBonus: number };
    const mithrilStaff = content.items.find((i) => i.id === "mithril-staff") as {
      strBonus: number;
    };
    expect(steelStaff.strBonus).toBeGreaterThan(ironStaff.strBonus);
    expect(mithrilStaff.strBonus).toBeGreaterThan(steelStaff.strBonus);
  });

  it("new items are appended after apprentice-staff (append-only: existing entries never reorder)", () => {
    const ids = content.items.map((i) => i.id);
    for (const id of [
      "iron-shortbow",
      "iron-staff",
      "steel-shortbow",
      "steel-staff",
      "mithril-shortbow",
      "mithril-staff",
    ]) {
      expect(ids.indexOf("apprentice-staff")).toBeLessThan(ids.indexOf(id));
    }
  });
});

/** A saved Snapshot for a ranged-trained player who just graduated Darkroot Forest: cleared
 * Meadow Depths (unlocking Darkroot Forest) and iron-geared with the iron-tier bow instead of a
 * melee weapon — mirrors old-sewers.test.ts's darkrootGraduateSave fixture exactly, but for
 * Ranged. Since #99, Ranged combat is mechanically real (accuracy + max hit derive from the
 * Ranged Skill, not Attack/Strength), so `ranged`/`magic` are trained to the same level as
 * attack/strength here — both set (rather than just the one the weapon needs) so this one fixture
 * serves both the Ranged and Magic variant below. */
function darkrootGraduateSaveRanged() {
  return makeSnapshot({
    player: {
      hp: 30,
      maxHp: 30,
      skills: {
        attack: { level: 26, xp: xpForLevel(26) },
        strength: { level: 28, xp: xpForLevel(28) },
        defence: { level: 22, xp: xpForLevel(22) },
        hitpoints: { level: 30, xp: xpForLevel(30) },
        ranged: { level: 28, xp: xpForLevel(28) },
        magic: { level: 28, xp: xpForLevel(28) },
      },
      equipment: {
        weapon: "iron-shortbow",
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

/** Magic counterpart of darkrootGraduateSaveRanged: same stats, iron-staff equipped instead. */
function darkrootGraduateSaveMagic() {
  const base = darkrootGraduateSaveRanged();
  return {
    ...base,
    player: {
      ...base.player,
      equipment: { ...base.player.equipment, weapon: "iron-staff" },
    },
  };
}

/** A saved Snapshot for a ranged-trained, steel-geared tier-3 (Old Sewers) graduate: cleared
 * Darkroot Hollow (so Old Sewers is unlocked) but has NOT yet completed Sewer King itself —
 * mirrors bone-crypt.test.ts's sewersGraduateSave fixture, but for Ranged. */
function sewersGraduateSaveRanged() {
  return makeSnapshot({
    player: {
      hp: 55,
      maxHp: 55,
      skills: {
        attack: { level: 45, xp: xpForLevel(45) },
        strength: { level: 47, xp: xpForLevel(47) },
        defence: { level: 42, xp: xpForLevel(42) },
        hitpoints: { level: 55, xp: xpForLevel(55) },
        // Since #99, Ranged/Magic combat draws on their own Skill (see darkrootGraduateSaveRanged
        // above); both set so this one fixture serves the Ranged and Magic variants alike.
        ranged: { level: 47, xp: xpForLevel(47) },
        magic: { level: 47, xp: xpForLevel(47) },
      },
      equipment: {
        weapon: "steel-shortbow",
        shield: "steel-kiteshield",
        body: "steel-chainbody",
        head: "steel-full-helm",
      },
      autoEatThreshold: 0.5,
      completedDungeonIds: ["darkroot-hollow"],
      // Assigned to Food Slot 0 (#61) — autoEat only ever drains Food Slots now, never the Bank
      // directly.
      foodSlots: [{ itemId: "cooked-pike", qty: 400 }, null, null],
    },
  });
}

/** Magic counterpart of sewersGraduateSaveRanged: same stats, steel-staff equipped instead. */
function sewersGraduateSaveMagic() {
  const base = sewersGraduateSaveRanged();
  return {
    ...base,
    player: {
      ...base.player,
      equipment: { ...base.player.equipment, weapon: "steel-staff" },
    },
  };
}

describe("Ranged tier progression (#13)", () => {
  it("an iron-geared (Shortbow) tier-2 graduate completes Darkroot Hollow, flipping Old Sewers unlocked, then progresses against the Giant Rat — training Ranged, not Attack/Strength", () => {
    const engine = createEngine(content, seededRng(2024), darkrootGraduateSaveRanged());
    expect(engine.snapshot().player.equipment.weapon).toBe("iron-shortbow");

    let hollowCompleted = false;
    engine.on("dungeon-completed", (e) => {
      if (e.dungeonId === "darkroot-hollow") hollowCompleted = true;
    });
    expect(() => engine.enterDungeon("darkroot-hollow")).not.toThrow();

    for (let i = 0; i < 20000 && !hollowCompleted; i++) {
      engine.tick();
      const snap = engine.snapshot();
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

    const { skills } = engine.snapshot().player;
    expect(skills.ranged.xp).toBeGreaterThan(0);
    expect(skills.attack.xp).toBe(xpForLevel(26));
    expect(skills.strength.xp).toBe(xpForLevel(28));
  });

  it("a steel-geared (Shortbow) tier-3 graduate completes Sewer King, flipping Bone Crypt unlocked, then farms the Crypt Shade", () => {
    const engine = createEngine(content, seededRng(2024), sewersGraduateSaveRanged());

    let sewerKingCompleted = false;
    engine.on("dungeon-completed", (e) => {
      if (e.dungeonId === "sewer-king") sewerKingCompleted = true;
    });
    expect(() => engine.enterDungeon("sewer-king")).not.toThrow();

    for (let i = 0; i < 40000 && !sewerKingCompleted; i++) {
      engine.tick();
      const snap = engine.snapshot();
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
    expect(engine.snapshot().player.skills.ranged.xp).toBeGreaterThan(0);
  });
});

describe("Magic tier progression (#13)", () => {
  it("an iron-geared (Staff) tier-2 graduate completes Darkroot Hollow, flipping Old Sewers unlocked, then progresses against the Giant Rat — training Magic, not Attack/Strength", () => {
    const engine = createEngine(content, seededRng(2024), darkrootGraduateSaveMagic());
    expect(engine.snapshot().player.equipment.weapon).toBe("iron-staff");

    let hollowCompleted = false;
    engine.on("dungeon-completed", (e) => {
      if (e.dungeonId === "darkroot-hollow") hollowCompleted = true;
    });
    expect(() => engine.enterDungeon("darkroot-hollow")).not.toThrow();

    for (let i = 0; i < 20000 && !hollowCompleted; i++) {
      engine.tick();
      const snap = engine.snapshot();
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

    const { skills } = engine.snapshot().player;
    expect(skills.magic.xp).toBeGreaterThan(0);
    expect(skills.attack.xp).toBe(xpForLevel(26));
    expect(skills.strength.xp).toBe(xpForLevel(28));
  });

  it("a steel-geared (Staff) tier-3 graduate completes Sewer King, flipping Bone Crypt unlocked, then farms the Crypt Shade", () => {
    const engine = createEngine(content, seededRng(2024), sewersGraduateSaveMagic());

    let sewerKingCompleted = false;
    engine.on("dungeon-completed", (e) => {
      if (e.dungeonId === "sewer-king") sewerKingCompleted = true;
    });
    expect(() => engine.enterDungeon("sewer-king")).not.toThrow();

    for (let i = 0; i < 40000 && !sewerKingCompleted; i++) {
      engine.tick();
      const snap = engine.snapshot();
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
    expect(engine.snapshot().player.skills.magic.xp).toBeGreaterThan(0);
  });
});
