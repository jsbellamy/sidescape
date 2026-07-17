import { describe, expect, it } from "vitest";
import type { Content, Element, MonsterDef } from "../core/types";
import { createEngine } from "../core/engine";
import { makeSnapshot } from "../core/testing/make-snapshot";
import { seededRng } from "../core/rng";
import { validateContent } from "../core/validate-content";
import { xpForLevel } from "../core/xp";
import { itemIcon } from "../ui/icons";
import { content } from "./index";
import { spellLadder, spellLadderRunes } from "./spell-ladder";

/** Issue #364 acceptance table — independent literals, not recomputed from implementation. */
const EXPECTED_SPELLS = [
  { id: "air-strike", element: "air", levelReq: 1, baseMaxHit: 6, runeId: "air-rune" },
  { id: "water-strike", element: "water", levelReq: 5, baseMaxHit: 9, runeId: "water-rune" },
  { id: "earth-strike", element: "earth", levelReq: 9, baseMaxHit: 12, runeId: "earth-rune" },
  { id: "fire-strike", element: "fire", levelReq: 13, baseMaxHit: 16, runeId: "fire-rune" },
  { id: "air-bolt", element: "air", levelReq: 17, baseMaxHit: 9, runeId: "air-bolt-rune" },
  { id: "water-bolt", element: "water", levelReq: 23, baseMaxHit: 14, runeId: "water-bolt-rune" },
  { id: "earth-bolt", element: "earth", levelReq: 29, baseMaxHit: 18, runeId: "earth-bolt-rune" },
  { id: "fire-bolt", element: "fire", levelReq: 35, baseMaxHit: 24, runeId: "fire-bolt-rune" },
  { id: "air-blast", element: "air", levelReq: 41, baseMaxHit: 12, runeId: "air-blast-rune" },
  { id: "water-blast", element: "water", levelReq: 47, baseMaxHit: 18, runeId: "water-blast-rune" },
  { id: "earth-blast", element: "earth", levelReq: 53, baseMaxHit: 24, runeId: "earth-blast-rune" },
  { id: "fire-blast", element: "fire", levelReq: 59, baseMaxHit: 32, runeId: "fire-blast-rune" },
] as const;

const NEW_RUNE_IDS = [
  "air-bolt-rune",
  "water-bolt-rune",
  "earth-bolt-rune",
  "fire-bolt-rune",
  "air-blast-rune",
  "water-blast-rune",
  "earth-blast-rune",
  "fire-blast-rune",
] as const;

describe("spell-ladder.ts (#364)", () => {
  it("generates twelve spells with the issue's pinned ids, levels, max hits, and runeIds", () => {
    const spells = spellLadder();
    expect(spells).toHaveLength(12);
    for (const expected of EXPECTED_SPELLS) {
      const spell = spells.find((s) => s.id === expected.id);
      expect(spell).toEqual({
        id: expected.id,
        name: `${expected.element[0]!.toUpperCase()}${expected.element.slice(1)} ${
          expected.id.split("-")[1]![0]!.toUpperCase() + expected.id.split("-")[1]!.slice(1)
        }`,
        element: expected.element,
        levelReq: expected.levelReq,
        baseMaxHit: expected.baseMaxHit,
        runeId: expected.runeId,
      });
    }
  });

  it("generates eight Bolt/Blast rune items with element set and no rangedStr", () => {
    const runes = spellLadderRunes();
    expect(runes).toHaveLength(8);
    for (const id of NEW_RUNE_IDS) {
      const rune = runes.find((r) => r.id === id);
      expect(rune).toMatchObject({
        kind: "ammo",
        id,
        ammoType: "rune",
        icon: id,
      });
      expect(rune!.element).toBe(id.split("-")[0]);
      expect("rangedStr" in rune!).toBe(false);
    }
  });
});

describe("Spell ladder content (#364)", () => {
  it("validateContent passes with 1:1 rune↔spell across all twelve spells", () => {
    expect(validateContent(content)).toEqual([]);
  });

  it("keeps the four shipped Strike spells unchanged in id, levelReq, baseMaxHit, and runeId", () => {
    for (const expected of EXPECTED_SPELLS.slice(0, 4)) {
      const spell = content.spells.find((s) => s.id === expected.id)!;
      expect(spell.levelReq).toBe(expected.levelReq);
      expect(spell.baseMaxHit).toBe(expected.baseMaxHit);
      expect(spell.runeId).toBe(expected.runeId);
    }
  });

  it("appends the eight new runes after rune-platelegs (append-only)", () => {
    const ids = content.items.map((i) => i.id);
    const platelegsIndex = ids.indexOf("rune-platelegs");
    expect(platelegsIndex).toBeGreaterThanOrEqual(0);
    for (let i = 0; i < NEW_RUNE_IDS.length; i++) {
      expect(ids[platelegsIndex + 1 + i]).toBe(NEW_RUNE_IDS[i]);
    }
  });

  it("lists all eight Bolt/Blast runes on the vendor with Bolt at 6g and Blast at 20g", () => {
    const vendor = Object.fromEntries(content.vendor.map((v) => [v.itemId, v.price]));
    for (const id of NEW_RUNE_IDS) {
      expect(vendor[id]).toBe(id.includes("bolt") ? 6 : 20);
    }
  });

  it("resolves every new rune icon via itemIcon (#360)", () => {
    for (const id of NEW_RUNE_IDS) {
      expect(itemIcon(id)).toMatch(/^data:|\.png/);
    }
  });
});

