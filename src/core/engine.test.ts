import { describe, expect, it } from "vitest";
import { createEngine } from "./engine";
import { fixtureContent } from "./fixture-content";
import { makeSnapshot } from "./make-snapshot";
import { seededRng } from "./rng";
import { xpForLevel } from "./xp";
import { AUTO_EAT_THRESHOLDS } from "./types";
import type { AutoEatThreshold, CombatStyle } from "./types";

function freshEngine(seed = 42) {
  return createEngine(fixtureContent, seededRng(seed));
}

/**
 * The Training Dummy barely fights back by design (see other describe blocks),
 * which is the point — but it makes death-by-attrition implausibly slow now that
 * passive regen (1 HP/10 Ticks) outpaces its average damage. For tests that need
 * the player to actually die against a weak early Monster, hit harder locally
 * instead of reworking the shared fixture every other test relies on.
 */
function fiercerDummyContent() {
  return {
    ...fixtureContent,
    monsters: fixtureContent.monsters.map((m) =>
      m.id === "dummy" ? { ...m, attackLevel: 5, maxHit: 2, attackSpeed: 3 } : m,
    ),
  };
}

/** Pump Ticks until `itemId` shows up in either the Bank or the Loot Zone (or fail the test), then
 * loot it all into the Bank — combat Drops land in the Loot Zone first, not the Bank directly
 * (#60), and most callers just want the item banked so they can equip/sell/eat it. */
function grindFor(engine: ReturnType<typeof freshEngine>, itemId: string, maxTicks = 20_000) {
  for (let i = 0; i < maxTicks; i++) {
    engine.tick();
    const snap = engine.snapshot();
    if (
      snap.bank.items.some((s) => s.itemId === itemId) ||
      snap.lootZone.some((s) => s.itemId === itemId)
    ) {
      engine.lootAll();
      return;
    }
  }
  throw new Error(`${itemId} never dropped in ${maxTicks} ticks`);
}

describe("Content validation at construction", () => {
  it("throws a single Error joining every violation when Content is malformed in several ways", () => {
    const invalidContent = {
      ...fixtureContent,
      items: fixtureContent.items.filter((i) => i.kind !== "currency"),
      monsters: fixtureContent.monsters.map((m) =>
        m.id === "dummy"
          ? {
              ...m,
              dropTable: [
                ...m.dropTable,
                { itemId: "gold-bar", qty: 1, chance: 1, band: "rare" as const },
              ],
            }
          : m,
      ),
    };

    expect(() => createEngine(invalidContent, seededRng(1))).toThrow(
      /no currency item[\s\S]*gold-bar/,
    );
  });
});

describe("fresh engine", () => {
  it("starts a level-1 player with Hitpoints 10, full HP, nothing selected", () => {
    const snap = freshEngine().snapshot();
    expect(snap.player.skills.attack.level).toBe(1);
    expect(snap.player.skills.strength.level).toBe(1);
    expect(snap.player.skills.defence.level).toBe(1);
    expect(snap.player.skills.hitpoints.level).toBe(10);
    expect(snap.player.maxHp).toBe(10);
    expect(snap.player.hp).toBe(10);
    expect(snap.player.gold).toBe(0);
    expect(snap.bank.items).toEqual([]);
    expect(snap.monster).toBeNull();
  });

  it("exposes Area gate flags: meadow unlocked from the start, crypt locked until its gating Dungeon (gauntlet) completes", () => {
    const snap = freshEngine().snapshot();
    // combat level = floor((atk + str + def + hp) / 4) = floor(13/4) = 3
    expect(snap.player.combatLevel).toBe(3);
    expect(snap.areas).toEqual([
      {
        id: "meadow",
        name: "Test Meadow",
        unlocked: true,
        monsterIds: ["dummy"],
        fishingSpots: [{ id: "pond", unlocked: true }],
      },
      {
        id: "crypt",
        name: "Test Crypt",
        unlocked: false,
        monsterIds: ["brute"],
        fishingSpots: [{ id: "deep-pond", unlocked: false }],
      },
    ]);
  });

  it("ticking with nothing selected changes nothing", () => {
    const engine = freshEngine();
    engine.tick();
    engine.tick();
    expect(engine.snapshot().player.hp).toBe(10);
    expect(engine.snapshot().monster).toBeNull();
  });
});

describe("combat", () => {
  it("selectMonster spawns the Monster at full HP", () => {
    const engine = freshEngine();
    engine.selectMonster("dummy");
    expect(engine.snapshot().monster).toEqual({
      id: "dummy",
      name: "Training Dummy",
      hp: 3,
      maxHp: 3,
    });
  });

  it("throws on an unknown monster id", () => {
    expect(() => freshEngine().selectMonster("dragon")).toThrow();
  });

  it("pumping Ticks wears the Monster down and kills fire; a fresh one respawns", () => {
    const engine = freshEngine();
    const kills: string[] = [];
    engine.on("kill", (e) => kills.push(e.monsterId));
    engine.selectMonster("dummy");
    for (let i = 0; i < 400; i++) engine.tick();
    expect(kills.length).toBeGreaterThanOrEqual(3);
    expect(kills.every((id) => id === "dummy")).toBe(true);
    const monster = engine.snapshot().monster!;
    expect(monster.hp).toBeGreaterThan(0); // fresh spawn, not a corpse
  });
});

describe("XP", () => {
  it("aggressive damage grants Strength XP at 4/damage with a Hitpoints trickle at 4/3", () => {
    const engine = freshEngine();
    engine.selectMonster("dummy");
    for (let i = 0; i < 400; i++) engine.tick();
    const { skills } = engine.snapshot().player;
    expect(skills.strength.xp).toBeGreaterThan(0);
    expect(skills.attack.xp).toBe(0);
    expect(skills.defence.xp).toBe(0);
    expect(skills.hitpoints.xp - xpForLevel(10)).toBeCloseTo(skills.strength.xp / 3, 6);
  });

  it("accurate style routes XP to Attack instead", () => {
    const engine = freshEngine();
    engine.setCombatStyle("accurate");
    engine.selectMonster("dummy");
    for (let i = 0; i < 400; i++) engine.tick();
    const { skills } = engine.snapshot().player;
    expect(skills.attack.xp).toBeGreaterThan(0);
    expect(skills.strength.xp).toBe(0);
  });

  it("crossing an XP threshold emits levelup with the new level", () => {
    const engine = freshEngine();
    const levelups: { skill: string; level: number }[] = [];
    engine.on("levelup", (e) => levelups.push({ skill: e.skill, level: e.level }));
    engine.selectMonster("dummy");
    // 83 XP = level 2 = ~21 damage dealt; plenty within 2000 ticks
    for (let i = 0; i < 2000; i++) engine.tick();
    expect(levelups).toContainEqual({ skill: "strength", level: 2 });
    expect(engine.snapshot().player.skills.strength.level).toBeGreaterThanOrEqual(2);
  });
});

describe("Drops", () => {
  it("every kill lands the guaranteed currency Drop straight into gold (#59); the drop event still fires unchanged", () => {
    const engine = freshEngine();
    let kills = 0;
    const goldDrops: number[] = [];
    engine.on("kill", () => kills++);
    engine.on("drop", (e) => {
      if (e.itemId === "gold") {
        goldDrops.push(e.qty);
        expect(e.band).toBe("guaranteed");
      }
    });
    engine.selectMonster("dummy");
    for (let i = 0; i < 2000; i++) engine.tick();
    expect(kills).toBeGreaterThanOrEqual(5);
    expect(goldDrops).toHaveLength(kills);
    expect(engine.snapshot().player.gold).toBe(kills * 5);
    // currency never touches the Bank (#59): it credits player.gold directly.
    expect(engine.snapshot().bank.items.some((s) => s.itemId === "gold")).toBe(false);
  });
});

describe("taking damage, Food, death and Respawn", () => {
  it("the Monster fights back; death enters Respawn, then combat auto-resumes", () => {
    const engine = createEngine(fiercerDummyContent(), seededRng(42));
    const order: string[] = [];
    let respawningSeenOnDeath = false;
    engine.on("kill", () => order.push("kill"));
    engine.on("death", () => {
      order.push("death");
      respawningSeenOnDeath = engine.snapshot().player.respawning;
    });
    engine.selectMonster("dummy");
    for (let i = 0; i < 5000; i++) engine.tick();

    expect(order).toContain("death");
    expect(respawningSeenOnDeath).toBe(true);
    // auto-resume: at least one kill lands after the first death
    expect(order.lastIndexOf("kill")).toBeGreaterThan(order.indexOf("death"));
    // back on our feet by the end or mid-Respawn — never a dead final state
    const player = engine.snapshot().player;
    expect(player.hp).toBeGreaterThanOrEqual(0);
    expect(player.hp === 0 ? player.respawning : true).toBe(true);
  });

  it("auto-eats Food below half HP, never overhealing", () => {
    // Food (meat) is now itself a combat Drop, which lands in the Loot Zone rather than the Bank
    // (#60) — auto-eat only ever reads from the Bank, so seed it directly instead of relying on
    // incidental kill Drops reaching it mid-fight.
    const engine = createEngine(
      fiercerDummyContent(),
      seededRng(42),
      makeSnapshot({
        player: {
          hp: 10,
          maxHp: 10,
          combatStyle: "aggressive",
          autoEatThreshold: 0.5, // makeSnapshot's own default is 0 (Off) — freshState's is 0.5
          skills: { hitpoints: { level: 10, xp: xpForLevel(10) } },
        },
        bank: { items: [{ itemId: "meat", qty: 20 }] },
      }),
    );
    let ate = 0;
    engine.on("food-eaten", (e) => {
      ate++;
      expect(e.itemId).toBe("meat");
      expect(e.healed).toBeGreaterThan(0);
      expect(e.healed).toBeLessThanOrEqual(4);
      expect(engine.snapshot().player.hp).toBeLessThanOrEqual(10);
    });
    engine.selectMonster("dummy");
    for (let i = 0; i < 5000; i++) engine.tick();
    expect(ate).toBeGreaterThan(0);
  });
});

describe("Configurable auto-eat threshold", () => {
  function thresholdEngine(
    threshold: AutoEatThreshold,
    bankSeed: { itemId: string; qty: number }[],
  ) {
    return createEngine(
      fiercerDummyContent(),
      seededRng(42),
      makeSnapshot({
        player: {
          hp: 10,
          maxHp: 10,
          combatStyle: "aggressive",
          autoEatThreshold: threshold,
          skills: { hitpoints: { level: 10, xp: xpForLevel(10) } },
        },
        bank: { items: bankSeed },
      }),
    );
  }

  it("accepts exactly {0, 0.25, 0.5, 0.75} and throws on any other value", () => {
    const engine = freshEngine();
    for (const threshold of AUTO_EAT_THRESHOLDS) {
      expect(() => engine.setAutoEatThreshold(threshold)).not.toThrow();
      expect(engine.snapshot().player.autoEatThreshold).toBe(threshold);
    }
    expect(() => engine.setAutoEatThreshold(0.1 as AutoEatThreshold)).toThrow();
    expect(() => engine.setAutoEatThreshold(1 as AutoEatThreshold)).toThrow();
    expect(() => engine.setAutoEatThreshold(-0.5 as AutoEatThreshold)).toThrow();
  });

  it("defaults to 0.5 for a fresh engine, and the default appears in the Snapshot", () => {
    const engine = freshEngine();
    expect(engine.snapshot().player.autoEatThreshold).toBe(0.5);
  });

  it("at Off (0), auto-eat never fires even at low HP with Food owned; the player can die, and manual eatFood still works", () => {
    const engine = thresholdEngine(0, [{ itemId: "meat", qty: 20 }]);
    let ate = 0;
    engine.on("food-eaten", () => ate++);
    let died = false;
    engine.on("death", () => {
      died = true;
    });
    engine.selectMonster("dummy");
    for (let i = 0; i < 5000 && !died; i++) engine.tick();

    expect(died).toBe(true);
    expect(ate).toBe(0);

    engine.eatFood("meat"); // manual eat is unaffected by the auto-eat threshold
    const meat = engine.snapshot().bank.items.find((s) => s.itemId === "meat");
    expect(meat?.qty).toBe(19);
  });

  it("at 0.75, auto-eat triggers as soon as HP first drops below 75% of max", () => {
    const engine = thresholdEngine(0.75, [{ itemId: "meat", qty: 20 }]);
    let firstEatPreHp: number | undefined;
    engine.on("food-eaten", (e) => {
      if (firstEatPreHp === undefined) firstEatPreHp = engine.snapshot().player.hp - e.healed;
    });
    engine.selectMonster("dummy");
    for (let i = 0; i < 2000 && firstEatPreHp === undefined; i++) engine.tick();

    expect(firstEatPreHp).toBeDefined();
    expect(firstEatPreHp as number).toBeLessThan(7.5); // below 75% of maxHp 10
    // and strictly earlier than the old hard-coded half-HP trigger would have allowed
    expect(firstEatPreHp as number).toBeGreaterThanOrEqual(6);
  });

  it("falls back to 0.5 when a saved threshold is not a recognised value (tolerant load)", () => {
    const corrupted = {
      player: {
        hp: 10,
        maxHp: 10,
        combatLevel: 3,
        combatStyle: "aggressive",
        autoEatThreshold: 0.9,
        skills: {
          attack: { level: 1, xp: 0 },
          strength: { level: 1, xp: 0 },
          defence: { level: 1, xp: 0 },
          hitpoints: { level: 10, xp: xpForLevel(10) },
        },
        equipment: { weapon: null, shield: null, head: null, body: null, legs: null },
        inventory: [],
        respawning: false,
      },
      monster: null,
      areas: [],
    };
    const engine = createEngine(
      fixtureContent,
      seededRng(1),
      JSON.parse(JSON.stringify(corrupted)),
    );
    expect(engine.snapshot().player.autoEatThreshold).toBe(0.5);
  });

  it("a pre-feature save missing autoEatThreshold loads at 50%, and the value round-trips through save/load", () => {
    const legacySave = {
      player: {
        hp: 10,
        maxHp: 10,
        combatLevel: 3,
        combatStyle: "aggressive",
        // no autoEatThreshold: simulates a save written before this feature shipped
        skills: {
          attack: { level: 1, xp: 0 },
          strength: { level: 1, xp: 0 },
          defence: { level: 1, xp: 0 },
          hitpoints: { level: 10, xp: xpForLevel(10) },
        },
        equipment: { weapon: null, shield: null, head: null, body: null, legs: null },
        inventory: [],
        respawning: false,
      },
      monster: null,
      areas: [],
    };
    const restored = createEngine(
      fixtureContent,
      seededRng(1),
      JSON.parse(JSON.stringify(legacySave)),
    );
    expect(restored.snapshot().player.autoEatThreshold).toBe(0.5);

    restored.setAutoEatThreshold(0.25);
    const saved = restored.snapshot();
    expect(saved.player.autoEatThreshold).toBe(0.25);

    const roundTripped = createEngine(
      fixtureContent,
      seededRng(1),
      JSON.parse(JSON.stringify(saved)),
    );
    expect(roundTripped.snapshot().player.autoEatThreshold).toBe(0.25);
  });
});

