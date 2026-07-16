import { describe, expect, it } from "vitest";
import { attackRoll, defenceRoll, effectiveLevel, hitChance, maxHit } from "./combat";
import { createEngine, UNARMED_SPEED } from "./engine";
import { fixtureContent } from "./fixture-content";
import { resolveContent } from "./validate-content";
import { makeSnapshot } from "./make-snapshot";
import { seededRng } from "./rng";
import { xpForLevel } from "./xp";
import { AUTO_EAT_THRESHOLDS } from "./types";
import type { AttackType, AutoEatThreshold, CombatStyle, Rng } from "./types";

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

describe("createEngine content resolution (#320)", () => {
  it("constructs from raw fixtureContent", () => {
    const engine = createEngine(fixtureContent, seededRng(1));
    expect(engine.snapshot().player.skills.attack.level).toBe(1);
  });

  it("constructs from pre-resolved fixtureContent with an equivalent initial snapshot", () => {
    // Fixed clock: snapshot() restamps savedAt (#69) on every call, so two real Date.now()
    // calls a millisecond apart would flake this equality — pin the clock instead.
    const now = () => 1_000_000;
    const fromRaw = createEngine(fixtureContent, seededRng(1), undefined, now);
    const fromResolved = createEngine(resolveContent(fixtureContent), seededRng(1), undefined, now);
    expect(fromResolved.snapshot()).toEqual(fromRaw.snapshot());
  });
});

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
        gatedBy: null,
        monsterIds: ["dummy"],
        fishingSpots: [{ id: "pond", unlocked: true }],
      },
      {
        id: "crypt",
        name: "Test Crypt",
        unlocked: false,
        gatedBy: { dungeonId: "gauntlet", name: "The Gauntlet" },
        monsterIds: ["brute"],
        fishingSpots: [{ id: "deep-pond", unlocked: false }],
      },
    ]);
  });

  it("gatedBy is null for an ungated Area, reports the gating Dungeon while locked, and returns to null once that Dungeon is cleared", () => {
    const fresh = freshEngine().snapshot();
    expect(fresh.areas.find((a) => a.id === "meadow")?.gatedBy).toBeNull();
    expect(fresh.areas.find((a) => a.id === "crypt")?.gatedBy).toEqual({
      dungeonId: "gauntlet",
      name: "The Gauntlet",
    });

    const engine = dungeonEngine(5);
    engine.enterDungeon("gauntlet");
    let completed = false;
    engine.on("dungeon-completed", () => {
      completed = true;
    });
    for (let i = 0; i < 5000 && !completed; i++) engine.tick();
    expect(completed).toBe(true);

    const after = engine.snapshot();
    const crypt = after.areas.find((a) => a.id === "crypt");
    expect(crypt?.unlocked).toBe(true);
    expect(crypt?.gatedBy).toBeNull();
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
    const monster = engine.snapshot().monster;
    expect(monster?.hp).toBe(3);
    expect(monster?.maxHp).toBe(3);
  });

  it("carries the six derived combat fields from the active MonsterDef (#184) — attackType, weakSpot, attackLevel, defenceLevel, maxHit, attackSpeed", () => {
    const engine = freshEngine();
    engine.selectMonster("dummy");
    // "dummy" (fixture-content.ts): attackLevel 1, defenceLevel 1, maxHit 1, attackSpeed 4,
    // attackType "crush", def all-equal-zero -> weakSpot ties to "stab" (first in ATTACK_TYPES).
    expect(engine.snapshot().monster).toEqual({
      id: "dummy",
      name: "Training Dummy",
      hp: 3,
      maxHp: 3,
      attackType: "crush",
      weakSpot: "stab",
      attackLevel: 1,
      defenceLevel: 1,
      maxHit: 1,
      attackSpeed: 4,
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

describe("attack events (#86)", () => {
  it("player attacks land on #monster-splats' cadence (weapon speed) and Monster attacks on its own attackSpeed", () => {
    const engine = freshEngine();
    engine.selectMonster("dummy");
    const playerTicks: number[] = [];
    const monsterTicks: number[] = [];
    engine.on("attack", (e) => {
      if (e.actor === "player") playerTicks.push(tick);
      else monsterTicks.push(tick);
    });
    let tick = 0;
    // Short window: long enough for several swings each side, short enough that a Respawn
    // (which pauses the cadence) is implausible against the barely-fighting-back dummy.
    for (let i = 0; i < 20; i++) {
      tick++;
      engine.tick();
    }

    // Unarmed player speed == UNARMED_SPEED (4); dummy's own attackSpeed is also 4.
    expect(playerTicks).toEqual([4, 8, 12, 16, 20]);
    expect(monsterTicks).toEqual([4, 8, 12, 16, 20]);
  });

  it("a killing blow emits attack before kill", () => {
    const engine = freshEngine();
    const order: string[] = [];
    engine.on("attack", (e) => order.push(`attack:${e.actor}`));
    engine.on("kill", () => order.push("kill"));
    engine.selectMonster("dummy");
    for (let i = 0; i < 400; i++) engine.tick();

    const firstKillIndex = order.indexOf("kill");
    expect(firstKillIndex).toBeGreaterThan(0);
    expect(order[firstKillIndex - 1]).toBe("attack:player");
  });

  it("a seeded run produces both an accuracy miss (hit: false, damage 0) and a connected 0-roll (hit: true, damage 0)", () => {
    const engine = freshEngine();
    const playerAttacks: { hit: boolean; damage: number }[] = [];
    engine.on("attack", (e) => {
      if (e.actor === "player") playerAttacks.push({ hit: e.hit, damage: e.damage });
    });
    engine.selectMonster("dummy");
    for (let i = 0; i < 400; i++) engine.tick();

    expect(playerAttacks.some((a) => a.hit === false && a.damage === 0)).toBe(true);
    expect(playerAttacks.some((a) => a.hit === true && a.damage > 0)).toBe(true);
  });

  it("the applied Monster HP delta matches the player-attack event's (clamped) damage", () => {
    const engine = freshEngine();
    engine.selectMonster("dummy");
    let hpBefore = engine.snapshot().monster!.hp;
    engine.on("attack", (e) => {
      if (e.actor !== "player") return;
      // Fires right after `activity.monsterHp -= damage` and before the kill/respawn reset, so
      // the Monster's Snapshot HP mid-Tick still reflects this swing's clamped damage exactly.
      const hpAfterThisSwing = engine.snapshot().monster!.hp;
      expect(hpBefore - hpAfterThisSwing).toBe(e.damage);
    });
    for (let i = 0; i < 400; i++) {
      engine.tick();
      hpBefore = engine.snapshot().monster!.hp;
    }
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

  it("every damaging hit emits xp-gained for the style skill AND its own hitpoints event (#285)", () => {
    const engine = freshEngine();
    const gains: { skill: string; amount: number }[] = [];
    engine.on("xp-gained", (e) => gains.push({ skill: e.skill, amount: e.amount }));
    engine.selectMonster("dummy");
    for (let i = 0; i < 40; i++) engine.tick();

    const strengthGains = gains.filter((g) => g.skill === "strength");
    const hpGains = gains.filter((g) => g.skill === "hitpoints");
    expect(strengthGains.length).toBeGreaterThan(0);
    expect(hpGains.length).toBeGreaterThan(0);
    expect(strengthGains.length).toBe(hpGains.length);
    // 4*damage for strength, (4/3)*damage for hitpoints, on the same hit: hitpoints = strength/3
    for (let i = 0; i < strengthGains.length; i++) {
      const strengthGain = strengthGains[i];
      const hpGain = hpGains[i];
      expect(strengthGain).toBeDefined();
      expect(hpGain).toBeDefined();
      expect(hpGain!.amount).toBeCloseTo(strengthGain!.amount / 3, 6);
      expect(strengthGain!.amount).toBeGreaterThan(0);
    }
  });
});

describe("Drops", () => {
  it("every kill lands the guaranteed currency Drop straight into gold (#59); the drop event still fires unchanged", () => {
    const engine = freshEngine();
    // Isolates currency-drop gold from #63's auto-sell-duplicates gold (default ON): over a long
    // enough grind, a repeat Equipment Drop would also credit gold via duplicate-sold, which would
    // otherwise break this test's kills*5 == gold assertion — a concern unrelated to what this test
    // actually checks (currency Drops crediting gold directly).
    engine.setAutoSellDuplicates(false);
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
    // (#60) — auto-eat only ever reads from Food Slots (#61), so seed the loadout directly
    // instead of relying on incidental kill Drops reaching a Slot mid-fight.
    const engine = createEngine(
      fiercerDummyContent(),
      seededRng(42),
      makeSnapshot({
        player: {
          hp: 10,
          maxHp: 10,
          combatStyle: "aggressive",
          autoEatThreshold: 0.5, // makeSnapshot's own default is 0 (Off) — freshState's is 0.5
          foodSlots: [{ itemId: "meat", qty: 20 }, null, null],
          skills: { hitpoints: { level: 10, xp: xpForLevel(10) } },
        },
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
  /** Seeds Food Slot 0 with `meat` (#61 — autoEat only ever reads Food Slots, never the Bank). */
  function thresholdEngine(threshold: AutoEatThreshold, slot0Qty: number) {
    return createEngine(
      fiercerDummyContent(),
      seededRng(42),
      makeSnapshot({
        player: {
          hp: 10,
          maxHp: 10,
          combatStyle: "aggressive",
          autoEatThreshold: threshold,
          foodSlots: [{ itemId: "meat", qty: slot0Qty }, null, null],
          skills: { hitpoints: { level: 10, xp: xpForLevel(10) } },
        },
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

  it("at Off (0), auto-eat never fires even at low HP with Food owned; the player can die, and manual eatFromSlot still works", () => {
    const engine = thresholdEngine(0, 20);
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

    engine.eatFromSlot(0); // manual eat is unaffected by the auto-eat threshold
    expect(engine.snapshot().player.foodSlots[0]).toEqual({ itemId: "meat", qty: 19 });
  });

  it("at 0.75, auto-eat triggers as soon as HP first drops below 75% of max", () => {
    const engine = thresholdEngine(0.75, 20);
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

describe("Active Food Slots (#61)", () => {
  describe("assignFoodSlot", () => {
    it("moves the entire Bank stock into the slot, clearing the Bank stack", () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({ bank: { items: [{ itemId: "meat", qty: 5 }] } }),
      );
      engine.assignFoodSlot(0, "meat");
      expect(engine.snapshot().player.foodSlots[0]).toEqual({ itemId: "meat", qty: 5 });
      expect(engine.snapshot().bank.items).toEqual([]);
    });

    it("throws on an out-of-range index", () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({ bank: { items: [{ itemId: "meat", qty: 5 }] } }),
      );
      expect(() => engine.assignFoodSlot(-1, "meat")).toThrow();
      expect(() => engine.assignFoodSlot(3, "meat")).toThrow();
    });

    it("throws for an unknown itemId or a non-Food item", () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({ bank: { items: [{ itemId: "bronze-sword", qty: 1 }] } }),
      );
      expect(() => engine.assignFoodSlot(0, "unobtainium")).toThrow(/food/i);
      expect(() => engine.assignFoodSlot(0, "bronze-sword")).toThrow(/food/i);
    });

    it("throws when the Bank holds zero of the Food", () => {
      const engine = freshEngine();
      expect(() => engine.assignFoodSlot(0, "meat")).toThrow(/own/i);
    });

    it("throws when the same Food is already assigned to a DIFFERENT slot", () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({ bank: { items: [{ itemId: "meat", qty: 5 }] } }),
      );
      engine.assignFoodSlot(0, "meat");
      expect(() => engine.assignFoodSlot(1, "meat")).toThrow(/assigned/i);
      expect(engine.snapshot().player.foodSlots[1]).toBeNull(); // untouched
    });

    it("swap: assigning a different Food into an occupied slot returns the old stock to the Bank first", () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({
          bank: { items: [{ itemId: "bread", qty: 4 }] },
          player: { foodSlots: [{ itemId: "meat", qty: 7 }, null, null] },
        }),
      );
      engine.assignFoodSlot(0, "bread");
      expect(engine.snapshot().player.foodSlots[0]).toEqual({ itemId: "bread", qty: 4 });
      expect(engine.snapshot().bank.items).toEqual([{ itemId: "meat", qty: 7 }]);
    });

    it("swap: a qty-0 occupied slot clears without needing a Bank Slot for the old (empty) stock", () => {
      // Bank sits at capacity 1, already holding "bar" — a swap that needed to return real stock
      // would throw "bank is full" here (see the test below), but slot 0's "meat" is at qty 0.
      const engine = createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({
          bank: {
            items: [
              { itemId: "bread", qty: 1 },
              { itemId: "bar", qty: 1 },
            ],
            capacity: 1,
          },
          player: { foodSlots: [{ itemId: "meat", qty: 0 }, null, null] },
        }),
      );
      expect(() => engine.assignFoodSlot(0, "bread")).not.toThrow();
      expect(engine.snapshot().player.foodSlots[0]?.itemId).toBe("bread");
    });

    it('a bank-full swap throws "bank is full", mutating nothing', () => {
      // Capacity 1, but "bar" AND "bread" both already sit in the Bank (2 stacks, tolerated on
      // load) — so even after bread's own stack fully clears (moving into the slot), the
      // remaining "bar" stack alone still fills the Bank's only Slot, leaving no room for the
      // swapped-out "meat" to return.
      const engine = createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({
          bank: {
            items: [
              { itemId: "bar", qty: 1 },
              { itemId: "bread", qty: 4 },
            ],
            capacity: 1,
          },
          player: { foodSlots: [{ itemId: "meat", qty: 7 }, null, null] },
        }),
      );
      expect(() => engine.assignFoodSlot(0, "bread")).toThrow(/bank is full/i);
      expect(engine.snapshot().player.foodSlots[0]).toEqual({ itemId: "meat", qty: 7 });
      expect(engine.snapshot().bank.items).toEqual(
        expect.arrayContaining([
          { itemId: "bar", qty: 1 },
          { itemId: "bread", qty: 4 },
        ]),
      );
    });
  });

  describe("unassignFoodSlot", () => {
    it("returns the slot's stock to the Bank and clears the slot to null", () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({ player: { foodSlots: [{ itemId: "meat", qty: 5 }, null, null] } }),
      );
      engine.unassignFoodSlot(0);
      expect(engine.snapshot().player.foodSlots[0]).toBeNull();
      expect(engine.snapshot().bank.items).toEqual([{ itemId: "meat", qty: 5 }]);
    });

    it("a slot at qty 0 unassigns without touching the Bank", () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({
          bank: { items: [{ itemId: "bar", qty: 1 }], capacity: 1 }, // Bank already full
          player: { foodSlots: [{ itemId: "meat", qty: 0 }, null, null] },
        }),
      );
      expect(() => engine.unassignFoodSlot(0)).not.toThrow();
      expect(engine.snapshot().player.foodSlots[0]).toBeNull();
      expect(engine.snapshot().bank.items).toEqual([{ itemId: "bar", qty: 1 }]);
    });

    it('throws "bank is full" when the returning stock needs a new Bank Slot at capacity', () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({
          bank: { items: [{ itemId: "bar", qty: 1 }], capacity: 1 },
          player: { foodSlots: [{ itemId: "meat", qty: 5 }, null, null] },
        }),
      );
      expect(() => engine.unassignFoodSlot(0)).toThrow(/bank is full/i);
      expect(engine.snapshot().player.foodSlots[0]).toEqual({ itemId: "meat", qty: 5 });
    });

    it("throws on an out-of-range index; unassigning an already-null slot is a harmless no-op", () => {
      const engine = freshEngine();
      expect(() => engine.unassignFoodSlot(-1)).toThrow();
      expect(() => engine.unassignFoodSlot(3)).toThrow();
      expect(() => engine.unassignFoodSlot(0)).not.toThrow();
    });
  });

  describe("eatFromSlot", () => {
    it("heals from the slot, decrements it, emits food-eaten, and never overheals", () => {
      // meat heals 4, but only 2 HP of headroom is available below max — must cap there
      const engine = createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({
          player: {
            hp: 8,
            maxHp: 10,
            skills: { hitpoints: { level: 10, xp: xpForLevel(10) } },
            foodSlots: [{ itemId: "meat", qty: 2 }, null, null],
          },
        }),
      );

      const events: { itemId: string; healed: number }[] = [];
      engine.on("food-eaten", (e) => events.push({ itemId: e.itemId, healed: e.healed }));
      engine.eatFromSlot(0);

      expect(events).toEqual([{ itemId: "meat", healed: 2 }]);
      expect(engine.snapshot().player.hp).toBe(10);
      expect(engine.snapshot().player.foodSlots[0]).toEqual({ itemId: "meat", qty: 1 });
    });

    it("eating the last unit leaves the slot at qty 0, still assigned (empty != unassigned)", () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({ player: { foodSlots: [{ itemId: "meat", qty: 1 }, null, null] } }),
      );
      engine.eatFromSlot(0);
      expect(engine.snapshot().player.foodSlots[0]).toEqual({ itemId: "meat", qty: 0 });
    });

    it("throws on an out-of-range index, a null slot, or a qty-0 slot", () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({ player: { foodSlots: [{ itemId: "meat", qty: 0 }, null, null] } }),
      );
      expect(() => engine.eatFromSlot(-1)).toThrow();
      expect(() => engine.eatFromSlot(3)).toThrow();
      expect(() => engine.eatFromSlot(0)).toThrow(); // qty 0
      expect(() => engine.eatFromSlot(1)).toThrow(); // null
    });
  });

  describe("autoEat drains slots in order", () => {
    /** Fiercer "dummy" (see fiercerDummyContent) so the player actually takes damage; hitpoints
     * pinned to level 10 (maxHp 10) for round-number threshold math. */
    function slottedEngine(
      threshold: AutoEatThreshold,
      foodSlots: ({ itemId: string; qty: number } | null)[],
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
            foodSlots,
            skills: { hitpoints: { level: 10, xp: xpForLevel(10) } },
          },
        }),
      );
    }

    it("eats from slot 0 before slot 1, and never touches unassigned Bank Food", () => {
      const engine = createEngine(
        fiercerDummyContent(),
        seededRng(42),
        makeSnapshot({
          player: {
            hp: 10,
            maxHp: 10,
            combatStyle: "aggressive",
            autoEatThreshold: 0.5,
            // slot 0 carries far more meat than 5000 Ticks of this fight could ever consume, so
            // slot 1's bread is never reached — isolates the "lowest-index-first" ordering rule.
            foodSlots: [{ itemId: "meat", qty: 999_999 }, { itemId: "bread", qty: 20 }, null],
            skills: { hitpoints: { level: 10, xp: xpForLevel(10) } },
          },
          bank: { items: [{ itemId: "meat", qty: 50 }] }, // unassigned Bank stock — must stay put
        }),
      );
      const eaten: string[] = [];
      engine.on("food-eaten", (e) => eaten.push(e.itemId));
      engine.selectMonster("dummy");
      for (let i = 0; i < 5000; i++) engine.tick();

      expect(eaten.length).toBeGreaterThan(0);
      expect(eaten.every((id) => id === "meat")).toBe(true); // slot 0's meat, never slot 1's bread
      expect(engine.snapshot().bank.items).toEqual([{ itemId: "meat", qty: 50 }]); // untouched
    });

    it("falls through to slot 1 once slot 0 runs dry", () => {
      const engine = slottedEngine(0.75, [
        { itemId: "meat", qty: 1 },
        { itemId: "bread", qty: 20 },
        null,
      ]);
      const eaten: string[] = [];
      engine.on("food-eaten", (e) => eaten.push(e.itemId));
      engine.selectMonster("dummy");
      for (let i = 0; i < 5000; i++) engine.tick();

      expect(eaten).toContain("bread"); // slot 0 (1 unit of meat) ran dry, so slot 1 picked up
      expect(engine.snapshot().player.foodSlots[0]).toEqual({ itemId: "meat", qty: 0 });
    });

    it("stops once HP clears the threshold, even with food remaining", () => {
      // A near-inexhaustible slot 0: autoEat only ever stops because HP cleared the threshold,
      // never because food ran out.
      const engine = slottedEngine(0.25, [{ itemId: "meat", qty: 999_999 }, null, null]);
      engine.selectMonster("dummy");
      for (let i = 0; i < 5000; i++) engine.tick();
      expect(engine.snapshot().player.hp).toBeGreaterThanOrEqual(2.5); // >= 25% of maxHp 10
    });
  });

  describe("Slot-as-home routing: arrivals of an assigned Food land in the slot, not the Bank", () => {
    it("a fishing Catch (a raw Material, #115) lands in the Bank, never a Food Slot", () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({ player: { foodSlots: [{ itemId: "meat", qty: 2 }, null, null] } }),
      );
      engine.selectFishingSpot("pond"); // catchChance 1, always catches "raw-fish" (a Material)
      for (let i = 0; i < 3; i++) engine.tick(); // catchTicks 3: exactly one Catch

      expect(engine.snapshot().player.foodSlots[0]).toEqual({ itemId: "meat", qty: 2 }); // untouched
      expect(engine.snapshot().bank.items).toEqual([{ itemId: "raw-fish", qty: 1 }]);
    });

    it("a Loot Zone sweep of a slot-assigned Food lands in the slot, not the Bank", () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({
          player: { foodSlots: [{ itemId: "meat", qty: 1 }, null, null] },
          lootZone: [{ itemId: "meat", qty: 4 }],
        }),
      );
      const looted: { itemId: string; qty: number }[][] = [];
      engine.on("looted", (e) => looted.push(e.items));

      engine.lootAll();

      expect(engine.snapshot().player.foodSlots[0]).toEqual({ itemId: "meat", qty: 5 });
      expect(engine.snapshot().lootZone).toEqual([]);
      expect(engine.snapshot().bank.items).toEqual([]);
      expect(looted).toEqual([[{ itemId: "meat", qty: 4 }]]);
    });

    it("a qty-0 slot refills from a Loot Zone sweep too", () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({
          player: { foodSlots: [{ itemId: "meat", qty: 0 }, null, null] },
          lootZone: [{ itemId: "meat", qty: 2 }],
        }),
      );
      engine.lootAll();
      expect(engine.snapshot().player.foodSlots[0]).toEqual({ itemId: "meat", qty: 2 });
    });

    it("Slot-bound arrivals never overflow, even against a full Bank", () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({
          bank: { items: [{ itemId: "bar", qty: 1 }], capacity: 1 }, // full
          player: { foodSlots: [{ itemId: "meat", qty: 1 }, null, null] },
          lootZone: [{ itemId: "meat", qty: 3 }],
        }),
      );
      const overflowEvents: unknown[] = [];
      engine.on("overflow-sold", (e) => overflowEvents.push(e));
      engine.on("overflow-lost", (e) => overflowEvents.push(e));

      engine.lootAll();

      expect(overflowEvents).toEqual([]);
      expect(engine.snapshot().player.foodSlots[0]).toEqual({ itemId: "meat", qty: 4 });
    });
  });

  describe("save/load", () => {
    it("foodSlots round-trips through save/load", () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({
          bank: {
            items: [
              { itemId: "meat", qty: 5 },
              { itemId: "bread", qty: 2 },
            ],
          },
        }),
      );
      engine.assignFoodSlot(0, "meat");
      engine.assignFoodSlot(2, "bread");
      const saved = engine.snapshot();

      const restored = createEngine(
        fixtureContent,
        seededRng(1),
        JSON.parse(JSON.stringify(saved)),
      );
      expect(restored.snapshot().player.foodSlots).toEqual(saved.player.foodSlots);
    });

    it("a save missing foodSlots entirely loads as [null, null, null]", () => {
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
          // no foodSlots key: simulates a save written before this feature shipped
        },
        monster: null,
        areas: [],
      };
      const restored = createEngine(
        fixtureContent,
        seededRng(1),
        JSON.parse(JSON.stringify(legacySave)),
      );
      expect(restored.snapshot().player.foodSlots).toEqual([null, null, null]);
    });

    it("a wrong-length saved array is normalized to 3 (short padded, long truncated)", () => {
      const short = createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({ player: { foodSlots: [{ itemId: "meat", qty: 2 }] } }),
      );
      expect(short.snapshot().player.foodSlots).toEqual([{ itemId: "meat", qty: 2 }, null, null]);

      const long = createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({
          player: {
            foodSlots: [
              { itemId: "meat", qty: 1 },
              { itemId: "bread", qty: 1 },
              null,
              { itemId: "meat", qty: 9 },
            ],
          },
        }),
      );
      expect(long.snapshot().player.foodSlots).toEqual([
        { itemId: "meat", qty: 1 },
        { itemId: "bread", qty: 1 },
        null,
      ]);
    });

    it("an entry with an unknown or non-Food itemId loads as null", () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({
          player: {
            foodSlots: [
              { itemId: "unobtainium", qty: 3 },
              { itemId: "bronze-sword", qty: 1 },
              { itemId: "meat", qty: 2 },
            ],
          },
        }),
      );
      expect(engine.snapshot().player.foodSlots).toEqual([null, null, { itemId: "meat", qty: 2 }]);
    });

    it("qty is coerced to a finite non-negative integer, falling back to 0", () => {
      // Built as a plain object (not makeSnapshot) since a negative/string/NaN qty isn't a value
      // the typed Snapshot shape can hold — this simulates hand-edited or corrupted save JSON.
      const corrupted = {
        player: {
          foodSlots: [
            { itemId: "meat", qty: -3 },
            { itemId: "meat", qty: "12" },
            { itemId: "meat", qty: Number.NaN },
          ],
        },
      };
      const engine = createEngine(
        fixtureContent,
        seededRng(1),
        JSON.parse(JSON.stringify(corrupted)),
      );
      expect(engine.snapshot().player.foodSlots).toEqual([
        { itemId: "meat", qty: 0 },
        { itemId: "meat", qty: 0 },
        { itemId: "meat", qty: 0 },
      ]);
    });

    it("old saves' Food (already migrated to the Bank by #59) simply starts unassigned", () => {
      const restored = createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({ bank: { items: [{ itemId: "meat", qty: 10 }] } }),
      );
      expect(restored.snapshot().player.foodSlots).toEqual([null, null, null]);
      expect(restored.snapshot().bank.items).toEqual([{ itemId: "meat", qty: 10 }]);
    });
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
  const ZERO_DEF: Record<string, number> = { stab: 0, slash: 0, crush: 0, ranged: 0, magic: 0 };
  const ONE_DEF: Record<string, number> = { stab: 1, slash: 1, crush: 1, ranged: 1, magic: 1 };

  it("is all zero, with the unarmed attack speed fallback and crush attack type, on a fresh engine with nothing equipped", () => {
    const snap = freshEngine().snapshot();
    expect(snap.player.bonuses).toEqual({
      attackType: "crush",
      atkBonus: 0,
      strBonus: 0,
      def: ZERO_DEF,
      attackSpeed: 4,
    });
  });

  it("sums bonuses across every equipped Gear Slot, reads attackType/atk/str from the weapon only, and reflects the weapon's own speed", () => {
    const engine = freshEngine();
    engine.selectMonster("dummy");
    grindFor(engine, "bronze-sword");
    grindFor(engine, "lucky-charm");
    engine.equip("bronze-sword"); // weapon: slash, atk 10, str 30, def all-0, speed 4
    engine.equip("lucky-charm"); // head: def all-1

    expect(engine.snapshot().player.bonuses).toEqual({
      attackType: "slash",
      atkBonus: 10,
      strBonus: 30,
      def: ONE_DEF,
      attackSpeed: 4,
    });
  });

  it("falls back to unarmed attack speed 4 and crush attack type when no weapon is equipped, even with other Gear worn", () => {
    const engine = freshEngine();
    engine.selectMonster("dummy");
    grindFor(engine, "lucky-charm");
    engine.equip("lucky-charm"); // head only, no weapon

    expect(engine.snapshot().player.bonuses).toEqual({
      attackType: "crush",
      atkBonus: 0,
      strBonus: 0,
      def: ONE_DEF,
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

describe("Jewelry Gear Slots (#117): amulet/ring are an offence slot, unlike armour", () => {
  it("a fresh engine's equipment snapshot has amulet and ring, both null", () => {
    const snap = freshEngine().snapshot();
    expect(snap.player.equipment.amulet).toBeNull();
    expect(snap.player.equipment.ring).toBeNull();
  });

  it("a pre-#117 save (no amulet/ring keys at all in player.equipment) loads with both defaulting to null", () => {
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
        // no amulet/ring keys: simulates a save written before this Gear Slot existed.
        equipment: { weapon: null, shield: null, head: null, body: null, legs: null },
        respawning: false,
      },
      monster: null,
      areas: [],
    };
    expect(() =>
      createEngine(fixtureContent, seededRng(1), JSON.parse(JSON.stringify(legacySave))),
    ).not.toThrow();
    const engine = createEngine(
      fixtureContent,
      seededRng(1),
      JSON.parse(JSON.stringify(legacySave)),
    );
    expect(engine.snapshot().player.equipment.amulet).toBeNull();
    expect(engine.snapshot().player.equipment.ring).toBeNull();
  });

  it("equipping a strBonus-carrying amulet raises gearBonus/strBonus (and so the melee max hit) with no engine change beyond validation", () => {
    const engine = createEngine(
      fixtureContent,
      seededRng(1),
      makeSnapshot({ bank: { items: [{ itemId: "lucky-amulet", qty: 1 }] } }),
    );
    expect(engine.snapshot().player.bonuses.strBonus).toBe(0);

    engine.equip("lucky-amulet");

    const bonuses = engine.snapshot().player.bonuses;
    expect(engine.snapshot().player.equipment.amulet).toBe("lucky-amulet");
    expect(bonuses.atkBonus).toBe(5); // lucky-amulet's own atkBonus
    expect(bonuses.strBonus).toBe(8); // lucky-amulet's own strBonus, summed by gearBonus()
    // The same strBonus total feeds combat's maxHit formula (combat.ts) — no separate engine
    // change was needed for jewelry to reach the damage roll (#117): gearBonus() already summed
    // across every equipped slot before this issue; only validateContent was gating it out.
    // (level 99 so the formula's floor() can't mask the difference the way it would at level 1.)
    const eff = effectiveLevel(99, "strength", "aggressive", "melee");
    expect(maxHit(eff, bonuses.strBonus)).toBeGreaterThan(maxHit(eff, 0));
  });

  it("equipping a ring stacks its own bonuses alongside an already-equipped amulet's", () => {
    const engine = createEngine(
      fixtureContent,
      seededRng(1),
      makeSnapshot({
        bank: {
          items: [
            { itemId: "lucky-amulet", qty: 1 },
            { itemId: "lucky-ring", qty: 1 },
          ],
        },
      }),
    );
    engine.equip("lucky-amulet");
    engine.equip("lucky-ring");

    const bonuses = engine.snapshot().player.bonuses;
    expect(engine.snapshot().player.equipment.ring).toBe("lucky-ring");
    expect(bonuses.atkBonus).toBe(5 + 3);
    expect(bonuses.strBonus).toBe(8 + 4);
    expect(bonuses.def.magic).toBe(1 + 0);
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
        if (i.id !== "raw-fish" || i.kind === "currency") return i;
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

    engine.selectFishingSpot("pond"); // pond always catches "raw-fish" (catchChance 1), now unsellable
    for (let i = 0; i < 3; i++) engine.tick(); // catchTicks 3: exactly one Catch

    expect(lost).toEqual([{ itemId: "raw-fish", qty: 1 }]);
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
        bank: { items: [{ itemId: "raw-fish", qty: 1 }], capacity: 1 },
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
    expect(engine.snapshot().bank.items).toEqual([{ itemId: "raw-fish", qty: 4 }]);
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

describe("Snapshot.savedAt clock injection (#69)", () => {
  it("stamps snapshot().savedAt from the injected `now` clock, not the real one", () => {
    const engine = createEngine(fixtureContent, seededRng(1), undefined, () => 123_456);
    expect(engine.snapshot().savedAt).toBe(123_456);
  });

  it("re-stamps savedAt on every snapshot() call, tracking the clock forward", () => {
    let time = 1_000;
    const engine = createEngine(fixtureContent, seededRng(1), undefined, () => time);
    expect(engine.snapshot().savedAt).toBe(1_000);
    time = 2_000;
    expect(engine.snapshot().savedAt).toBe(2_000);
  });

  it("defaults to the real Date.now() when no clock is injected", () => {
    const before = Date.now();
    const engine = createEngine(fixtureContent, seededRng(1));
    const stamped = engine.snapshot().savedAt;
    const after = Date.now();
    expect(stamped).toBeGreaterThanOrEqual(before);
    expect(stamped).toBeLessThanOrEqual(after);
  });

  it("loads a save missing savedAt (pre-#69) without throwing — the field is output-only, never read back", () => {
    const legacySave = makeSnapshot() as unknown as Record<string, unknown>;
    delete legacySave["savedAt"];
    expect(() =>
      createEngine(fixtureContent, seededRng(1), legacySave as never, () => 999),
    ).not.toThrow();
    const engine = createEngine(fixtureContent, seededRng(1), legacySave as never, () => 999);
    expect(engine.snapshot().savedAt).toBe(999); // freshly stamped, not derived from the missing field
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

  it("a save with a valid monster still resumes combat with its saved HP (no regression); an old-shape saved monster (no derived fields, #184) still loads and the next snapshot() carries them, freshly computed from Content", () => {
    const engine = createEngine(
      fixtureContent,
      seededRng(1),
      // Deliberately the OLD monster shape (id/name/hp/maxHp only, no derived fields) — mirrors a
      // pre-#184 save.
      makeSnapshot({ monster: { id: "dummy", name: "Training Dummy", hp: 2, maxHp: 3 } }),
    );
    expect(engine.snapshot().monster).toEqual({
      id: "dummy",
      name: "Training Dummy",
      hp: 2,
      maxHp: 3,
      // Recomputed from fixtureContent's "dummy" MonsterDef, not read from the saved Snapshot
      // (which had none of these fields).
      attackType: "crush",
      weakSpot: "stab",
      attackLevel: 1,
      defenceLevel: 1,
      maxHit: 1,
      attackSpeed: 4,
    });
    let kills = 0;
    engine.on("kill", () => kills++);
    for (let i = 0; i < 5000; i++) engine.tick();
    expect(kills).toBeGreaterThan(0);
  });

  it("ignores tampered derived monster fields on a saved Snapshot — they are always recomputed from Content at snapshot() time (#184)", () => {
    const engine = createEngine(
      fixtureContent,
      seededRng(1),
      makeSnapshot({
        monster: {
          id: "dummy",
          name: "Training Dummy",
          hp: 2,
          maxHp: 3,
          // Every derived field below is deliberately WRONG relative to fixtureContent's real
          // "dummy" MonsterDef (attackType "crush", weakSpot "stab" (all-zero vector),
          // attackLevel/defenceLevel/maxHit 1, attackSpeed 4) — if the Engine ever trusted these
          // instead of recomputing them, this test would see the tampered values below.
          attackType: "magic",
          weakSpot: "magic",
          attackLevel: 99,
          defenceLevel: 99,
          maxHit: 99,
          attackSpeed: 99,
        },
      }),
    );
    expect(engine.snapshot().monster).toEqual({
      id: "dummy",
      name: "Training Dummy",
      hp: 2,
      maxHp: 3,
      attackType: "crush",
      weakSpot: "stab",
      attackLevel: 1,
      defenceLevel: 1,
      maxHit: 1,
      attackSpeed: 4,
    });
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

  it("a missing player.potionSlot (pre-#118 save) loads null", () => {
    const engine = createEngine(fixtureContent, seededRng(1), makeSnapshot());
    expect(engine.snapshot().player.potionSlot).toBeNull();
  });

  it("player.potionSlot naming an unknown itemId loads null", () => {
    const engine = createEngine(
      fixtureContent,
      seededRng(1),
      makeSnapshot({
        player: { potionSlot: { itemId: "unobtainium", qty: 5, charges: 3 } },
      }),
    );
    expect(engine.snapshot().player.potionSlot).toBeNull();
  });

  it("player.potionSlot naming a non-Potion item (e.g. Food) loads null", () => {
    const engine = createEngine(
      fixtureContent,
      seededRng(1),
      makeSnapshot({ player: { potionSlot: { itemId: "meat", qty: 5, charges: 3 } } }),
    );
    expect(engine.snapshot().player.potionSlot).toBeNull();
  });

  it("player.potionSlot with a non-positive qty or charges loads null", () => {
    const zeroQty = createEngine(
      fixtureContent,
      seededRng(1),
      makeSnapshot({
        player: { potionSlot: { itemId: "strength-potion", qty: 0, charges: 3 } },
      }),
    );
    expect(zeroQty.snapshot().player.potionSlot).toBeNull();

    const zeroCharges = createEngine(
      fixtureContent,
      seededRng(1),
      makeSnapshot({
        player: { potionSlot: { itemId: "strength-potion", qty: 5, charges: 0 } },
      }),
    );
    expect(zeroCharges.snapshot().player.potionSlot).toBeNull();
  });

  it("a valid player.potionSlot loads normally alongside the rest of the sweep", () => {
    const engine = createEngine(
      fixtureContent,
      seededRng(1),
      makeSnapshot({
        player: { potionSlot: { itemId: "strength-potion", qty: 4, charges: 2 } },
      }),
    );
    expect(engine.snapshot().player.potionSlot).toEqual({
      itemId: "strength-potion",
      qty: 4,
      charges: 2,
    });
  });

  it("a missing player.ownedPets (pre-#120 save) loads as an empty Set (#120)", () => {
    const engine = createEngine(fixtureContent, seededRng(1), makeSnapshot());
    expect(engine.snapshot().player.ownedPets).toEqual([]);
  });

  it("player.ownedPets drops unknown/renamed pet ids but keeps every real one (#120)", () => {
    const engine = createEngine(
      fixtureContent,
      seededRng(1),
      makeSnapshot({
        player: { ownedPets: ["test-combat-pet", "no-such-pet", "test-fishing-pet"] },
      }),
    );
    expect(engine.snapshot().player.ownedPets.sort()).toEqual([
      "test-combat-pet",
      "test-fishing-pet",
    ]);
  });

  it("a valid Snapshot still round-trips unchanged (no behavioural change for clean saves)", () => {
    // Fixed clock: snapshot() restamps savedAt (#69) on every call, so two real Date.now()
    // calls a millisecond apart would flake this equality — pin the clock instead.
    const original = createEngine(fixtureContent, seededRng(42), undefined, () => 0);
    original.selectMonster("dummy");
    grindFor(original, "bronze-sword");
    original.equip("bronze-sword");
    for (let i = 0; i < 200; i++) original.tick();
    const saved = original.snapshot();

    const restored = createEngine(
      fixtureContent,
      seededRng(1),
      JSON.parse(JSON.stringify(saved)),
      () => 0,
    );
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
  it("selectFishingSpot yields Fishing XP and a raw Material (#115) over Ticks, emitting fish-caught (catchChance 1)", () => {
    const engine = freshEngine();
    const caught: { spotId: string; itemId: string; qty: number }[] = [];
    engine.on("fish-caught", (e) =>
      caught.push({ spotId: e.spotId, itemId: e.itemId, qty: e.qty }),
    );
    engine.selectFishingSpot("pond");
    expect(engine.snapshot().fishing).toEqual({ spotId: "pond", name: "Test Pond", progress: 0 });

    for (let i = 0; i < 3; i++) engine.tick(); // pond.catchTicks === 3
    expect(caught).toEqual([{ spotId: "pond", itemId: "raw-fish", qty: 1 }]);

    for (let i = 0; i < 3; i++) engine.tick();
    expect(caught).toHaveLength(2);

    const snap = engine.snapshot();
    expect(snap.bank.items.find((s) => s.itemId === "raw-fish")?.qty).toBe(2);
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
    expect(engine.snapshot().fishing).toEqual({
      spotId: "deep-pond",
      name: "Test Deep Pond",
      progress: 0,
    });
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
    expect(engine.snapshot().fishing).toEqual({ spotId: "pond", name: "Test Pond", progress: 0 });

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
      // 1/3 elapsed, not persisted (#284) — the field isn't even part of the saved shape below.
      expect(saved.fishing).toEqual({ spotId: "pond", name: "Test Pond", progress: 1 / 3 });

      const restored = createEngine(
        fixtureContent,
        seededRng(7),
        JSON.parse(JSON.stringify(saved)),
      );
      // Resume always re-arms the cooldown fresh (#28), so progress restarts cleanly at 0 (#284) —
      // never resumes mid-cycle, never NaN, never >1.
      expect(restored.snapshot().fishing).toEqual({
        spotId: "pond",
        name: "Test Pond",
        progress: 0,
      });

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
      expect(snap.monster).toEqual({
        id: "dummy",
        name: "Training Dummy",
        hp: 3,
        maxHp: 3,
        attackType: "crush",
        weakSpot: "stab",
        attackLevel: 1,
        defenceLevel: 1,
        maxHit: 1,
        attackSpeed: 4,
      });
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
      // On wave-cleared, the next Wave's own MonsterDef facts appear (#184) — "boss-dummy" has its
      // own attackLevel/defenceLevel/maxHit/attackSpeed distinct from "dummy"'s, proving they come
      // from the new active MonsterDef rather than being carried over from the prior wave.
      expect(snap.monster).toEqual({
        id: "boss-dummy",
        name: "Boss Dummy",
        hp: 5,
        maxHp: 5,
        attackType: "crush",
        weakSpot: "stab",
        attackLevel: 1,
        defenceLevel: 1,
        maxHit: 1,
        attackSpeed: 4,
      });
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
          icon: "bronze-bar",
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
      const engine = createEngine(manyWavesContent, seededRng(8)); // seed pinned: produces a real
      // (non-currency) Drop before the eventual death, so the Loot Zone genuinely has something to
      // lose — not just a hypothetically-empty one. (Re-pinned for #120: pets' own per-kill roll
      // consumes an extra rng.next() draw, shifting the sequence downstream of every kill.)
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

describe("Auto-sell duplicate Equipment (#63)", () => {
  /** dummy's Drop Table replaced with a single guaranteed bronze-sword entry: makes every kill
   * produce exactly one deterministic Equipment Drop, so duplicate-sell tests don't have to grind
   * out bronze-sword's normal 1/16 chance. */
  function guaranteedSwordDropContent() {
    return {
      ...fixtureContent,
      monsters: fixtureContent.monsters.map((m) =>
        m.id === "dummy"
          ? {
              ...m,
              dropTable: [{ itemId: "bronze-sword", qty: 1, chance: 1, band: "uncommon" as const }],
            }
          : m,
      ),
    };
  }

  /** Same as guaranteedSwordDropContent, but bronze-sword carries no `value` — for the unsellable-
   * duplicate case (discarded via overflow-lost instead of sold). */
  function guaranteedUnsellableSwordDropContent() {
    const base = guaranteedSwordDropContent();
    return {
      ...base,
      items: base.items.map((i) => {
        if (i.id !== "bronze-sword" || i.kind !== "equipment") return i;
        const { value: _value, ...rest } = i;
        return rest;
      }),
    };
  }

  /** Ticks `engine` (already given a selected Monster) until a "kill" event fires, or fails the
   * test — mirrors this file's grindFor but stops at the first kill rather than a specific item. */
  function tickUntilKill(engine: ReturnType<typeof createEngine>, maxTicks = 5000) {
    let killed = false;
    engine.on("kill", () => {
      killed = true;
    });
    for (let i = 0; i < maxTicks && !killed; i++) engine.tick();
    if (!killed) throw new Error("dummy never died");
  }

  it("a duplicate Drop is auto-sold when the original is equipped, and the drop event still fires first", () => {
    const engine = createEngine(
      guaranteedSwordDropContent(),
      seededRng(7),
      makeSnapshot({ player: { equipment: { weapon: "bronze-sword" } } }),
    );
    const eventOrder: string[] = [];
    engine.on("drop", (e) => eventOrder.push(`drop:${e.itemId}`));
    const sold: { itemId: string; gold: number }[] = [];
    engine.on("duplicate-sold", (e) => {
      sold.push({ itemId: e.itemId, gold: e.gold });
      eventOrder.push(`sold:${e.itemId}`);
    });

    engine.selectMonster("dummy");
    tickUntilKill(engine);

    expect(sold).toEqual([{ itemId: "bronze-sword", gold: 20 }]);
    expect(eventOrder).toEqual(["drop:bronze-sword", "sold:bronze-sword"]);
    expect(engine.snapshot().lootZone).toEqual([]);
    expect(engine.snapshot().bank.items).toEqual([]);
  });

  it("a duplicate Drop is auto-sold when the original is banked — the banked stack is left untouched, not topped up", () => {
    const engine = createEngine(
      guaranteedSwordDropContent(),
      seededRng(7),
      makeSnapshot({ bank: { items: [{ itemId: "bronze-sword", qty: 1 }] } }),
    );
    const sold: { itemId: string; gold: number }[] = [];
    engine.on("duplicate-sold", (e) => sold.push({ itemId: e.itemId, gold: e.gold }));

    engine.selectMonster("dummy");
    tickUntilKill(engine);

    expect(sold).toEqual([{ itemId: "bronze-sword", gold: 20 }]);
    expect(engine.snapshot().bank.items).toEqual([{ itemId: "bronze-sword", qty: 1 }]);
    expect(engine.snapshot().lootZone).toEqual([]);
  });

  it("a duplicate Drop is auto-sold when the original is already sitting in the Loot Zone", () => {
    const engine = createEngine(
      guaranteedSwordDropContent(),
      seededRng(7),
      makeSnapshot({ lootZone: [{ itemId: "bronze-sword", qty: 1 }] }),
    );
    const sold: { itemId: string; gold: number }[] = [];
    engine.on("duplicate-sold", (e) => sold.push({ itemId: e.itemId, gold: e.gold }));

    engine.selectMonster("dummy");
    tickUntilKill(engine);

    expect(sold).toEqual([{ itemId: "bronze-sword", gold: 20 }]);
    expect(engine.snapshot().lootZone).toEqual([{ itemId: "bronze-sword", qty: 1 }]);
    expect(engine.snapshot().bank.items).toEqual([]);
  });

  it("the duplicate is kept (lands in the Loot Zone as normal) when the toggle is off", () => {
    const engine = createEngine(
      guaranteedSwordDropContent(),
      seededRng(7),
      makeSnapshot({
        player: { autoSellDuplicates: false },
        bank: { items: [{ itemId: "bronze-sword", qty: 1 }] },
      }),
    );
    const sold: unknown[] = [];
    engine.on("duplicate-sold", (e) => sold.push(e));

    engine.selectMonster("dummy");
    tickUntilKill(engine);

    expect(sold).toEqual([]);
    expect(engine.snapshot().lootZone).toEqual([{ itemId: "bronze-sword", qty: 1 }]);
    expect(engine.snapshot().bank.items).toEqual([{ itemId: "bronze-sword", qty: 1 }]);
  });

  it("the first-ever copy of an Equipment item is never sold — it lands in the Loot Zone like any other Drop", () => {
    const engine = createEngine(guaranteedSwordDropContent(), seededRng(7));
    const sold: unknown[] = [];
    engine.on("duplicate-sold", (e) => sold.push(e));

    engine.selectMonster("dummy");
    tickUntilKill(engine);

    expect(sold).toEqual([]);
    expect(engine.snapshot().lootZone).toEqual([{ itemId: "bronze-sword", qty: 1 }]);
  });

  it("an unsellable duplicate (no value) is discarded with overflow-lost instead of duplicate-sold", () => {
    const engine = createEngine(
      guaranteedUnsellableSwordDropContent(),
      seededRng(7),
      makeSnapshot({ bank: { items: [{ itemId: "bronze-sword", qty: 1 }] } }),
    );
    const sold: unknown[] = [];
    engine.on("duplicate-sold", (e) => sold.push(e));
    const lost: { itemId: string; qty: number }[] = [];
    engine.on("overflow-lost", (e) => lost.push({ itemId: e.itemId, qty: e.qty }));

    engine.selectMonster("dummy");
    tickUntilKill(engine);

    expect(sold).toEqual([]);
    expect(lost).toEqual([{ itemId: "bronze-sword", qty: 1 }]);
    expect(engine.snapshot().player.gold).toBe(0);
    expect(engine.snapshot().bank.items).toEqual([{ itemId: "bronze-sword", qty: 1 }]);
  });

  it("applies to Dungeon Chest items too, not just kill Drops", () => {
    // Only the bronze-sword ENTRY's chance is zeroed (leaving its rng.next() draw in place, same
    // as fixtureContent's own dungeon-completes-within-5000-ticks tests) rather than replacing the
    // whole Drop Table, so the Chest is the only new deterministic source of bronze-sword.
    const content = {
      ...fixtureContent,
      monsters: fixtureContent.monsters.map((m) =>
        m.id === "dummy"
          ? {
              ...m,
              dropTable: m.dropTable.map((entry) =>
                entry.itemId === "bronze-sword" ? { ...entry, chance: 0 } : entry,
              ),
            }
          : m,
      ),
      dungeons: fixtureContent.dungeons.map((d) =>
        d.id === "gauntlet"
          ? {
              ...d,
              chest: [{ itemId: "bronze-sword", qty: 1, chance: 1, band: "common" as const }],
            }
          : d,
      ),
    };
    // Seeded off a real fresh-engine Snapshot (not makeSnapshot's fixture defaults, e.g. Accurate
    // style / level-1 HP) plus one override, so wave kills start from a realistic state, with only
    // a pre-owned bronze-sword added. Seed 3 pinned: the run completes within budget and neither
    // "dummy" low-chance entry (meat 0.25, lucky-charm 1/128) happens to roll positive along the
    // way, so the Bank ends up holding exactly the Chest's (duplicate-sold) bronze-sword and
    // nothing else (#120: pets' own per-kill roll consumes an extra rng.next() draw per kill,
    // shifting which of these low-chance rolls land).
    const freshSnap = createEngine(content, seededRng(0)).snapshot();
    const engine = createEngine(content, seededRng(3), {
      ...freshSnap,
      bank: { ...freshSnap.bank, items: [{ itemId: "bronze-sword", qty: 1 }] },
    });
    const sold: { itemId: string; gold: number }[] = [];
    engine.on("duplicate-sold", (e) => sold.push({ itemId: e.itemId, gold: e.gold }));
    let completed = false;
    engine.on("dungeon-completed", () => {
      completed = true;
    });

    engine.enterDungeon("gauntlet");
    for (let i = 0; i < 5000 && !completed; i++) engine.tick();

    expect(completed).toBe(true);
    expect(sold).toEqual([{ itemId: "bronze-sword", gold: 20 }]);
    expect(engine.snapshot().bank.items).toEqual([{ itemId: "bronze-sword", qty: 1 }]);
    expect(engine.snapshot().lootZone).toEqual([]);
  });

  it("stackables (Food/Material) are never treated as duplicates, even when already owned", () => {
    const content = {
      ...fixtureContent,
      monsters: fixtureContent.monsters.map((m) =>
        m.id === "dummy"
          ? { ...m, dropTable: [{ itemId: "meat", qty: 1, chance: 1, band: "common" as const }] }
          : m,
      ),
    };
    const engine = createEngine(
      content,
      seededRng(3),
      makeSnapshot({ bank: { items: [{ itemId: "meat", qty: 5 }] } }),
    );
    const sold: unknown[] = [];
    engine.on("duplicate-sold", (e) => sold.push(e));

    engine.selectMonster("dummy");
    tickUntilKill(engine);

    expect(sold).toEqual([]);
    expect(engine.snapshot().lootZone).toEqual([{ itemId: "meat", qty: 1 }]);
  });

  it("Smithing outputs are never dupe-sold, even though the output is Equipment already owned", () => {
    const engine = createEngine(
      fixtureContent,
      seededRng(1),
      makeSnapshot({
        bank: {
          items: [
            { itemId: "bronze-sword", qty: 1 },
            { itemId: "bar", qty: 1 },
          ],
        },
      }),
    );
    const sold: unknown[] = [];
    engine.on("duplicate-sold", (e) => sold.push(e));
    const crafted: unknown[] = [];
    engine.on("item-crafted", (e) => crafted.push(e));

    engine.selectRecipe("test-sword");
    for (let i = 0; i < 10 && crafted.length === 0; i++) engine.tick();

    expect(crafted).toHaveLength(1);
    expect(sold).toEqual([]);
    expect(engine.snapshot().bank.items).toEqual(
      expect.arrayContaining([{ itemId: "bronze-sword", qty: 2 }]),
    );
  });

  it("Fishing Catches are never dupe-sold, even though Catches are always a Material (never Equipment, #115)", () => {
    const engine = createEngine(
      fixtureContent,
      seededRng(1),
      makeSnapshot({ bank: { items: [{ itemId: "raw-fish", qty: 5 }] } }),
    );
    const sold: unknown[] = [];
    engine.on("duplicate-sold", (e) => sold.push(e));
    const caught: unknown[] = [];
    engine.on("fish-caught", (e) => caught.push(e));

    engine.selectFishingSpot("pond");
    for (let i = 0; i < 10 && caught.length === 0; i++) engine.tick();

    expect(caught).toHaveLength(1);
    expect(sold).toEqual([]);
    expect(engine.snapshot().bank.items).toEqual([{ itemId: "raw-fish", qty: 6 }]);
  });

  describe("setAutoSellDuplicates command", () => {
    it("defaults true for a fresh engine, and toggles both ways", () => {
      const engine = freshEngine();
      expect(engine.snapshot().player.autoSellDuplicates).toBe(true);

      engine.setAutoSellDuplicates(false);
      expect(engine.snapshot().player.autoSellDuplicates).toBe(false);

      engine.setAutoSellDuplicates(true);
      expect(engine.snapshot().player.autoSellDuplicates).toBe(true);
    });

    it("throws on a non-boolean value", () => {
      const engine = freshEngine();
      expect(() => engine.setAutoSellDuplicates("yes" as unknown as boolean)).toThrow();
    });
  });

  describe("save/load", () => {
    it("autoSellDuplicates survives a save/load round-trip", () => {
      const original = createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({ player: { autoSellDuplicates: false } }),
      );
      const saved = original.snapshot();
      const restored = createEngine(
        fixtureContent,
        seededRng(1),
        JSON.parse(JSON.stringify(saved)),
      );

      expect(restored.snapshot().player.autoSellDuplicates).toBe(false);
    });

    it("a pre-#63 save with no autoSellDuplicates key at all defaults to true", () => {
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
          // no autoSellDuplicates key: simulates a save written before this feature shipped
        },
        monster: null,
        areas: [],
      };
      const restored = createEngine(
        fixtureContent,
        seededRng(1),
        JSON.parse(JSON.stringify(legacySave)),
      );

      expect(restored.snapshot().player.autoSellDuplicates).toBe(true);
    });

    it("a non-boolean saved value defaults to true", () => {
      const restored = createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({ player: { autoSellDuplicates: "nope" as unknown as boolean } }),
      );

      expect(restored.snapshot().player.autoSellDuplicates).toBe(true);
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
    expect(engine.snapshot().production).toEqual({
      recipeId: "test-sword",
      name: "Test Sword",
      skill: "smithing",
      progress: 0,
    });

    // #284: progress climbs 0..1 across the 3-tick cooldown, resetting back near 0 the instant
    // the re-armed cycle begins (never >1, never NaN).
    engine.tick();
    expect(engine.snapshot().production?.progress).toBeCloseTo(1 / 3);
    engine.tick();
    expect(engine.snapshot().production?.progress).toBeCloseTo(2 / 3);
    engine.tick(); // completes the craft and re-arms
    expect(crafted).toEqual([{ recipeId: "test-sword", itemId: "bronze-sword" }]);
    let snap = engine.snapshot();
    expect(snap.bank.items.find((s) => s.itemId === "bar")?.qty).toBe(1);
    expect(snap.bank.items.find((s) => s.itemId === "bronze-sword")?.qty).toBe(1);
    expect(snap.player.skills.smithing.xp).toBe(10);
    expect(snap.production).toEqual({
      recipeId: "test-sword",
      name: "Test Sword",
      skill: "smithing",
      progress: 0,
    }); // 1 bar left: re-armed, progress back at 0

    for (let i = 0; i < 3; i++) engine.tick();
    expect(crafted).toHaveLength(2);
    snap = engine.snapshot();
    expect(snap.bank.items.find((s) => s.itemId === "bar")).toBeUndefined();
    expect(snap.bank.items.find((s) => s.itemId === "bronze-sword")?.qty).toBe(2);
    expect(snap.player.skills.smithing.xp).toBe(20);
    expect(snap.production).toBeNull(); // no bars left for another craft: auto-stopped to idle
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
    expect(engine.snapshot().production).toEqual({
      recipeId: "test-charm",
      name: "Test Charm",
      skill: "smithing",
      progress: 0,
    });
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
    expect(engine.snapshot().production).not.toBeNull();
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
      expect(engine.snapshot().production).toEqual({
        recipeId: "test-sword",
        name: "Test Sword",
        skill: "smithing",
        progress: 0,
      });

      engine.selectFishingSpot("pond");
      expect(engine.snapshot().production).toBeNull();
      engine.selectRecipe("test-sword");
      expect(engine.snapshot().fishing).toBeNull();
      expect(engine.snapshot().production).not.toBeNull();

      engine.enterDungeon("gauntlet");
      expect(engine.snapshot().production).toBeNull();
      expect(engine.snapshot().dungeon).not.toBeNull();
      engine.selectRecipe("test-sword");
      expect(engine.snapshot().dungeon).toBeNull();
      expect(engine.snapshot().production).toEqual({
        recipeId: "test-sword",
        name: "Test Sword",
        skill: "smithing",
        progress: 0,
      });
    });

    it("selecting a Monster, a Fishing Spot, or a Dungeon each clear an active Smithing Recipe", () => {
      const engine = createEngine(fixtureContent, seededRng(1), smithingSnapshot(5));

      engine.selectRecipe("test-sword");
      expect(engine.snapshot().production).not.toBeNull();
      engine.selectMonster("dummy");
      expect(engine.snapshot().production).toBeNull();

      engine.selectRecipe("test-sword");
      expect(engine.snapshot().production).not.toBeNull();
      engine.selectFishingSpot("pond");
      expect(engine.snapshot().production).toBeNull();

      engine.selectRecipe("test-sword");
      expect(engine.snapshot().production).not.toBeNull();
      engine.enterDungeon("gauntlet");
      expect(engine.snapshot().production).toBeNull();
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
      expect(snap.production).toBeNull();
      expect(snap.fishing).toEqual({ spotId: "pond", name: "Test Pond", progress: 0 });
    });

    it("a save made while smithing resumes smithing on load, re-arming the cooldown to craftTicks", () => {
      const original = createEngine(fixtureContent, seededRng(1), smithingSnapshot(5));
      original.selectRecipe("test-sword");
      original.tick(); // 1 tick into a 3-tick cooldown; not yet due for a craft
      const saved = original.snapshot();
      // 1/3 elapsed — not persisted (#284), gone from the round-tripped save entirely.
      expect(saved.production).toEqual({
        recipeId: "test-sword",
        name: "Test Sword",
        skill: "smithing",
        progress: 1 / 3,
      });

      const restored = createEngine(
        fixtureContent,
        seededRng(7),
        JSON.parse(JSON.stringify(saved)),
      );
      // Resume re-arms the cooldown fresh (#28), so progress restarts cleanly at 0 (#284).
      expect(restored.snapshot().production).toEqual({
        recipeId: "test-sword",
        name: "Test Sword",
        skill: "smithing",
        progress: 0,
      });

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
        makeSnapshot({
          production: { recipeId: "mithril-scimitar", name: "?", skill: "smithing" },
        }),
      );
      expect(engine.snapshot().production).toBeNull();
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
          production: { recipeId: "test-charm", name: "Test Charm", skill: "smithing" }, // levelReq 20
        }),
      );
      expect(engine.snapshot().production).toBeNull();
    });

    it("a save whose smithing recipe's inputs are no longer sufficient falls back to idle", () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({
          player: { skills: { smithing: { level: 1, xp: 0 } } },
          production: { recipeId: "test-sword", name: "Test Sword", skill: "smithing" },
        }),
      );
      expect(engine.snapshot().production).toBeNull();
    });

    it("a corrupted save with both a Monster and a Smithing Recipe set resumes only the Monster (mutual exclusion on load)", () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({
          bank: { items: [{ itemId: "bar", qty: 5 }] },
          monster: { id: "dummy", name: "Training Dummy", hp: 3, maxHp: 3 },
          production: { recipeId: "test-sword", name: "Test Sword", skill: "smithing" },
        }),
      );
      const snap = engine.snapshot();
      expect(snap.monster).not.toBeNull();
      expect(snap.production).toBeNull();
    });

    it("a valid Smithing Snapshot still round-trips unchanged", () => {
      // Fixed clock: snapshot() restamps savedAt (#69) on every call, so two real Date.now()
      // calls a millisecond apart would flake this equality — pin the clock instead.
      const original = createEngine(fixtureContent, seededRng(1), smithingSnapshot(5), () => 0);
      original.selectRecipe("test-sword");
      for (let i = 0; i < 5; i++) original.tick();
      const saved = original.snapshot();

      const restored = createEngine(
        fixtureContent,
        seededRng(1),
        JSON.parse(JSON.stringify(saved)),
        () => 0,
      );
      // Everything round-trips unchanged EXCEPT production.progress (#284): it's derived from
      // internal-only, un-persisted cooldown state, so a resume always re-arms fresh and restarts
      // progress at 0 rather than resuming mid-cycle.
      expect(restored.snapshot()).toEqual({
        ...saved,
        production: { ...saved.production, progress: 0 },
      });
    });
  });
});

/** #113: generalises the Smithing-only Recipe machinery so any Skill can ride RecipeDef/
 * selectRecipe. Deliberately scoped to the two new behaviors this slice adds — the "Smithing"
 * describe above already covers every pre-existing craft/gate/resume/overflow rule, which must
 * keep passing byte-identical once smithing/production is renamed. */
describe("Production skill chassis (#113)", () => {
  /** A throwaway non-Smithing recipe (Cooking), added only to prove selectRecipe/productionTick
   * route level-gating and XP through `recipe.skill` rather than a hardcoded Smithing. */
  function contentWithCookingRecipe() {
    return {
      ...fixtureContent,
      recipes: [
        ...fixtureContent.recipes,
        {
          id: "test-stew",
          name: "Test Stew",
          skill: "cooking" as const,
          levelReq: 1,
          inputs: [{ itemId: "bar", qty: 1 }],
          outputItemId: "meat",
          xp: 15,
          craftTicks: 2,
        },
      ],
    };
  }

  it("selecting a non-Smithing Recipe gates on and grants XP to that Recipe's own skill, not Smithing", () => {
    const engine = createEngine(
      contentWithCookingRecipe(),
      seededRng(1),
      makeSnapshot({ bank: { items: [{ itemId: "bar", qty: 1 }] } }),
    );
    expect(() => engine.selectRecipe("test-stew")).not.toThrow();
    for (let i = 0; i < 2; i++) engine.tick(); // test-stew.craftTicks === 2

    const snap = engine.snapshot();
    expect(snap.player.skills.cooking.xp).toBe(15);
    expect(snap.player.skills.smithing.xp).toBe(0);
  });

  it("a save written with the pre-slice 'smithing' field name still resumes the Recipe as production (tolerant production ?? smithing)", () => {
    const legacySave = {
      ...makeSnapshot({
        player: { skills: { smithing: { level: 1, xp: 0 } } },
        bank: { items: [{ itemId: "bar", qty: 5 }] },
      }),
      smithing: { recipeId: "test-sword", name: "Test Sword" },
    };
    const engine = createEngine(
      fixtureContent,
      seededRng(1),
      JSON.parse(JSON.stringify(legacySave)),
    );
    expect(engine.snapshot().production).toEqual({
      recipeId: "test-sword",
      name: "Test Sword",
      skill: "smithing",
      progress: 0,
    });
  });
});

describe("Ranged and Magic Skills (#7, #339 mode-aware Combat Style)", () => {
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

    it("equipping the ranged Test Bow with Accurate routes attack XP to Ranged; Hitpoints still trickles", () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(42),
        makeSnapshot({
          player: {
            combatStyle: "accurate",
            equipment: { weapon: "bow" },
            quiver: { itemId: "arrow", qty: 100_000 },
          },
        }),
      );
      engine.selectMonster("dummy");
      for (let i = 0; i < 400; i++) engine.tick();
      const { skills } = engine.snapshot().player;
      expect(skills.ranged.xp).toBeGreaterThan(0);
      expect(skills.attack.xp).toBe(0);
      expect(skills.strength.xp).toBe(0);
      expect(skills.defence.xp).toBe(0);
      expect(skills.magic.xp).toBe(0);
      expect(skills.hitpoints.xp).toBeCloseTo(skills.ranged.xp / 3, 6);
    });

    it("equipping the ranged Test Bow with Rapid routes attack XP to Ranged (same rate as Accurate)", () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(42),
        makeSnapshot({
          player: {
            combatStyle: "rapid",
            equipment: { weapon: "bow" },
            quiver: { itemId: "arrow", qty: 100_000 },
          },
        }),
      );
      engine.selectMonster("dummy");
      for (let i = 0; i < 400; i++) engine.tick();
      const { skills } = engine.snapshot().player;
      expect(skills.ranged.xp).toBeGreaterThan(0);
      expect(skills.defence.xp).toBe(0);
    });

    it("Defensive ranged splits XP 50/50 between Ranged and Defence", () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(42),
        makeSnapshot({
          player: {
            combatStyle: "defensive",
            equipment: { weapon: "bow" },
            quiver: { itemId: "arrow", qty: 100_000 },
          },
        }),
      );
      engine.selectMonster("dummy");
      for (let i = 0; i < 400; i++) engine.tick();
      const { skills } = engine.snapshot().player;
      expect(skills.ranged.xp).toBeGreaterThan(0);
      expect(skills.defence.xp).toBeGreaterThan(0);
      expect(skills.ranged.xp).toBeCloseTo(skills.defence.xp, 6);
      expect(skills.attack.xp).toBe(0);
      expect(skills.strength.xp).toBe(0);
    });

    it("equipping the magic Test Staff with Accurate routes attack XP to Magic; Hitpoints still trickles", () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(42),
        // Magic now requires a loaded Rune Slot (#119, #221) — air-rune casts test-spark.
        makeSnapshot({
          player: {
            combatStyle: "accurate",
            equipment: { weapon: "staff" },
            runeSlot: { itemId: "air-rune", qty: 100_000 },
          },
        }),
      );
      engine.selectMonster("dummy");
      for (let i = 0; i < 400; i++) engine.tick();
      const { skills } = engine.snapshot().player;
      expect(skills.magic.xp).toBeGreaterThan(0);
      expect(skills.attack.xp).toBe(0);
      expect(skills.strength.xp).toBe(0);
      expect(skills.defence.xp).toBe(0);
      expect(skills.ranged.xp).toBe(0);
      expect(skills.hitpoints.xp).toBeCloseTo(skills.magic.xp / 3, 6);
    });

    it("Defensive magic splits XP 50/50 between Magic and Defence", () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(42),
        makeSnapshot({
          player: {
            combatStyle: "defensive",
            equipment: { weapon: "staff" },
            runeSlot: { itemId: "air-rune", qty: 100_000 },
          },
        }),
      );
      engine.selectMonster("dummy");
      for (let i = 0; i < 400; i++) engine.tick();
      const { skills } = engine.snapshot().player;
      expect(skills.magic.xp).toBeGreaterThan(0);
      expect(skills.defence.xp).toBeGreaterThan(0);
      expect(skills.magic.xp).toBeCloseTo(skills.defence.xp, 6);
    });

    it("switching from a ranged weapon back to unarmed resumes ordinary Combat Style routing", () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(42),
        makeSnapshot({
          player: {
            combatStyle: "defensive",
            equipment: { weapon: "bow" },
            // Ranged now requires a loaded Quiver (#119).
            quiver: { itemId: "arrow", qty: 100_000 },
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

  describe("mode-aware Combat Style (#339)", () => {
    function bowEngine(style: CombatStyle, seed = 42) {
      return createEngine(
        fixtureContent,
        seededRng(seed),
        makeSnapshot({
          player: {
            combatStyle: style,
            equipment: { weapon: "bow" },
            quiver: { itemId: "arrow", qty: 100_000 },
          },
        }),
      );
    }

    it("Rapid yields more player attacks than Accurate over the same Tick window", () => {
      function playerAttacks(style: CombatStyle, ticks: number): number {
        const engine = bowEngine(style, 7);
        engine.selectMonster("dummy");
        let count = 0;
        engine.on("attack", (e) => {
          if (e.actor === "player") count++;
        });
        for (let i = 0; i < ticks; i++) engine.tick();
        return count;
      }

      expect(bowEngine("accurate", 7).snapshot().player.bonuses.attackSpeed).toBe(4);
      expect(bowEngine("rapid", 7).snapshot().player.bonuses.attackSpeed).toBe(3);
      expect(playerAttacks("rapid", 60)).toBeGreaterThan(playerAttacks("accurate", 60));
    });

    it("Rapid speed floor: max(1, speed - 1) for a 1-Tick ranged weapon", () => {
      const fastBowContent = {
        ...fixtureContent,
        items: [
          ...fixtureContent.items,
          {
            kind: "equipment" as const,
            id: "fast-bow",
            name: "Fast Bow",
            icon: "shortbow",
            slot: "weapon" as const,
            attackType: "ranged" as const,
            atkBonus: 10,
            strBonus: 30,
            def: { stab: 0, slash: 0, crush: 0, ranged: 0, magic: 0 },
            attackSpeed: 1,
            value: 20,
          },
        ],
      };
      const engine = createEngine(
        fastBowContent,
        seededRng(1),
        makeSnapshot({
          player: {
            combatStyle: "rapid",
            equipment: { weapon: "fast-bow" },
            quiver: { itemId: "arrow", qty: 100_000 },
          },
        }),
      );
      engine.selectMonster("dummy");
      expect(engine.snapshot().player.bonuses.attackSpeed).toBe(1);
    });

    it("equip sword (aggressive) → bow remaps to rapid; bow (rapid) → sword remaps to aggressive", () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({
          player: {
            combatStyle: "aggressive",
            equipment: { weapon: "bronze-sword" },
          },
          bank: { items: [{ itemId: "bow", qty: 1 }] },
        }),
      );
      engine.equip("bow");
      expect(engine.snapshot().player.combatStyle).toBe("rapid");

      engine.equip("bronze-sword");
      expect(engine.snapshot().player.combatStyle).toBe("aggressive");
    });

    it("Defensive is preserved across melee ↔ ranged weapon swaps", () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({
          player: {
            combatStyle: "defensive",
            equipment: { weapon: "bronze-sword" },
          },
          bank: { items: [{ itemId: "bow", qty: 1 }] },
        }),
      );
      engine.equip("bow");
      expect(engine.snapshot().player.combatStyle).toBe("defensive");
      engine.equip("bronze-sword");
      expect(engine.snapshot().player.combatStyle).toBe("defensive");
    });

    it('setCombatStyle("rapid") throws while a melee weapon is equipped', () => {
      const engine = freshEngine();
      expect(() => engine.setCombatStyle("rapid")).toThrow(/illegal for melee/i);
    });

    it('setCombatStyle("aggressive") throws while a bow is equipped', () => {
      const engine = bowEngine("accurate");
      expect(() => engine.setCombatStyle("aggressive")).toThrow(/illegal for ranged/i);
    });

    it("Defensive ranged raises the player's incoming-hit Defence roll through the Engine interface", () => {
      function monsterHitRate(style: CombatStyle): number {
        const engine = createEngine(
          fixtureContent,
          seededRng(11),
          makeSnapshot({
            player: {
              combatStyle: style,
              skills: { hitpoints: { level: 20, xp: xpForLevel(20) } },
              equipment: { weapon: "bow", head: "lucky-charm" },
              quiver: { itemId: "arrow", qty: 100_000 },
            },
          }),
        );
        engine.selectMonster("dummy");
        let hits = 0;
        let total = 0;
        engine.on("attack", (e) => {
          if (e.actor !== "monster") return;
          total++;
          if (e.hit) hits++;
        });
        for (let i = 0; i < 8000; i++) engine.tick();
        expect(total).toBeGreaterThan(200);
        return hits / total;
      }
      const rapidRate = monsterHitRate("rapid");
      const defensiveRate = monsterHitRate("defensive");
      expect(defensiveRate).toBeLessThan(rapidRate);
    });

    it("Defensive magic raises the player's incoming-hit Defence roll through the Engine interface", () => {
      function monsterHitRate(style: CombatStyle): number {
        const engine = createEngine(
          fixtureContent,
          seededRng(11),
          makeSnapshot({
            player: {
              combatStyle: style,
              skills: { hitpoints: { level: 20, xp: xpForLevel(20) } },
              equipment: { weapon: "staff", head: "lucky-charm" },
              runeSlot: { itemId: "air-rune", qty: 100_000 },
            },
          }),
        );
        engine.selectMonster("dummy");
        let hits = 0;
        let total = 0;
        engine.on("attack", (e) => {
          if (e.actor !== "monster") return;
          total++;
          if (e.hit) hits++;
        });
        for (let i = 0; i < 8000; i++) engine.tick();
        expect(total).toBeGreaterThan(200);
        return hits / total;
      }
      const rapidRate = monsterHitRate("rapid");
      const defensiveRate = monsterHitRate("defensive");
      expect(defensiveRate).toBeLessThan(rapidRate);
    });

    it('loads combatStyle "rapid" when legal and remaps rapid+mace to aggressive on resume', () => {
      const rapidBow = createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({
          player: {
            combatStyle: "rapid",
            equipment: { weapon: "bow" },
            quiver: { itemId: "arrow", qty: 100_000 },
          },
          monster: { id: "dummy", hp: 10 },
        }),
      );
      expect(rapidBow.snapshot().player.combatStyle).toBe("rapid");
      expect(rapidBow.snapshot().player.bonuses.attackSpeed).toBe(3);

      const remapped = createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({
          player: {
            combatStyle: "rapid",
            equipment: { weapon: "bronze-sword" },
          },
        }),
      );
      expect(remapped.snapshot().player.combatStyle).toBe("aggressive");
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
      // Fixed clock: snapshot() restamps savedAt (#69) on every call, so two real Date.now()
      // calls a millisecond apart would flake this equality — pin the clock instead.
      const original = createEngine(
        fixtureContent,
        // Seed 1 pinned: at tick 200 the player is NOT mid-Respawn (#120: pets' own per-kill roll
        // consumes an extra rng.next() draw, shifting which Ticks land a kill/death — hp:0 +
        // respawning:true is a real state that can never round-trip, since respawnTicksLeft is
        // deliberately never persisted (loadState always resumes un-respawning) and loadHp clamps
        // a saved hp back up to 1; this test wants a clean, round-trippable capture instead).
        seededRng(1),
        // Ranged now requires a loaded Quiver (#119).
        makeSnapshot({
          player: {
            combatStyle: "accurate",
            skills: { hitpoints: { level: 99, xp: xpForLevel(99) } },
            equipment: { weapon: "bow" },
            quiver: { itemId: "arrow", qty: 100_000 },
          },
        }),
        () => 0,
      );
      original.selectMonster("dummy");
      for (let i = 0; i < 200; i++) original.tick();
      const saved = original.snapshot();
      expect(saved.player.skills.ranged.xp).toBeGreaterThan(0);

      const restored = createEngine(
        fixtureContent,
        seededRng(1),
        JSON.parse(JSON.stringify(saved)),
        () => 0,
      );
      expect(restored.snapshot()).toEqual(saved);
    });
  });
});

