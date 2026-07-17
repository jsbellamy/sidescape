import { describe, expect, it } from "vitest";
import { createEngine } from "../core/engine";
import { makeSnapshot } from "../core/testing/make-snapshot";
import { seededRng } from "../core/rng";
import { resolveContent } from "../core/validate-content";
import { xpForLevel } from "../core/xp";
import { content } from "./index";

const FROSTSPIRE_OPEN_WORLD_MONSTER_IDS = [
  "frost-wolf",
  "ice-wraith",
  "frost-giant",
  "ice-troll",
  "rime-sorcerer",
] as const;
const FROST_WARDEN_WAVES = ["frost-wolf", "ice-wraith", "frost-giant", "frost-warden"];

// #254: Frostspire, the 5th Area, plus its terminal Frost Warden Dungeon — the slice that retires
// #252's adamant/rune interim. Follows the house per-Area pattern (bone-crypt.test.ts,
// darkroot-forest.test.ts): gating chain, drop-table bands, append-only ordering, plus an engine
// convergence run driving an adamant-geared fixture through the Dungeon to chest-opened.
describe("resolveContent(content)", () => {
  it("does not throw with Frostspire, the Frost Warden Dungeon, and their new Monsters added", () => {
    expect(() => resolveContent(content)).not.toThrow();
  });
});

