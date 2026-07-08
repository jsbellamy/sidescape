import { describe, expect, it } from "vitest";
import { createEngine } from "./engine";
import { fixtureContent } from "./fixture-content";
import { makeSnapshot } from "./make-snapshot";
import { seededRng } from "./rng";

describe("makeSnapshot", () => {
  it("returns a complete Snapshot that loads cleanly via createEngine with no thrown error", () => {
    expect(() => createEngine(fixtureContent, seededRng(1), makeSnapshot())).not.toThrow();
  });

  it("defaults to full HP, level-1 Skills, no Gear, empty inventory, nothing selected", () => {
    const snap = makeSnapshot();
    expect(snap.player.hp).toBe(snap.player.maxHp);
    for (const skill of ["attack", "strength", "defence", "hitpoints", "fishing"] as const) {
      expect(snap.player.skills[skill]).toEqual({ level: 1, xp: 0 });
    }
    expect(snap.player.equipment).toEqual({
      weapon: null,
      shield: null,
      head: null,
      body: null,
      legs: null,
    });
    expect(snap.player.inventory).toEqual([]);
    expect(snap.player.respawning).toBe(false);
    expect(snap.player.combatStyle).toBe("accurate");
    expect(snap.player.autoEatThreshold).toBe(0);
    expect(snap.monster).toBeNull();
    expect(snap.fishing).toBeNull();
  });

  it("derives areas from the fixture Content, gated by the default combat/Fishing level", () => {
    const snap = makeSnapshot();
    expect(snap.areas.map((a) => a.id)).toEqual(["meadow", "crypt"]);
    const meadow = snap.areas.find((a) => a.id === "meadow");
    const crypt = snap.areas.find((a) => a.id === "crypt");
    expect(meadow?.unlocked).toBe(true); // meadow requires combat level 0
    expect(crypt?.unlocked).toBe(false); // crypt requires combat level 40
  });

  it("deep-merges a player override: only the stated field changes, everything else keeps its default", () => {
    const snap = makeSnapshot({ player: { hp: 12 } });
    expect(snap.player.hp).toBe(12);
    expect(snap.player.maxHp).toBe(makeSnapshot().player.maxHp);
    expect(snap.player.skills).toEqual(makeSnapshot().player.skills);
    expect(snap.player.equipment).toEqual(makeSnapshot().player.equipment);
  });

  it("deep-merges a single Skill without disturbing the others", () => {
    const snap = makeSnapshot({ player: { skills: { hitpoints: { level: 45, xp: 6517 } } } });
    expect(snap.player.skills.hitpoints).toEqual({ level: 45, xp: 6517 });
    expect(snap.player.skills.attack).toEqual({ level: 1, xp: 0 });
    expect(snap.player.skills.strength).toEqual({ level: 1, xp: 0 });
  });

  it("deep-merges a single Gear Slot without disturbing the others", () => {
    const snap = makeSnapshot({ player: { equipment: { weapon: "bronze-sword" } } });
    expect(snap.player.equipment.weapon).toBe("bronze-sword");
    expect(snap.player.equipment.shield).toBeNull();
  });

  it("sets fishing wholesale and leaves monster null", () => {
    const snap = makeSnapshot({ fishing: { spotId: "pond", name: "Test Pond" } });
    expect(snap.fishing).toEqual({ spotId: "pond", name: "Test Pond" });
    expect(snap.monster).toBeNull();
  });

  it("sets monster wholesale and leaves fishing null", () => {
    const snap = makeSnapshot({
      monster: { id: "dummy", name: "Training Dummy", hp: 3, maxHp: 3 },
    });
    expect(snap.monster).toEqual({ id: "dummy", name: "Training Dummy", hp: 3, maxHp: 3 });
    expect(snap.fishing).toBeNull();
  });

  it("replaces inventory and areas wholesale rather than merging elements", () => {
    const snap = makeSnapshot({
      player: { inventory: [{ itemId: "meat", qty: 5 }] },
      areas: [],
    });
    expect(snap.player.inventory).toEqual([{ itemId: "meat", qty: 5 }]);
    expect(snap.areas).toEqual([]);
  });

  it("each call returns an independent object (no shared mutable defaults)", () => {
    const a = makeSnapshot();
    const b = makeSnapshot();
    a.player.inventory.push({ itemId: "gold", qty: 1 });
    expect(b.player.inventory).toEqual([]);
  });
});