describe("Attack Type axis (#99)", () => {
  it("a fresh engine's unarmed Attack Type is crush, the OSRS punch type", () => {
    expect(freshEngine().snapshot().player.bonuses.attackType).toBe("crush");
  });

  describe("Player accuracy routes against the equipped weapon's own Attack Type", () => {
    function contentWithDummySlashDef(defValue: number) {
      return {
        ...fixtureContent,
        monsters: fixtureContent.monsters.map((m) =>
          m.id === "dummy"
            ? { ...m, def: { stab: 0, slash: defValue, crush: 0, ranged: 0, magic: 0 } }
            : m,
        ),
      };
    }

    // bronze-sword is a slash weapon (fixture-content.ts) — with hitpoints trained up so the
    // player survives long enough across thousands of Ticks to build a real sample.
    function playerHitRateAgainst(defValue: number, ticks = 4000): number {
      const engine = createEngine(
        contentWithDummySlashDef(defValue),
        seededRng(7),
        makeSnapshot({
          player: {
            skills: { hitpoints: { level: 20, xp: xpForLevel(20) } },
            equipment: { weapon: "bronze-sword" },
          },
        }),
      );
      engine.selectMonster("dummy");
      let hits = 0;
      let total = 0;
      engine.on("attack", (e) => {
        if (e.actor !== "player") return;
        total++;
        if (e.hit) hits++;
      });
      for (let i = 0; i < ticks; i++) engine.tick();
      expect(total).toBeGreaterThan(0);
      return hits / total;
    }

    it("hits measurably more often against a monster with a low bonus in the weapon's Attack Type than a high one", () => {
      const lowDefHitRate = playerHitRateAgainst(0);
      const highDefHitRate = playerHitRateAgainst(300);
      expect(lowDefHitRate).toBeGreaterThan(highDefHitRate + 0.2);
    });
  });

  describe("Ranged combat is mechanically real: accuracy and max hit derive from the Ranged Skill", () => {
    function runRanged(
      rangedLevel: number,
      attackLevel: number,
      strengthLevel: number,
      ticks = 1000,
    ): number[] {
      const engine = createEngine(
        fixtureContent,
        seededRng(99),
        makeSnapshot({
          player: {
            combatStyle: "accurate",
            skills: {
              attack: { level: attackLevel, xp: xpForLevel(attackLevel) },
              strength: { level: strengthLevel, xp: xpForLevel(strengthLevel) },
              ranged: { level: rangedLevel, xp: xpForLevel(rangedLevel) },
              hitpoints: { level: 20, xp: xpForLevel(20) },
            },
            equipment: { weapon: "bow" }, // ranged
            // Ranged now requires a loaded Quiver (#119).
            quiver: { itemId: "arrow", qty: 100_000 },
          },
        }),
      );
      engine.selectMonster("weak-dummy");
      const damages: number[] = [];
      engine.on("attack", (e) => {
        if (e.actor === "player") damages.push(e.damage);
      });
      for (let i = 0; i < ticks; i++) engine.tick();
      expect(damages.length).toBeGreaterThan(0);
      return damages;
    }

    it("raising the Ranged Skill level raises the observed max hit", () => {
      const lowRanged = runRanged(1, 1, 1);
      const highRanged = runRanged(80, 1, 1);
      expect(Math.max(...highRanged)).toBeGreaterThan(Math.max(...lowRanged));
    });

    it("raising Attack/Strength Skill levels changes nothing about Ranged combat (bit-identical outcome, same seed)", () => {
      const lowAtkStr = runRanged(40, 1, 1);
      const highAtkStr = runRanged(40, 99, 99);
      expect(highAtkStr).toEqual(lowAtkStr);
    });
  });

  describe("Monster-vs-player accuracy is unchanged at uniform defence vectors (regression pin, #100)", () => {
    it("matches the theoretical hitChance for the scalar a uniform vector averages to", () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(11),
        makeSnapshot({
          player: {
            skills: { hitpoints: { level: 20, xp: xpForLevel(20) } },
            // lucky-charm's def vector is uniform 1 across every Attack Type (fixture-content.ts)
            // — gearDef(monster.attackType) must equal 1 regardless of which type the monster
            // attacks with, exactly what the old scalar defBonus (and, before #100, the interim
            // gearDefAverage) would have been at uniform vectors — bit-identical pre/post #100.
            equipment: { head: "lucky-charm" },
          },
        }),
      );
      engine.selectMonster("dummy"); // attackLevel 1: weak enough the player survives many Ticks
      let hits = 0;
      let total = 0;
      engine.on("attack", (e) => {
        if (e.actor !== "monster") return;
        total++;
        if (e.hit) hits++;
      });
      for (let i = 0; i < 8000; i++) engine.tick();
      expect(total).toBeGreaterThan(200);

      const dummy = fixtureContent.monsters.find((m) => m.id === "dummy")!;
      const expectedAtkRoll = attackRoll(dummy.attackLevel + 8, 0);
      // Player: level-1 Defence, default combatStyle "aggressive" (no Defence style boost).
      const expectedDefRoll = defenceRoll(effectiveLevel(1, "defence", "aggressive", "melee"), 1);
      const expectedHitChance = hitChance(expectedAtkRoll, expectedDefRoll);

      expect(hits / total).toBeCloseTo(expectedHitChance, 1);
    });
  });

  describe("Monster accuracy routes vs gearDef(monster.attackType) (#100)", () => {
    // Overrides "dummy"'s own attackType and "lucky-charm"'s (head slot) def vector — isolated per
    // call so each test picks exactly the Attack Type / armour combo it needs.
    function contentWith(monsterAttackType: AttackType, headDef: Record<AttackType, number>) {
      return {
        ...fixtureContent,
        monsters: fixtureContent.monsters.map((m) =>
          m.id === "dummy" ? { ...m, attackType: monsterAttackType } : m,
        ),
        items: fixtureContent.items.map((i) =>
          i.id === "lucky-charm" ? { ...i, def: headDef } : i,
        ),
      };
    }

    function monsterHitRate(
      monsterAttackType: AttackType,
      headDef: Record<AttackType, number>,
      ticks = 6000,
    ): number {
      const engine = createEngine(
        contentWith(monsterAttackType, headDef),
        seededRng(11),
        makeSnapshot({
          player: {
            skills: { hitpoints: { level: 20, xp: xpForLevel(20) } },
            equipment: { head: "lucky-charm" },
          },
        }),
      );
      engine.selectMonster("dummy");
      let hits = 0;
      let total = 0;
      engine.on("attack", (e) => {
        if (e.actor !== "monster") return;
        total++;
        if (e.hit) hits++;
      });
      for (let i = 0; i < ticks; i++) engine.tick();
      expect(total).toBeGreaterThan(200);
      return hits / total;
    }

    it("hits the player measurably more often when their armour is weak (vs strong) in the monster's own Attack Type — both directions", () => {
      const slashDef: Record<AttackType, number> = {
        stab: 0,
        slash: 300,
        crush: 0,
        ranged: 0,
        magic: 0,
      };
      const crushDef: Record<AttackType, number> = {
        stab: 0,
        slash: 0,
        crush: 300,
        ranged: 0,
        magic: 0,
      };

      // Direction 1: a slash-attacking monster hits far more often through crush-heavy armour
      // (weak vs slash) than through slash-heavy armour (strong vs slash).
      const slashMonsterVsCrushArmour = monsterHitRate("slash", crushDef);
      const slashMonsterVsSlashArmour = monsterHitRate("slash", slashDef);
      expect(slashMonsterVsCrushArmour).toBeGreaterThan(slashMonsterVsSlashArmour + 0.2);

      // Direction 2: swap which type the monster itself attacks with, same two armour pieces —
      // the result flips, proving the roll follows the monster's own attackType rather than a
      // fixed type (or the old average-across-all-types behaviour).
      const crushMonsterVsSlashArmour = monsterHitRate("crush", slashDef);
      const crushMonsterVsCrushArmour = monsterHitRate("crush", crushDef);
      expect(crushMonsterVsSlashArmour).toBeGreaterThan(crushMonsterVsCrushArmour + 0.2);
    });
  });
});

