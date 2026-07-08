import { fixtureContent } from "./fixture-content";
import type { Snapshot } from "./types";

/** A recursive Partial: plain nested objects may supply a subset of their fields; arrays and
 * scalars are taken wholesale (no element-wise partials) when supplied. */
export type DeepPartial<T> = T extends (infer _U)[]
  ? T
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Deep-merges `override` onto `base`: plain objects merge key by key; arrays, null, and
 * scalars are replaced wholesale whenever `override` supplies a value for that key. */
function mergeUnknown(base: unknown, override: unknown): unknown {
  if (override === undefined) return base;
  if (!isPlainObject(base) || !isPlainObject(override)) return override;
  const merged: Record<string, unknown> = { ...base };
  for (const key of Object.keys(override)) {
    merged[key] = mergeUnknown(base[key], override[key]);
  }
  return merged;
}

/** A minimal, self-consistent Snapshot: level-1 Skills (so full HP is 1), nothing selected,
 * no Gear worn, an empty inventory, and Areas/Fishing Spots gated exactly as Engine would derive
 * them for that combat/Fishing level against `fixtureContent`. */
function baseSnapshot(): Snapshot {
  const skills: Snapshot["player"]["skills"] = {
    attack: { level: 1, xp: 0 },
    strength: { level: 1, xp: 0 },
    defence: { level: 1, xp: 0 },
    hitpoints: { level: 1, xp: 0 },
    fishing: { level: 1, xp: 0 },
  };
  const combatLevel = Math.floor(
    (skills.attack.level + skills.strength.level + skills.defence.level + skills.hitpoints.level) /
      4,
  );
  const maxHp = skills.hitpoints.level;

  return {
    player: {
      hp: maxHp,
      maxHp,
      combatLevel,
      combatStyle: "accurate",
      autoEatThreshold: 0,
      skills,
      equipment: { weapon: null, shield: null, head: null, body: null, legs: null },
      // Derived output, ignored on load (#26); the fixture default matches a fresh, unarmed
      // player — mirrors engine.ts's own unarmed attack-speed fallback of 4 Ticks.
      bonuses: { atkBonus: 0, strBonus: 0, defBonus: 0, attackSpeed: 4 },
      inventory: [],
      respawning: false,
    },
    monster: null,
    fishing: null,
    bank: { items: [], capacity: 100, nextSlotsPrice: 1000 },
    areas: fixtureContent.areas.map((area) => {
      const unlocked = combatLevel >= area.combatLevelReq;
      return {
        id: area.id,
        name: area.name,
        unlocked,
        monsterIds: [...area.monsterIds],
        fishingSpots: (area.fishingSpotIds ?? []).map((id) => {
          const spot = fixtureContent.fishingSpots.find((s) => s.id === id);
          return { id, unlocked: unlocked && skills.fishing.level >= (spot?.levelReq ?? 0) };
        }),
      };
    }),
  };
}

/**
 * Builds a complete, valid Snapshot for tests, so call sites state only the fields their
 * scenario cares about instead of hand-building the whole shape. `overrides` deep-merges onto
 * sensible defaults (full HP at level 1 across every Skill, no Gear, empty inventory, nothing
 * selected) for plain nested objects (`player`, `player.skills`, `player.equipment`); arrays
 * (`inventory`, `areas`) and nullable objects (`monster`, `fishing`) are replaced wholesale
 * when supplied.
 */
export function makeSnapshot(overrides?: DeepPartial<Snapshot>): Snapshot {
  return mergeUnknown(baseSnapshot(), overrides) as Snapshot;
}
