import type { CombatStyle, SkillName } from "./types";

/** Combat Style grants +3 effective levels to its matching Skill. */
const STYLE_BOOST: Record<CombatStyle, SkillName> = {
  accurate: "attack",
  aggressive: "strength",
  defensive: "defence",
};

export function effectiveLevel(level: number, skill: SkillName, style: CombatStyle): number {
  return level + 8 + (STYLE_BOOST[style] === skill ? 3 : 0);
}

/** OSRS-style max hit from effective Strength and equipment strength bonus. */
export function maxHit(effectiveStrength: number, strBonus: number): number {
  return Math.floor(0.5 + (effectiveStrength * (strBonus + 64)) / 640);
}

export function attackRoll(effectiveAttack: number, atkBonus: number): number {
  return effectiveAttack * (atkBonus + 64);
}

export function defenceRoll(effectiveDefence: number, defBonus: number): number {
  return effectiveDefence * (defBonus + 64);
}

/** OSRS accuracy formula: chance the attack roll beats the defence roll. */
export function hitChance(atkRoll: number, defRoll: number): number {
  return atkRoll > defRoll
    ? 1 - (defRoll + 2) / (2 * (atkRoll + 1))
    : atkRoll / (2 * (defRoll + 1));
}