describe("Spells / Rune Slot (#101, #221)", () => {
  describe("loadRuneSlot selects the Spell", () => {
    it("throws on an unknown item id", () => {
      const engine = freshEngine();
      expect(() => engine.loadRuneSlot("no-such-item")).toThrow(/not a Rune/);
    });

    it("throws on a non-rune item (e.g. an arrow)", () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({ bank: { items: [{ itemId: "arrow", qty: 5 }] } }),
      );
      expect(() => engine.loadRuneSlot("arrow")).toThrow(/not a Rune/);
    });

    it("throws when the player owns zero of the rune", () => {
      const engine = freshEngine();
      expect(() => engine.loadRuneSlot("air-rune")).toThrow(/do not own/);
    });

    it("throws when the player's Magic level is below the Spell's levelReq", () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({ bank: { items: [{ itemId: "fire-rune", qty: 5 }] } }),
      );
      // test-inferno (fire-rune's Spell) has levelReq 13; a fresh player is Magic level 1.
      expect(() => engine.loadRuneSlot("fire-rune")).toThrow(/magic level too low: need 13/);
    });

    it("a rejected load (magic level too low) leaves the Rune Slot and Bank untouched", () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({ bank: { items: [{ itemId: "fire-rune", qty: 5 }] } }),
      );
      expect(() => engine.loadRuneSlot("fire-rune")).toThrow();
      expect(engine.snapshot().player.runeSlot).toBeNull();
      expect(engine.snapshot().player.spell).toBeNull();
      expect(engine.snapshot().bank.items).toEqual([{ itemId: "fire-rune", qty: 5 }]);
    });

    it("a legal load selects the Spell and persists across a save/load round-trip", () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({
          player: { skills: { magic: { level: 20, xp: xpForLevel(20) } } },
          bank: { items: [{ itemId: "water-rune", qty: 12 }] },
        }),
      );
      engine.loadRuneSlot("water-rune");
      expect(engine.snapshot().player.spell).toEqual({
        id: "test-blast",
        name: "Test Blast",
        element: "water",
      });
      expect(engine.snapshot().player.runeSlot).toEqual({ itemId: "water-rune", qty: 12 });

      const reloaded = createEngine(fixtureContent, seededRng(1), engine.snapshot());
      expect(reloaded.snapshot().player.spell).toEqual({
        id: "test-blast",
        name: "Test Blast",
        element: "water",
      });
      expect(reloaded.snapshot().player.runeSlot).toEqual({ itemId: "water-rune", qty: 12 });
    });

    it("loading a rune does not change activity — legal any time, like setCombatStyle", () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({ bank: { items: [{ itemId: "air-rune", qty: 5 }] } }),
      );
      engine.selectMonster("dummy");
      engine.loadRuneSlot("air-rune");
      expect(engine.snapshot().monster?.id).toBe("dummy");
    });

    it("loading a DIFFERENT rune returns the previously loaded stack to the Bank", () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({
          player: {
            skills: { magic: { level: 20, xp: xpForLevel(20) } },
            runeSlot: { itemId: "water-rune", qty: 10 },
          },
          bank: { items: [{ itemId: "air-rune", qty: 4 }] },
        }),
      );
      engine.loadRuneSlot("air-rune");
      expect(engine.snapshot().player.runeSlot).toEqual({ itemId: "air-rune", qty: 4 });
      expect(engine.snapshot().bank.items).toEqual(
        expect.arrayContaining([{ itemId: "water-rune", qty: 10 }]),
      );
    });

    it("loading the SAME rune tops up the stack in place", () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({
          player: { runeSlot: { itemId: "air-rune", qty: 5 } },
          bank: { items: [{ itemId: "air-rune", qty: 3 }] },
        }),
      );
      engine.loadRuneSlot("air-rune");
      expect(engine.snapshot().player.runeSlot).toEqual({ itemId: "air-rune", qty: 8 });
      expect(engine.snapshot().bank.items.find((s) => s.itemId === "air-rune")).toBeUndefined();
    });

    it("a full Bank on the swap throws loudly and mutates nothing", () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({
          player: { runeSlot: { itemId: "water-rune", qty: 10 } },
          bank: {
            items: [
              { itemId: "bar", qty: 1 },
              { itemId: "air-rune", qty: 4 },
            ],
            capacity: 1,
          },
        }),
      );
      expect(() => engine.loadRuneSlot("air-rune")).toThrow(/bank is full/);
      expect(engine.snapshot().player.runeSlot).toEqual({ itemId: "water-rune", qty: 10 });
    });
  });

  describe("unloadRuneSlot", () => {
    it("returns the stack to the Bank and empties the slot", () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({ player: { runeSlot: { itemId: "air-rune", qty: 7 } } }),
      );
      engine.unloadRuneSlot();
      expect(engine.snapshot().player.runeSlot).toBeNull();
      expect(engine.snapshot().bank.items).toEqual(
        expect.arrayContaining([{ itemId: "air-rune", qty: 7 }]),
      );
    });

    it("is a no-op on an already-empty slot", () => {
      const engine = freshEngine();
      expect(() => engine.unloadRuneSlot()).not.toThrow();
      expect(engine.snapshot().player.runeSlot).toBeNull();
    });

    it("a qty-0 loaded slot clears to null without needing a Bank Slot", () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({
          player: { runeSlot: { itemId: "air-rune", qty: 0 } },
          bank: { items: [{ itemId: "bar", qty: 1 }], capacity: 1 },
        }),
      );
      expect(() => engine.unloadRuneSlot()).not.toThrow();
      expect(engine.snapshot().player.runeSlot).toBeNull();
    });
  });

  describe("resolution: no rune loaded -> no Spell (#221 removed the levelReq-1 fallback)", () => {
    it("a fresh engine's Rune Slot and Spell are both empty", () => {
      const snap = freshEngine().snapshot();
      expect(snap.player.runeSlot).toBeNull();
      expect(snap.player.spell).toBeNull();
    });

    it("an itemId that no longer resolves to a rune Item (dropped/corrupted content) loads as null, with no Spell", () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({ player: { runeSlot: { itemId: "no-longer-exists", qty: 5 } } }),
      );
      expect(engine.snapshot().player.runeSlot).toBeNull();
      expect(engine.snapshot().player.spell).toBeNull();
    });

    it("a depleted (qty 0) loaded rune still resolves its Spell — the readout stays populated while depleted", () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({ player: { runeSlot: { itemId: "air-rune", qty: 0 } } }),
      );
      expect(engine.snapshot().player.spell).toEqual({
        id: "test-spark",
        name: "Test Spark",
        element: "air",
      });
    });
  });

  describe("Magic accuracy and max hit (#101, #221)", () => {
    it("magic max hit changes with the loaded rune's Spell, not with Strength level", () => {
      function maxDamage(magicLevel: number, strengthLevel: number, runeItemId: string): number {
        const engine = createEngine(
          fixtureContent,
          seededRng(5),
          makeSnapshot({
            player: {
              skills: {
                magic: { level: magicLevel, xp: xpForLevel(magicLevel) },
                strength: { level: strengthLevel, xp: xpForLevel(strengthLevel) },
                hitpoints: { level: 20, xp: xpForLevel(20) },
              },
              equipment: { weapon: "staff" },
              runeSlot: { itemId: runeItemId, qty: 100_000 },
            },
          }),
        );
        engine.selectMonster("control-dummy");
        let max = 0;
        engine.on("attack", (e) => {
          if (e.actor === "player") max = Math.max(max, e.damage);
        });
        for (let i = 0; i < 2000; i++) engine.tick();
        return max;
      }

      // Same rune/Spell (test-spark via air-rune, baseMaxHit 5), Strength 1 vs 99: byte-identical
      // ceiling — Strength never enters magic's max-hit formula (#101 dropped strBonus entirely).
      const lowStr = maxDamage(20, 1, "air-rune");
      const highStr = maxDamage(20, 99, "air-rune");
      expect(highStr).toBe(lowStr);

      // Same Magic level, a stronger Spell (test-blast via water-rune, baseMaxHit 15): ceiling rises.
      const weakerSpell = maxDamage(20, 1, "air-rune");
      const strongerSpell = maxDamage(20, 1, "water-rune");
      expect(strongerSpell).toBeGreaterThan(weakerSpell);
    });

    it("raising Attack/Strength changes nothing about magic combat (bit-identical outcome, same seed) — accuracy is Magic level + weapon atkBonus only", () => {
      function run(magicLevel: number, attackLevel: number, strengthLevel: number): number[] {
        const engine = createEngine(
          fixtureContent,
          seededRng(77),
          makeSnapshot({
            player: {
              skills: {
                magic: { level: magicLevel, xp: xpForLevel(magicLevel) },
                attack: { level: attackLevel, xp: xpForLevel(attackLevel) },
                strength: { level: strengthLevel, xp: xpForLevel(strengthLevel) },
                hitpoints: { level: 20, xp: xpForLevel(20) },
              },
              equipment: { weapon: "staff" },
              runeSlot: { itemId: "air-rune", qty: 100_000 },
            },
          }),
        );
        engine.selectMonster("control-dummy");
        const damages: number[] = [];
        engine.on("attack", (e) => {
          if (e.actor === "player") damages.push(e.damage);
        });
        for (let i = 0; i < 1000; i++) engine.tick();
        expect(damages.length).toBeGreaterThan(0);
        return damages;
      }

      const lowAtkStr = run(40, 1, 1);
      const highAtkStr = run(40, 99, 99);
      expect(highAtkStr).toEqual(lowAtkStr);
    });
  });

  describe("Element weakness multiplier (#101) — the one damage-side modifier in the Hybrid model", () => {
    /** Runs the same seeded Rng, same player, against `monsterId` for `ticks` Ticks, returning
     * every player `attack` event's (hit, damage) pair. Two runs built from the same seed produce
     * byte-identical accuracy rolls and base damage rolls (`weakElement` never enters the accuracy
     * math and the multiplier consumes no extra Rng draws) — so diffing two runs against paired
     * fixture monsters (see fixture-content.ts's weak-dummy/control-dummy) isolates exactly what
     * the multiplier changed, instead of eyeballing aggregate statistics. */
    function runAttacks(
      monsterId: string,
      runeItemId: string,
      seed: number,
      ticks = 500,
    ): { hit: boolean; damage: number }[] {
      const engine = createEngine(
        fixtureContent,
        seededRng(seed),
        makeSnapshot({
          player: {
            skills: {
              magic: { level: 20, xp: xpForLevel(20) },
              hitpoints: { level: 20, xp: xpForLevel(20) },
            },
            equipment: { weapon: "staff" },
            runeSlot: { itemId: runeItemId, qty: 100_000 },
          },
        }),
      );
      engine.selectMonster(monsterId);
      const attacks: { hit: boolean; damage: number }[] = [];
      engine.on("attack", (e) => {
        if (e.actor === "player") attacks.push({ hit: e.hit, damage: e.damage });
      });
      for (let i = 0; i < ticks; i++) engine.tick();
      expect(attacks.length).toBeGreaterThan(0);
      return attacks;
    }

    it("a matching-element rune (air-rune/Test Spark) deals floor(damage × 1.5) against a weak-to-air monster, versus the identical non-weak control run", () => {
      const control = runAttacks("control-dummy", "air-rune", 5);
      const weak = runAttacks("weak-dummy", "air-rune", 5);

      expect(weak).toHaveLength(control.length);
      let sawAHit = false;
      for (let i = 0; i < control.length; i++) {
        const c = control[i] as { hit: boolean; damage: number };
        const w = weak[i] as { hit: boolean; damage: number };
        expect(w.hit).toBe(c.hit); // weakElement never affects accuracy
        expect(w.damage).toBe(Math.floor(c.damage * 1.5));
        if (c.hit) sawAHit = true;
      }
      expect(sawAHit).toBe(true); // the sample actually exercised the multiplier path
    });

    it("a non-matching element (water-rune/Test Blast) gets no multiplier against the same weak-to-air monster — byte-identical to the control run", () => {
      const control = runAttacks("control-dummy", "water-rune", 9);
      const mismatched = runAttacks("weak-dummy", "water-rune", 9);
      expect(mismatched).toEqual(control);
    });
  });

  describe("Snapshot / content shape", () => {
    it("Content.spells is non-empty and every spell round-trips its own fields, incl. runeId", () => {
      const spark = fixtureContent.spells.find((s) => s.id === "test-spark");
      expect(spark).toEqual({
        id: "test-spark",
        name: "Test Spark",
        element: "air",
        levelReq: 1,
        baseMaxHit: 5,
        runeId: "air-rune",
      });
    });
  });
});