describe("Passive HP regen", () => {
  function damagedEngine(hp: number, seed = 1) {
    return createEngine(
      fixtureContent,
      seededRng(seed),
      makeSnapshot({
        player: { hp, maxHp: 10, skills: { hitpoints: { level: 10, xp: xpForLevel(10) } } },
      }),
    );
  }

  it("gains exactly 1 HP every 10 Ticks while below max HP", () => {
    const engine = damagedEngine(5);
    for (let i = 0; i < 9; i++) engine.tick();
    expect(engine.snapshot().player.hp).toBe(5);
    engine.tick();
    expect(engine.snapshot().player.hp).toBe(6);

    for (let i = 0; i < 9; i++) engine.tick();
    expect(engine.snapshot().player.hp).toBe(6);
    engine.tick();
    expect(engine.snapshot().player.hp).toBe(7);
  });

  it("does not regen once HP reaches max", () => {
    const engine = damagedEngine(9);
    for (let i = 0; i < 10; i++) engine.tick();
    expect(engine.snapshot().player.hp).toBe(10);
    for (let i = 0; i < 30; i++) engine.tick();
    expect(engine.snapshot().player.hp).toBe(10);
  });

  it("never regens while at max HP from the start", () => {
    const engine = freshEngine();
    for (let i = 0; i < 50; i++) engine.tick();
    expect(engine.snapshot().player.hp).toBe(10);
  });

  it("does not regen during Respawn", () => {
    const veteran = createEngine(
      fixtureContent,
      seededRng(3),
      makeSnapshot({
        player: {
          hp: 60,
          maxHp: 60,
          combatStyle: "aggressive",
          skills: {
            attack: { level: 60, xp: xpForLevel(60) },
            strength: { level: 60, xp: xpForLevel(60) },
            // weak Defence so the gated, hard-hitting brute can actually land a kill
            defence: { level: 1, xp: 0 },
            hitpoints: { level: 60, xp: xpForLevel(60) },
          },
          completedDungeonIds: ["gauntlet"], // Crypt's gating Dungeon, so "brute" is selectable
        },
      }),
    );
    veteran.selectMonster("brute");
    let died = false;
    veteran.on("death", () => {
      died = true;
    });
    for (let i = 0; i < 5000 && !died; i++) veteran.tick();
    expect(died).toBe(true);
    expect(veteran.snapshot().player.hp).toBe(0);
    expect(veteran.snapshot().player.respawning).toBe(true);

    let sawHpDuringRespawn = false;
    for (let i = 0; i < 6; i++) {
      veteran.tick();
      const player = veteran.snapshot().player;
      if (player.respawning) {
        expect(player.hp).toBe(0);
        sawHpDuringRespawn = true;
      }
    }
    expect(sawHpDuringRespawn).toBe(true);
  });
});

describe("Manual eat command", () => {
  it("heals from Food, consumes it, emits food-eaten, and never overheals", () => {
    // meat heals 4, but only 2 HP of headroom is available below max — must cap there
    const engine = createEngine(
      fixtureContent,
      seededRng(1),
      makeSnapshot({
        player: {
          hp: 8,
          maxHp: 10,
          skills: { hitpoints: { level: 10, xp: xpForLevel(10) } },
        },
        bank: { items: [{ itemId: "meat", qty: 2 }] },
      }),
    );

    const events: { itemId: string; healed: number }[] = [];
    engine.on("food-eaten", (e) => events.push({ itemId: e.itemId, healed: e.healed }));
    engine.eatFood("meat");

    expect(events).toEqual([{ itemId: "meat", healed: 2 }]);
    expect(engine.snapshot().player.hp).toBe(10);
    expect(engine.snapshot().bank.items).toEqual([{ itemId: "meat", qty: 1 }]);
  });

  it("throws for a non-Food item", () => {
    const engine = freshEngine();
    engine.selectMonster("dummy");
    grindFor(engine, "bronze-sword");
    expect(() => engine.eatFood("bronze-sword")).toThrow(/food/i);
  });

  it("throws for an unowned Food item", () => {
    const engine = freshEngine();
    expect(() => engine.eatFood("meat")).toThrow(/own/i);
  });
});

describe("Equipment and gates", () => {
  it("equip throws for unowned items and for non-equipment", () => {
    const engine = freshEngine();
    engine.selectMonster("dummy");
    expect(() => engine.equip("bronze-sword")).toThrow(/own/i);
    grindFor(engine, "meat");
    expect(() => engine.equip("meat")).toThrow(/equip/i);
  });

  it("equipping moves the item from the Bank to its Gear Slot", () => {
    const engine = freshEngine();
    engine.selectMonster("dummy");
    grindFor(engine, "bronze-sword");
    engine.equip("bronze-sword");
    const player = engine.snapshot().player;
    expect(player.equipment.weapon).toBe("bronze-sword");
    expect(engine.snapshot().bank.items.some((s) => s.itemId === "bronze-sword")).toBe(false);
    // no longer owned in the Bank, so equipping again throws
    expect(() => engine.equip("bronze-sword")).toThrow(/own/i);
  });

  it("equipped gear speeds up killing", () => {
    const seed = 7;
    const ticks = 12_000;
    const killsWith = { unarmed: 0, armed: 0 };

    const unarmed = createEngine(fixtureContent, seededRng(seed));
    unarmed.on("kill", () => killsWith.unarmed++);
    unarmed.selectMonster("dummy");
    for (let i = 0; i < ticks; i++) unarmed.tick();

    const armed = createEngine(fixtureContent, seededRng(seed));
    armed.on("kill", () => killsWith.armed++);
    armed.selectMonster("dummy");
    let equipped = false;
    for (let i = 0; i < ticks; i++) {
      armed.tick();
      if (!equipped && armed.snapshot().lootZone.some((s) => s.itemId === "bronze-sword")) {
        armed.lootAll();
        armed.equip("bronze-sword");
        equipped = true;
      }
    }
    expect(equipped).toBe(true);
    expect(killsWith.armed).toBeGreaterThan(killsWith.unarmed);
  });

  it("selectMonster throws for a Monster behind a locked Area gate", () => {
    expect(() => freshEngine().selectMonster("brute")).toThrow(
      /Test Crypt is locked — defeat The Gauntlet/,
    );
  });

  it("combat leveling alone never unlocks a gated Area, even far past the old combat-level requirement", () => {
    const veteran = createEngine(
      fixtureContent,
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
          // completedDungeonIds deliberately left empty: "gauntlet" was never completed.
        },
      }),
    );
    expect(veteran.snapshot().player.combatLevel).toBe(99);
    expect(veteran.snapshot().areas.find((a) => a.id === "crypt")?.unlocked).toBe(false);
    expect(() => veteran.selectMonster("brute")).toThrow(
      /Test Crypt is locked — defeat The Gauntlet/,
    );
  });

  it("equip emits exactly one equipped event carrying the equipped item's id", () => {
    const engine = freshEngine();
    engine.selectMonster("dummy");
    grindFor(engine, "bronze-sword");
    const equipped: string[] = [];
    engine.on("equipped", (e) => equipped.push(e.itemId));

    engine.equip("bronze-sword");

    expect(equipped).toEqual(["bronze-sword"]);
  });

  describe("equip against a full Bank (#59 — a player command, so it fails loud rather than auto-selling gear)", () => {
    it("swapping to a new weapon while the Bank is full throws 'bank is full', leaving equipment and the Bank untouched", () => {
      // Weapon slot already holds bronze-sword; the Bank holds 2 "bow" (a 1-slot Bank at
      // capacity). Equipping one "bow" only decrements that stack to 1 — it doesn't clear the
      // stack, so no Slot is freed — and returning bronze-sword needs a fresh Slot the full Bank
      // can't give: must throw.
      const engine = createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({
          player: { equipment: { weapon: "bronze-sword" } },
          bank: { items: [{ itemId: "bow", qty: 2 }], capacity: 1 },
        }),
      );
      expect(() => engine.equip("bow")).toThrow(/bank is full/i);
      expect(engine.snapshot().player.equipment.weapon).toBe("bronze-sword");
      expect(engine.snapshot().bank.items).toEqual([{ itemId: "bow", qty: 2 }]);
    });

    it("swapping the same item back into its own slot never reports full, even at capacity", () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({
          player: { equipment: { weapon: "bronze-sword" } },
          bank: {
            items: [
              { itemId: "bronze-sword", qty: 1 }, // a second copy, banked
              { itemId: "bar", qty: 1 },
            ],
            capacity: 2,
          },
        }),
      );
      expect(() => engine.equip("bronze-sword")).not.toThrow();
      expect(engine.snapshot().player.equipment.weapon).toBe("bronze-sword");
      expect(engine.snapshot().bank.items).toEqual(
        expect.arrayContaining([
          { itemId: "bronze-sword", qty: 1 },
          { itemId: "bar", qty: 1 },
        ]),
      );
    });

    it("pulling the last unit of the incoming item frees its own Bank Slot, so the swap-back can still fit", () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({
          player: { equipment: { weapon: "bronze-sword" } },
          bank: { items: [{ itemId: "bow", qty: 1 }], capacity: 1 },
        }),
      );
      // Bank is full (1/1) with only "bow" — but equipping "bow" removes its own last unit first,
      // freeing the one Slot the swapped-out bronze-sword needs, so this must NOT throw.
      expect(() => engine.equip("bow")).not.toThrow();
      expect(engine.snapshot().player.equipment.weapon).toBe("bow");
      expect(engine.snapshot().bank.items).toEqual([{ itemId: "bronze-sword", qty: 1 }]);
    });
  });
});

describe("Snapshot player.bonuses (#26)", () => {
  it("is all zero, with the unarmed attack speed fallback, on a fresh engine with nothing equipped", () => {
    const snap = freshEngine().snapshot();
    expect(snap.player.bonuses).toEqual({ atkBonus: 0, strBonus: 0, defBonus: 0, attackSpeed: 4 });
  });

  it("sums bonuses across every equipped Gear Slot and reflects the weapon's own speed", () => {
    const engine = freshEngine();
    engine.selectMonster("dummy");
    grindFor(engine, "bronze-sword");
    grindFor(engine, "lucky-charm");
    engine.equip("bronze-sword"); // weapon: atk 10, str 30, def 0, speed 4
    engine.equip("lucky-charm"); // head: atk 0, str 0, def 1

    expect(engine.snapshot().player.bonuses).toEqual({
      atkBonus: 10,
      strBonus: 30,
      defBonus: 1,
      attackSpeed: 4,
    });
  });

  it("falls back to unarmed attack speed 4 when no weapon is equipped, even with other Gear worn", () => {
    const engine = freshEngine();
    engine.selectMonster("dummy");
    grindFor(engine, "lucky-charm");
    engine.equip("lucky-charm"); // head only, no weapon

    expect(engine.snapshot().player.bonuses).toEqual({
      atkBonus: 0,
      strBonus: 0,
      defBonus: 1,
      attackSpeed: 4,
    });
  });

  it("updates immediately after equip, in the same snapshot the UI would re-render from", () => {
    const engine = freshEngine();
    engine.selectMonster("dummy");
    grindFor(engine, "bronze-sword");
    expect(engine.snapshot().player.bonuses.atkBonus).toBe(0);

    engine.equip("bronze-sword");

    expect(engine.snapshot().player.bonuses.atkBonus).toBe(10);
  });
});

describe("Selling items", () => {
  it("throws for an unknown item", () => {
    expect(() => freshEngine().sell("dragon-tooth")).toThrow(/unknown/i);
  });

  it("throws for an unowned item", () => {
    expect(() => freshEngine().sell("meat")).toThrow(/own/i);
  });

  it("throws for currency (selling gold for gold is nonsense)", () => {
    const engine = freshEngine();
    engine.selectMonster("dummy");
    grindFor(engine, "meat"); // any kill also drops gold
    expect(() => engine.sell("gold")).toThrow(/cannot be sold/i);
  });

  it("throws for an item without a value", () => {
    const noValueContent = {
      ...fixtureContent,
      items: fixtureContent.items.map((i) => {
        if (i.id !== "meat" || i.kind === "currency") return i;
        const { value: _value, ...rest } = i;
        return rest;
      }),
    };
    const engine = createEngine(noValueContent, seededRng(1));
    engine.selectMonster("dummy");
    grindFor(engine, "meat");
    expect(() => engine.sell("meat")).toThrow(/cannot be sold/i);
  });

  it("throws for qty < 1 or non-integer qty", () => {
    const engine = freshEngine();
    engine.selectMonster("dummy");
    grindFor(engine, "meat");
    expect(() => engine.sell("meat", 0)).toThrow();
    expect(() => engine.sell("meat", -1)).toThrow();
    expect(() => engine.sell("meat", 1.5)).toThrow();
  });

  it("throws when selling more than owned", () => {
    const engine = freshEngine();
    engine.selectMonster("dummy");
    grindFor(engine, "meat");
    const owned = engine.snapshot().bank.items.find((s) => s.itemId === "meat")?.qty ?? 0;
    expect(() => engine.sell("meat", owned + 1)).toThrow(/own/i);
  });

  it("selling N removes N from the Bank (deleting the entry at zero), credits N*value gold, and emits one item-sold event", () => {
    const engine = freshEngine();
    engine.selectMonster("dummy");
    grindFor(engine, "bronze-sword");
    const goldBefore = engine.snapshot().player.gold;

    const events: { itemId: string; qty: number; gold: number }[] = [];
    engine.on("item-sold", (e) => events.push({ itemId: e.itemId, qty: e.qty, gold: e.gold }));
    engine.sell("bronze-sword", 1);

    expect(events).toEqual([{ itemId: "bronze-sword", qty: 1, gold: 20 }]);
    expect(engine.snapshot().bank.items.some((s) => s.itemId === "bronze-sword")).toBe(false);
    expect(engine.snapshot().player.gold).toBe(goldBefore + 20);
  });

  it("selling part of a stack decrements it without deleting the entry", () => {
    const engine = freshEngine();
    engine.selectMonster("dummy");
    for (let i = 0; i < 3000; i++) engine.tick();
    engine.lootAll();
    const owned = engine.snapshot().bank.items.find((s) => s.itemId === "meat")?.qty ?? 0;
    expect(owned).toBeGreaterThan(1);

    engine.sell("meat", 1);
    const remaining = engine.snapshot().bank.items.find((s) => s.itemId === "meat")?.qty;
    expect(remaining).toBe(owned - 1);
  });

  it("defaults qty to 1 when omitted", () => {
    const engine = freshEngine();
    engine.selectMonster("dummy");
    grindFor(engine, "meat");
    const owned = engine.snapshot().bank.items.find((s) => s.itemId === "meat")?.qty ?? 0;
    engine.sell("meat");
    const remaining = engine.snapshot().bank.items.find((s) => s.itemId === "meat")?.qty ?? 0;
    expect(remaining).toBe(owned - 1);
  });

  it("worn Equipment is structurally unsellable: equip the only copy, then sell throws as unowned", () => {
    const engine = freshEngine();
    engine.selectMonster("dummy");
    grindFor(engine, "bronze-sword");
    engine.equip("bronze-sword");
    expect(() => engine.sell("bronze-sword")).toThrow(/own/i);
  });

  it("throws at construction if Content defines no currency, with no hard-coded currency id in the Engine", () => {
    const noCurrencyContent = {
      ...fixtureContent,
      items: fixtureContent.items.filter((i) => i.kind !== "currency"),
    };
    expect(() => createEngine(noCurrencyContent, seededRng(1))).toThrow(/currency/i);
  });
});

