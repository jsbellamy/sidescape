import { describe, expect, it } from "vitest";
import { createEngine } from "../core/engine";
import { makeSnapshot } from "../core/testing/make-snapshot";
import { seededRng } from "../core/rng";
import { resolveContent } from "../core/validate-content";
import { xpForLevel } from "../core/xp";
import { content } from "./index";

const SEWER_KING_WAVES = ["giant-rat", "zombie", "skeleton", "sewer-king"];

// #253: the new shade-crypt Dungeon plus crypt-ghoul/bone-knight must be well-formed Content —
// every id cross-reference (waves, chest, dropTable, monsterIds) resolves.
describe("resolveContent(content)", () => {
  it("does not throw with the Shade Crypt Dungeon and its new Monsters added", () => {
    expect(() => resolveContent(content)).not.toThrow();
  });
});

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
    expect(boneCrypt?.monsterIds).toEqual([
      "crypt-ghoul",
      "bone-knight",
      "bone-archer",
      "tomb-wight",
    ]);
    expect(boneCrypt?.unlocked).toBe(false);
  });

  it("gates a fresh player out of Bone Crypt's open-world Monsters", () => {
    for (const monsterId of ["crypt-ghoul", "bone-knight", "bone-archer", "tomb-wight"]) {
      expect(() => createEngine(content, seededRng(1)).selectMonster(monsterId)).toThrow(
        /Bone Crypt is locked — defeat Sewer King/,
      );
    }
  });

  it("open-world Bone Crypt Monsters cover melee, ranged, and magic attack styles", () => {
    const openWorldIds = content.areas.find((a) => a.id === "bone-crypt")!.monsterIds;
    const attackTypes = new Set(
      openWorldIds.map((id) => content.monsters.find((m) => m.id === id)!.attackType),
    );
    expect(attackTypes.has("stab") || attackTypes.has("slash") || attackTypes.has("crush")).toBe(
      true,
    );
    expect(attackTypes.has("ranged")).toBe(true);
    expect(attackTypes.has("magic")).toBe(true);
  });

  it("no open-world Bone Crypt Monster drops any raw fish", () => {
    const rawFishIds = ["raw-pike", "raw-trout", "raw-cave-eel", "raw-icefin"];
    const openWorldIds = content.areas.find((a) => a.id === "bone-crypt")!.monsterIds;
    for (const monsterId of openWorldIds) {
      const monster = content.monsters.find((m) => m.id === monsterId)!;
      for (const entry of monster.dropTable) {
        expect(
          rawFishIds,
          `${monsterId} must not drop raw fish (found ${entry.itemId})`,
        ).not.toContain(entry.itemId);
      }
    }
  });

  it("bone-archer and tomb-wight are open-world only: absent from every Dungeon's waves", () => {
    for (const dungeon of content.dungeons) {
      expect(dungeon.waves).not.toContain("bone-archer");
      expect(dungeon.waves).not.toContain("tomb-wight");
    }
  });

  it("bone-archer and tomb-wight Drop Tables carry guaranteed/common/uncommon bands (and rare for ruby)", () => {
    for (const monsterId of ["bone-archer", "tomb-wight"]) {
      const monster = content.monsters.find((m) => m.id === monsterId)!;
      const bands = new Set(monster.dropTable.map((e) => e.band));
      expect(bands.has("guaranteed"), `${monsterId} missing guaranteed`).toBe(true);
      expect(bands.has("common"), `${monsterId} missing common`).toBe(true);
      expect(bands.has("uncommon"), `${monsterId} missing uncommon`).toBe(true);
      for (const entry of monster.dropTable) {
        const item = content.items.find((i) => i.id === entry.itemId);
        expect(item, `${monsterId} drops unknown item ${entry.itemId}`).toBeDefined();
      }
    }
    const tombWight = content.monsters.find((m) => m.id === "tomb-wight")!;
    expect(tombWight.dropTable.some((e) => e.itemId === "ruby" && e.band === "rare")).toBe(true);
  });

  it("Crypt Ghoul and Bone Knight both drop mithril Equipment and mithril-bar", () => {
    for (const monsterId of ["crypt-ghoul", "bone-knight"]) {
      const monster = content.monsters.find((m) => m.id === monsterId)!;
      expect(monster, monsterId).toBeDefined();
      let mithrilEquipmentSeen = false;
      let mithrilBarSeen = false;
      for (const entry of monster.dropTable) {
        const item = content.items.find((i) => i.id === entry.itemId);
        expect(item, `${monsterId} drops unknown item ${entry.itemId}`).toBeDefined();
        if (item?.kind === "equipment" && item.id.startsWith("mithril-"))
          mithrilEquipmentSeen = true;
        if (entry.itemId === "mithril-bar") mithrilBarSeen = true;
      }
      expect(mithrilEquipmentSeen, `${monsterId} drops no mithril Equipment`).toBe(true);
      expect(mithrilBarSeen, `${monsterId} drops no mithril-bar`).toBe(true);
    }
  });

  // #253: Crypt Shade is promoted to the shade-crypt Dungeon's boss — dungeon-only, exactly like
  // goblin-chief/hollow-warden/sewer-king, so it no longer lives in any Area's monsterIds.
  it("Crypt Shade is dungeon-only: absent from every Area's monsterIds", () => {
    expect(content.areas.some((a) => a.monsterIds.includes("crypt-shade"))).toBe(false);
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

  it("shade-blade still carries strBonus 34 and no rangedStr or magicDamage (#361, #362)", () => {
    const shadeBlade = content.items.find((i) => i.id === "shade-blade");
    expect(shadeBlade).toMatchObject({ strBonus: 34 });
    expect(shadeBlade?.kind === "equipment" && shadeBlade.rangedStr).toBeUndefined();
    expect(shadeBlade?.kind === "equipment" && shadeBlade.magicDamage).toBeUndefined();
  });

  it("shade-blade carries levelReq: { attack: 40 }, matching rune tier (#363)", () => {
    const shadeBlade = content.items.find((i) => i.id === "shade-blade");
    expect(shadeBlade).toMatchObject({ levelReq: { attack: 40 } });
  });

  it("the Shade Blade out-bonuses every mithril weapon and every earlier weapon in the game", () => {
    const shadeBlade = content.items.find((i) => i.id === "shade-blade");
    const mithrilDagger = content.items.find((i) => i.id === "mithril-dagger");
    expect(shadeBlade?.kind).toBe("equipment");
    expect(mithrilDagger?.kind).toBe("equipment");
    // #252: adamant/rune are a LATER era, not "earlier weapons" — excluded from this scope. The
    // ladder's own step steepens specifically so rune-sword still sits under shade-blade (see
    // tier-ladder.test.ts), but rune-shortbow is a documented, accepted exception (issue's own
    // "Rune shortbow at 41/35 does edge past it numerically; that is accepted"), asserted below.
    const weapons = content.items.filter(
      (i) =>
        i.kind === "equipment" &&
        i.slot === "weapon" &&
        i.id !== "shade-blade" &&
        !i.id.startsWith("adamant-") &&
        !i.id.startsWith("rune-") &&
        i.attackType !== "ranged" &&
        i.attackType !== "magic",
    ) as { atkBonus: number; strBonus: number }[];
    expect(weapons.length).toBeGreaterThan(0);
    for (const weapon of weapons) {
      expect((shadeBlade as { atkBonus: number }).atkBonus).toBeGreaterThan(weapon.atkBonus);
      expect((shadeBlade as { strBonus: number }).strBonus).toBeGreaterThan(weapon.strBonus);
    }
  });

  // #252: the tier-5/6 (adamant/rune) equipment this slice adds vs. shade-blade — rune-sword is
  // the load-bearing case (asserted here AND in tier-ladder.test.ts, since it's why the step
  // steepens); rune-shortbow is the one documented, owner-accepted exception.
  it("rune-sword stays under shade-blade; rune-shortbow is the one documented exception that exceeds it", () => {
    const shadeBlade = content.items.find((i) => i.id === "shade-blade") as {
      atkBonus: number;
      strBonus: number;
    };
    const runeSword = content.items.find((i) => i.id === "rune-sword") as {
      atkBonus: number;
      strBonus: number;
    };
    const runeShortbow = content.items.find((i) => i.id === "rune-shortbow") as {
      atkBonus: number;
      rangedStr: number;
    };
    expect(runeSword.atkBonus).toBeLessThan(shadeBlade.atkBonus);
    expect(runeSword.strBonus).toBeLessThan(shadeBlade.strBonus);
    expect(runeShortbow.atkBonus).toBeGreaterThan(shadeBlade.atkBonus);
    expect(runeShortbow.rangedStr).toBeGreaterThan(shadeBlade.strBonus);
  });

  it("mithril Equipment out-bonuses its steel equivalent", () => {
    const steelChainbody = content.items.find((i) => i.id === "steel-chainbody");
    const mithrilChainbody = content.items.find((i) => i.id === "mithril-chainbody");
    expect((mithrilChainbody as { def: { stab: number } }).def.stab).toBeGreaterThan(
      (steelChainbody as { def: { stab: number } }).def.stab,
    );
    const steelKiteshield = content.items.find((i) => i.id === "steel-kiteshield");
    const mithrilKiteshield = content.items.find((i) => i.id === "mithril-kiteshield");
    expect((mithrilKiteshield as { def: { stab: number } }).def.stab).toBeGreaterThan(
      (steelKiteshield as { def: { stab: number } }).def.stab,
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
      // Assigned to Food Slot 0 (#61) — autoEat only ever drains Food Slots now, never the Bank
      // directly. 4,000 (not boneCryptFarmerSave's deliberate "millions") — enough that the one
      // test using this save directly (the Crypt Shade farming smoke test below) isn't food-
      // exhaustion-limited: a fixed pike stash makes that test's ">10 kills" bound sensitive to
      // exactly where Content's Rng-draw sequence lands (every dropTable entry anywhere upstream
      // consumes one Rng draw per kill, so adding one — #117's gem drops — shifts the whole
      // sequence), which isn't the balance property this test is meant to check.
      foodSlots: [{ itemId: "cooked-pike", qty: 4000 }, null, null],
    },
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
      foodSlots: [{ itemId: "cooked-pike", qty: 5_000_000 }, null, null],
    },
  };
}

describe("Bone Crypt tier balance", () => {
  it(
    "a steel-geared tier-3 (Sewers) graduate completes the Sewer King dungeon run, flipping " +
      "Bone Crypt unlocked on dungeon-completed, then farms the Crypt Ghoul",
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

      expect(() => engine.selectMonster("crypt-ghoul")).not.toThrow();
      let kills = 0;
      engine.on("kill", (e) => {
        if (e.monsterId === "crypt-ghoul") kills++;
      });
      for (let i = 0; i < 40000; i++) engine.tick();

      expect(kills).toBeGreaterThan(10);
    },
  );

  it("a fresh (unequipped, level-1) player cannot even enter Sewer King or select a Crypt Ghoul", () => {
    expect(() => createEngine(content, seededRng(2024)).enterDungeon("sewer-king")).toThrow(
      /Old Sewers is locked — defeat Darkroot Hollow/,
    );
    expect(() => createEngine(content, seededRng(2024)).selectMonster("crypt-ghoul")).toThrow(
      /Bone Crypt is locked — defeat Sewer King/,
    );
  });
});