/**
 * Modifier-aggregation layer (#114): the layer itself is internal (no Snapshot surface), so these
 * prove the wiring the only way observable from the public Engine interface — through actual
 * combat/fishing outcomes, using each Engine's own real per-instance state: an owned fixture Pet
 * (via a Snapshot's `player.ownedPets`) or an active fixture Potion (via `player.potionSlot`), the
 * production `activeModifierSources()` seams (#234 removed the process-global test-tuning
 * `__setModifierSourcesForTest`). Every other describe block in this file exercises the ×1
 * identity implicitly: zero owned Pets/active Potion means both aggregators fold to 1 everywhere
 * they're applied.
 */
describe("Modifier-aggregation layer (#114)", () => {
  it("a +20% Strength modifier source (owned test-combat-pet) raises the observed player max hit in melee combat, vs a baseline Engine that doesn't own it", () => {
    function meleeDamages(ownedPets: string[] = []): number[] {
      const engine = createEngine(
        fixtureContent,
        seededRng(99),
        makeSnapshot({
          player: {
            skills: {
              attack: { level: 90, xp: xpForLevel(90) },
              strength: { level: 90, xp: xpForLevel(90) },
              hitpoints: { level: 20, xp: xpForLevel(20) },
            },
            ownedPets,
          },
        }),
      );
      // "control-dummy" (hp 999, maxHit 0, defenceLevel 1, no weakElement): never dies mid-sample
      // (so damage never clamps to remaining Monster HP) and never attacks back, isolating the
      // player's own max-hit ceiling from anything else in play.
      engine.selectMonster("control-dummy");
      const damages: number[] = [];
      engine.on("attack", (e) => {
        if (e.actor === "player") damages.push(e.damage);
      });
      for (let i = 0; i < 1000; i++) engine.tick();
      expect(damages.length).toBeGreaterThan(0);
      return damages;
    }

    const baseline = meleeDamages();
    // "test-combat-pet" (fixtureContent): target "strength", boostPct 0.2 — a separate Engine
    // built from a Snapshot that owns it, compared against the baseline Engine above that doesn't.
    const boosted = meleeDamages(["test-combat-pet"]);

    // effectiveLevel(90, "strength", "aggressive") = 101 -> maxHit(101, 0) = 10 at ×1, but
    // floor(101 * 1.2) = 121 -> maxHit(121, 0) = 12 once the pet is owned: a real ceiling raise,
    // not RNG noise (attack level 90 vs control-dummy's defenceLevel 1 lands nearly every swing,
    // so 1000 Ticks samples each ceiling many times over).
    expect(Math.max(...boosted)).toBeGreaterThan(Math.max(...baseline));
  });

  it("a +20% Attack modifier source leaves the max hit alone but is isolated per Skill (Strength untouched)", () => {
    // Test-local Content (#234): fixtureContent plus one extra observable Pet targeting "attack"
    // — not permanent production/fixture Content, and doesn't touch any other Pet-count/UI
    // assertion elsewhere (fixtureContent itself is untouched; this is a local derivation).
    const attackPetContent = {
      ...fixtureContent,
      pets: [
        ...fixtureContent.pets,
        {
          id: "test-attack-pet",
          name: "Test Attack Pet",
          icon: "goblin-charm",
          target: "attack" as const,
          boostPct: 0.2,
          source: "combat" as const,
        },
      ],
    };
    const engine = createEngine(
      attackPetContent,
      seededRng(99),
      makeSnapshot({
        player: {
          skills: {
            attack: { level: 90, xp: xpForLevel(90) },
            strength: { level: 90, xp: xpForLevel(90) },
            hitpoints: { level: 20, xp: xpForLevel(20) },
          },
          // Restored through this Engine's own Snapshot/loadout state (#234), not a global seam.
          ownedPets: ["test-attack-pet"],
        },
      }),
    );
    engine.selectMonster("control-dummy"); // hp 999: damage never clamps to remaining Monster HP
    const damages: number[] = [];
    engine.on("attack", (e) => {
      if (e.actor === "player") damages.push(e.damage);
    });
    for (let i = 0; i < 1000; i++) engine.tick();
    expect(damages.length).toBeGreaterThan(0);
    // maxHit(101, 0) = 10, same ceiling as the unmodified ×1 baseline above — an Attack-targeted
    // source must never leak into the Strength-derived max hit.
    expect(Math.max(...damages)).toBe(10);
  });

  it("a fishing-speed modifier source (owned test-fishing-pet) shortens the Catch cadence: more fish-caught events over the same Tick window than a baseline Engine that doesn't own it", () => {
    function catchesOver(ticks: number, ownedPets: string[] = []): number {
      const engine = createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({ player: { ownedPets } }),
      );
      let caught = 0;
      engine.on("fish-caught", () => caught++);
      engine.selectFishingSpot("pond");
      for (let i = 0; i < ticks; i++) engine.tick();
      return caught;
    }

    const baseline = catchesOver(60);
    // "test-fishing-pet" (fixtureContent): target "fishing-speed", boostPct 0.5.
    const boosted = catchesOver(60, ["test-fishing-pet"]);

    expect(boosted).toBeGreaterThan(baseline);
  });

  it("locality regression (#234): pumping a baseline and a boosted Engine INTERLEAVED still shows the modifier only on the boosted instance", () => {
    const baseline = createEngine(
      fixtureContent,
      seededRng(99),
      makeSnapshot({
        player: {
          skills: {
            attack: { level: 90, xp: xpForLevel(90) },
            strength: { level: 90, xp: xpForLevel(90) },
            hitpoints: { level: 20, xp: xpForLevel(20) },
          },
        },
      }),
    );
    const boosted = createEngine(
      fixtureContent,
      seededRng(99),
      makeSnapshot({
        player: {
          skills: {
            attack: { level: 90, xp: xpForLevel(90) },
            strength: { level: 90, xp: xpForLevel(90) },
            hitpoints: { level: 20, xp: xpForLevel(20) },
          },
          ownedPets: ["test-combat-pet"],
        },
      }),
    );
    baseline.selectMonster("control-dummy");
    boosted.selectMonster("control-dummy");

    const baselineDamages: number[] = [];
    const boostedDamages: number[] = [];
    baseline.on("attack", (e) => {
      if (e.actor === "player") baselineDamages.push(e.damage);
    });
    boosted.on("attack", (e) => {
      if (e.actor === "player") boostedDamages.push(e.damage);
    });

    // Interleaved, not sequential: every Tick alternates which Engine advances, so any leakage
    // through shared module state (the very bug #234 removes) would show up as the baseline
    // Engine observing the boosted ceiling mid-run.
    for (let i = 0; i < 1000; i++) {
      baseline.tick();
      boosted.tick();
    }

    expect(baselineDamages.length).toBeGreaterThan(0);
    expect(boostedDamages.length).toBeGreaterThan(0);
    // Same ceilings as the standalone Strength-boost test above: 10 (×1) vs 12 (×1.2).
    expect(Math.max(...baselineDamages)).toBe(10);
    expect(Math.max(...boostedDamages)).toBe(12);
    expect(baseline.snapshot().player.ownedPets).toEqual([]);
    expect(boosted.snapshot().player.ownedPets).toEqual(["test-combat-pet"]);
  });
});