describe("Bank (#59 — the sole item store; gold is player.gold, never a stack)", () => {
  function bankEngine(overrides: Parameters<typeof makeSnapshot>[0] = {}) {
    return createEngine(fixtureContent, seededRng(1), makeSnapshot(overrides));
  }

  describe("buyBankSlots", () => {
    it("charges 1000g, then 1500g, then 2000g (derived from capacity), growing capacity by BANK_SLOTS_PER_PURCHASE (10) each time", () => {
      const engine = bankEngine({ player: { gold: 10_000 } });
      expect(engine.snapshot().bank.capacity).toBe(100);
      expect(engine.snapshot().bank.nextSlotsPrice).toBe(1000);

      engine.buyBankSlots();
      expect(engine.snapshot().bank.capacity).toBe(110);
      expect(engine.snapshot().player.gold).toBe(9000);
      expect(engine.snapshot().bank.nextSlotsPrice).toBe(1500);

      engine.buyBankSlots();
      expect(engine.snapshot().bank.capacity).toBe(120);
      expect(engine.snapshot().player.gold).toBe(7500);
      expect(engine.snapshot().bank.nextSlotsPrice).toBe(2000);

      engine.buyBankSlots();
      expect(engine.snapshot().bank.capacity).toBe(130);
      expect(engine.snapshot().player.gold).toBe(5500);
    });

    it("throws when gold is short of the next price, spending nothing", () => {
      const engine = bankEngine({ player: { gold: 999 } });
      expect(() => engine.buyBankSlots()).toThrow(/gold/i);
      expect(engine.snapshot().player.gold).toBe(999);
      expect(engine.snapshot().bank.capacity).toBe(100);
    });
  });

  describe("save/load", () => {
    it("Bank contents, capacity, and gold round-trip through save/load", () => {
      const original = bankEngine({
        player: { gold: 5000 },
        bank: { items: [{ itemId: "meat", qty: 3 }], capacity: 100 },
      });
      original.buyBankSlots();
      const saved = original.snapshot();

      const restored = createEngine(
        fixtureContent,
        seededRng(1),
        JSON.parse(JSON.stringify(saved)),
      );
      expect(restored.snapshot().bank.items).toEqual(saved.bank.items);
      expect(restored.snapshot().bank.capacity).toBe(saved.bank.capacity);
      expect(restored.snapshot().player.gold).toBe(saved.player.gold);
    });

    it("a pre-feature save (no bank key at all) loads with an empty 100-slot Bank", () => {
      const legacySave = {
        player: {
          hp: 10,
          maxHp: 10,
          combatLevel: 3,
          combatStyle: "aggressive",
          autoEatThreshold: 0.5,
          skills: {
            attack: { level: 1, xp: 0 },
            strength: { level: 1, xp: 0 },
            defence: { level: 1, xp: 0 },
            hitpoints: { level: 10, xp: xpForLevel(10) },
          },
          equipment: { weapon: null, shield: null, head: null, body: null, legs: null },
          respawning: false,
        },
        monster: null,
        areas: [],
        // no bank key: simulates a save written before this feature shipped
      };
      const restored = createEngine(
        fixtureContent,
        seededRng(1),
        JSON.parse(JSON.stringify(legacySave)),
      );
      expect(restored.snapshot().bank).toEqual({ items: [], capacity: 100, nextSlotsPrice: 1000 });
      expect(restored.snapshot().player.gold).toBe(0);
    });

    it("Bank entries for an unknown itemId, or with an invalid qty, are dropped on load", () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({
          bank: {
            items: [
              { itemId: "unobtainium", qty: 3 },
              { itemId: "meat", qty: 0 },
              { itemId: "bronze-sword", qty: 1.5 },
              { itemId: "lucky-charm", qty: 2 },
            ],
            capacity: 100,
          },
        }),
      );
      expect(engine.snapshot().bank.items).toEqual([{ itemId: "lucky-charm", qty: 2 }]);
    });

    it("a currency stack sitting in bank.items (impossible via any current command, but tolerated on load) folds into gold, never surviving as a Bank stack", () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({
          player: { gold: 100 },
          bank: {
            items: [
              { itemId: "gold", qty: 250 },
              { itemId: "meat", qty: 2 },
            ],
            capacity: 100,
          },
        }),
      );
      expect(engine.snapshot().player.gold).toBe(350);
      expect(engine.snapshot().bank.items).toEqual([{ itemId: "meat", qty: 2 }]);
    });
  });
});

describe("Bank overflow: passive flows auto-sell, player commands throw (#59)", () => {
  /** A single Bank Slot, already occupied by "bar" and thus at capacity, so the next passive
   * arrival of a NEW item is guaranteed to hit the overflow path. */
  function fullBankSnapshot(
    playerOverrides: NonNullable<Parameters<typeof makeSnapshot>[0]>["player"] = {},
  ) {
    return makeSnapshot({
      player: playerOverrides,
      bank: { items: [{ itemId: "bar", qty: 1 }], capacity: 1 },
    });
  }

  // A kill Drop needing a new stack at full BANK capacity no longer overflows here at all (#60):
  // kill Drops land in the Loot Zone first, which has its own separate 10-stack capacity and its
  // own overflow scenario — see "Loot Zone (#60)" below for that coverage instead.

  it("an unsellable passive arrival needing a new stack at full capacity is discarded and emits overflow-lost, crediting no gold", () => {
    const noValueContent = {
      ...fixtureContent,
      items: fixtureContent.items.map((i) => {
        if (i.id !== "meat" || i.kind === "currency") return i;
        const { value: _value, ...rest } = i;
        return rest;
      }),
    };
    const engine = createEngine(
      noValueContent,
      seededRng(1),
      fullBankSnapshot({ skills: { fishing: { level: 1, xp: 0 } } }),
    );
    const lost: { itemId: string; qty: number }[] = [];
    const sold: unknown[] = [];
    engine.on("overflow-lost", (e) => lost.push({ itemId: e.itemId, qty: e.qty }));
    engine.on("overflow-sold", (e) => sold.push(e));

    engine.selectFishingSpot("pond"); // pond always catches "meat" (catchChance 1), now unsellable
    for (let i = 0; i < 3; i++) engine.tick(); // catchTicks 3: exactly one Catch

    expect(lost).toEqual([{ itemId: "meat", qty: 1 }]);
    expect(sold).toEqual([]);
    expect(engine.snapshot().player.gold).toBe(0);
    expect(engine.snapshot().bank.items).toEqual([{ itemId: "bar", qty: 1 }]);
  });

  it("a passive arrival that tops up an EXISTING stack always fits, even at capacity — no overflow event fires", () => {
    const engine = createEngine(
      fixtureContent,
      seededRng(1),
      makeSnapshot({
        player: { skills: { fishing: { level: 1, xp: 0 } } },
        bank: { items: [{ itemId: "meat", qty: 1 }], capacity: 1 },
      }),
    );
    let overflowed = false;
    engine.on("overflow-sold", () => {
      overflowed = true;
    });
    engine.on("overflow-lost", () => {
      overflowed = true;
    });

    engine.selectFishingSpot("pond");
    for (let i = 0; i < 9; i++) engine.tick(); // 3 Catches at catchTicks 3, catchChance 1

    expect(overflowed).toBe(false);
    expect(engine.snapshot().bank.items).toEqual([{ itemId: "meat", qty: 4 }]);
  });

  it("smithing output is subject to the same overflow rule as any other passive arrival", () => {
    const engine = createEngine(fixtureContent, seededRng(1), fullBankSnapshot());
    // "test-sword" needs 1 bar (already banked, so consuming it clears that very stack) and
    // outputs "bronze-sword" — a brand-new stack, landing on a Bank that is, at the moment of
    // output, back down to size 0 (the input stack just cleared), so this does NOT overflow.
    engine.selectRecipe("test-sword");
    for (let i = 0; i < 3; i++) engine.tick(); // craftTicks 3
    expect(engine.snapshot().bank.items).toEqual([{ itemId: "bronze-sword", qty: 1 }]);
  });
});

describe("Save migration: pre-#59 carried Inventory folds into gold + Bank (tolerant, never bricks a save)", () => {
  /** A pre-#59 save shape: `player.inventory` existed, `player.gold` did not. Built via a plain
   * object (cast, not `makeSnapshot`) since the current Snapshot type no longer has `inventory`. */
  function legacySave(
    inventory: { itemId: string; qty: number }[],
    bankItems: { itemId: string; qty: number }[] = [],
    bankCapacity = 100,
  ) {
    return {
      player: {
        hp: 10,
        maxHp: 10,
        combatLevel: 3,
        combatStyle: "aggressive",
        autoEatThreshold: 0.5,
        skills: {
          attack: { level: 1, xp: 0 },
          strength: { level: 1, xp: 0 },
          defence: { level: 1, xp: 0 },
          hitpoints: { level: 10, xp: xpForLevel(10) },
        },
        equipment: { weapon: null, shield: null, head: null, body: null, legs: null },
        inventory,
        respawning: false,
        // no `gold` key: simulates a save written before #59 shipped
      },
      monster: null,
      areas: [],
      bank: { items: bankItems, capacity: bankCapacity },
    };
  }

  it("the carried currency stack sums into player.gold; every other carried stack merges into the Bank", () => {
    const restored = createEngine(
      fixtureContent,
      seededRng(1),
      JSON.parse(
        JSON.stringify(
          legacySave([
            { itemId: "gold", qty: 300 },
            { itemId: "meat", qty: 4 },
            { itemId: "bronze-sword", qty: 1 },
          ]),
        ),
      ),
    );
    const snap = restored.snapshot();
    expect(snap.player.gold).toBe(300);
    expect(snap.bank.items).toEqual(
      expect.arrayContaining([
        { itemId: "meat", qty: 4 },
        { itemId: "bronze-sword", qty: 1 },
      ]),
    );
    expect(snap.bank.items).toHaveLength(2);
  });

  it("a currency stack already sitting in bank.items also sums into gold, alongside the carried one", () => {
    const restored = createEngine(
      fixtureContent,
      seededRng(1),
      JSON.parse(
        JSON.stringify(legacySave([{ itemId: "gold", qty: 100 }], [{ itemId: "gold", qty: 50 }])),
      ),
    );
    expect(restored.snapshot().player.gold).toBe(150);
    expect(restored.snapshot().bank.items).toEqual([]);
  });

  it("a carried stack merges with an existing Bank stack of the same item, summing quantities", () => {
    const restored = createEngine(
      fixtureContent,
      seededRng(1),
      JSON.parse(
        JSON.stringify(legacySave([{ itemId: "meat", qty: 4 }], [{ itemId: "meat", qty: 6 }])),
      ),
    );
    expect(restored.snapshot().bank.items).toEqual([{ itemId: "meat", qty: 10 }]);
  });

  it("migration may push the Bank over capacity — that's tolerated (capacity only gates NEW incoming stacks)", () => {
    const restored = createEngine(
      fixtureContent,
      seededRng(1),
      JSON.parse(
        JSON.stringify(
          legacySave(
            [
              { itemId: "meat", qty: 1 },
              { itemId: "bronze-sword", qty: 1 },
              { itemId: "lucky-charm", qty: 1 },
            ],
            [{ itemId: "bar", qty: 1 }],
            2, // capacity 2, but 4 distinct stacks total after merge
          ),
        ),
      ),
    );
    const snap = restored.snapshot();
    expect(snap.bank.items).toHaveLength(4);
    expect(snap.bank.capacity).toBe(2); // unchanged — capacity itself never grows from migration
    // and the Engine keeps functioning normally afterward (over-capacity is self-resolving, never
    // bricking the save): selling one stack down doesn't throw.
    expect(() => restored.sell("bar", 1)).not.toThrow();
  });

  it("a save with neither inventory nor gold (very old, or already a clean fresh save) loads at gold 0", () => {
    const bareSave = legacySave([]);
    delete (bareSave.player as { inventory?: unknown }).inventory;
    const restored = createEngine(
      fixtureContent,
      seededRng(1),
      JSON.parse(JSON.stringify(bareSave)),
    );
    expect(restored.snapshot().player.gold).toBe(0);
    expect(restored.snapshot().bank.items).toEqual([]);
  });
});

describe("save/load", () => {
  it("a Snapshot JSON round-trips through createEngine and keeps fighting", () => {
    const original = freshEngine();
    original.selectMonster("dummy");
    grindFor(original, "bronze-sword");
    original.equip("bronze-sword");
    for (let i = 0; i < 500; i++) original.tick();
    const saved = original.snapshot();

    const restored = createEngine(fixtureContent, seededRng(1), JSON.parse(JSON.stringify(saved)));
    const snap = restored.snapshot();
    expect(snap.player.skills).toEqual(saved.player.skills);
    expect(snap.player.equipment).toEqual(saved.player.equipment);
    expect(snap.player.gold).toBe(saved.player.gold);
    expect(snap.bank.items).toEqual(saved.bank.items);
    expect(snap.player.hp).toBe(saved.player.hp);
    expect(snap.monster?.id).toBe(saved.monster?.id);

    let kills = 0;
    restored.on("kill", () => kills++);
    for (let i = 0; i < 2000; i++) restored.tick();
    expect(kills).toBeGreaterThan(0);
  });

  it("a save with the gating Dungeon already in completedDungeonIds unlocks the Crypt gate", () => {
    const veteran = createEngine(
      fixtureContent,
      seededRng(1),
      makeSnapshot({
        player: { completedDungeonIds: ["gauntlet"] },
      }),
    );
    expect(veteran.snapshot().areas.find((a) => a.id === "crypt")?.unlocked).toBe(true);
    expect(() => veteran.selectMonster("brute")).not.toThrow();
  });
});