describe("Frostspire content", () => {
  it("appears in the picker, locked until Shade Crypt is completed", () => {
    const fresh = createEngine(content, seededRng(1));
    const areas = fresh.snapshot().areas;
    const frostspire = areas.find((a) => a.id === "frostspire");
    expect(frostspire).toBeDefined();
    expect(frostspire?.name).toBe("Frostspire");
    expect(frostspire?.monsterIds).toEqual([...FROSTSPIRE_OPEN_WORLD_MONSTER_IDS]);
    expect(frostspire?.unlocked).toBe(false);
  });

  it("gates a fresh player out of Frostspire's open-world Monsters", () => {
    for (const monsterId of FROSTSPIRE_OPEN_WORLD_MONSTER_IDS) {
      expect(() => createEngine(content, seededRng(1)).selectMonster(monsterId)).toThrow(
        /Frostspire is locked — defeat Shade Crypt/,
      );
    }
  });

  it("frost-wolf through rime-sorcerer are statted above Crypt Shade (hp 110/atk 60/def 44/maxHit 22)", () => {
    for (const id of FROSTSPIRE_OPEN_WORLD_MONSTER_IDS) {
      const monster = content.monsters.find((m) => m.id === id)!;
      expect(monster, id).toBeDefined();
      expect(monster.hp, `${id} hp`).toBeGreaterThan(110);
      expect(monster.attackLevel, `${id} attackLevel`).toBeGreaterThan(60);
      expect(monster.defenceLevel, `${id} defenceLevel`).toBeGreaterThan(44);
      expect(monster.maxHit, `${id} maxHit`).toBeGreaterThan(22);
    }
  });

  it("Frost Warden is dungeon-only: absent from every Area's monsterIds, and stronger than the open-world five", () => {
    expect(content.areas.some((a) => a.monsterIds.includes("frost-warden"))).toBe(false);
    const warden = content.monsters.find((m) => m.id === "frost-warden")!;
    expect(warden).toBeDefined();
    for (const id of FROSTSPIRE_OPEN_WORLD_MONSTER_IDS) {
      const monster = content.monsters.find((m) => m.id === id)!;
      expect(warden.hp).toBeGreaterThan(monster.hp);
      expect(warden.attackLevel).toBeGreaterThan(monster.attackLevel);
      expect(warden.defenceLevel).toBeGreaterThan(monster.defenceLevel);
      expect(warden.maxHit).toBeGreaterThan(monster.maxHit);
    }
  });

  it("rime-sorcerer carries weakElement fire as an open-world caster, distinct from the Frost Warden boss", () => {
    const sorcerer = content.monsters.find((m) => m.id === "rime-sorcerer")!;
    const warden = content.monsters.find((m) => m.id === "frost-warden")!;
    expect(sorcerer.weakElement).toBe("fire");
    expect(warden.weakElement).toBe("fire");
    expect(content.areas.some((a) => a.monsterIds.includes("rime-sorcerer"))).toBe(true);
    expect(content.areas.some((a) => a.monsterIds.includes("frost-warden"))).toBe(false);
    for (const dungeon of content.dungeons) {
      expect(dungeon.waves, dungeon.id).not.toContain("rime-sorcerer");
    }
  });

  it("only frost-wolf, ice-wraith, frost-giant, and ice-troll lack a weakElement among Frostspire's open-world five", () => {
    for (const id of ["frost-wolf", "ice-wraith", "frost-giant", "ice-troll"] as const) {
      expect(content.monsters.find((m) => m.id === id)?.weakElement, id).toBeUndefined();
    }
    expect(content.monsters.find((m) => m.id === "rime-sorcerer")?.weakElement).toBe("fire");
  });

  it("ice-troll and rime-sorcerer are absent from the Frost Warden Dungeon's waves", () => {
    const dungeon = content.dungeons.find((d) => d.id === "frost-warden")!;
    expect(dungeon.waves).toEqual(FROST_WARDEN_WAVES);
    expect(dungeon.waves).not.toContain("ice-troll");
    expect(dungeon.waves).not.toContain("rime-sorcerer");
  });

  it("frost-wolf through rime-sorcerer each drop adamant Equipment and adamant-bar", () => {
    for (const monsterId of FROSTSPIRE_OPEN_WORLD_MONSTER_IDS) {
      const monster = content.monsters.find((m) => m.id === monsterId)!;
      let adamantEquipmentSeen = false;
      let adamantBarSeen = false;
      for (const entry of monster.dropTable) {
        const item = content.items.find((i) => i.id === entry.itemId);
        expect(item, `${monsterId} drops unknown item ${entry.itemId}`).toBeDefined();
        if (item?.kind === "equipment" && item.id.startsWith("adamant-"))
          adamantEquipmentSeen = true;
        if (entry.itemId === "adamant-bar") adamantBarSeen = true;
      }
      expect(adamantEquipmentSeen, `${monsterId} drops no adamant Equipment`).toBe(true);
      expect(adamantBarSeen, `${monsterId} drops no adamant-bar`).toBe(true);
    }
  });

  it("ice-troll and rime-sorcerer Drop Tables carry guaranteed, common, uncommon, and rare bands", () => {
    for (const monsterId of ["ice-troll", "rime-sorcerer"] as const) {
      const monster = content.monsters.find((m) => m.id === monsterId)!;
      const bands = new Set(monster.dropTable.map((e) => e.band));
      expect(bands.has("guaranteed"), `${monsterId} missing guaranteed`).toBe(true);
      expect(bands.has("common"), `${monsterId} missing common`).toBe(true);
      expect(bands.has("uncommon"), `${monsterId} missing uncommon`).toBe(true);
      expect(bands.has("rare"), `${monsterId} missing rare`).toBe(true);
      for (const entry of monster.dropTable) {
        const item = content.items.find((i) => i.id === entry.itemId);
        expect(item, `${monsterId} drops unknown item ${entry.itemId}`).toBeDefined();
      }
    }
  });

  it.each([
    { monsterId: "ice-troll", goldQty: 210 },
    { monsterId: "rime-sorcerer", goldQty: 220 },
  ] as const)(
    "a seeded kill of $monsterId grants its guaranteed gold Drop",
    ({ monsterId, goldQty }) => {
      const engine = createEngine(content, seededRng(398), adamantGraduateSave());
      expect(() => engine.selectMonster(monsterId)).not.toThrow();

      let kills = 0;
      let guaranteedGold = 0;
      engine.on("kill", (e) => {
        if (e.monsterId === monsterId) kills++;
      });
      engine.on("drop", (e) => {
        if (e.itemId === "gold" && e.qty === goldQty && e.band === "guaranteed") {
          guaranteedGold++;
        }
      });
      for (let i = 0; i < 40_000 && kills === 0; i++) engine.tick();

      expect(kills).toBeGreaterThan(0);
      expect(guaranteedGold).toBeGreaterThan(0);
    },
  );

  it("appends Frostspire after Bone Crypt, its Monsters after Crypt Shade, and Frost Warden after Shade Crypt (append-only ordering)", () => {
    const areaIds = content.areas.map((a) => a.id);
    expect(areaIds.indexOf("bone-crypt")).toBeLessThan(areaIds.indexOf("frostspire"));
    expect(areaIds[areaIds.length - 1]).toBe("frostspire");

    const monsterIds = content.monsters.map((m) => m.id);
    const cryptShadeIdx = monsterIds.indexOf("crypt-shade");
    for (const id of [...FROSTSPIRE_OPEN_WORLD_MONSTER_IDS, "frost-warden"]) {
      expect(monsterIds.indexOf(id)).toBeGreaterThan(cryptShadeIdx);
    }
    expect(monsterIds.indexOf("ice-troll")).toBeLessThan(monsterIds.indexOf("rime-sorcerer"));
    expect(monsterIds.indexOf("rime-sorcerer")).toBeLessThan(monsterIds.indexOf("frost-warden"));

    const dungeonIds = content.dungeons.map((d) => d.id);
    expect(dungeonIds.indexOf("shade-crypt")).toBeLessThan(dungeonIds.indexOf("frost-warden"));
    expect(dungeonIds[dungeonIds.length - 1]).toBe("frost-warden");
  });
});