/**
 * Deterministic Rng adapter for Pet-drop tests (#234, local to this test file): replays `values`
 * in order, then repeats `fallback` forever. A production Pet-roll draw compares against a real
 * tuning constant (`PET_DROP_CHANCE` 1/2000, `BOSS_PET_DROP_CHANCE` 1/300), so a value below both
 * forces a roll to succeed and a value at/above the relevant chance forces it to fail — the same
 * seam every other Engine test drives (`createEngine`'s injected `Rng`), just fed a scripted
 * sequence instead of a PRNG.
 */
function sequenceRng(values: number[], fallback = 0): Rng {
  let index = 0;
  return { next: () => values[index++] ?? fallback };
}

/**
 * Pets (#120): very-rare drops from a qualifying action (a kill, a Catch, a craft completion) or a
 * specific Boss, each granting a small ALWAYS-ON modifier once owned — no active-pet slot, no
 * charges (owner decision, grilled: "All owned always-on"). These tests force or deny a roll
 * deterministically through `sequenceRng` (above) against the real, unchanged production
 * 1-in-2000/1-in-300 chances (#234 removed the `__setPetDropChanceForTest` global override).
 * fixtureContent's "pet-target" (hp 1, maxHit 0) exists purely so a kill-driven roll resolves
 * within a single scripted attack. For the player's one-hit kill against "pet-target", the known
 * draw order per resolved swing is: accuracy draw, damage draw, then (only on a kill) the
 * qualifying Pet-roll draw(s) — see `rollDamage`/`playerAttack` in engine.ts.
 */