describe("loadState: full-sweep tolerant save validation (#38)", () => {
  it("an invalid combatStyle falls back to aggressive, and no NaN reaches xp on the next kill", () => {
    const engine = createEngine(
      fixtureContent,
      seededRng(1),
      makeSnapshot({ player: { combatStyle: "berserk" as CombatStyle } }),
    );
    expect(engine.snapshot().player.combatStyle).toBe("aggressive");

    engine.selectMonster("dummy");
    for (let i = 0; i < 50; i++) engine.tick();
    const skills = engine.snapshot().player.skills;
    expect(Number.isNaN(skills.attack.xp)).toBe(false);
    expect(Number.isNaN(skills.strength.xp)).toBe(false);
    expect(Number.isNaN(skills.defence.xp)).toBe(false);
    expect(Number.isNaN(skills.hitpoints.xp)).toBe(false);
  });

  it("equipment.weapon naming an unknown item loads that slot null", () => {
    const engine = createEngine(
      fixtureContent,
      seededRng(1),
      makeSnapshot({ player: { equipment: { weapon: "excalibur" } } }),
    );
    expect(engine.snapshot().player.equipment.weapon).toBeNull();
  });

  it("equipment naming a real item in the wrong slot loads that slot null", () => {
    // lucky-charm is a head item; placing it in the weapon slot is a slot mismatch.
    const engine = createEngine(
      fixtureContent,
      seededRng(1),
      makeSnapshot({ player: { equipment: { weapon: "lucky-charm" } } }),
    );
    expect(engine.snapshot().player.equipment.weapon).toBeNull();
  });

  it("a valid equipment reference still loads normally alongside the rest of the sweep", () => {
    const engine = createEngine(
      fixtureContent,
      seededRng(1),
      makeSnapshot({ player: { equipment: { head: "lucky-charm" } } }),
    );
    expect(engine.snapshot().player.equipment.head).toBe("lucky-charm");
  });

  it("Bank entries for an unknown itemId are dropped", () => {
    const engine = createEngine(
      fixtureContent,
      seededRng(1),
      makeSnapshot({ bank: { items: [{ itemId: "unobtainium", qty: 3 }] } }),
    );
    expect(engine.snapshot().bank.items).toEqual([]);
  });

  it("Bank entries with qty 0, negative, or non-integer are dropped; valid entries survive", () => {
    const engine = createEngine(
      fixtureContent,
      seededRng(1),
      makeSnapshot({
        bank: {
          items: [
            { itemId: "meat", qty: 0 },
            { itemId: "bronze-sword", qty: 1.5 },
            { itemId: "lucky-charm", qty: 2 },
          ],
        },
      }),
    );
    expect(engine.snapshot().bank.items).toEqual([{ itemId: "lucky-charm", qty: 2 }]);
  });

  it("a negative or non-finite saved gold falls back to 0", () => {
    const negative = createEngine(
      fixtureContent,
      seededRng(1),
      makeSnapshot({ player: { gold: -50 } }),
    );
    expect(negative.snapshot().player.gold).toBe(0);

    const nan = createEngine(fixtureContent, seededRng(1), makeSnapshot({ player: { gold: NaN } }));
    expect(nan.snapshot().player.gold).toBe(0);
  });

  it("a saved skill xp of NaN or negative loads at the fresh default for that skill", () => {
    const engine = createEngine(
      fixtureContent,
      seededRng(1),
      makeSnapshot({
        player: {
          skills: {
            attack: { xp: NaN },
            strength: { xp: -50 },
          },
        },
      }),
    );
    const skills = engine.snapshot().player.skills;
    expect(skills.attack.xp).toBe(0);
    expect(skills.strength.xp).toBe(0);
  });

  it("a missing hitpoints skill falls back to the fresh default (xpForLevel(10))", () => {
    const engine = createEngine(
      fixtureContent,
      seededRng(1),
      makeSnapshot({ player: { skills: { hitpoints: { xp: NaN } } } }),
    );
    expect(engine.snapshot().player.skills.hitpoints.xp).toBe(xpForLevel(10));
  });

  it("hp above maxHp loads clamped to maxHp", () => {
    const engine = createEngine(
      fixtureContent,
      seededRng(1),
      makeSnapshot({
        player: { hp: 9999, skills: { hitpoints: { level: 10, xp: xpForLevel(10) } } },
      }),
    );
    expect(engine.snapshot().player.hp).toBe(10);
  });

  it("hp below 1 (including 0 and negative) loads clamped to 1", () => {
    const engine = createEngine(
      fixtureContent,
      seededRng(1),
      makeSnapshot({
        player: { hp: -20, skills: { hitpoints: { level: 10, xp: xpForLevel(10) } } },
      }),
    );
    expect(engine.snapshot().player.hp).toBe(1);
  });

  it("a save whose monster names an unknown id loads idle instead of throwing", () => {
    expect(() =>
      createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({ monster: { id: "dragon", name: "Dragon", hp: 100, maxHp: 100 } }),
      ),
    ).not.toThrow();
    const engine = createEngine(
      fixtureContent,
      seededRng(1),
      makeSnapshot({ monster: { id: "dragon", name: "Dragon", hp: 100, maxHp: 100 } }),
    );
    expect(engine.snapshot().monster).toBeNull();
  });

  it("a save whose fishing names an unknown spot id loads idle instead of throwing", () => {
    const engine = createEngine(
      fixtureContent,
      seededRng(1),
      makeSnapshot({ fishing: { spotId: "river", name: "River" } }),
    );
    expect(engine.snapshot().fishing).toBeNull();
    expect(engine.snapshot().monster).toBeNull();
  });

  it("a save with a valid monster still resumes combat with its saved HP (no regression)", () => {
    const engine = createEngine(
      fixtureContent,
      seededRng(1),
      makeSnapshot({ monster: { id: "dummy", name: "Training Dummy", hp: 2, maxHp: 3 } }),
    );
    expect(engine.snapshot().monster).toEqual({
      id: "dummy",
      name: "Training Dummy",
      hp: 2,
      maxHp: 3,
    });
    let kills = 0;
    engine.on("kill", () => kills++);
    for (let i = 0; i < 5000; i++) engine.tick();
    expect(kills).toBeGreaterThan(0);
  });

  it("never throws even when every field is corrupted at once", () => {
    expect(() =>
      createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({
          player: {
            hp: NaN,
            combatStyle: "berserk" as CombatStyle,
            autoEatThreshold: 0.9 as AutoEatThreshold,
            gold: -3,
            skills: {
              attack: { xp: -1 },
              strength: { xp: NaN },
              defence: { xp: NaN },
              hitpoints: { xp: NaN },
              fishing: { xp: NaN },
            },
            equipment: { weapon: "nonexistent", shield: "lucky-charm" },
          },
          monster: { id: "nonexistent", name: "x", hp: 1, maxHp: 1 },
          bank: { items: [{ itemId: "nonexistent", qty: 5 }] },
        }),
      ),
    ).not.toThrow();
  });

  it("a valid Snapshot still round-trips unchanged (no behavioural change for clean saves)", () => {
    const original = freshEngine();
    original.selectMonster("dummy");
    grindFor(original, "bronze-sword");
    original.equip("bronze-sword");
    for (let i = 0; i < 200; i++) original.tick();
    const saved = original.snapshot();

    const restored = createEngine(fixtureContent, seededRng(1), JSON.parse(JSON.stringify(saved)));
    expect(restored.snapshot()).toEqual(saved);
  });
});

describe("Drop Table convergence", () => {
  it("the 1/128 rare Drop lands at roughly its declared rate over many kills", () => {
    const engine = freshEngine(1234);
    let kills = 0;
    let rares = 0;
    engine.on("kill", () => kills++);
    engine.on("drop", (e) => {
      if (e.band === "rare") rares++;
    });
    engine.selectMonster("dummy");
    for (let i = 0; i < 200_000; i++) engine.tick();

    expect(kills).toBeGreaterThan(2000);
    const expected = kills / 128;
    expect(rares).toBeGreaterThan(expected * 0.6);
    expect(rares).toBeLessThan(expected * 1.4);
  });
});

/** A veteran with the Crypt's gating Dungeon ("gauntlet") already completed — so its Area gate
 * is open — and a configurable Fishing level/XP. Combat level is incidental (#24: leveling alone
 * never opens an Area gate), kept high only because these fixtures predate the Dungeon gate. */
function veteranSnapshot(fishingLevel = 1, fishingXp = 0) {
  return makeSnapshot({
    player: {
      hp: 45,
      maxHp: 45,
      skills: {
        attack: { level: 45, xp: xpForLevel(45) },
        strength: { level: 45, xp: xpForLevel(45) },
        defence: { level: 45, xp: xpForLevel(45) },
        hitpoints: { level: 45, xp: xpForLevel(45) },
        fishing: { level: fishingLevel, xp: fishingXp },
      },
      completedDungeonIds: ["gauntlet"],
    },
  });
}

describe("Fishing", () => {
  it("selectFishingSpot yields Fishing XP and edible Food over Ticks, emitting fish-caught (catchChance 1)", () => {
    const engine = freshEngine();
    const caught: { spotId: string; itemId: string; qty: number }[] = [];
    engine.on("fish-caught", (e) =>
      caught.push({ spotId: e.spotId, itemId: e.itemId, qty: e.qty }),
    );
    engine.selectFishingSpot("pond");
    expect(engine.snapshot().fishing).toEqual({ spotId: "pond", name: "Test Pond" });

    for (let i = 0; i < 3; i++) engine.tick(); // pond.catchTicks === 3
    expect(caught).toEqual([{ spotId: "pond", itemId: "meat", qty: 1 }]);

    for (let i = 0; i < 3; i++) engine.tick();
    expect(caught).toHaveLength(2);

    const snap = engine.snapshot();
    expect(snap.bank.items.find((s) => s.itemId === "meat")?.qty).toBe(2);
    expect(snap.player.skills.fishing.xp).toBe(20); // 2 Catches * pond.xp (10)
  });

  it("throws on an unknown Fishing Spot id", () => {
    expect(() => freshEngine().selectFishingSpot("river")).toThrow(/unknown/i);
  });

  it("throws when the containing Area is locked, even before checking Fishing level", () => {
    expect(() => freshEngine().selectFishingSpot("deep-pond")).toThrow(
      /Test Crypt is locked — defeat The Gauntlet/,
    );
  });

  it("throws for insufficient Fishing level once the Area gate is already open", () => {
    const engine = createEngine(fixtureContent, seededRng(1), veteranSnapshot());
    expect(() => engine.selectFishingSpot("deep-pond")).toThrow(/fishing level 20/i);
  });

  it("succeeds once both the Area and Fishing level gates are met", () => {
    const engine = createEngine(fixtureContent, seededRng(1), veteranSnapshot(20, xpForLevel(20)));
    expect(() => engine.selectFishingSpot("deep-pond")).not.toThrow();
    expect(engine.snapshot().fishing).toEqual({ spotId: "deep-pond", name: "Test Deep Pond" });
  });

  it("derives locked/unlocked Fishing Spot gates in the Snapshot, independent of the Area gate", () => {
    const fresh = freshEngine().snapshot();
    expect(fresh.areas.find((a) => a.id === "meadow")?.fishingSpots).toEqual([
      { id: "pond", unlocked: true },
    ]);
    expect(fresh.areas.find((a) => a.id === "crypt")?.fishingSpots).toEqual([
      { id: "deep-pond", unlocked: false }, // Area itself is locked
    ]);

    const lowFishing = createEngine(fixtureContent, seededRng(1), veteranSnapshot()).snapshot();
    // Area is unlocked (combat level 45) but Fishing level 1 < levelReq 20
    expect(lowFishing.areas.find((a) => a.id === "crypt")?.fishingSpots).toEqual([
      { id: "deep-pond", unlocked: false },
    ]);

    const highFishing = createEngine(
      fixtureContent,
      seededRng(1),
      veteranSnapshot(20, xpForLevel(20)),
    ).snapshot();
    expect(highFishing.areas.find((a) => a.id === "crypt")?.fishingSpots).toEqual([
      { id: "deep-pond", unlocked: true },
    ]);
  });

  it("selecting a Fishing Spot clears any selected Monster, and vice versa (at most one active)", () => {
    const engine = freshEngine();
    engine.selectMonster("dummy");
    expect(engine.snapshot().monster).not.toBeNull();

    engine.selectFishingSpot("pond");
    expect(engine.snapshot().monster).toBeNull();
    expect(engine.snapshot().fishing).toEqual({ spotId: "pond", name: "Test Pond" });

    engine.selectMonster("dummy");
    expect(engine.snapshot().fishing).toBeNull();
    expect(engine.snapshot().monster).not.toBeNull();
  });

  it("selecting a Fishing Spot mid-Respawn cancels it, restoring hp to at least 1", () => {
    const engine = createEngine(fiercerDummyContent(), seededRng(42));
    engine.selectMonster("dummy");
    let died = false;
    engine.on("death", () => {
      died = true;
    });
    for (let i = 0; i < 5000 && !died; i++) engine.tick();
    expect(died).toBe(true);
    expect(engine.snapshot().player.respawning).toBe(true);
    expect(engine.snapshot().player.hp).toBe(0);

    engine.selectFishingSpot("pond");
    const player = engine.snapshot().player;
    expect(player.respawning).toBe(false);
    expect(player.hp).toBeGreaterThanOrEqual(1);
    expect(engine.snapshot().monster).toBeNull();
    expect(engine.snapshot().fishing).not.toBeNull();
  });

  it("Fishing XP never moves combatLevel() or Area unlocks", () => {
    const engine = freshEngine();
    const before = engine.snapshot();
    engine.selectFishingSpot("pond");
    for (let i = 0; i < 3000; i++) engine.tick();
    const after = engine.snapshot();

    expect(after.player.skills.fishing.xp).toBeGreaterThan(0);
    expect(after.player.combatLevel).toBe(before.player.combatLevel);
    expect(after.areas.find((a) => a.id === "crypt")?.unlocked).toBe(
      before.areas.find((a) => a.id === "crypt")?.unlocked,
    );
  });

  describe("pinned decisions while fishing", () => {
    function damagedFishingSnapshot(hp: number) {
      return makeSnapshot({
        player: {
          hp,
          maxHp: 10,
          skills: { hitpoints: { level: 10, xp: xpForLevel(10) } },
        },
        bank: { items: [{ itemId: "meat", qty: 5 }] },
      });
    }

    it("passive regen continues while fishing (downtime heals)", () => {
      const engine = createEngine(fixtureContent, seededRng(1), damagedFishingSnapshot(5));
      engine.selectFishingSpot("pond");
      for (let i = 0; i < 9; i++) engine.tick();
      expect(engine.snapshot().player.hp).toBe(5);
      engine.tick();
      expect(engine.snapshot().player.hp).toBe(6);
    });

    it("auto-eat never fires while fishing, even below the threshold with Food owned", () => {
      const engine = createEngine(fixtureContent, seededRng(1), damagedFishingSnapshot(2));
      let ate = 0;
      engine.on("food-eaten", () => ate++);
      engine.selectFishingSpot("pond");
      for (let i = 0; i < 100; i++) engine.tick();
      expect(ate).toBe(0);
    });

    it("death cannot occur while fishing, even starting at 1 HP", () => {
      const engine = createEngine(fixtureContent, seededRng(1), damagedFishingSnapshot(1));
      let died = false;
      engine.on("death", () => {
        died = true;
      });
      engine.selectFishingSpot("pond");
      for (let i = 0; i < 200; i++) engine.tick();
      expect(died).toBe(false);
      expect(engine.snapshot().player.hp).toBeGreaterThanOrEqual(1);
    });
  });

  describe("save/load", () => {
    it("a pre-feature save (no fishing key anywhere) loads at Fishing level 1 / 0 XP with combat resumed unchanged", () => {
      const legacySave = {
        player: {
          hp: 3,
          maxHp: 3,
          combatLevel: 3,
          combatStyle: "aggressive",
          autoEatThreshold: 0.5,
          skills: {
            attack: { level: 1, xp: 0 },
            strength: { level: 1, xp: 0 },
            defence: { level: 1, xp: 0 },
            hitpoints: { level: 10, xp: xpForLevel(10) },
            // no fishing key: simulates a save written before this feature shipped
          },
          equipment: { weapon: null, shield: null, head: null, body: null, legs: null },
          inventory: [],
          respawning: false,
        },
        monster: { id: "dummy", name: "Training Dummy", hp: 3, maxHp: 3 },
        // no top-level fishing key either
        areas: [],
      };
      const restored = createEngine(
        fixtureContent,
        seededRng(1),
        JSON.parse(JSON.stringify(legacySave)),
      );
      const snap = restored.snapshot();
      expect(snap.player.skills.fishing).toEqual({ level: 1, xp: 0 });
      expect(snap.fishing).toBeNull();
      expect(snap.monster?.id).toBe("dummy");

      let kills = 0;
      restored.on("kill", () => kills++);
      for (let i = 0; i < 2000; i++) restored.tick();
      expect(kills).toBeGreaterThan(0);
    });

    it("a save made while fishing resumes fishing on load, re-arming the cooldown to catchTicks", () => {
      const original = freshEngine();
      original.selectFishingSpot("pond");
      original.tick(); // 1 tick into a 3-tick cooldown; not yet due for a Catch
      const saved = original.snapshot();
      expect(saved.fishing).toEqual({ spotId: "pond", name: "Test Pond" });

      const restored = createEngine(
        fixtureContent,
        seededRng(7),
        JSON.parse(JSON.stringify(saved)),
      );
      expect(restored.snapshot().fishing).toEqual({ spotId: "pond", name: "Test Pond" });

      const caught: unknown[] = [];
      restored.on("fish-caught", (e) => caught.push(e));
      restored.tick();
      restored.tick();
      expect(caught).toHaveLength(0); // re-armed to catchTicks (3), not resumed at 2 remaining
      restored.tick();
      expect(caught).toHaveLength(1);
    });
  });
});

