import { describe, expect, it } from "vitest";
import { ATTACK_TYPES } from "../core/types";
import type { AttackType, Element } from "../core/types";
import { content } from "./index";

/** Combat Depth wave 4/4 (#102)'s owner-decided table: every Monster's own offence Attack Type,
 * its weak spot (the lowest entry in its `def` vector), and its `weakElement` (only bosses plus
 * the Zombie carry one). Regression guard — asserts the re-stat matches the table even as the
 * exact def numbers get retuned later (they're flagged tuning defaults). */
const WEAK_SPOT_TABLE: {
  id: string;
  attackType: AttackType;
  weakTo: AttackType;
  weakElement?: Element;
}[] = [
  { id: "chicken", attackType: "stab", weakTo: "slash" },
  { id: "cow", attackType: "crush", weakTo: "slash" },
  { id: "giant-rat", attackType: "stab", weakTo: "slash" },
  { id: "wolf", attackType: "slash", weakTo: "slash" },
  { id: "goblin", attackType: "crush", weakTo: "stab" },
  { id: "goblin-warrior", attackType: "slash", weakTo: "stab" },
  { id: "goblin-brute", attackType: "crush", weakTo: "stab" },
  { id: "goblin-chief", attackType: "crush", weakTo: "stab" },
  { id: "bandit", attackType: "stab", weakTo: "stab" },
  { id: "zombie", attackType: "crush", weakTo: "slash", weakElement: "fire" },
  { id: "skeleton", attackType: "slash", weakTo: "crush" },
  { id: "hollow-warden", attackType: "magic", weakTo: "crush", weakElement: "fire" },
  { id: "sewer-king", attackType: "crush", weakTo: "stab", weakElement: "earth" },
  // Shade Crypt (#253): Bone Crypt's new open-world cast, statted between Skeleton and Crypt
  // Shade. Neither is a boss, so neither carries a weakElement.
  { id: "crypt-ghoul", attackType: "slash", weakTo: "stab" },
  { id: "bone-knight", attackType: "crush", weakTo: "crush" },
  { id: "crypt-shade", attackType: "magic", weakTo: "ranged", weakElement: "fire" },
];

/** Mirrors the UI's own weak-spot derivation (`weakSpot` in ui/app.ts): the lowest `def` entry,
 * ties broken by ATTACK_TYPES order. */
function lowestDefType(def: Record<AttackType, number>): AttackType {
  return ATTACK_TYPES.reduce((weakest, t) => (def[t] < def[weakest] ? t : weakest));
}

describe("Monster weak spots (Combat Depth #102 re-stat)", () => {
  it("covers all 16 Monsters from the table", () => {
    expect(WEAK_SPOT_TABLE).toHaveLength(16);
  });

  for (const row of WEAK_SPOT_TABLE) {
    it(`${row.id} carries attackType "${row.attackType}", is weak to "${row.weakTo}"${
      row.weakElement ? `, and weakElement "${row.weakElement}"` : ""
    }`, () => {
      const monster = content.monsters.find((m) => m.id === row.id);
      expect(monster, `${row.id} not found in Content`).toBeDefined();
      expect(monster!.attackType).toBe(row.attackType);
      expect(lowestDefType(monster!.def)).toBe(row.weakTo);
      expect(monster!.weakElement).toBe(row.weakElement);
    });
  }

  it("every Monster's weak spot is meaningfully worse than its strongest type (>=40% below)", () => {
    for (const monster of content.monsters) {
      const values = ATTACK_TYPES.map((t) => monster.def[t]);
      const strongest = Math.max(...values);
      const weakest = Math.min(...values);
      expect(
        weakest,
        `${monster.id}: weak spot ${weakest} not >=40% below strongest ${strongest}`,
      ).toBeLessThanOrEqual(strongest * 0.6);
    }
  });

  it("only bosses (hollow-warden, sewer-king, crypt-shade) plus the Zombie carry a weakElement", () => {
    const withWeakElement = content.monsters.filter((m) => m.weakElement).map((m) => m.id);
    expect(new Set(withWeakElement)).toEqual(
      new Set(["zombie", "hollow-warden", "sewer-king", "crypt-shade"]),
    );
  });
});