describe("Pets (#120)", () => {
  it('a kill rolls the killed action\'s "combat" pet at the real tuning chance, entering ownedPets and firing pet-dropped', () => {
    const engine = createEngine(fixtureContent, sequenceRng([0, 0.999, 0]));
    engine.selectMonster("pet-target");
    let droppedId: string | undefined;
    engine.on("pet-dropped", (e) => {
      droppedId = e.petId;
    });
    // playerCooldown/monsterCooldown both start at their own attackSpeed, so the first several
    // Ticks draw nothing; the scripted values land on the Tick the player's swing actually
    // resolves.
    for (let i = 0; i < 10 && droppedId === undefined; i++) engine.tick();
    expect(droppedId).toBe("test-combat-pet");
    expect(engine.snapshot().player.ownedPets).toContain("test-combat-pet");
  });

  it('a Catch success (not merely an attempt) rolls the "fishing" pet', () => {
    // catchChance 1 (fixtureContent's "pond") makes every attempt guaranteed, so an all-zero Rng
    // both passes the catch roll and forces the Pet roll below the real chance.
    const engine = createEngine(fixtureContent, sequenceRng([], 0));
    engine.selectFishingSpot("pond");
    let droppedId: string | undefined;
    engine.on("pet-dropped", (e) => {
      droppedId = e.petId;
    });
    for (let i = 0; i < 10 && droppedId === undefined; i++) engine.tick();
    expect(droppedId).toBe("test-fishing-pet");
    expect(engine.snapshot().player.ownedPets).toContain("test-fishing-pet");
  });

  it('a craft completion rolls the "production" pet', () => {
    const engine = createEngine(
      fixtureContent,
      sequenceRng([], 0),
      makeSnapshot({ bank: { items: [{ itemId: "bar", qty: 1 }] } }),
    );
    engine.selectRecipe("test-sword"); // craftTicks 3, 1 bar in the Bank — completes once
    let droppedId: string | undefined;
    engine.on("pet-dropped", (e) => {
      droppedId = e.petId;
    });
    for (let i = 0; i < 10 && droppedId === undefined; i++) engine.tick();
    expect(droppedId).toBe("test-production-pet");
    expect(engine.snapshot().player.ownedPets).toContain("test-production-pet");
  });

  it("an already-owned pet never re-rolls, even against a forced-success Rng", () => {
    const engine = createEngine(
      fixtureContent,
      sequenceRng([0, 0.999], 0),
      makeSnapshot({ player: { ownedPets: ["test-combat-pet"] } }),
    );
    engine.selectMonster("pet-target");
    let dropped = false;
    engine.on("pet-dropped", () => {
      dropped = true;
    });
    for (let i = 0; i < 20; i++) engine.tick();
    expect(dropped).toBe(false);
    expect(engine.snapshot().player.ownedPets).toEqual(["test-combat-pet"]);
  });

  it("a boss pet only drops from its source.boss Monster, never from an ordinary kill, even against a forced-success Rng", () => {
    const engine = createEngine(fixtureContent, sequenceRng([0, 0.999, 0]));
    engine.selectMonster("pet-target"); // NOT "boss-dummy" — test-boss-pet's source.boss
    const droppedIds: string[] = [];
    engine.on("pet-dropped", (e) => droppedIds.push(e.petId));
    for (let i = 0; i < 10 && droppedIds.length === 0; i++) engine.tick();
    expect(droppedIds).toContain("test-combat-pet");
    expect(droppedIds).not.toContain("test-boss-pet");
  });

  it("killing the matching source.boss Monster rolls its own boss pet, independently of the generic combat-pet roll", () => {
    // High Strength/Attack (mirrors the modifier-aggregation tests above) so the player one-shots
    // "boss-dummy" (hp 5): floor(0.999 * (maxHit + 1)) needs a maxHit of at least 4.
    const engine = createEngine(
      fixtureContent,
      sequenceRng([0, 0.999, 0, 0]),
      makeSnapshot({
        player: {
          skills: {
            attack: { level: 90, xp: xpForLevel(90) },
            strength: { level: 90, xp: xpForLevel(90) },
            hitpoints: { level: 20, xp: xpForLevel(20) },
          },
        },
      }),
    );
    engine.selectMonster("boss-dummy"); // fixtureContent's own "gauntlet" Dungeon boss
    const droppedIds: string[] = [];
    engine.on("pet-dropped", (e) => droppedIds.push(e.petId));
    for (let i = 0; i < 10 && droppedIds.length === 0; i++) engine.tick();
    expect(droppedIds).toContain("test-boss-pet");
  });

  it("every owned pet's modifier is always-on via activeModifierSources (#114) — no slot, no charges", () => {
    function meleeDamages(
      ownedPets: string[] = [],
      potionSlot: { itemId: string; qty: number; charges: number } | null = null,
    ): number[] {
      const engine = createEngine(
        fixtureContent,
        seededRng(99),
        makeSnapshot({
          player: {
            skills: {
              attack: { level: 90, xp: xpForLevel(90) },
              strength: { level: 90, xp: xpForLevel(90) },
              hitpoints: { level: 20, xp: xpForLevel(20) },
            },
            ownedPets,
            potionSlot,
          },
        }),
      );
      // "control-dummy" (hp 999, maxHit 0, defenceLevel 1): never dies mid-sample and never
      // attacks back, mirroring the #114 potion/pet-source tests above.
      engine.selectMonster("control-dummy");
      const damages: number[] = [];
      engine.on("attack", (e) => {
        if (e.actor === "player") damages.push(e.damage);
      });
      for (let i = 0; i < 1000; i++) engine.tick();
      expect(damages.length).toBeGreaterThan(0);
      return damages;
    }

    const baseline = meleeDamages();
    const petOwned = meleeDamages(["test-combat-pet"]);
    // "test-combat-pet" targets strength at boostPct 0.2 (fixtureContent) — no slot/charges
    // involved (unlike the potion below), it's unconditional purely from being in ownedPets.
    expect(Math.max(...petOwned)).toBeGreaterThan(Math.max(...baseline));

    // Composes ADDITIVELY with an active potion targeting the same Skill (#114's own aggregation
    // rule: "level multipliers stack additively within a target, then multiply the effective
    // level once") — pet alone (+20%) vs pet + potion (+20% + 20% = +40%) should raise the
    // ceiling further still.
    const potionPlusPet = meleeDamages(["test-combat-pet"], {
      itemId: "strength-potion",
      qty: 99,
      charges: 3,
    });
    expect(Math.max(...potionPlusPet)).toBeGreaterThan(Math.max(...petOwned));
  });
});

/**
 * Herblore + charge potions (#118): the Potion Slot mirrors Active Food Slots (#61) but singular
 * — see PotionSlot's own doc (types.ts). fixtureContent's "strength-potion" (target "strength",
 * boostPct 0.2, charges 3) and "fishing-potion" (target "fishing-speed", boostPct 0.5, charges 3)
 * exercise the two qualifying-action kinds independently; "production-potion" (target
 * "production-speed", same shape) covers the third. "herb" + the "test-brew" Recipe (skill
 * "herblore") exercise the Herblore Recipe chassis itself.
 */