/** "gauntlet" (fixtureContent): meadow-hosted, waves ["dummy", "dummy", "boss-dummy"], chest
 * [gold ×50 guaranteed, bronze-sword 50% chance]. */
function dungeonEngine(seed = 1) {
  return createEngine(fixtureContent, seededRng(seed));
}

describe("Dungeons", () => {
  describe("enterDungeon", () => {
    it("throws on an unknown dungeon id", () => {
      expect(() => dungeonEngine().enterDungeon("nonexistent")).toThrow(/unknown dungeon/i);
    });

    it("throws when the host Area is locked", () => {
      const lockedDungeonContent = {
        ...fixtureContent,
        dungeons: [
          ...fixtureContent.dungeons,
          {
            id: "crypt-dungeon",
            name: "Crypt Dungeon",
            areaId: "crypt",
            waves: ["dummy"],
            chest: [{ itemId: "gold", qty: 1, chance: 1, band: "guaranteed" as const }],
          },
        ],
      };
      expect(() =>
        createEngine(lockedDungeonContent, seededRng(1)).enterDungeon("crypt-dungeon"),
      ).toThrow(/Test Crypt is locked — defeat The Gauntlet/);
    });

    it("spawns the first Wave at full HP and populates the dungeon Snapshot (1-based wave)", () => {
      const engine = dungeonEngine();
      engine.enterDungeon("gauntlet");
      const snap = engine.snapshot();
      expect(snap.dungeon).toEqual({
        id: "gauntlet",
        name: "The Gauntlet",
        wave: 1,
        totalWaves: 3,
      });
      expect(snap.monster).toEqual({ id: "dummy", name: "Training Dummy", hp: 3, maxHp: 3 });
    });

    it("clears any selected Fishing Spot on entry", () => {
      const engine = dungeonEngine();
      engine.selectFishingSpot("pond");
      expect(engine.snapshot().fishing).not.toBeNull();

      engine.enterDungeon("gauntlet");
      expect(engine.snapshot().fishing).toBeNull();
      expect(engine.snapshot().monster?.id).toBe("dummy");
    });

    it("succeeds mid-Respawn: cancels it and floors hp to at least 1, mirroring selectMonster", () => {
      const engine = createEngine(fiercerDummyContent(), seededRng(42));
      engine.selectMonster("dummy");
      let died = false;
      engine.on("death", () => {
        died = true;
      });
      for (let i = 0; i < 5000 && !died; i++) engine.tick();
      expect(died).toBe(true);
      expect(engine.snapshot().player.respawning).toBe(true);
      expect(engine.snapshot().player.hp).toBe(0);

      engine.enterDungeon("gauntlet");
      const player = engine.snapshot().player;
      expect(player.respawning).toBe(false);
      expect(player.hp).toBeGreaterThanOrEqual(1);
      expect(engine.snapshot().dungeon).toEqual({
        id: "gauntlet",
        name: "The Gauntlet",
        wave: 1,
        totalWaves: 3,
      });
    });
  });

  describe("abandoning a run", () => {
    it("selectMonster abandons an active Dungeon run, leaving dungeon null", () => {
      const engine = dungeonEngine();
      engine.enterDungeon("gauntlet");
      expect(engine.snapshot().dungeon).not.toBeNull();

      engine.selectMonster("dummy");
      expect(engine.snapshot().dungeon).toBeNull();
      expect(engine.snapshot().monster?.id).toBe("dummy");
    });

    it("selectFishingSpot abandons an active Dungeon run, leaving dungeon null", () => {
      const engine = dungeonEngine();
      engine.enterDungeon("gauntlet");
      expect(engine.snapshot().dungeon).not.toBeNull();

      engine.selectFishingSpot("pond");
      expect(engine.snapshot().dungeon).toBeNull();
      expect(engine.snapshot().fishing).not.toBeNull();
    });
  });

  describe("Wave progression", () => {
    it("killing each wave advances with correct wave-cleared i/N events; wave Monsters still roll their normal Drop Table", () => {
      const engine = dungeonEngine(5);
      const waveCleared: { dungeonId: string; wave: number; totalWaves: number }[] = [];
      const kills: string[] = [];
      engine.on("wave-cleared", (e) =>
        waveCleared.push({ dungeonId: e.dungeonId, wave: e.wave, totalWaves: e.totalWaves }),
      );
      engine.on("kill", (e) => kills.push(e.monsterId));
      engine.enterDungeon("gauntlet");

      for (let i = 0; i < 5000 && waveCleared.length < 2; i++) engine.tick();

      expect(waveCleared).toEqual([
        { dungeonId: "gauntlet", wave: 1, totalWaves: 3 },
        { dungeonId: "gauntlet", wave: 2, totalWaves: 3 },
      ]);
      expect(kills).toEqual(["dummy", "dummy"]);
      const snap = engine.snapshot();
      expect(snap.dungeon).toEqual({
        id: "gauntlet",
        name: "The Gauntlet",
        wave: 3,
        totalWaves: 3,
      });
      expect(snap.monster).toEqual({ id: "boss-dummy", name: "Boss Dummy", hp: 5, maxHp: 5 });
      // wave Monsters still roll their normal Drop Table (guaranteed gold ×5 lands on every kill,
      // credited straight to gold, #59).
      expect(snap.player.gold).toBeGreaterThanOrEqual(10);
    });
  });

  describe("Boss kill and the Chest", () => {
    it("rolls the Chest, credits/banks its items, fires dungeon-completed then chest-opened exactly once each, marks the dungeon completed, and ejects to idle", () => {
      const engine = dungeonEngine(5);
      const order: string[] = [];
      let chestItems: { itemId: string; qty: number; band: string }[] = [];
      let completedCount = 0;
      let chestOpenedCount = 0;
      engine.on("dungeon-completed", (e) => {
        completedCount++;
        order.push(`completed:${e.dungeonId}`);
      });
      engine.on("chest-opened", (e) => {
        chestOpenedCount++;
        chestItems = e.items;
        order.push(`chest:${e.dungeonId}`);
      });
      engine.enterDungeon("gauntlet");

      for (let i = 0; i < 5000 && completedCount === 0; i++) engine.tick();

      expect(completedCount).toBe(1);
      expect(chestOpenedCount).toBe(1);
      expect(order).toEqual(["completed:gauntlet", "chest:gauntlet"]);
      expect(chestItems).toContainEqual({ itemId: "gold", qty: 50, band: "guaranteed" });
      // No per-item `drop` events fire for the Chest — only chest-opened reports its contents.

      const snap = engine.snapshot();
      expect(snap.player.completedDungeonIds).toEqual(["gauntlet"]);
      expect(snap.monster).toBeNull();
      expect(snap.dungeon).toBeNull();
      expect(snap.player.gold).toBeGreaterThanOrEqual(50); // the Chest's guaranteed 50 gold landed
    });

    it("Chest rolls do not emit per-item drop events (unlike each wave kill's own Drop Table roll)", () => {
      const engine = dungeonEngine(5);
      const goldDrops: number[] = [];
      engine.on("drop", (e) => {
        if (e.itemId === "gold") goldDrops.push(e.qty);
      });
      let completed = false;
      engine.on("dungeon-completed", () => {
        completed = true;
      });
      engine.enterDungeon("gauntlet");
      for (let i = 0; i < 5000 && !completed; i++) engine.tick();
      expect(completed).toBe(true);

      // 3 kills total (2 "dummy" waves + the "boss-dummy" boss) each still roll their own Drop
      // Table and emit a `drop` (guaranteed gold: 5, 5, then 10) — but the Chest's own guaranteed
      // 50 gold lands with no matching `drop` event.
      expect(goldDrops).toEqual([5, 5, 10]);
      expect(engine.snapshot().player.gold).toBeGreaterThanOrEqual(5 + 5 + 10 + 50);
    });

    it("the Chest's chance entry (50%) rolls independently of the guaranteed entry across many completions", () => {
      const engine = dungeonEngine(777);
      let completions = 0;
      let swordCount = 0;
      engine.on("chest-opened", (e) => {
        completions++;
        if (e.items.some((i) => i.itemId === "bronze-sword")) swordCount++;
        expect(e.items.some((i) => i.itemId === "gold" && i.qty === 50)).toBe(true); // guaranteed, every time
      });
      engine.enterDungeon("gauntlet");
      for (let i = 0; i < 400_000 && completions < 80; i++) {
        engine.tick();
        const snap = engine.snapshot();
        if (snap.dungeon === null && snap.monster === null) engine.enterDungeon("gauntlet");
      }

      expect(completions).toBeGreaterThanOrEqual(80);
      const rate = swordCount / completions;
      expect(rate).toBeGreaterThan(0.3);
      expect(rate).toBeLessThan(0.7);
    });
  });

  describe("Death mid-run", () => {
    /** A near-lethal "dummy" (gauntlet's wave 1/2 Monster) so the player dies well inside wave 1,
     * long before the Dungeon could otherwise complete — fiercerDummyContent's milder boost (used
     * for open-world combat tests) is too slow to guarantee that here. */
    function lethalDungeonContent() {
      return {
        ...fixtureContent,
        monsters: fixtureContent.monsters.map((m) =>
          m.id === "dummy" ? { ...m, attackLevel: 99, maxHit: 20, attackSpeed: 1 } : m,
        ),
      };
    }

    it("death fires, the run is abandoned immediately, Respawn completes to idle with no auto-resume, and re-entry restarts at wave 1", () => {
      const engine = createEngine(lethalDungeonContent(), seededRng(42));
      let died = false;
      engine.on("death", () => {
        died = true;
      });
      engine.enterDungeon("gauntlet");

      for (let i = 0; i < 5000 && !died; i++) engine.tick();
      expect(died).toBe(true);
      // abandoned in the very same Tick as death, before Respawn even starts counting down.
      expect(engine.snapshot().dungeon).toBeNull();
      expect(engine.snapshot().monster).toBeNull();
      expect(engine.snapshot().player.respawning).toBe(true);

      // Respawn still counts down to completion (guarded spawn: no Monster selected to resume);
      // RESPAWN_TICKS is 8, so 10 more Ticks is enough to see it through.
      for (let i = 0; i < 10; i++) engine.tick();
      const snap = engine.snapshot();
      expect(snap.player.respawning).toBe(false);
      expect(snap.player.hp).toBe(snap.player.maxHp);
      expect(snap.monster).toBeNull();
      expect(snap.dungeon).toBeNull();

      // Re-entering restarts at wave 1 regardless of progress before death (all-or-nothing).
      engine.enterDungeon("gauntlet");
      expect(engine.snapshot().dungeon).toEqual({
        id: "gauntlet",
        name: "The Gauntlet",
        wave: 1,
        totalWaves: 3,
      });
      expect(engine.snapshot().monster?.id).toBe("dummy");
    });
  });

  describe("save/load", () => {
    it("a save captured mid-run loads ejected/idle: the dungeon-only Boss never spawns from a save", () => {
      const engine = dungeonEngine(3);
      const waveCleared: number[] = [];
      engine.on("wave-cleared", (e) => waveCleared.push(e.wave));
      engine.enterDungeon("gauntlet");
      for (let i = 0; i < 5000 && waveCleared.length < 2; i++) engine.tick();
      expect(waveCleared).toEqual([1, 2]);

      // Freshly spawned this same Tick: the naive load path (spawnMonster(saved.monster.id))
      // would turn this dungeon-only Boss into an infinitely farmable open-world Monster.
      const saved = engine.snapshot();
      expect(saved.dungeon).toEqual({
        id: "gauntlet",
        name: "The Gauntlet",
        wave: 3,
        totalWaves: 3,
      });
      expect(saved.monster?.id).toBe("boss-dummy");

      const restored = createEngine(
        fixtureContent,
        seededRng(1),
        JSON.parse(JSON.stringify(saved)),
      );
      const restoredSnap = restored.snapshot();
      expect(restoredSnap.dungeon).toBeNull();
      expect(restoredSnap.monster).toBeNull();
      expect(restoredSnap.player.respawning).toBe(false);
      expect(restoredSnap.player.hp).toBeGreaterThan(0);
    });

    it("completedDungeonIds round-trips through save/load", () => {
      const engine = dungeonEngine(5);
      let completed = false;
      engine.on("dungeon-completed", () => {
        completed = true;
      });
      engine.enterDungeon("gauntlet");
      for (let i = 0; i < 5000 && !completed; i++) engine.tick();
      expect(engine.snapshot().player.completedDungeonIds).toEqual(["gauntlet"]);

      const saved = engine.snapshot();
      const restored = createEngine(
        fixtureContent,
        seededRng(1),
        JSON.parse(JSON.stringify(saved)),
      );
      expect(restored.snapshot().player.completedDungeonIds).toEqual(["gauntlet"]);
    });

    it("a pre-feature save (no dungeon/completedDungeonIds keys at all) loads with none completed", () => {
      const legacySave = {
        player: {
          hp: 10,
          maxHp: 10,
          combatLevel: 3,
          combatStyle: "aggressive",
          autoEatThreshold: 0.5,
          skills: {
            attack: { level: 1, xp: 0 },
            strength: { level: 1, xp: 0 },
            defence: { level: 1, xp: 0 },
            hitpoints: { level: 10, xp: xpForLevel(10) },
          },
          equipment: { weapon: null, shield: null, head: null, body: null, legs: null },
          inventory: [],
          respawning: false,
          // no completedDungeonIds key: simulates a save written before this feature shipped
        },
        monster: null,
        areas: [],
        // no dungeon key either
      };
      const restored = createEngine(
        fixtureContent,
        seededRng(1),
        JSON.parse(JSON.stringify(legacySave)),
      );
      expect(restored.snapshot().player.completedDungeonIds).toEqual([]);
      expect(restored.snapshot().dungeon).toBeNull();
    });

    it("a pre-#24 save (no completedDungeonIds key, crypt unlocked:true in saved areas[]) migrates gauntlet into completedDungeonIds", () => {
      const preWaveSave = {
        player: {
          hp: 45,
          maxHp: 45,
          combatLevel: 45,
          combatStyle: "aggressive",
          autoEatThreshold: 0.5,
          skills: {
            attack: { level: 45, xp: xpForLevel(45) },
            strength: { level: 45, xp: xpForLevel(45) },
            defence: { level: 45, xp: xpForLevel(45) },
            hitpoints: { level: 45, xp: xpForLevel(45) },
          },
          equipment: { weapon: null, shield: null, head: null, body: null, legs: null },
          inventory: [],
          respawning: false,
          // no completedDungeonIds key: this save predates Dungeon-boss gating (#24), back when
          // the Crypt's `unlocked` flag was derived from combat level instead.
        },
        monster: null,
        areas: [
          {
            id: "meadow",
            name: "Test Meadow",
            unlocked: true,
            monsterIds: ["dummy"],
            fishingSpots: [{ id: "pond", unlocked: true }],
          },
          {
            id: "crypt",
            name: "Test Crypt",
            unlocked: true,
            monsterIds: ["brute"],
            fishingSpots: [{ id: "deep-pond", unlocked: true }],
          },
        ],
        // no dungeon key either
      };
      const restored = createEngine(
        fixtureContent,
        seededRng(1),
        JSON.parse(JSON.stringify(preWaveSave)),
      );
      expect(restored.snapshot().player.completedDungeonIds).toEqual(["gauntlet"]);
      expect(restored.snapshot().areas.find((a) => a.id === "crypt")?.unlocked).toBe(true);
    });

    it("a pre-#24 save with crypt unlocked:false in saved areas[] stays locked (nothing migrated)", () => {
      const preWaveSave = {
        player: {
          hp: 10,
          maxHp: 10,
          combatLevel: 3,
          combatStyle: "aggressive",
          autoEatThreshold: 0.5,
          skills: {
            attack: { level: 1, xp: 0 },
            strength: { level: 1, xp: 0 },
            defence: { level: 1, xp: 0 },
            hitpoints: { level: 10, xp: xpForLevel(10) },
          },
          equipment: { weapon: null, shield: null, head: null, body: null, legs: null },
          inventory: [],
          respawning: false,
        },
        monster: null,
        areas: [
          {
            id: "meadow",
            name: "Test Meadow",
            unlocked: true,
            monsterIds: ["dummy"],
            fishingSpots: [{ id: "pond", unlocked: true }],
          },
          {
            id: "crypt",
            name: "Test Crypt",
            unlocked: false,
            monsterIds: ["brute"],
            fishingSpots: [{ id: "deep-pond", unlocked: false }],
          },
        ],
      };
      const restored = createEngine(
        fixtureContent,
        seededRng(1),
        JSON.parse(JSON.stringify(preWaveSave)),
      );
      expect(restored.snapshot().player.completedDungeonIds).toEqual([]);
      expect(restored.snapshot().areas.find((a) => a.id === "crypt")?.unlocked).toBe(false);
    });
  });
});