describe("Frost Warden Dungeon", () => {
  it("is hosted in Frostspire with frost-wolf/ice-wraith/frost-giant waves plus the Frost Warden boss", () => {
    const dungeon = content.dungeons.find((d) => d.id === "frost-warden");
    expect(dungeon).toBeDefined();
    expect(dungeon?.areaId).toBe("frostspire");
    expect(dungeon?.waves).toEqual(FROST_WARDEN_WAVES);
    const boss = content.monsters.find((m) => m.id === "frost-warden");
    expect(boss).toBeDefined();
    expect(boss!.hp).toBeGreaterThan(content.monsters.find((m) => m.id === "frost-giant")!.hp);
  });

  it("its Chest carries rune-bar guaranteed, adamant-full-helm common, rune-dagger uncommon, and rune-kiteshield rare, every entry resolving to a real item", () => {
    const dungeon = content.dungeons.find((d) => d.id === "frost-warden")!;
    const byItem = new Map(dungeon.chest.map((e) => [e.itemId, e]));
    expect(byItem.get("gold")).toMatchObject({ chance: 1, band: "guaranteed" });
    expect(byItem.get("rune-bar")).toMatchObject({ qty: 2, chance: 1, band: "guaranteed" });
    expect(byItem.get("adamant-full-helm")).toMatchObject({
      qty: 1,
      chance: 1 / 2,
      band: "common",
    });
    expect(byItem.get("rune-dagger")).toMatchObject({ qty: 1, chance: 1 / 4, band: "uncommon" });
    expect(byItem.get("rune-kiteshield")).toMatchObject({
      qty: 1,
      chance: 1 / 8,
      band: "rare",
    });
    for (const entry of dungeon.chest) {
      const item = content.items.find((i) => i.id === entry.itemId);
      expect(item, `chest entry ${entry.itemId} not found`).toBeDefined();
    }
  });

  it("entering it requires Frostspire unlocked (a player without Shade Crypt cleared is locked out)", () => {
    expect(() => createEngine(content, seededRng(1)).enterDungeon("frost-warden")).toThrow(
      /Frostspire is locked — defeat Shade Crypt/,
    );
  });

  it("a player who unlocked Frostspire but hasn't cleared Frost Warden can still enter it (Dungeon entry only requires the host Area unlocked)", () => {
    const engine = createEngine(content, seededRng(1), adamantGraduateSave());
    expect(() => engine.enterDungeon("frost-warden")).not.toThrow();
  });

  it("an adamant-geared fixture clears Frost Warden end to end: dungeon-completed then chest-opened with rune-bar in the loot", () => {
    const engine = createEngine(content, seededRng(11), adamantGraduateSave());

    let completedDungeonId: string | null = null;
    let chestItems: { itemId: string; qty: number }[] | null = null;
    engine.on("dungeon-completed", (e) => {
      if (e.dungeonId === "frost-warden") completedDungeonId = e.dungeonId;
    });
    engine.on("chest-opened", (e) => {
      if (e.dungeonId === "frost-warden") chestItems = e.items;
    });

    expect(() => engine.enterDungeon("frost-warden")).not.toThrow();

    for (let i = 0; i < 300000 && completedDungeonId === null; i++) {
      engine.tick();
      const snap = engine.snapshot();
      if (completedDungeonId === null && snap.dungeon === null && snap.monster === null) {
        engine.enterDungeon("frost-warden");
      }
    }

    expect(completedDungeonId).toBe("frost-warden");
    expect(chestItems).not.toBeNull();
    expect(chestItems!.length).toBeGreaterThan(0);
    expect(chestItems!.some((i) => i.itemId === "rune-bar")).toBe(true);
  }, 20000);
});