describe("Herblore and Potion Slot (#118)", () => {
  describe("assignPotionSlot", () => {
    it("moves the entire Bank stock into the slot, opening it with the PotionDef's charges", () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({ bank: { items: [{ itemId: "strength-potion", qty: 5 }] } }),
      );
      engine.assignPotionSlot("strength-potion");
      expect(engine.snapshot().player.potionSlot).toEqual({
        itemId: "strength-potion",
        qty: 5,
        charges: 3,
      });
      expect(engine.snapshot().bank.items).toEqual([]);
    });

    it("throws for an unknown itemId or a non-Potion item", () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({ bank: { items: [{ itemId: "meat", qty: 5 }] } }),
      );
      expect(() => engine.assignPotionSlot("unobtainium")).toThrow(/potion/i);
      expect(() => engine.assignPotionSlot("meat")).toThrow(/potion/i);
    });

    it("throws when the Bank holds zero of the Potion", () => {
      const engine = freshEngine();
      expect(() => engine.assignPotionSlot("strength-potion")).toThrow(/own/i);
    });

    it("re-assigning the same potion type tops up qty, keeping the open one's remaining charges", () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({
          bank: { items: [{ itemId: "strength-potion", qty: 4 }] },
          player: { potionSlot: { itemId: "strength-potion", qty: 2, charges: 1 } },
        }),
      );
      engine.assignPotionSlot("strength-potion");
      // qty adds (2 + 4 = 6); charges stays at the already-open potion's remaining 1 — no reset,
      // the buff (and its drain progress) carries through unbroken.
      expect(engine.snapshot().player.potionSlot).toEqual({
        itemId: "strength-potion",
        qty: 6,
        charges: 1,
      });
      expect(engine.snapshot().bank.items).toEqual([]);
    });

    it("swap: assigning a DIFFERENT potion consumes the open one (qty-1 returns to the Bank)", () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({
          bank: { items: [{ itemId: "fishing-potion", qty: 2 }] },
          player: { potionSlot: { itemId: "strength-potion", qty: 3, charges: 2 } },
        }),
      );
      engine.assignPotionSlot("fishing-potion");
      expect(engine.snapshot().player.potionSlot).toEqual({
        itemId: "fishing-potion",
        qty: 2,
        charges: 3,
      });
      // The open strength-potion (charges 2, still > 0) is consumed/wasted; qty-1 = 2 return.
      expect(engine.snapshot().bank.items).toEqual([{ itemId: "strength-potion", qty: 2 }]);
    });

    it('a bank-full swap throws "bank is full", mutating nothing', () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({
          bank: {
            items: [
              { itemId: "bar", qty: 1 },
              { itemId: "fishing-potion", qty: 2 },
            ],
            capacity: 1,
          },
          player: { potionSlot: { itemId: "strength-potion", qty: 3, charges: 2 } },
        }),
      );
      expect(() => engine.assignPotionSlot("fishing-potion")).toThrow(/bank is full/i);
      expect(engine.snapshot().player.potionSlot).toEqual({
        itemId: "strength-potion",
        qty: 3,
        charges: 2,
      });
      expect(engine.snapshot().bank.items).toEqual(
        expect.arrayContaining([
          { itemId: "bar", qty: 1 },
          { itemId: "fishing-potion", qty: 2 },
        ]),
      );
    });
  });

  describe("unassignPotionSlot", () => {
    it("consumes the open potion, returning qty-1 to the Bank, and clears the slot to null", () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({ player: { potionSlot: { itemId: "strength-potion", qty: 5, charges: 2 } } }),
      );
      engine.unassignPotionSlot();
      expect(engine.snapshot().player.potionSlot).toBeNull();
      expect(engine.snapshot().bank.items).toEqual([{ itemId: "strength-potion", qty: 4 }]);
    });

    it("a qty-1 slot unassigns to an empty Bank entry (nothing returns)", () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({ player: { potionSlot: { itemId: "strength-potion", qty: 1, charges: 2 } } }),
      );
      engine.unassignPotionSlot();
      expect(engine.snapshot().player.potionSlot).toBeNull();
      expect(engine.snapshot().bank.items).toEqual([]);
    });

    it("is a harmless no-op when already null", () => {
      const engine = freshEngine();
      expect(() => engine.unassignPotionSlot()).not.toThrow();
      expect(engine.snapshot().player.potionSlot).toBeNull();
    });

    it('throws "bank is full" when the returning stock needs a new Bank Slot at capacity', () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({
          bank: { items: [{ itemId: "bar", qty: 1 }], capacity: 1 },
          player: { potionSlot: { itemId: "strength-potion", qty: 5, charges: 2 } },
        }),
      );
      expect(() => engine.unassignPotionSlot()).toThrow(/bank is full/i);
      expect(engine.snapshot().player.potionSlot).toEqual({
        itemId: "strength-potion",
        qty: 5,
        charges: 2,
      });
    });
  });

  describe("charge decrement (the tick side)", () => {
    it("a combat-Skill-target potion decrements once per resolved player attack", () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({ bank: { items: [{ itemId: "strength-potion", qty: 1 }] } }),
      );
      engine.assignPotionSlot("strength-potion");
      // "control-dummy": never dies, never attacks back — isolates the player's own attack cadence.
      engine.selectMonster("control-dummy");
      for (let i = 0; i < UNARMED_SPEED; i++) engine.tick(); // one resolved player attack
      expect(engine.snapshot().player.potionSlot?.charges).toBe(2);
    });

    it('auto-continues from the stack: charges hitting 0 with qty>1 consumes one and reopens with fresh charges ("buff stays unbroken")', () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({ bank: { items: [{ itemId: "strength-potion", qty: 2 }] } }),
      );
      engine.assignPotionSlot("strength-potion");
      engine.selectMonster("control-dummy");
      for (let i = 0; i < UNARMED_SPEED * 3; i++) engine.tick(); // 3 resolved player attacks
      // charges: 3 -> 2 -> 1 -> 0 on the 3rd attack; qty 2 > 1, so it auto-continues: qty 1,
      // charges reset to the PotionDef's own 3 — the buff (still target "strength") never lapses.
      expect(engine.snapshot().player.potionSlot).toEqual({
        itemId: "strength-potion",
        qty: 1,
        charges: 3,
      });
    });

    it("clears to null: charges hitting 0 with qty===1 ends the buff", () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({ bank: { items: [{ itemId: "strength-potion", qty: 1 }] } }),
      );
      engine.assignPotionSlot("strength-potion");
      engine.selectMonster("control-dummy");
      for (let i = 0; i < UNARMED_SPEED * 3; i++) engine.tick(); // 3 resolved player attacks
      expect(engine.snapshot().player.potionSlot).toBeNull();
    });

    it("a fishing-speed potion decrements once per catch ATTEMPT (fishingTick), regardless of the catch roll", () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({ bank: { items: [{ itemId: "fishing-potion", qty: 1 }] } }),
      );
      engine.assignPotionSlot("fishing-potion");
      engine.selectFishingSpot("pond"); // catchTicks 3, catchChance 1 — always succeeds
      for (let i = 0; i < 3; i++) engine.tick(); // one catch attempt
      expect(engine.snapshot().player.potionSlot?.charges).toBe(2);
    });

    it("a production-speed potion decrements once per craft COMPLETION (productionTick), for any Recipe's skill", () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({
          bank: {
            items: [
              { itemId: "bar", qty: 5 },
              { itemId: "production-potion", qty: 1 },
            ],
          },
        }),
      );
      engine.assignPotionSlot("production-potion");
      engine.selectRecipe("test-sword"); // skill "smithing" — the wiring is skill-agnostic
      for (let i = 0; i < 3; i++) engine.tick(); // one craft completion (craftTicks 3)
      expect(engine.snapshot().player.potionSlot?.charges).toBe(2);
    });

    it("progress stays in 0..1 (never >1, never NaN) after a fishing-speed potion shortens the re-armed cooldown (#284)", () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({ bank: { items: [{ itemId: "fishing-potion", qty: 1 }] } }),
      );
      engine.assignPotionSlot("fishing-potion"); // boostPct 0.5 -> multiplier 1.5
      engine.selectFishingSpot("pond"); // catchTicks 3, first cycle arms to the raw 3
      for (let i = 0; i < 3; i++) engine.tick(); // completes the un-boosted first cycle, re-arms
      // Math.round(3 / 1.5) = 2: the re-armed cooldownTotal shrinks to 2, and progress derives
      // from the NEW total, so it never exceeds 1 even though the cycle got shorter.
      const afterRearm = engine.snapshot().fishing;
      expect(afterRearm?.progress).toBe(0);
      engine.tick();
      expect(engine.snapshot().fishing?.progress).toBeCloseTo(0.5); // 1 of 2 ticks elapsed
      engine.tick(); // completes the 2-tick cycle, re-arms again
      expect(engine.snapshot().fishing?.progress).toBe(0);
      for (const p of [afterRearm?.progress, engine.snapshot().fishing?.progress]) {
        expect(p).not.toBeNaN();
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(1);
      }
    });

    it("a potion whose target doesn't match the current activity never drains (a Strength potion untouched while fishing)", () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({ bank: { items: [{ itemId: "strength-potion", qty: 1 }] } }),
      );
      engine.assignPotionSlot("strength-potion");
      engine.selectFishingSpot("pond");
      for (let i = 0; i < 30; i++) engine.tick(); // several catch attempts
      expect(engine.snapshot().player.potionSlot?.charges).toBe(3); // never ticked down
    });
  });

  describe("feeds the modifier-aggregation layer (#114)", () => {
    it("an active Strength potion raises the observed player max hit in melee combat", () => {
      function meleeDamages(withPotion: boolean, ticks = 1000): number[] {
        const engine = createEngine(
          fixtureContent,
          seededRng(99),
          makeSnapshot({
            player: {
              skills: {
                attack: { level: 90, xp: xpForLevel(90) },
                strength: { level: 90, xp: xpForLevel(90) },
                hitpoints: { level: 20, xp: xpForLevel(20) },
              },
            },
            // A huge stack so the buff never lapses mid-sample (250-ish attacks over 1000 Ticks
            // unarmed, well under charges 3 * qty 1000 worth of auto-continues).
            bank: { items: withPotion ? [{ itemId: "strength-potion", qty: 1000 }] : [] },
          }),
        );
        if (withPotion) engine.assignPotionSlot("strength-potion");
        // "control-dummy": never dies (so damage never clamps to remaining Monster HP) and never
        // attacks back, isolating the player's own max-hit ceiling.
        engine.selectMonster("control-dummy");
        const damages: number[] = [];
        engine.on("attack", (e) => {
          if (e.actor === "player") damages.push(e.damage);
        });
        for (let i = 0; i < ticks; i++) engine.tick();
        expect(damages.length).toBeGreaterThan(0);
        return damages;
      }

      const baseline = meleeDamages(false);
      const boosted = meleeDamages(true);

      // maxHit(101, 0) = 10 at ×1 (baseline); floor(101 * 1.2) = 121 -> maxHit(121, 0) = 12 with
      // the potion's own boostPct 0.2 active — mirrors the #114 suite's own worked example above,
      // now fed by a real potion source instead of the test-only seam.
      expect(Math.max(...baseline)).toBe(10);
      expect(Math.max(...boosted)).toBe(12);
    });

    it("an active fishing-speed potion shortens the Catch cadence", () => {
      function catchesOver(withPotion: boolean, ticks = 60): number {
        const engine = createEngine(
          fixtureContent,
          seededRng(1),
          makeSnapshot({
            bank: { items: withPotion ? [{ itemId: "fishing-potion", qty: 1000 }] : [] },
          }),
        );
        if (withPotion) engine.assignPotionSlot("fishing-potion");
        let caught = 0;
        engine.on("fish-caught", () => caught++);
        engine.selectFishingSpot("pond");
        for (let i = 0; i < ticks; i++) engine.tick();
        return caught;
      }

      const baseline = catchesOver(false);
      const boosted = catchesOver(true);

      expect(boosted).toBeGreaterThan(baseline);
    });
  });

  describe("Herblore Recipe chassis", () => {
    it("a herblore Recipe crafts a Potion and grants Herblore XP", () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({ bank: { items: [{ itemId: "herb", qty: 1 }] } }),
      );
      engine.selectRecipe("test-brew"); // skill "herblore", levelReq 1, craftTicks 3, xp 20
      for (let i = 0; i < 3; i++) engine.tick();
      const snap = engine.snapshot();
      expect(snap.bank.items).toEqual(
        expect.arrayContaining([{ itemId: "strength-potion", qty: 1 }]),
      );
      expect(snap.player.skills.herblore.xp).toBe(20);
    });
  });
});