describe("Loot Zone (#60)", () => {
  /** Extends fixtureContent with 6-7 inert Material items ("junk-N"), purely so a test can pre-fill
   * the 10-stack Loot Zone with items that are NOT among dummy's own Drop Table entries (meat,
   * bronze-sword, lucky-charm) — fixtureContent alone doesn't have enough "other" items to reach
   * 10 distinct stacks. */
  function junkContent(junkCount: number) {
    return {
      ...fixtureContent,
      items: [
        ...fixtureContent.items,
        ...Array.from({ length: junkCount }, (_, i) => ({
          kind: "material" as const,
          id: `junk-${i}`,
          name: `Junk ${i}`,
          value: 1,
        })),
      ],
    };
  }

  it("kill Drops land in the Loot Zone, not the Bank, while combat continues; currency still credits gold directly, bypassing both", () => {
    const engine = freshEngine();
    engine.selectMonster("dummy");
    for (let i = 0; i < 2000; i++) engine.tick();
    const snap = engine.snapshot();
    expect(snap.bank.items).toEqual([]); // nothing reached the Bank mid-combat
    expect(snap.lootZone.length).toBeGreaterThan(0); // but Drops did land somewhere
    expect(snap.lootZone.some((s) => s.itemId === "gold")).toBe(false); // currency never enters the zone
    expect(snap.player.gold).toBeGreaterThan(0); // credited straight to gold instead
  });

  it("Dungeon Chest items land in the Loot Zone too, at the moment the Chest opens, before the same-Tick auto-sweep clears it", () => {
    const guaranteedChestContent = {
      ...fixtureContent,
      dungeons: fixtureContent.dungeons.map((d) =>
        d.id === "gauntlet"
          ? { ...d, chest: d.chest.map((entry) => ({ ...entry, chance: 1 })) }
          : d,
      ),
    };
    const engine = createEngine(guaranteedChestContent, seededRng(5));
    engine.enterDungeon("gauntlet");
    let zoneAtChestOpen: { itemId: string; qty: number }[] | undefined;
    engine.on("chest-opened", () => {
      zoneAtChestOpen = engine.snapshot().lootZone;
    });
    let completed = false;
    engine.on("dungeon-completed", () => {
      completed = true;
    });
    for (let i = 0; i < 5000 && !completed; i++) engine.tick();

    expect(completed).toBe(true);
    expect(zoneAtChestOpen).toBeDefined();
    expect(zoneAtChestOpen!.some((s) => s.itemId === "bronze-sword")).toBe(true);
    expect(engine.snapshot().lootZone).toEqual([]); // then swept away by the same-Tick auto-loot
    expect(engine.snapshot().bank.items.some((s) => s.itemId === "bronze-sword")).toBe(true);
  });

  it("an 11th distinct zone stack auto-sells (sellable) or discards (unsellable), the same overflow rule/events as a full Bank (#59); a sweep never touches the overflowed items", () => {
    const content = junkContent(7);
    const engine = createEngine(
      content,
      seededRng(1),
      makeSnapshot({
        lootZone: [
          { itemId: "bar", qty: 1 },
          { itemId: "bow", qty: 1 },
          { itemId: "staff", qty: 1 },
          { itemId: "junk-0", qty: 1 },
          { itemId: "junk-1", qty: 1 },
          { itemId: "junk-2", qty: 1 },
          { itemId: "junk-3", qty: 1 },
          { itemId: "junk-4", qty: 1 },
          { itemId: "junk-5", qty: 1 },
          { itemId: "junk-6", qty: 1 }, // 10 stacks: the zone is already at capacity
        ],
      }),
    );
    const sold: { itemId: string; qty: number; gold: number }[] = [];
    const lost: { itemId: string; qty: number }[] = [];
    engine.on("overflow-sold", (e) => sold.push({ itemId: e.itemId, qty: e.qty, gold: e.gold }));
    engine.on("overflow-lost", (e) => lost.push({ itemId: e.itemId, qty: e.qty }));

    engine.selectMonster("dummy");
    // dummy's Drop Table (meat/bronze-sword/lucky-charm) are all brand-new to this zone — any of
    // them landing is a genuine 11th stack.
    for (let i = 0; i < 20_000 && sold.length === 0 && lost.length === 0; i++) engine.tick();

    expect(sold.length + lost.length).toBeGreaterThan(0);
    expect(engine.snapshot().lootZone).toHaveLength(10); // unchanged — overflow never touches the zone
  });

  it("a Drop that tops up an existing zone stack always fits, even with the zone already holding 10 stacks", () => {
    const content = junkContent(6);
    const engine = createEngine(
      content,
      seededRng(1),
      makeSnapshot({
        lootZone: [
          { itemId: "meat", qty: 1 }, // one of dummy's own Drops — already has a stack here
          { itemId: "bow", qty: 1 },
          { itemId: "staff", qty: 1 },
          { itemId: "junk-0", qty: 1 },
          { itemId: "junk-1", qty: 1 },
          { itemId: "junk-2", qty: 1 },
          { itemId: "junk-3", qty: 1 },
          { itemId: "junk-4", qty: 1 },
          { itemId: "junk-5", qty: 1 },
          { itemId: "bar", qty: 1 }, // 10 stacks: the zone is already at capacity
        ],
      }),
    );
    let overflowed = false;
    engine.on("overflow-sold", () => {
      overflowed = true;
    });
    engine.on("overflow-lost", () => {
      overflowed = true;
    });

    engine.selectMonster("dummy");
    for (
      let i = 0;
      i < 20_000 && (engine.snapshot().lootZone.find((s) => s.itemId === "meat")?.qty ?? 0) <= 1;
      i++
    ) {
      engine.tick();
    }

    expect(overflowed).toBe(false);
    expect(engine.snapshot().lootZone).toHaveLength(10); // still exactly 10 stacks
    const meatQty = engine.snapshot().lootZone.find((s) => s.itemId === "meat")?.qty ?? 0;
    expect(meatQty).toBeGreaterThan(1); // topped up despite the zone already being "full"
  });

  describe("Auto-loot sweep triggers", () => {
    it("selectFishingSpot sweeps the Loot Zone into the Bank before switching activity", () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({ lootZone: [{ itemId: "meat", qty: 3 }] }),
      );
      const looted: { itemId: string; qty: number }[][] = [];
      engine.on("looted", (e) => looted.push(e.items));

      engine.selectFishingSpot("pond");

      expect(engine.snapshot().lootZone).toEqual([]);
      expect(engine.snapshot().bank.items).toEqual([{ itemId: "meat", qty: 3 }]);
      expect(looted).toEqual([[{ itemId: "meat", qty: 3 }]]);
    });

    it("selectRecipe sweeps the Loot Zone into the Bank before switching activity", () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({
          bank: { items: [{ itemId: "bar", qty: 1 }] },
          lootZone: [{ itemId: "meat", qty: 3 }],
        }),
      );
      const looted: { itemId: string; qty: number }[][] = [];
      engine.on("looted", (e) => looted.push(e.items));

      engine.selectRecipe("test-sword");

      expect(engine.snapshot().lootZone).toEqual([]);
      expect(engine.snapshot().bank.items).toEqual(
        expect.arrayContaining([{ itemId: "meat", qty: 3 }]),
      );
      expect(looted).toEqual([[{ itemId: "meat", qty: 3 }]]);
    });

    it("enterDungeon sweeps the Loot Zone into the Bank before the run starts — open-world loot is banked first", () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({ lootZone: [{ itemId: "meat", qty: 5 }] }),
      );

      engine.enterDungeon("gauntlet");

      expect(engine.snapshot().bank.items).toEqual([{ itemId: "meat", qty: 5 }]);
      expect(engine.snapshot().lootZone).toEqual([]); // the run starts with an empty zone
    });

    it("dungeon completion sweeps the run's own Loot Zone (wave Drops + Chest) into the Bank", () => {
      const engine = dungeonEngine(5); // known seed: completes "gauntlet" within 5000 Ticks
      let completed = false;
      engine.on("dungeon-completed", () => {
        completed = true;
      });
      engine.enterDungeon("gauntlet");
      for (let i = 0; i < 5000 && !completed; i++) engine.tick();

      expect(completed).toBe(true);
      expect(engine.snapshot().lootZone).toEqual([]); // a fresh Bank has plenty of room
      expect(engine.snapshot().bank.items.length).toBeGreaterThan(0);
    });

    it("selectMonster does NOT sweep — switching Monsters, or abandoning a Dungeon run, leaves the zone exactly as-is", () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({ lootZone: [{ itemId: "meat", qty: 3 }] }),
      );
      const looted: unknown[] = [];
      engine.on("looted", (e) => looted.push(e));

      engine.selectMonster("dummy");

      expect(engine.snapshot().lootZone).toEqual([{ itemId: "meat", qty: 3 }]);
      expect(engine.snapshot().bank.items).toEqual([]);
      expect(looted).toEqual([]);
    });

    it("open-world death does NOT sweep or touch the Loot Zone at all — the same fight resumes with the zone untouched", () => {
      const engine = createEngine(
        fiercerDummyContent(),
        seededRng(42),
        makeSnapshot({ lootZone: [{ itemId: "meat", qty: 3 }] }),
      );
      engine.selectMonster("dummy");
      let died = false;
      engine.on("death", () => {
        died = true;
      });
      engine.on("dungeon-failed", () => {
        throw new Error("dungeon-failed must never fire for open-world death");
      });
      for (let i = 0; i < 5000 && !died; i++) engine.tick();

      expect(died).toBe(true);
      const meatQty = engine.snapshot().lootZone.find((s) => s.itemId === "meat")?.qty ?? 0;
      expect(meatQty).toBeGreaterThanOrEqual(3); // the seeded stack survives untouched (maybe topped up)
      expect(engine.snapshot().bank.items).toEqual([]); // never swept
    });
  });

  describe("Dungeon runs are all-or-nothing for loot too (owner amendment)", () => {
    it("death mid-Dungeon-run empties the Loot Zone (the failed run's own Drops are lost, not banked) and emits dungeon-failed with exactly the lost stacks", () => {
      // fiercerDummyContent's "dummy" is calibrated (elsewhere in this file) to eventually kill the
      // player by attrition over a few thousand Ticks while still landing kills of its own along the
      // way — but gauntlet's stock 2-wave run finishes (ejecting to idle) long before that exposure
      // accumulates. Stretch it to many "dummy" Waves before the Boss so there's enough runway for
      // both a kill (Wave 1 alone, dummy only has 3 HP) and, eventually, a death.
      const base = fiercerDummyContent();
      const manyWavesContent = {
        ...base,
        dungeons: base.dungeons.map((d) =>
          d.id === "gauntlet" ? { ...d, waves: [...Array(20).fill("dummy"), "boss-dummy"] } : d,
        ),
      };
      const engine = createEngine(manyWavesContent, seededRng(3)); // seed pinned: produces a real
      // (non-currency) Drop before the eventual death, so the Loot Zone genuinely has something to
      // lose — not just a hypothetically-empty one.
      let died = false;
      engine.on("death", () => {
        died = true;
      });
      let failed: { dungeonId: string; lostItems: { itemId: string; qty: number }[] } | undefined;
      engine.on("dungeon-failed", (e) => {
        failed = { dungeonId: e.dungeonId, lostItems: [...e.lostItems] };
      });
      engine.enterDungeon("gauntlet");
      let sawNonEmptyZone = false;
      for (let i = 0; i < 5000 && !died; i++) {
        engine.tick();
        if (engine.snapshot().lootZone.length > 0) sawNonEmptyZone = true;
      }

      expect(died).toBe(true);
      expect(sawNonEmptyZone).toBe(true); // the run did accumulate its own Loot Zone stacks first
      expect(failed).toBeDefined();
      expect(failed!.dungeonId).toBe("gauntlet");
      expect(failed!.lostItems.length).toBeGreaterThan(0);
      expect(engine.snapshot().lootZone).toEqual([]); // emptied, not swept
      expect(engine.snapshot().bank.items).toEqual([]); // none of the lost stacks reached the Bank
    });

    it("open-world death is unchanged: no dungeon-failed, no loss, the same fight resumes", () => {
      const engine = createEngine(fiercerDummyContent(), seededRng(42));
      engine.selectMonster("dummy");
      let died = false;
      engine.on("death", () => {
        died = true;
      });
      const failures: unknown[] = [];
      engine.on("dungeon-failed", (e) => failures.push(e));
      for (let i = 0; i < 5000 && !died; i++) engine.tick();

      expect(died).toBe(true);
      expect(failures).toEqual([]);
    });
  });

  describe("Sweep semantics: bank what fits, leave the rest, never sell", () => {
    it("a sweep banks a top-up plus a stack that already has room, and leaves a stack needing a NEW Bank Slot in the zone untouched — never sold", () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({
          bank: { items: [{ itemId: "bar", qty: 1 }], capacity: 1 }, // full: 1/1, holding "bar"
          lootZone: [
            { itemId: "bar", qty: 2 }, // tops up the existing Bank stack — always fits
            { itemId: "meat", qty: 3 }, // needs a brand-new Bank Slot — Bank is full, stays put
          ],
        }),
      );
      const looted: { itemId: string; qty: number }[][] = [];
      engine.on("looted", (e) => looted.push(e.items));
      const overflowEvents: unknown[] = [];
      engine.on("overflow-sold", (e) => overflowEvents.push(e));
      engine.on("overflow-lost", (e) => overflowEvents.push(e));

      engine.lootAll();

      expect(engine.snapshot().bank.items).toEqual([{ itemId: "bar", qty: 3 }]);
      expect(engine.snapshot().lootZone).toEqual([{ itemId: "meat", qty: 3 }]); // left behind, not sold
      expect(looted).toEqual([[{ itemId: "bar", qty: 2 }]]);
      expect(overflowEvents).toEqual([]); // a sweep never sells — only zone-full overflow does that
    });

    it("lootAll is idempotent and never throws — against an empty zone, a partially-blocked one, or repeated calls", () => {
      const empty = freshEngine();
      expect(() => empty.lootAll()).not.toThrow();
      expect(() => empty.lootAll()).not.toThrow();
      expect(empty.snapshot().lootZone).toEqual([]);

      const blocked = createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({
          bank: { items: [{ itemId: "bar", qty: 1 }], capacity: 1 },
          lootZone: [{ itemId: "meat", qty: 3 }],
        }),
      );
      expect(() => blocked.lootAll()).not.toThrow();
      const afterFirst = blocked.snapshot().lootZone;
      expect(() => blocked.lootAll()).not.toThrow(); // second call moves nothing new — still no throw
      expect(blocked.snapshot().lootZone).toEqual(afterFirst);
    });
  });

  describe("save/load", () => {
    it("the Loot Zone persists across save/load", () => {
      const original = createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({
          lootZone: [
            { itemId: "meat", qty: 4 },
            { itemId: "bar", qty: 1 },
          ],
        }),
      );
      const saved = original.snapshot();
      const restored = createEngine(
        fixtureContent,
        seededRng(1),
        JSON.parse(JSON.stringify(saved)),
      );

      expect(restored.snapshot().lootZone).toEqual(
        expect.arrayContaining([
          { itemId: "meat", qty: 4 },
          { itemId: "bar", qty: 1 },
        ]),
      );
      expect(restored.snapshot().lootZone).toHaveLength(2);
    });

    it("a pre-#60 save with no lootZone key at all loads with an empty zone", () => {
      const legacySave = {
        player: {
          hp: 10,
          maxHp: 10,
          combatLevel: 3,
          combatStyle: "aggressive",
          autoEatThreshold: 0.5,
          skills: {
            attack: { level: 1, xp: 0 },
            strength: { level: 1, xp: 0 },
            defence: { level: 1, xp: 0 },
            hitpoints: { level: 10, xp: xpForLevel(10) },
          },
          equipment: { weapon: null, shield: null, head: null, body: null, legs: null },
          respawning: false,
        },
        monster: null,
        areas: [],
        // no lootZone key: simulates a save written before this feature shipped
      };
      const restored = createEngine(
        fixtureContent,
        seededRng(1),
        JSON.parse(JSON.stringify(legacySave)),
      );
      expect(restored.snapshot().lootZone).toEqual([]);
    });

    it("Loot Zone entries for an unknown itemId, the currency id, or an invalid qty are dropped on load", () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({
          lootZone: [
            { itemId: "unobtainium", qty: 3 },
            { itemId: "gold", qty: 50 }, // currency never legitimately sits in the zone — dropped
            { itemId: "meat", qty: 0 },
            { itemId: "bronze-sword", qty: 1.5 },
            { itemId: "lucky-charm", qty: 2 },
          ],
        }),
      );
      expect(engine.snapshot().lootZone).toEqual([{ itemId: "lucky-charm", qty: 2 }]);
    });
  });
});

