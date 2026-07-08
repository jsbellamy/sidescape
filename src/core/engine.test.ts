import { describe, expect, it } from "vitest";
import { createEngine } from "./engine";
import { fixtureContent } from "./fixture-content";
import { seededRng } from "./rng";
import { xpForLevel } from "./xp";

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

/** Pump Ticks until the player owns `itemId` (or fail the test). */
function grindFor(engine: ReturnType<typeof freshEngine>, itemId: string, maxTicks = 20_000) {
  for (let i = 0; i < maxTicks; i++) {
    engine.tick();
    if (engine.snapshot().player.inventory.some((s) => s.itemId === itemId)) return;
  }
  throw new Error(`${itemId} never dropped in ${maxTicks} ticks`);
}

describe("fresh engine", () => {
  it("starts a level-1 player with Hitpoints 10, full HP, nothing selected", () => {
    const snap = freshEngine().snapshot();
    expect(snap.player.skills.attack.level).toBe(1);
    expect(snap.player.skills.strength.level).toBe(1);
    expect(snap.player.skills.defence.level).toBe(1);
    expect(snap.player.skills.hitpoints.level).toBe(10);
    expect(snap.player.maxHp).toBe(10);
    expect(snap.player.hp).toBe(10);
    expect(snap.player.inventory).toEqual([]);
    expect(snap.monster).toBeNull();
  });

  it("exposes Area gate flags: meadow unlocked, crypt locked at combat level 3", () => {
    const snap = freshEngine().snapshot();
    // combat level = floor((atk + str + def + hp) / 4) = floor(13/4) = 3
    expect(snap.player.combatLevel).toBe(3);
    expect(snap.areas).toEqual([
      { id: "meadow", name: "Test Meadow", unlocked: true, monsterIds: ["dummy"] },
      { id: "crypt", name: "Test Crypt", unlocked: false, monsterIds: ["brute"] },
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
  it("every kill lands the guaranteed Drop; inventory accumulates quantities", () => {
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
    const gold = engine.snapshot().player.inventory.find((s) => s.itemId === "gold");
    expect(gold?.qty).toBe(kills * 5);
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
    const engine = createEngine(fiercerDummyContent(), seededRng(42));
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

describe("Passive HP regen", () => {
  function damagedEngine(hp: number, seed = 1) {
    return createEngine(fixtureContent, seededRng(seed), {
      player: {
        hp,
        maxHp: 10,
        combatLevel: 3,
        combatStyle: "aggressive",
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
    });
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
    const veteran = createEngine(fixtureContent, seededRng(3), {
      player: {
        hp: 60,
        maxHp: 60,
        combatLevel: 45,
        combatStyle: "aggressive",
        skills: {
          attack: { level: 60, xp: xpForLevel(60) },
          strength: { level: 60, xp: xpForLevel(60) },
          // weak Defence so the gated, hard-hitting brute can actually land a kill
          defence: { level: 1, xp: 0 },
          hitpoints: { level: 60, xp: xpForLevel(60) },
        },
        equipment: { weapon: null, shield: null, head: null, body: null, legs: null },
        inventory: [],
        respawning: false,
      },
      monster: null,
      areas: [],
    });
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
    const engine = createEngine(fixtureContent, seededRng(1), {
      player: {
        hp: 8,
        maxHp: 10,
        combatLevel: 3,
        combatStyle: "aggressive",
        skills: {
          attack: { level: 1, xp: 0 },
          strength: { level: 1, xp: 0 },
          defence: { level: 1, xp: 0 },
          hitpoints: { level: 10, xp: xpForLevel(10) },
        },
        equipment: { weapon: null, shield: null, head: null, body: null, legs: null },
        inventory: [{ itemId: "meat", qty: 2 }],
        respawning: false,
      },
      monster: null,
      areas: [],
    });

    const events: { itemId: string; healed: number }[] = [];
    engine.on("food-eaten", (e) => events.push({ itemId: e.itemId, healed: e.healed }));
    engine.eatFood("meat");

    expect(events).toEqual([{ itemId: "meat", healed: 2 }]);
    expect(engine.snapshot().player.hp).toBe(10);
    expect(engine.snapshot().player.inventory).toEqual([{ itemId: "meat", qty: 1 }]);
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

  it("equipping moves the item from inventory to its Gear Slot", () => {
    const engine = freshEngine();
    engine.selectMonster("dummy");
    grindFor(engine, "bronze-sword");
    engine.equip("bronze-sword");
    const player = engine.snapshot().player;
    expect(player.equipment.weapon).toBe("bronze-sword");
    expect(player.inventory.some((s) => s.itemId === "bronze-sword")).toBe(false);
    // no longer owned in inventory, so equipping again throws
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
      if (!equipped && armed.snapshot().player.inventory.some((s) => s.itemId === "bronze-sword")) {
        armed.equip("bronze-sword");
        equipped = true;
      }
    }
    expect(equipped).toBe(true);
    expect(killsWith.armed).toBeGreaterThan(killsWith.unarmed);
  });

  it("selectMonster throws for a Monster behind a locked Area gate", () => {
    expect(() => freshEngine().selectMonster("brute")).toThrow(/combat level 40/i);
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
    const owned = engine.snapshot().player.inventory.find((s) => s.itemId === "meat")?.qty ?? 0;
    expect(() => engine.sell("meat", owned + 1)).toThrow(/own/i);
  });

  it("selling N removes N from the inventory (deleting the entry at zero), credits N*value gold, and emits one item-sold event", () => {
    const engine = freshEngine();
    engine.selectMonster("dummy");
    grindFor(engine, "bronze-sword");
    const goldBefore =
      engine.snapshot().player.inventory.find((s) => s.itemId === "gold")?.qty ?? 0;

    const events: { itemId: string; qty: number; gold: number }[] = [];
    engine.on("item-sold", (e) => events.push({ itemId: e.itemId, qty: e.qty, gold: e.gold }));
    engine.sell("bronze-sword", 1);

    expect(events).toEqual([{ itemId: "bronze-sword", qty: 1, gold: 20 }]);
    const player = engine.snapshot().player;
    expect(player.inventory.some((s) => s.itemId === "bronze-sword")).toBe(false);
    const goldAfter = player.inventory.find((s) => s.itemId === "gold")?.qty ?? 0;
    expect(goldAfter).toBe(goldBefore + 20);
  });

  it("selling part of a stack decrements it without deleting the entry", () => {
    const engine = freshEngine();
    engine.selectMonster("dummy");
    for (let i = 0; i < 3000; i++) engine.tick();
    const owned = engine.snapshot().player.inventory.find((s) => s.itemId === "meat")?.qty ?? 0;
    expect(owned).toBeGreaterThan(1);

    engine.sell("meat", 1);
    const remaining = engine.snapshot().player.inventory.find((s) => s.itemId === "meat")?.qty;
    expect(remaining).toBe(owned - 1);
  });

  it("defaults qty to 1 when omitted", () => {
    const engine = freshEngine();
    engine.selectMonster("dummy");
    grindFor(engine, "meat");
    const owned = engine.snapshot().player.inventory.find((s) => s.itemId === "meat")?.qty ?? 0;
    engine.sell("meat");
    const remaining = engine.snapshot().player.inventory.find((s) => s.itemId === "meat")?.qty ?? 0;
    expect(remaining).toBe(owned - 1);
  });

  it("worn Equipment is structurally unsellable: equip the only copy, then sell throws as unowned", () => {
    const engine = freshEngine();
    engine.selectMonster("dummy");
    grindFor(engine, "bronze-sword");
    engine.equip("bronze-sword");
    expect(() => engine.sell("bronze-sword")).toThrow(/own/i);
  });

  it("throws if Content defines no currency, with no hard-coded currency id in the Engine", () => {
    const noCurrencyContent = {
      ...fixtureContent,
      items: fixtureContent.items.filter((i) => i.kind !== "currency"),
    };
    const engine = createEngine(noCurrencyContent, seededRng(1));
    engine.selectMonster("dummy");
    grindFor(engine, "meat");
    expect(() => engine.sell("meat")).toThrow();
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
    expect(snap.player.inventory).toEqual(saved.player.inventory);
    expect(snap.player.hp).toBe(saved.player.hp);
    expect(snap.monster?.id).toBe(saved.monster?.id);

    let kills = 0;
    restored.on("kill", () => kills++);
    for (let i = 0; i < 2000; i++) restored.tick();
    expect(kills).toBeGreaterThan(0);
  });

  it("a high-level save unlocks the Crypt gate", () => {
    const veteran = createEngine(fixtureContent, seededRng(1), {
      player: {
        hp: 45,
        maxHp: 45,
        combatLevel: 45,
        combatStyle: "aggressive",
        skills: {
          attack: { level: 45, xp: xpForLevel(45) },
          strength: { level: 45, xp: xpForLevel(45) },
          defence: { level: 45, xp: xpForLevel(45) },
          hitpoints: { level: 45, xp: xpForLevel(45) },
        },
        equipment: { weapon: null, shield: null, head: null, body: null, legs: null },
        inventory: [],
        respawning: false,
      },
      monster: null,
      areas: [],
    });
    expect(veteran.snapshot().areas.find((a) => a.id === "crypt")?.unlocked).toBe(true);
    expect(() => veteran.selectMonster("brute")).not.toThrow();
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