describe("Ammo + Vendor (#119)", () => {
  describe("loadQuiver", () => {
    it("moves the whole Bank stack into the Quiver", () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({ bank: { items: [{ itemId: "arrow", qty: 30 }] } }),
      );
      engine.loadQuiver("arrow");
      expect(engine.snapshot().player.quiver).toEqual({ itemId: "arrow", qty: 30 });
      expect(engine.snapshot().bank.items).toEqual([]);
    });

    it("throws on a non-arrow id", () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({ bank: { items: [{ itemId: "air-rune", qty: 5 }] } }),
      );
      expect(() => engine.loadQuiver("air-rune")).toThrow(/arrow/i);
    });

    it("throws when the player owns none", () => {
      const engine = freshEngine();
      expect(() => engine.loadQuiver("arrow")).toThrow(/own/i);
    });

    it("topping up: loading the same arrow tier again adds to the already-loaded stack", () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({
          bank: { items: [{ itemId: "arrow", qty: 10 }] },
          player: { quiver: { itemId: "arrow", qty: 5 } },
        }),
      );
      engine.loadQuiver("arrow");
      expect(engine.snapshot().player.quiver).toEqual({ itemId: "arrow", qty: 15 });
    });

    it("swapping arrow tiers returns the previous stack to the Bank first", () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({
          bank: { items: [{ itemId: "iron-arrow", qty: 10 }] },
          player: { quiver: { itemId: "arrow", qty: 7 } },
        }),
      );
      engine.loadQuiver("iron-arrow");
      expect(engine.snapshot().player.quiver).toEqual({ itemId: "iron-arrow", qty: 10 });
      expect(engine.snapshot().bank.items).toEqual([{ itemId: "arrow", qty: 7 }]);
    });

    it('a bank-full tier swap throws "bank is full", mutating nothing', () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({
          bank: {
            items: [
              { itemId: "bar", qty: 1 },
              { itemId: "iron-arrow", qty: 10 },
            ],
            capacity: 1,
          },
          player: { quiver: { itemId: "arrow", qty: 7 } },
        }),
      );
      expect(() => engine.loadQuiver("iron-arrow")).toThrow(/bank is full/i);
      expect(engine.snapshot().player.quiver).toEqual({ itemId: "arrow", qty: 7 });
    });
  });

  describe("unloadQuiver", () => {
    it("returns the stack to the Bank and clears the Quiver to null", () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({ player: { quiver: { itemId: "arrow", qty: 12 } } }),
      );
      engine.unloadQuiver();
      expect(engine.snapshot().player.quiver).toBeNull();
      expect(engine.snapshot().bank.items).toEqual([{ itemId: "arrow", qty: 12 }]);
    });

    it("is a harmless no-op when already empty", () => {
      const engine = freshEngine();
      expect(() => engine.unloadQuiver()).not.toThrow();
      expect(engine.snapshot().player.quiver).toBeNull();
    });

    it('throws "bank is full" when returning the stock needs a new Bank Slot', () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({
          bank: { items: [{ itemId: "bar", qty: 1 }], capacity: 1 },
          player: { quiver: { itemId: "arrow", qty: 12 } },
        }),
      );
      expect(() => engine.unloadQuiver()).toThrow(/bank is full/i);
      expect(engine.snapshot().player.quiver).toEqual({ itemId: "arrow", qty: 12 });
    });

    it("a qty-0 loaded Quiver clears to null without needing a Bank Slot (empty != unloaded)", () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({
          bank: { items: [{ itemId: "bar", qty: 1 }], capacity: 1 },
          player: { quiver: { itemId: "arrow", qty: 0 } },
        }),
      );
      expect(() => engine.unloadQuiver()).not.toThrow();
      expect(engine.snapshot().player.quiver).toBeNull();
    });
  });

  // loadRuneSlot/unloadRuneSlot (#221, replacing loadRunePouch/unloadRunePouch) are covered by the
  // "Spells / Rune Slot (#221)" describe block above, not duplicated here.

  describe("Ranged consumption: the Quiver's own arrow feeds both accuracy-independent decrement and max hit", () => {
    it("consumes exactly 1 arrow per RESOLVED ranged swing (hit or miss alike)", () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(13),
        makeSnapshot({
          player: {
            equipment: { weapon: "bow" },
            quiver: { itemId: "arrow", qty: 1000 },
            skills: { hitpoints: { level: 20, xp: xpForLevel(20) } },
          },
        }),
      );
      engine.selectMonster("control-dummy"); // hp 999, maxHit 0 — never dies, never damages back
      let swings = 0;
      engine.on("attack", (e) => {
        if (e.actor === "player") swings++;
      });
      for (let i = 0; i < 500; i++) engine.tick();
      expect(swings).toBeGreaterThan(0);
      expect(engine.snapshot().player.quiver?.qty).toBe(1000 - swings);
    });

    it("the loaded arrow's rangedStr raises ranged max hit — the bow decides accuracy, the arrow decides power", () => {
      // A big rangedStr gap (5 vs 60) on the SAME arrow id/content otherwise, so the only variable
      // is the one field under test. Pinned at Ranged 99 (MAX_LEVEL): awardCombatXp keeps granting
      // Ranged XP every resolved hit across this run's 500-ish attacks, and any level BELOW max
      // would climb mid-run, silently raising the max-hit ceiling for both arrow variants alike
      // and masking rangedStr's own effect — level 99 can never level up further, so the ceiling
      // stays pinned to rangedStr alone for the whole run.
      function maxDamageWithArrowRangedStr(rangedStr: number): number {
        const content = {
          ...fixtureContent,
          items: fixtureContent.items.map((i) => (i.id === "arrow" ? { ...i, rangedStr } : i)),
        };
        const engine = createEngine(
          content,
          seededRng(5),
          makeSnapshot({
            player: {
              skills: {
                ranged: { level: 99, xp: xpForLevel(99) },
                hitpoints: { level: 40, xp: xpForLevel(40) },
              },
              equipment: { weapon: "bow" },
              quiver: { itemId: "arrow", qty: 100_000 },
            },
          }),
        );
        engine.selectMonster("control-dummy");
        let max = 0;
        engine.on("attack", (e) => {
          if (e.actor === "player") max = Math.max(max, e.damage);
        });
        for (let i = 0; i < 2000; i++) engine.tick();
        return max;
      }
      const weakerArrow = maxDamageWithArrowRangedStr(5);
      const strongerArrow = maxDamageWithArrowRangedStr(60);
      expect(strongerArrow).toBeGreaterThan(weakerArrow);
    });
  });

  describe("Magic consumption: the loaded rune (10 runes = 10 casts) depletes 1 per resolved swing", () => {
    it("consumes exactly 1 rune of the loaded stack per RESOLVED magic swing (hit or miss alike)", () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(17),
        makeSnapshot({
          player: {
            equipment: { weapon: "staff" },
            runeSlot: { itemId: "air-rune", qty: 1000 },
            skills: { hitpoints: { level: 20, xp: xpForLevel(20) } },
          },
        }),
      );
      engine.selectMonster("control-dummy");
      let swings = 0;
      engine.on("attack", (e) => {
        if (e.actor === "player") swings++;
      });
      for (let i = 0; i < 500; i++) engine.tick();
      expect(swings).toBeGreaterThan(0);
      expect(engine.snapshot().player.runeSlot).toEqual({ itemId: "air-rune", qty: 1000 - swings });
    });

    it("10 runes = 10 casts: the eleventh swing is skipped (no damage, no XP) and depletes at qty 0, not below", () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(21),
        makeSnapshot({
          player: {
            equipment: { weapon: "staff" },
            runeSlot: { itemId: "air-rune", qty: 10 },
            skills: { hitpoints: { level: 20, xp: xpForLevel(20) } },
          },
        }),
      );
      engine.selectMonster("control-dummy"); // maxHit 0, never dies — pure swing counting
      let resolvedSwings = 0;
      let magicXpGained = false;
      const startingMagicXp = engine.snapshot().player.skills.magic.xp;
      engine.on("attack", (e) => {
        if (e.actor === "player") resolvedSwings++;
      });
      let outOfAmmoCount = 0;
      engine.on("out-of-ammo", () => outOfAmmoCount++);
      for (let i = 0; i < 300; i++) {
        engine.tick();
        if (engine.snapshot().player.skills.magic.xp > startingMagicXp) magicXpGained = true;
      }
      expect(resolvedSwings).toBe(10);
      expect(engine.snapshot().player.runeSlot).toEqual({ itemId: "air-rune", qty: 0 }); // Quiver parity: stays loaded at 0, never nulled
      expect(outOfAmmoCount).toBe(1); // fires once for the 11th-onward skip, not once per Tick
      void magicXpGained; // XP accrual is exercised elsewhere; this test only counts resolved swings
    });

    it("a missed swing consumes a rune too — only a SKIPPED (out-of-ammo) swing does not", () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(17),
        makeSnapshot({
          player: {
            equipment: { weapon: "staff" },
            // control-dummy's defence makes some swings miss; the point is that consumption is
            // gated on "resolved", not on "hit" — see the accompanying attack-event correlation.
            runeSlot: { itemId: "air-rune", qty: 1000 },
            skills: { hitpoints: { level: 20, xp: xpForLevel(20) } },
          },
        }),
      );
      engine.selectMonster("control-dummy");
      let hits = 0;
      let misses = 0;
      engine.on("attack", (e) => {
        if (e.actor !== "player") return;
        if (e.hit) hits++;
        else misses++;
      });
      for (let i = 0; i < 500; i++) engine.tick();
      expect(misses).toBeGreaterThan(0); // the sample actually included a miss
      expect(engine.snapshot().player.runeSlot?.qty).toBe(1000 - hits - misses);
    });
  });

  describe("Out-of-ammo: the swing doesn't resolve, the monster still attacks, and the warning fires once per depletion", () => {
    it("ranged: an empty Quiver blocks every swing (no damage, no XP) while the monster keeps attacking; a single out-of-ammo event fires across many idle Ticks", () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(9),
        makeSnapshot({
          player: {
            equipment: { weapon: "bow" },
            quiver: { itemId: "arrow", qty: 0 }, // loaded but depleted
            skills: { hitpoints: { level: 20, xp: xpForLevel(20) } },
          },
        }),
      );
      engine.selectMonster("dummy");
      let outOfAmmoCount = 0;
      let need: string | undefined;
      engine.on("out-of-ammo", (e) => {
        outOfAmmoCount++;
        need = e.need;
      });
      let playerSwings = 0;
      let monsterSwings = 0;
      engine.on("attack", (e) => {
        if (e.actor === "player") playerSwings++;
        else monsterSwings++;
      });
      for (let i = 0; i < 200; i++) engine.tick();
      expect(playerSwings).toBe(0); // never resolves
      expect(monsterSwings).toBeGreaterThan(0); // the monster's own attack still proceeds
      expect(outOfAmmoCount).toBe(1); // once per depletion, not every Tick
      expect(need).toBe("arrow");
      expect(engine.snapshot().player.skills.ranged.xp).toBe(0);
    });

    it("magic with an EMPTY Rune Slot: no Spell, no Element on the event, every swing blocked, no crash", () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(11),
        makeSnapshot({
          player: {
            equipment: { weapon: "staff" },
            runeSlot: null,
            skills: { hitpoints: { level: 20, xp: xpForLevel(20) } },
          },
        }),
      );
      engine.selectMonster("dummy");
      let warned: { need: string; element?: string } | undefined;
      engine.on("out-of-ammo", (e) => {
        warned = e;
      });
      let playerSwings = 0;
      engine.on("attack", (e) => {
        if (e.actor === "player") playerSwings++;
      });
      expect(() => {
        for (let i = 0; i < 200; i++) engine.tick();
      }).not.toThrow();
      expect(playerSwings).toBe(0);
      expect(warned?.need).toBe("rune");
      expect(warned?.element).toBeUndefined();
      expect(engine.snapshot().player.spell).toBeNull();
    });

    it("magic with a DEPLETED (qty 0) Rune Slot: the warning still carries the resolved Spell's Element", () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(11),
        makeSnapshot({
          player: {
            equipment: { weapon: "staff" },
            runeSlot: { itemId: "air-rune", qty: 0 },
            skills: { hitpoints: { level: 20, xp: xpForLevel(20) } },
          },
        }),
      );
      engine.selectMonster("dummy");
      let warned: { need: string; element?: string } | undefined;
      engine.on("out-of-ammo", (e) => {
        warned = e;
      });
      for (let i = 0; i < 200; i++) engine.tick();
      expect(warned?.need).toBe("rune");
      expect(warned?.element).toBe("air");
      expect(engine.snapshot().player.runeSlot).toEqual({ itemId: "air-rune", qty: 0 });
    });

    it("a fresh depletion after reloading fires its own new out-of-ammo event", () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(9),
        makeSnapshot({
          player: {
            equipment: { weapon: "bow" },
            quiver: { itemId: "arrow", qty: 1 },
            skills: { hitpoints: { level: 20, xp: xpForLevel(20) } },
          },
          bank: { items: [{ itemId: "arrow", qty: 5 }] },
        }),
      );
      engine.selectMonster("dummy");
      let warnings = 0;
      engine.on("out-of-ammo", () => warnings++);

      for (let i = 0; i < 100; i++) engine.tick();
      expect(warnings).toBe(1);
      expect(engine.snapshot().player.quiver?.qty).toBe(0);

      // Reload — no special "clear the warning" step needed, it resets the moment ammo is present.
      engine.loadQuiver("arrow");
      for (let i = 0; i < 100; i++) engine.tick();
      expect(warnings).toBe(2); // the SECOND depletion gets its own event
      expect(engine.snapshot().player.quiver?.qty).toBe(0);
    });

    it("melee never emits out-of-ammo, with or without a Quiver/Rune Slot loaded", () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({ player: { equipment: { weapon: "bronze-sword" } } }),
      );
      engine.selectMonster("dummy");
      let outOfAmmoCount = 0;
      engine.on("out-of-ammo", () => outOfAmmoCount++);
      let playerSwings = 0;
      engine.on("attack", (e) => {
        if (e.actor === "player") playerSwings++;
      });
      for (let i = 0; i < 200; i++) engine.tick();
      expect(playerSwings).toBeGreaterThan(0); // melee resolves normally, no ammo gate
      expect(outOfAmmoCount).toBe(0);
    });
  });

  describe("Zero-reload dual-wielding (owner's whole point of the two-store design)", () => {
    it("a player carrying both a loaded Quiver and Rune Slot can freely alternate bow and staff — no load/unload step between swaps, and the correct store depletes each phase", () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(3),
        makeSnapshot({
          player: {
            equipment: { weapon: "bow" },
            quiver: { itemId: "arrow", qty: 50 },
            runeSlot: { itemId: "air-rune", qty: 50 },
            skills: { hitpoints: { level: 30, xp: xpForLevel(30) } },
          },
          // Owned so the mid-test engine.equip("staff")/engine.equip("bow") swaps (below) succeed —
          // equip requires Bank ownership even though "bow" starts pre-worn via the override above.
          bank: {
            items: [
              { itemId: "staff", qty: 1 },
              { itemId: "bow", qty: 1 },
            ],
          },
        }),
      );
      engine.selectMonster("dummy");
      for (let i = 0; i < 120; i++) engine.tick();
      const afterRanged = engine.snapshot().player;
      expect(afterRanged.quiver?.qty).toBeLessThan(50); // Quiver depleted while wielding the bow
      expect(afterRanged.runeSlot?.qty).toBe(50); // untouched

      // Swap weapons only — NO loadQuiver/loadRuneSlot call, which is the entire point being
      // tested: both stores are already live, so switching needs no reload step.
      engine.equip("staff");
      for (let i = 0; i < 120; i++) engine.tick();
      const afterMagic = engine.snapshot().player;
      expect(afterMagic.runeSlot?.qty).toBeLessThan(50);
      expect(afterMagic.quiver?.qty).toBe(afterRanged.quiver?.qty); // untouched while casting

      // Swap back — again, no reload command.
      engine.equip("bow");
      const quiverBeforeSecondRangedPhase = afterMagic.quiver?.qty as number;
      for (let i = 0; i < 120; i++) engine.tick();
      const afterSecondRanged = engine.snapshot().player;
      expect(afterSecondRanged.quiver?.qty).toBeLessThan(quiverBeforeSecondRangedPhase);
      // The Rune Slot sat untouched during this second ranged phase.
      expect(afterSecondRanged.runeSlot?.qty).toBe(afterMagic.runeSlot?.qty);
    });
  });

  describe("buy (fixed-price vendor)", () => {
    it("charges price * qty and adds the item to the Bank", () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({ player: { gold: 100 } }),
      );
      engine.buy("arrow", 10); // fixture vendor price 2
      expect(engine.snapshot().player.gold).toBe(80);
      expect(engine.snapshot().bank.items).toEqual([{ itemId: "arrow", qty: 10 }]);
    });

    it("defaults qty to 1", () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({ player: { gold: 100 } }),
      );
      engine.buy("arrow");
      expect(engine.snapshot().player.gold).toBe(98);
      expect(engine.snapshot().bank.items).toEqual([{ itemId: "arrow", qty: 1 }]);
    });

    it('throws "not enough gold" when short, spending nothing (mirrors buyBankSlots)', () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({ player: { gold: 1 } }),
      );
      expect(() => engine.buy("arrow", 10)).toThrow(/not enough gold: need 20/i);
      expect(engine.snapshot().player.gold).toBe(1);
      expect(engine.snapshot().bank.items).toEqual([]);
    });

    it("throws on an item the vendor doesn't sell", () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({ player: { gold: 1000 } }),
      );
      expect(() => engine.buy("meat", 1)).toThrow(/vendor/i);
    });

    it('throws "bank is full" when a brand-new stack is needed at capacity, spending nothing (never auto-sold)', () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({
          player: { gold: 1000 },
          bank: { items: [{ itemId: "bar", qty: 1 }], capacity: 1 },
        }),
      );
      expect(() => engine.buy("arrow", 1)).toThrow(/bank is full/i);
      expect(engine.snapshot().player.gold).toBe(1000);
    });

    it("emits item-bought", () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({ player: { gold: 100 } }),
      );
      let event: { type: string; itemId: string; qty: number; gold: number } | undefined;
      engine.on("item-bought", (e) => {
        event = e;
      });
      engine.buy("arrow", 4);
      expect(event).toEqual({ type: "item-bought", itemId: "arrow", qty: 4, gold: 8 });
    });

    it("throws on an invalid qty, spending nothing", () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({ player: { gold: 100 } }),
      );
      expect(() => engine.buy("arrow", 0)).toThrow();
      expect(() => engine.buy("arrow", -1)).toThrow();
      expect(engine.snapshot().player.gold).toBe(100);
    });
  });

  describe("save/load", () => {
    it("a pre-#119 save (no quiver/rune keys at all) loads with Quiver null and Rune Slot null", () => {
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
      };
      const restored = createEngine(
        fixtureContent,
        seededRng(1),
        JSON.parse(JSON.stringify(legacySave)),
      );
      expect(restored.snapshot().player.quiver).toBeNull();
      expect(restored.snapshot().player.runeSlot).toBeNull();
    });

    it("a valid Snapshot carrying a loaded Quiver and Rune Slot round-trips unchanged", () => {
      const original = createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({
          player: {
            quiver: { itemId: "arrow", qty: 12 },
            runeSlot: { itemId: "air-rune", qty: 5 },
          },
        }),
        () => 0,
      );
      const saved = original.snapshot();
      const restored = createEngine(
        fixtureContent,
        seededRng(1),
        JSON.parse(JSON.stringify(saved)),
        () => 0,
      );
      expect(restored.snapshot()).toEqual(saved);
    });

    it("a Quiver itemId that no longer resolves to an Arrow (dropped/corrupted content) loads as null", () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({ player: { quiver: { itemId: "unobtainium", qty: 5 } } }),
      );
      expect(engine.snapshot().player.quiver).toBeNull();
    });

    it("a Rune Slot itemId that no longer resolves to a Rune (dropped/corrupted content) loads as null", () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({ player: { runeSlot: { itemId: "unobtainium", qty: 5 } } }),
      );
      expect(engine.snapshot().player.runeSlot).toBeNull();
    });

    it("a garbage player.runeSlot (not an object) loads to null without throwing", () => {
      const engine = createEngine(
        fixtureContent,
        seededRng(1),
        makeSnapshot({ player: { runeSlot: "garbage" as never } }),
      );
      expect(engine.snapshot().player.runeSlot).toBeNull();
    });

    describe("Rune Slot migration (#221): a pre-existing player.runePouch save", () => {
      /** Builds a raw (pre-#221) save object carrying `player.runePouch` — the shape this issue's
       * migration reads and banks, never turning it into a loaded Rune Slot. Built as a plain
       * object rather than via `makeSnapshot` (which no longer knows about `runePouch` at all,
       * mirroring the real dropped-field shape a player's old save file would have). */
      function legacyRunePouchSave(
        runePouch: { itemId: string; qty: number }[],
        bankItems: { itemId: string; qty: number }[] = [],
        bankCapacity?: number,
      ): unknown {
        const base = makeSnapshot({
          bank: {
            items: bankItems,
            ...(bankCapacity !== undefined ? { capacity: bankCapacity } : {}),
          },
        });
        return { ...base, player: { ...base.player, runePouch } };
      }

      it("loads with runeSlot null and all four stacks banked at full quantity — nothing is lost", () => {
        const engine = createEngine(
          fixtureContent,
          seededRng(1),
          legacyRunePouchSave([
            { itemId: "air-rune", qty: 10 },
            { itemId: "water-rune", qty: 7 },
            { itemId: "earth-rune", qty: 3 },
            { itemId: "fire-rune", qty: 1 },
          ]) as never,
        );
        expect(engine.snapshot().player.runeSlot).toBeNull();
        expect(engine.snapshot().player.spell).toBeNull();
        expect(engine.snapshot().bank.items).toEqual(
          expect.arrayContaining([
            { itemId: "air-rune", qty: 10 },
            { itemId: "water-rune", qty: 7 },
            { itemId: "earth-rune", qty: 3 },
            { itemId: "fire-rune", qty: 1 },
          ]),
        );
      });

      it("a full Bank during migration auto-sells the overflowing stack (addToBank semantics) rather than throwing", () => {
        // Capacity 1, already occupied by "bar" — the next new distinct stack (the migrated
        // air-rune) is guaranteed to hit the overflow path, mirroring fullBankSnapshot's own
        // pattern (see "Bank overflow (#59)" above).
        const save = () =>
          legacyRunePouchSave(
            [{ itemId: "air-rune", qty: 5 }],
            [{ itemId: "bar", qty: 1 }],
            1,
          ) as never;
        expect(() => createEngine(fixtureContent, seededRng(1), save())).not.toThrow();
        const engine = createEngine(fixtureContent, seededRng(1), save());
        // air-rune could not fit as a new stack, so it was auto-sold (fixture value 1g/unit)
        // instead of thrown away — the "bar" stack from the save is untouched.
        expect(engine.snapshot().bank.items).toEqual([{ itemId: "bar", qty: 1 }]);
        expect(engine.snapshot().player.gold).toBeGreaterThanOrEqual(5);
        expect(engine.snapshot().player.runeSlot).toBeNull();
      });

      it("a garbage runePouch entry (unknown itemId / non-rune / bad qty) is dropped silently, without throwing", () => {
        const engine = createEngine(
          fixtureContent,
          seededRng(1),
          legacyRunePouchSave([
            { itemId: "unobtainium", qty: 5 },
            { itemId: "arrow", qty: 5 }, // not a rune
            { itemId: "air-rune", qty: -3 }, // invalid qty
            { itemId: "water-rune", qty: 4 }, // the one valid entry
          ]) as never,
        );
        expect(engine.snapshot().player.runeSlot).toBeNull();
        expect(engine.snapshot().bank.items).toEqual([{ itemId: "water-rune", qty: 4 }]);
      });

      it("a save with neither runeSlot nor runePouch at all loads to runeSlot null without throwing", () => {
        const base = makeSnapshot();
        const stripped = { ...base, player: { ...base.player } } as unknown as Record<
          string,
          unknown
        >;
        const player = stripped["player"] as Record<string, unknown>;
        delete player["runeSlot"];
        expect(() => createEngine(fixtureContent, seededRng(1), stripped as never)).not.toThrow();
        const engine = createEngine(fixtureContent, seededRng(1), stripped as never);
        expect(engine.snapshot().player.runeSlot).toBeNull();
      });
    });
  });
});