/** fixtureContent's Smithing fixtures: material "bar", recipe "test-sword" (1 bar -> bronze-sword,
 * lvl 1, xp 10, craftTicks 3), and recipe "test-charm" (3 bar -> lucky-charm, lvl 20, xp 40,
 * craftTicks 5) for gate tests independent of the level-1 recipe. */
function smithingSnapshot(barQty: number, smithingLevel = 1, smithingXp = 0) {
  return makeSnapshot({
    player: {
      skills: { smithing: { level: smithingLevel, xp: smithingXp } },
    },
    bank: { items: [{ itemId: "bar", qty: barQty }] },
  });
}

describe("Smithing", () => {
  it("selectRecipe crafts repeatedly: consumes inputs at completion, grants output + Smithing XP, emits one item-crafted per craft, and auto-stops to idle when inputs run out", () => {
    const engine = createEngine(fixtureContent, seededRng(1), smithingSnapshot(2));
    const crafted: { recipeId: string; itemId: string }[] = [];
    engine.on("item-crafted", (e) => crafted.push({ recipeId: e.recipeId, itemId: e.itemId }));

    engine.selectRecipe("test-sword");
    expect(engine.snapshot().smithing).toEqual({ recipeId: "test-sword", name: "Test Sword" });

    for (let i = 0; i < 3; i++) engine.tick(); // test-sword.craftTicks === 3
    expect(crafted).toEqual([{ recipeId: "test-sword", itemId: "bronze-sword" }]);
    let snap = engine.snapshot();
    expect(snap.bank.items.find((s) => s.itemId === "bar")?.qty).toBe(1);
    expect(snap.bank.items.find((s) => s.itemId === "bronze-sword")?.qty).toBe(1);
    expect(snap.player.skills.smithing.xp).toBe(10);
    expect(snap.smithing).toEqual({ recipeId: "test-sword", name: "Test Sword" }); // 1 bar left: re-armed

    for (let i = 0; i < 3; i++) engine.tick();
    expect(crafted).toHaveLength(2);
    snap = engine.snapshot();
    expect(snap.bank.items.find((s) => s.itemId === "bar")).toBeUndefined();
    expect(snap.bank.items.find((s) => s.itemId === "bronze-sword")?.qty).toBe(2);
    expect(snap.player.skills.smithing.xp).toBe(20);
    expect(snap.smithing).toBeNull(); // no bars left for another craft: auto-stopped to idle
  });

  it("throws on an unknown Recipe id", () => {
    expect(() => freshEngine().selectRecipe("mithril-scimitar")).toThrow(/unknown/i);
  });

  it("throws for insufficient Smithing level", () => {
    const engine = createEngine(fixtureContent, seededRng(1), smithingSnapshot(5));
    expect(() => engine.selectRecipe("test-charm")).toThrow(/smithing level 20/i);
  });

  it("throws for insufficient inputs to craft even once", () => {
    const engine = createEngine(fixtureContent, seededRng(1), smithingSnapshot(0));
    expect(() => engine.selectRecipe("test-sword")).toThrow(/insufficient/i);
  });

  it("succeeds once Smithing level and inputs are both sufficient", () => {
    const engine = createEngine(
      fixtureContent,
      seededRng(1),
      smithingSnapshot(5, 20, xpForLevel(20)),
    );
    expect(() => engine.selectRecipe("test-charm")).not.toThrow();
    expect(engine.snapshot().smithing).toEqual({ recipeId: "test-charm", name: "Test Charm" });
  });

  it("succeeds mid-Respawn: cancels it and floors hp to at least 1, mirroring selectMonster/selectFishingSpot/enterDungeon", () => {
    const engine = createEngine(
      fiercerDummyContent(),
      seededRng(42),
      makeSnapshot({ bank: { items: [{ itemId: "bar", qty: 5 }] } }),
    );
    engine.selectMonster("dummy");
    let died = false;
    engine.on("death", () => {
      died = true;
    });
    for (let i = 0; i < 5000 && !died; i++) engine.tick();
    expect(died).toBe(true);
    expect(engine.snapshot().player.respawning).toBe(true);
    expect(engine.snapshot().player.hp).toBe(0);

    engine.selectRecipe("test-sword");
    const player = engine.snapshot().player;
    expect(player.respawning).toBe(false);
    expect(player.hp).toBeGreaterThanOrEqual(1);
    expect(engine.snapshot().monster).toBeNull();
    expect(engine.snapshot().smithing).not.toBeNull();
  });

  it("Smithing XP never moves combatLevel() or Area unlocks", () => {
    const engine = createEngine(fixtureContent, seededRng(1), smithingSnapshot(200));
    const before = engine.snapshot();
    engine.selectRecipe("test-sword");
    for (let i = 0; i < 3000; i++) engine.tick();
    const after = engine.snapshot();

    expect(after.player.skills.smithing.xp).toBeGreaterThan(0);
    expect(after.player.combatLevel).toBe(before.player.combatLevel);
    expect(after.areas.find((a) => a.id === "crypt")?.unlocked).toBe(
      before.areas.find((a) => a.id === "crypt")?.unlocked,
    );
  });

  describe("pinned decisions while smithing", () => {
    function damagedSmithingSnapshot(hp: number) {
      return makeSnapshot({
        player: {
          hp,
          maxHp: 10,
          skills: { hitpoints: { level: 10, xp: xpForLevel(10) } },
        },
        bank: {
          items: [
            { itemId: "bar", qty: 100 },
            { itemId: "meat", qty: 5 },
          ],
        },
      });
    }

    it("passive regen continues while smithing (downtime heals)", () => {
      const engine = createEngine(fixtureContent, seededRng(1), damagedSmithingSnapshot(5));
      engine.selectRecipe("test-sword");
      for (let i = 0; i < 9; i++) engine.tick();
      expect(engine.snapshot().player.hp).toBe(5);
      engine.tick();
      expect(engine.snapshot().player.hp).toBe(6);
    });

    it("auto-eat never fires while smithing, even below the threshold with Food owned", () => {
      const engine = createEngine(fixtureContent, seededRng(1), damagedSmithingSnapshot(2));
      let ate = 0;
      engine.on("food-eaten", () => ate++);
      engine.selectRecipe("test-sword");
      for (let i = 0; i < 100; i++) engine.tick();
      expect(ate).toBe(0);
    });

    it("death cannot occur while smithing, even starting at 1 HP", () => {
      const engine = createEngine(fixtureContent, seededRng(1), damagedSmithingSnapshot(1));
      let died = false;
      engine.on("death", () => {
        died = true;
      });
      engine.selectRecipe("test-sword");
      for (let i = 0; i < 200; i++) engine.tick();
      expect(died).toBe(false);
      expect(engine.snapshot().player.hp).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Four-way mutual exclusion (#28)", () => {
    it("selecting a Recipe clears an active Monster, Fishing Spot, or Dungeon run", () => {
      const engine = createEngine(fixtureContent, seededRng(1), smithingSnapshot(5));

      engine.selectMonster("dummy");
      expect(engine.snapshot().monster).not.toBeNull();
      engine.selectRecipe("test-sword");
      expect(engine.snapshot().monster).toBeNull();
      expect(engine.snapshot().smithing).toEqual({ recipeId: "test-sword", name: "Test Sword" });

      engine.selectFishingSpot("pond");
      expect(engine.snapshot().smithing).toBeNull();
      engine.selectRecipe("test-sword");
      expect(engine.snapshot().fishing).toBeNull();
      expect(engine.snapshot().smithing).not.toBeNull();

      engine.enterDungeon("gauntlet");
      expect(engine.snapshot().smithing).toBeNull();
      expect(engine.snapshot().dungeon).not.toBeNull();
      engine.selectRecipe("test-sword");
      expect(engine.snapshot().dungeon).toBeNull();
      expect(engine.snapshot().smithing).toEqual({ recipeId: "test-sword", name: "Test Sword" });
    });

    it("selecting a Monster, a Fishing Spot, or a Dungeon each clear an active Smithing Recipe", () => {
      const engine = createEngine(fixtureContent, seededRng(1), smithingSnapshot(5));

      engine.selectRecipe("test-sword");
      expect(engine.snapshot().smithing).not.toBeNull();
      engine.selectMonster("dummy");
      expect(engine.snapshot().smithing).toBeNull();

      engine.selectRecipe("test-sword");
      expect(engine.snapshot().smithing).not.toBeNull();
      engine.selectFishingSpot("pond");
      expect(engine.snapshot().smithing).toBeNull();

      engine.selectRecipe("test-sword");
      expect(engine.snapshot().smithing).not.toBeNull();
      engine.enterDungeon("gauntlet");
      expect(engine.snapshot().smithing).toBeNull();
    });
  });

  describe("save/load", () => {
    it("a pre-feature save (no smithing key anywhere) loads at Smithing level 1 / 0 XP with a prior Fishing activity resumed unchanged", () => {
      const legacySave = {
        player: {
          hp: 3,
          maxHp: 3,
          combatLevel: 3,
          combatStyle: "aggressive",
          autoEatThreshold: 0.5,
          skills: {
            attack: { level: 1, xp: 0 },
            strength: { level: 1, xp: 0 },
            defence: { level: 1, xp: 0 },
            hitpoints: { level: 10, xp: xpForLevel(10) },
            fishing: { level: 1, xp: 0 },
            // no smithing key: simulates a save written before this feature shipped
          },
          equipment: { weapon: null, shield: null, head: null, body: null, legs: null },
          inventory: [],
          respawning: false,
        },
        monster: null,
        fishing: { spotId: "pond", name: "Test Pond" },
        // no top-level smithing key either
        areas: [],
      };
      const restored = createEngine(
        fixtureContent,
        seededRng(1),
        JSON.parse(JSON.stringify(legacySave)),
      );
      const snap = restored.snapshot();
      expect(snap.player.skills.smithing).toEqual({ level: 1, xp: 0 });
      expect(snap.smithing).toBeNull();
      expect(snap.fishing).toEqual({ spotId: "pond", name: "Test Pond" });
    });

    it("a save made while smithing resumes smithing on load, re-arming the cooldown to craftTicks", () => {
      const original = createEngine(fixtureContent, seededRng(1), smithingSnapshot(5));
      original.selectRecipe("test-sword");
      original.tick(); // 1 tick into a 3-tick cooldown; not yet due for a craft
      const saved = original.snapshot();
      expect(saved.smithing).toEqual({ recipeId: "test-sword", name: "Test Sword" });

      const restored = createEngine(
        fixtureContent,
        seededRng(7),
        JSON.parse(JSON.stringify(saved)),
      );
      expect(restored.snapshot().smithing).toEqual({ recipeId: "test-sword", name: "Test Sword" });

      const crafted: unknown[] = [];
      restored.on("item-crafted", (e) => crafted.push(e));
      restored.tick();
      restored.tick();
      expect(crafted).toHaveLength(0); // re-armed to craftTicks (3), not resumed at 2 remaining
      restored.tick();
      expect(crafted).toHaveLength(1);
    });

    it("a save whose smithing names an unknown recipe id loads idle instead of throwing", () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({ smithing: { recipeId: "mithril-scimitar", name: "?" } }),
      );
      expect(engine.snapshot().smithing).toBeNull();
    });

    it("a save whose smithing recipe is now under-leveled falls back to idle", () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({
          player: {
            skills: { smithing: { level: 1, xp: 0 } },
          },
          bank: { items: [{ itemId: "bar", qty: 5 }] },
          smithing: { recipeId: "test-charm", name: "Test Charm" }, // levelReq 20
        }),
      );
      expect(engine.snapshot().smithing).toBeNull();
    });

    it("a save whose smithing recipe's inputs are no longer sufficient falls back to idle", () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({
          player: { skills: { smithing: { level: 1, xp: 0 } } },
          smithing: { recipeId: "test-sword", name: "Test Sword" },
        }),
      );
      expect(engine.snapshot().smithing).toBeNull();
    });

    it("a corrupted save with both a Monster and a Smithing Recipe set resumes only the Monster (mutual exclusion on load)", () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({
          bank: { items: [{ itemId: "bar", qty: 5 }] },
          monster: { id: "dummy", name: "Training Dummy", hp: 3, maxHp: 3 },
          smithing: { recipeId: "test-sword", name: "Test Sword" },
        }),
      );
      const snap = engine.snapshot();
      expect(snap.monster).not.toBeNull();
      expect(snap.smithing).toBeNull();
    });

    it("a valid Smithing Snapshot still round-trips unchanged", () => {
      const original = createEngine(fixtureContent, seededRng(1), smithingSnapshot(5));
      original.selectRecipe("test-sword");
      for (let i = 0; i < 5; i++) original.tick();
      const saved = original.snapshot();

      const restored = createEngine(
        fixtureContent,
        seededRng(1),
        JSON.parse(JSON.stringify(saved)),
      );
      expect(restored.snapshot()).toEqual(saved);
    });
  });
});