describe("Spell ladder Engine seams (#364)", () => {
  function withDummyMonsters(weakElement?: Element): Content {
    const template = content.monsters.find((m) => m.id === "chicken")!;
    const { weakElement: _ignored, ...base } = template;
    const dummy = {
      ...base,
      id: "spell-ladder-dummy",
      name: "Spell Ladder Dummy",
      hp: 999_999,
      maxHit: 0,
    };
    const monsters = [...content.monsters, dummy];
    if (weakElement) {
      const weak: MonsterDef = {
        ...dummy,
        id: "spell-ladder-weak",
        name: "Spell Ladder Weak",
        weakElement,
      };
      const control: MonsterDef = {
        ...dummy,
        id: "spell-ladder-control",
        name: "Spell Ladder Control",
      };
      monsters.push(weak, control);
    }
    return { ...content, monsters };
  }

  function observedMagicMaxDamage(
    runeItemId: string,
    magicLevel = 99,
    weaponId = "apprentice-staff",
    testContent: Content = withDummyMonsters(),
  ): number {
    const engine = createEngine(
      testContent,
      seededRng(364),
      makeSnapshot({
        player: {
          skills: {
            magic: { level: magicLevel, xp: xpForLevel(magicLevel) },
            hitpoints: { level: 40, xp: xpForLevel(40) },
          },
          equipment: { weapon: weaponId },
          runeSlot: { itemId: runeItemId, qty: 100_000 },
        },
      }),
    );
    engine.selectMonster("spell-ladder-dummy");
    let max = 0;
    engine.on("attack", (e) => {
      if (e.actor === "player") max = Math.max(max, e.damage);
    });
    for (let i = 0; i < 2000; i++) engine.tick();
    expect(max).toBeGreaterThan(0);
    return max;
  }

  it("assignLoadoutSlot('rune', 'fire-blast-rune') throws below Magic 59 and succeeds at 59", () => {
    const bank = { items: [{ itemId: "fire-blast-rune", qty: 100 }] };
    const low = createEngine(
      content,
      seededRng(1),
      makeSnapshot({
        player: { skills: { magic: { level: 58, xp: xpForLevel(58) } } },
        bank,
      }),
    );
    expect(() => low.assignLoadoutSlot("rune", "fire-blast-rune")).toThrow(
      /magic level too low: need 59/,
    );

    const high = createEngine(
      content,
      seededRng(1),
      makeSnapshot({
        player: { skills: { magic: { level: 59, xp: xpForLevel(59) } } },
        bank,
      }),
    );
    high.assignLoadoutSlot("rune", "fire-blast-rune");
    expect(high.snapshot().player.spell?.id).toBe("fire-blast");
  });

  it.each(EXPECTED_SPELLS.slice(4).map((s) => [s.id, s.runeId, s.baseMaxHit, s.levelReq] as const))(
    "%s casts at baseMaxHit %i with zero magicDamage gear",
    (_spellId, runeId, baseMaxHit, levelReq) => {
      const observed = observedMagicMaxDamage(runeId, levelReq);
      expect(observed).toBe(baseMaxHit);
    },
  );

  it.each(EXPECTED_SPELLS.slice(4).map((s) => [s.id, s.runeId, s.baseMaxHit, s.levelReq] as const))(
    "%s max hit scales with rune-staff +15%% magicDamage: floor(baseMaxHit × 1.15)",
    (_spellId, runeId, baseMaxHit, levelReq) => {
      const observed = observedMagicMaxDamage(runeId, Math.max(levelReq, 40), "rune-staff");
      expect(observed).toBe(Math.floor(baseMaxHit * 1.15));
    },
  );

  function runAttacks(testContent: Content, monsterId: string, runeItemId: string, seed: number) {
    const engine = createEngine(
      testContent,
      seededRng(seed),
      makeSnapshot({
        player: {
          skills: {
            magic: { level: 59, xp: xpForLevel(59) },
            hitpoints: { level: 40, xp: xpForLevel(40) },
          },
          equipment: { weapon: "apprentice-staff" },
          runeSlot: { itemId: runeItemId, qty: 100_000 },
        },
      }),
    );
    engine.selectMonster(monsterId);
    const attacks: { hit: boolean; damage: number }[] = [];
    engine.on("attack", (e) => {
      if (e.actor === "player") attacks.push({ hit: e.hit, damage: e.damage });
    });
    for (let i = 0; i < 500; i++) engine.tick();
    expect(attacks.length).toBeGreaterThan(0);
    return attacks;
  }

  it.each([
    ["fire-bolt-rune", "fire"],
    ["earth-bolt-rune", "earth"],
    ["fire-blast-rune", "fire"],
    ["earth-blast-rune", "earth"],
  ] as const)(
    "matching element on %s deals ×1.5 against a %s-weak monster",
    (runeItemId, element) => {
      const testContent = withDummyMonsters(element);
      const control = runAttacks(testContent, "spell-ladder-control", runeItemId, 41);
      const weak = runAttacks(testContent, "spell-ladder-weak", runeItemId, 41);
      expect(weak).toHaveLength(control.length);
      let sawHit = false;
      for (let i = 0; i < control.length; i++) {
        const c = control[i]!;
        const w = weak[i]!;
        expect(w.hit).toBe(c.hit);
        expect(w.damage).toBe(Math.floor(c.damage * 1.5));
        if (c.hit) sawHit = true;
      }
      expect(sawHit).toBe(true);
    },
  );
});