/** A saved Snapshot for a mithril-geared Bone Crypt graduate: cleared Sewer King (so Bone Crypt is
 * unlocked) and mithril-geared — used to drive a full Shade Crypt Dungeon clear (skeleton ->
 * crypt-ghoul -> bone-knight -> crypt-shade) without dying mid-run. */
function mithrilGraduateSave() {
  return makeSnapshot({
    player: {
      hp: 70,
      maxHp: 70,
      skills: {
        attack: { level: 58, xp: xpForLevel(58) },
        strength: { level: 60, xp: xpForLevel(60) },
        defence: { level: 52, xp: xpForLevel(52) },
        hitpoints: { level: 70, xp: xpForLevel(70) },
      },
      equipment: {
        weapon: "mithril-dagger",
        shield: "mithril-kiteshield",
        body: "mithril-chainbody",
        head: "mithril-full-helm",
      },
      autoEatThreshold: 0.5,
      completedDungeonIds: ["darkroot-hollow", "sewer-king"],
      foodSlots: [{ itemId: "cooked-pike", qty: 5000 }, null, null],
    },
  });
}

// #397: Bone Archer's first ranged attacker and Tomb Wight's first caster — Engine-seam kill smoke.
describe("Bone Archer and Tomb Wight (#397)", () => {
  it.each([
    { monsterId: "bone-archer", goldQty: 100, rngSeed: 3971 },
    { monsterId: "tomb-wight", goldQty: 110, rngSeed: 3972 },
  ] as const)(
    "a $monsterId kill lands its guaranteed gold Drop (seeded Rng, real Content)",
    ({ monsterId, goldQty, rngSeed }) => {
      const engine = createEngine(content, seededRng(rngSeed), mithrilGraduateSave());
      engine.setAutoSellDuplicates(false);
      expect(() => engine.selectMonster(monsterId)).not.toThrow();

      let kills = 0;
      const goldDrops: number[] = [];
      engine.on("kill", (e) => {
        if (e.monsterId === monsterId) kills++;
      });
      engine.on("drop", (e) => {
        if (e.itemId === "gold") {
          goldDrops.push(e.qty);
          expect(e.band).toBe("guaranteed");
        }
      });

      for (let i = 0; i < 50000 && kills === 0; i++) engine.tick();

      expect(kills).toBeGreaterThan(0);
      expect(goldDrops).toContain(goldQty);
      expect(engine.snapshot().player.gold).toBeGreaterThanOrEqual(goldQty);
    },
  );

  it("a player without Sewer King cleared cannot select bone-archer or tomb-wight", () => {
    const engine = createEngine(content, seededRng(1), sewersGraduateSave());
    expect(() => engine.selectMonster("bone-archer")).toThrow(
      /Bone Crypt is locked — defeat Sewer King/,
    );
    expect(() => engine.selectMonster("tomb-wight")).toThrow(
      /Bone Crypt is locked — defeat Sewer King/,
    );
  });
});