describe("Ranged and Magic Skills (#7)", () => {
  describe("weapon-driven XP routing", () => {
    it("melee combat (no weapon, or a melee weapon) never touches Ranged or Magic XP", () => {
      const engine = freshEngine();
      engine.selectMonster("dummy");
      for (let i = 0; i < 400; i++) engine.tick();
      const { skills } = engine.snapshot().player;
      expect(skills.strength.xp).toBeGreaterThan(0); // unchanged: default aggressive style
      expect(skills.ranged.xp).toBe(0);
      expect(skills.magic.xp).toBe(0);
    });

    it("equipping the ranged Test Bow routes attack XP to Ranged instead of Attack/Strength/Defence, bypassing Combat Style; Hitpoints still trickles", () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(42),
        makeSnapshot({ player: { combatStyle: "aggressive", equipment: { weapon: "bow" } } }),
      );
      engine.selectMonster("dummy");
      for (let i = 0; i < 400; i++) engine.tick();
      const { skills } = engine.snapshot().player;
      expect(skills.ranged.xp).toBeGreaterThan(0);
      expect(skills.attack.xp).toBe(0);
      expect(skills.strength.xp).toBe(0);
      expect(skills.defence.xp).toBe(0);
      expect(skills.magic.xp).toBe(0);
      // makeSnapshot's fixture default starts Hitpoints at level 1 / 0 xp (unlike freshState's
      // level-10 default), so no baseline subtraction is needed here.
      expect(skills.hitpoints.xp).toBeCloseTo(skills.ranged.xp / 3, 6);
    });

    it("equipping the magic Test Staff routes attack XP to Magic instead of Attack/Strength/Defence, bypassing Combat Style; Hitpoints still trickles", () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(42),
        makeSnapshot({ player: { combatStyle: "accurate", equipment: { weapon: "staff" } } }),
      );
      engine.selectMonster("dummy");
      for (let i = 0; i < 400; i++) engine.tick();
      const { skills } = engine.snapshot().player;
      expect(skills.magic.xp).toBeGreaterThan(0);
      expect(skills.attack.xp).toBe(0);
      expect(skills.strength.xp).toBe(0);
      expect(skills.defence.xp).toBe(0);
      expect(skills.ranged.xp).toBe(0);
      // makeSnapshot's fixture default starts Hitpoints at level 1 / 0 xp (unlike freshState's
      // level-10 default), so no baseline subtraction is needed here.
      expect(skills.hitpoints.xp).toBeCloseTo(skills.magic.xp / 3, 6);
    });

    it("switching from a ranged weapon back to unarmed resumes ordinary Combat Style routing", () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(42),
        makeSnapshot({
          player: {
            combatStyle: "defensive",
            equipment: { weapon: "bow" },
          },
          bank: { items: [{ itemId: "bronze-sword", qty: 1 }] },
        }),
      );
      engine.selectMonster("dummy");
      for (let i = 0; i < 200; i++) engine.tick();
      expect(engine.snapshot().player.skills.ranged.xp).toBeGreaterThan(0);

      // Unequipping isn't a command (v1 has no "remove"), so swap to a melee weapon instead —
      // the fixture's bronze-sword — to exercise the mode falling back to Combat Style routing.
      engine.equip("bronze-sword");
      const before = engine.snapshot().player.skills;
      for (let i = 0; i < 200; i++) engine.tick();
      const after = engine.snapshot().player.skills;
      expect(after.defence.xp).toBeGreaterThan(before.defence.xp); // defensive style, now melee
      expect(after.ranged.xp).toBe(before.ranged.xp); // no further Ranged XP once swapped off
    });
  });

  describe("combat level: best of melee / Ranged / Magic (display-only since #24)", () => {
    function combatLevelSnapshot(skills: {
      attack: number;
      strength: number;
      defence: number;
      hitpoints: number;
      ranged: number;
      magic: number;
    }) {
      return makeSnapshot({
        player: {
          skills: {
            attack: { level: skills.attack, xp: xpForLevel(skills.attack) },
            strength: { level: skills.strength, xp: xpForLevel(skills.strength) },
            defence: { level: skills.defence, xp: xpForLevel(skills.defence) },
            hitpoints: { level: skills.hitpoints, xp: xpForLevel(skills.hitpoints) },
            ranged: { level: skills.ranged, xp: xpForLevel(skills.ranged) },
            magic: { level: skills.magic, xp: xpForLevel(skills.magic) },
          },
        },
      });
    }

    it("at equal levels across the board, the formula matches the pre-#7 melee-only formula unchanged", () => {
      // base (def+hp) = 1+10 = 11; top = max(atk+str=2, 2*ranged=2, 2*magic=2) = 2
      // combatLevel = floor((11 + 2) / 4) = floor(13/4) = 3 — same as freshEngine()'s combatLevel.
      const engine = createEngine(
        fixtureContent,
        seededRng(1),
        combatLevelSnapshot({
          attack: 1,
          strength: 1,
          defence: 1,
          hitpoints: 10,
          ranged: 1,
          magic: 1,
        }),
      );
      expect(engine.snapshot().player.combatLevel).toBe(3);
    });

    it("a melee-heavy build: melee's combined Attack+Strength wins over Ranged/Magic", () => {
      // base (def+hp) = 5+10 = 15; top = max(atk+str=20, 2*ranged=2, 2*magic=2) = 20
      // combatLevel = floor((15 + 20) / 4) = floor(35/4) = 8
      const engine = createEngine(
        fixtureContent,
        seededRng(1),
        combatLevelSnapshot({
          attack: 10,
          strength: 10,
          defence: 5,
          hitpoints: 10,
          ranged: 1,
          magic: 1,
        }),
      );
      expect(engine.snapshot().player.combatLevel).toBe(8);
    });

    it("a Ranged-heavy build: doubled Ranged level wins over a low melee/Magic total", () => {
      // base (def+hp) = 5+10 = 15; top = max(atk+str=2, 2*ranged=40, 2*magic=2) = 40
      // combatLevel = floor((15 + 40) / 4) = floor(55/4) = 13
      const engine = createEngine(
        fixtureContent,
        seededRng(1),
        combatLevelSnapshot({
          attack: 1,
          strength: 1,
          defence: 5,
          hitpoints: 10,
          ranged: 20,
          magic: 1,
        }),
      );
      expect(engine.snapshot().player.combatLevel).toBe(13);
    });

    it("a Magic-heavy build: doubled Magic level wins over a low melee/Ranged total", () => {
      // base (def+hp) = 1+10 = 11; top = max(atk+str=2, 2*ranged=2, 2*magic=30) = 30
      // combatLevel = floor((11 + 30) / 4) = floor(41/4) = 10
      const engine = createEngine(
        fixtureContent,
        seededRng(1),
        combatLevelSnapshot({
          attack: 1,
          strength: 1,
          defence: 1,
          hitpoints: 10,
          ranged: 1,
          magic: 15,
        }),
      );
      expect(engine.snapshot().player.combatLevel).toBe(10);
    });

    it("still never gates an Area unlock — combat level is display-only since #24", () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(1),
        combatLevelSnapshot({
          attack: 1,
          strength: 1,
          defence: 1,
          hitpoints: 10,
          ranged: 99,
          magic: 99,
        }),
      );
      const snap = engine.snapshot();
      expect(snap.player.combatLevel).toBeGreaterThan(50);
      expect(snap.areas.find((a) => a.id === "crypt")?.unlocked).toBe(false);
    });
  });

  describe("save/load", () => {
    it("a pre-migration save (only the original six Skills, no ranged/magic keys) loads with both at level 1 / 0 XP", () => {
      const legacySave = {
        player: {
          hp: 10,
          maxHp: 10,
          combatLevel: 3,
          combatStyle: "aggressive",
          autoEatThreshold: 0.5,
          skills: {
            attack: { level: 1, xp: 0 },
            strength: { level: 1, xp: 0 },
            defence: { level: 1, xp: 0 },
            hitpoints: { level: 10, xp: xpForLevel(10) },
            fishing: { level: 1, xp: 0 },
            smithing: { level: 1, xp: 0 },
            // no ranged/magic keys: simulates a save written before this feature shipped
          },
          equipment: { weapon: null, shield: null, head: null, body: null, legs: null },
          inventory: [],
          respawning: false,
        },
        monster: null,
        areas: [],
      };
      const restored = createEngine(
        fixtureContent,
        seededRng(1),
        JSON.parse(JSON.stringify(legacySave)),
      );
      const snap = restored.snapshot();
      expect(snap.player.skills.ranged).toEqual({ level: 1, xp: 0 });
      expect(snap.player.skills.magic).toEqual({ level: 1, xp: 0 });
      // the rest of the sweep is untouched by this migration
      expect(snap.player.skills.attack).toEqual({ level: 1, xp: 0 });
      expect(snap.player.skills.hitpoints).toEqual({ level: 10, xp: xpForLevel(10) });
    });

    it("a valid Snapshot carrying Ranged/Magic XP round-trips unchanged", () => {
      const original = createEngine(
        fixtureContent,
        seededRng(42),
        makeSnapshot({ player: { equipment: { weapon: "bow" } } }),
      );
      original.selectMonster("dummy");
      for (let i = 0; i < 200; i++) original.tick();
      const saved = original.snapshot();
      expect(saved.player.skills.ranged.xp).toBeGreaterThan(0);

      const restored = createEngine(
        fixtureContent,
        seededRng(1),
        JSON.parse(JSON.stringify(saved)),
      );
      expect(restored.snapshot()).toEqual(saved);
    });
  });
});
