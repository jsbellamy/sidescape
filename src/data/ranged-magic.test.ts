import { describe, expect, it } from "vitest";
import { createEngine } from "../core/engine";
import { makeSnapshot } from "../core/make-snapshot";
import { seededRng } from "../core/rng";
import { content } from "./index";

describe("Ranged and Magic starter weapons (#7)", () => {
  it("Shortbow is a Ranged-mode weapon; Apprentice Staff is a Magic-mode weapon", () => {
    const shortbow = content.items.find((i) => i.id === "shortbow");
    expect(shortbow).toEqual({
      kind: "equipment",
      id: "shortbow",
      name: "Shortbow",
      slot: "weapon",
      attackType: "ranged",
      atkBonus: 5,
      strBonus: 4,
      def: { stab: 0, slash: 0, crush: 0, ranged: 0, magic: 0 },
      attackSpeed: 5,
      value: 25,
    });

    const staff = content.items.find((i) => i.id === "apprentice-staff");
    expect(staff).toEqual({
      kind: "equipment",
      id: "apprentice-staff",
      name: "Apprentice Staff",
      slot: "weapon",
      attackType: "magic",
      atkBonus: 4,
      strBonus: 5,
      def: { stab: 0, slash: 0, crush: 0, ranged: 0, magic: 0 },
      attackSpeed: 6,
      value: 25,
    });
  });

  it("both are appended after existing items (append-only: shade-blade still precedes them)", () => {
    const ids = content.items.map((i) => i.id);
    expect(ids.indexOf("shade-blade")).toBeLessThan(ids.indexOf("shortbow"));
    expect(ids.indexOf("shade-blade")).toBeLessThan(ids.indexOf("apprentice-staff"));
  });

  it("every other weapon in Content declares a melee attackType (stab/slash/crush)", () => {
    // Ranged/Magic weapons across #7 (starter tier) and #13 (iron/steel/mithril tiers) — every
    // other weapon in Content must declare a melee attackType (#99 derives Combat Mode from it).
    const rangedAndMagicWeaponIds = new Set([
      "shortbow",
      "apprentice-staff",
      "iron-shortbow",
      "iron-staff",
      "steel-shortbow",
      "steel-staff",
      "mithril-shortbow",
      "mithril-staff",
    ]);
    const otherWeapons = content.items.filter(
      (i) => i.kind === "equipment" && i.slot === "weapon" && !rangedAndMagicWeaponIds.has(i.id),
    );
    expect(otherWeapons.length).toBeGreaterThan(0);
    for (const weapon of otherWeapons) {
      expect(weapon.kind === "equipment" && weapon.attackType).toMatch(/^(stab|slash|crush)$/);
    }
  });

  it("Shortbow drops from Lumbry Meadows' Goblin; Apprentice Staff drops from its Cow", () => {
    const goblin = content.monsters.find((m) => m.id === "goblin")!;
    expect(goblin.dropTable).toContainEqual({
      itemId: "shortbow",
      qty: 1,
      chance: 1 / 28,
      band: "uncommon",
    });

    const cow = content.monsters.find((m) => m.id === "cow")!;
    expect(cow.dropTable).toContainEqual({
      itemId: "apprentice-staff",
      qty: 1,
      chance: 1 / 28,
      band: "uncommon",
    });

    const lumbryMeadows = content.areas.find((a) => a.id === "lumbry-meadows")!;
    expect(lumbryMeadows.monsterIds).toEqual(expect.arrayContaining(["goblin", "cow"]));
  });

  it("equipping the Shortbow (owned via the Bank) and fighting routes attack XP to Ranged, not Attack/Strength", () => {
    const engine = createEngine(
      content,
      seededRng(7),
      makeSnapshot({ bank: { items: [{ itemId: "shortbow", qty: 1 }] } }),
    );
    engine.equip("shortbow");
    expect(engine.snapshot().player.equipment.weapon).toBe("shortbow");

    engine.selectMonster("chicken");
    for (let i = 0; i < 300; i++) engine.tick();
    const { skills } = engine.snapshot().player;
    expect(skills.ranged.xp).toBeGreaterThan(0);
    expect(skills.attack.xp).toBe(0);
    expect(skills.strength.xp).toBe(0);
  });

  it("equipping the Apprentice Staff and fighting routes attack XP to Magic, not Attack/Strength", () => {
    const engine = createEngine(
      content,
      seededRng(7),
      makeSnapshot({ bank: { items: [{ itemId: "apprentice-staff", qty: 1 }] } }),
    );
    engine.equip("apprentice-staff");
    expect(engine.snapshot().player.equipment.weapon).toBe("apprentice-staff");

    engine.selectMonster("chicken");
    for (let i = 0; i < 300; i++) engine.tick();
    const { skills } = engine.snapshot().player;
    expect(skills.magic.xp).toBeGreaterThan(0);
    expect(skills.attack.xp).toBe(0);
    expect(skills.strength.xp).toBe(0);
  });
});