// Shade Crypt (#253): Bone Crypt's own Dungeon. skeleton/crypt-ghoul/bone-knight waves plus the
// dungeon-only Crypt Shade boss, mirroring Sewer King's structure exactly.
describe("Shade Crypt Dungeon", () => {
  it("is hosted in Bone Crypt with skeleton/crypt-ghoul/bone-knight waves plus the Crypt Shade boss", () => {
    const dungeon = content.dungeons.find((d) => d.id === "shade-crypt");
    expect(dungeon).toBeDefined();
    expect(dungeon?.areaId).toBe("bone-crypt");
    expect(dungeon?.waves).toEqual(["skeleton", "crypt-ghoul", "bone-knight", "crypt-shade"]);
    const boss = content.monsters.find((m) => m.id === "crypt-shade");
    expect(boss).toBeDefined();
    expect(boss!.hp).toBeGreaterThan(content.monsters.find((m) => m.id === "bone-knight")!.hp);
  });

  it("its Chest bridges the mithril -> adamant transition, and every entry resolves to a real item", () => {
    const dungeon = content.dungeons.find((d) => d.id === "shade-crypt")!;
    const chestItemIds = dungeon.chest.map((e) => e.itemId);
    const mithrilItems = chestItemIds.filter((id) => id.startsWith("mithril-"));
    const adamantItems = chestItemIds.filter((id) => id.startsWith("adamant-"));
    expect(mithrilItems.length).toBeGreaterThan(0);
    expect(adamantItems.length).toBeGreaterThan(0);
    for (const entry of dungeon.chest) {
      const item = content.items.find((i) => i.id === entry.itemId);
      expect(item, `chest entry ${entry.itemId} not found`).toBeDefined();
    }
  });

  it("was the only adamant source before #254; Frostspire's own open-world Monsters are now a second one, but both still require clearing this Dungeon first", () => {
    // #254 retires the "shade-crypt is the ONLY adamant source in all of Content" invariant this
    // test used to assert (Frostspire's frost-wolf/ice-wraith/frost-giant drop adamant gear too —
    // see src/data/adamant-rune-reachability.test.ts, narrowed there for that slice's own scope).
    // What survives is the GATING chain: every adamant source anywhere in Content sits behind
    // this Dungeon — shade-crypt's own Chest directly, and Frostspire's Monsters transitively,
    // since Frostspire itself is unlockedByDungeonId "shade-crypt". A fresh player reaches none
    // of them.
    const fresh = createEngine(content, seededRng(1));
    for (const monsterId of ["frost-wolf", "ice-wraith", "frost-giant"]) {
      expect(() => fresh.selectMonster(monsterId)).toThrow(
        /Frostspire is locked — defeat Shade Crypt/,
      );
    }
    expect(() => createEngine(content, seededRng(1)).enterDungeon("frost-warden")).toThrow(
      /Frostspire is locked — defeat Shade Crypt/,
    );
    expect(() => createEngine(content, seededRng(1)).enterDungeon("shade-crypt")).toThrow(
      /Bone Crypt is locked — defeat Sewer King/,
    );

    // Every OTHER Dungeon's Chest (i.e. every one gated at or before Shade Crypt) still yields no
    // adamant at all — the narrower invariant that does survive #254 unchanged.
    for (const dungeon of content.dungeons) {
      if (dungeon.id === "shade-crypt" || dungeon.id === "frost-warden") continue;
      for (const entry of dungeon.chest) {
        expect(
          entry.itemId.startsWith("adamant-"),
          `${dungeon.id}'s chest yields ${entry.itemId}`,
        ).toBe(false);
      }
    }
  });

  it("entering it requires Bone Crypt unlocked (a player without Sewer King cleared is locked out)", () => {
    expect(() => createEngine(content, seededRng(1)).enterDungeon("shade-crypt")).toThrow(
      /Bone Crypt is locked — defeat Sewer King/,
    );
  });

  it("a player who unlocked Bone Crypt but hasn't cleared Shade Crypt can still enter it (Dungeon entry only requires the host Area unlocked)", () => {
    const engine = createEngine(content, seededRng(1), mithrilGraduateSave());
    expect(() => engine.enterDungeon("shade-crypt")).not.toThrow();
  });

  it('a save with state.monster.id === "crypt-shade" (a player mid-fight from before this slice) loads without throwing', () => {
    // A genuine captured Snapshot, not hand-rolled: crypt-shade is dungeon-only now (absent from
    // every Area's monsterIds, like every other dungeon boss), but direct selectMonster by id is
    // still legal at the Engine layer — exactly how goblin-chief/hollow-warden/sewer-king already
    // behave — so this reproduces a real pre-#253 open-world Crypt Shade fight.
    const fighting = createEngine(content, seededRng(1));
    fighting.selectMonster("crypt-shade");
    fighting.tick();
    const saved = fighting.snapshot();
    expect(saved.monster?.id).toBe("crypt-shade");

    let restored: ReturnType<typeof createEngine> | undefined;
    expect(() => {
      restored = createEngine(content, seededRng(1), saved);
    }).not.toThrow();
    // loadState resolves the monster by id from content.monsters, which still contains it (id and
    // stats unchanged) — the fight resumes rather than falling back idle.
    expect(restored!.snapshot().monster?.id).toBe("crypt-shade");
  });

  it("a mithril-geared fixture clears Shade Crypt end to end: dungeon-completed then chest-opened", () => {
    const engine = createEngine(content, seededRng(7), mithrilGraduateSave());

    let completedDungeonId: string | null = null;
    let chestItems: { itemId: string; qty: number }[] | null = null;
    engine.on("dungeon-completed", (e) => {
      if (e.dungeonId === "shade-crypt") completedDungeonId = e.dungeonId;
    });
    engine.on("chest-opened", (e) => {
      if (e.dungeonId === "shade-crypt") chestItems = e.items;
    });

    expect(() => engine.enterDungeon("shade-crypt")).not.toThrow();

    for (let i = 0; i < 200000 && completedDungeonId === null; i++) {
      engine.tick();
      const snap = engine.snapshot();
      // Re-enter if a death (or a fully-drained food stash) ejected the run back to idle before
      // it completed — Dungeon runs are all-or-nothing, so a failed attempt just retries.
      if (completedDungeonId === null && snap.dungeon === null && snap.monster === null) {
        engine.enterDungeon("shade-crypt");
      }
    }

    expect(completedDungeonId).toBe("shade-crypt");
    expect(chestItems).not.toBeNull();
    expect(chestItems!.length).toBeGreaterThan(0);
  }, 15000);
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