describe("Gear Tiers 5/6 interim retired (#252 -> #254)", () => {
  it("every adamant and rune item is now reachable — directly from a Monster drop table or Dungeon chest, or by Smithing from an itself-reachable Material (the owner's own 'combination of drop + smithable' rule)", () => {
    const newTierItemIds = content.items
      .filter((i) => i.id.startsWith("adamant-") || i.id.startsWith("rune-"))
      .map((i) => i.id)
      // Ammo (adamant-arrow/rune-arrow) is vendor-sold by design (#252), not drop/chest-gated —
      // out of scope for this reachability check, which is about the Equipment/Bar ladder gate.
      .filter((id) => !id.endsWith("-arrow"));
    expect(newTierItemIds.length).toBeGreaterThanOrEqual(18);

    // Base reachability: directly dropped by some Monster or contained in some Dungeon Chest.
    const reachable = new Set<string>();
    for (const monster of content.monsters) {
      for (const entry of monster.dropTable) reachable.add(entry.itemId);
    }
    for (const dungeon of content.dungeons) {
      for (const entry of dungeon.chest) reachable.add(entry.itemId);
    }

    // Close over Smithing: a Recipe's output is also reachable once every one of its inputs is
    // (fixed-point — one pass suffices here since every Recipe input is itself a directly-dropped
    // Bar, but looping keeps this correct if that ever changes).
    let changed = true;
    while (changed) {
      changed = false;
      for (const recipe of content.recipes) {
        if (reachable.has(recipe.outputItemId)) continue;
        if (recipe.inputs.every((input) => reachable.has(input.itemId))) {
          reachable.add(recipe.outputItemId);
          changed = true;
        }
      }
    }

    const unreachable = newTierItemIds.filter((id) => !reachable.has(id));
    expect(unreachable, unreachable.join(", ")).toEqual([]);
  });

  it("rune-shortbow and rune-staff specifically are drop/chest reachable, not Smithing-reachable (their weapon families have no Recipe at any tier)", () => {
    for (const id of ["rune-shortbow", "rune-staff"]) {
      expect(
        content.recipes.some((r) => r.outputItemId === id),
        id,
      ).toBe(false);
      const inChest = content.dungeons.some((d) => d.chest.some((e) => e.itemId === id));
      const inDropTable = content.monsters.some((m) => m.dropTable.some((e) => e.itemId === id));
      expect(inChest || inDropTable, `${id} has no direct source`).toBe(true);
    }
  });
});

/** A saved Snapshot for an adamant-geared Frostspire graduate: cleared Shade Crypt (so Frostspire
 * is unlocked) and adamant-geared — mirrors bone-crypt.test.ts's mithrilGraduateSave shape one
 * tier up, used to drive a full Frost Warden Dungeon clear without dying mid-run. */
function adamantGraduateSave() {
  return makeSnapshot({
    player: {
      hp: 85,
      maxHp: 85,
      skills: {
        attack: { level: 70, xp: xpForLevel(70) },
        strength: { level: 72, xp: xpForLevel(72) },
        defence: { level: 64, xp: xpForLevel(64) },
        hitpoints: { level: 85, xp: xpForLevel(85) },
      },
      equipment: {
        weapon: "adamant-dagger",
        shield: "adamant-kiteshield",
        body: "adamant-chainbody",
        head: "adamant-full-helm",
      },
      autoEatThreshold: 0.5,
      completedDungeonIds: ["darkroot-hollow", "sewer-king", "shade-crypt"],
      foodSlots: [{ itemId: "cooked-pike", qty: 6000 }, null, null],
    },
  });
}
