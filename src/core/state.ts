import type {
  AutoEatThreshold,
  CombatStyle,
  FoodSlot,
  GearSlot,
  PotionSlot,
  SkillName,
} from "./types";

export interface MonsterFight {
  monsterId: string;
  monsterHp: number;
  playerCooldown: number;
  monsterCooldown: number;
}

export interface CombatActivity extends MonsterFight {
  kind: "combat";
}

/** Sibling to CombatActivity: a Dungeon run is always mid-fight (waves and the boss are Monsters),
 * so it carries the same MonsterFight fields plus which run/Wave it's on. */
export interface DungeonActivity extends MonsterFight {
  kind: "dungeon";
  dungeonId: string;
  /** 0-based index into DungeonDef.waves of the Monster currently up. */
  waveIndex: number;
}

export interface FishingActivity {
  kind: "fishing";
  spotId: string;
  catchCooldown: number;
  /** The exact value `catchCooldown` was last armed to (#284) — set at every arm/re-arm site in
   * lockstep with `catchCooldown` itself, so `snapshot()` can derive `progress` as
   * `(cooldownTotal - catchCooldown) / cooldownTotal`. Internal only, never persisted — a resumed
   * activity always re-arms both fields together (see loadState), so there is no save-compat
   * concern and no stale-total risk. */
  cooldownTotal: number;
}

/** A Recipe in progress (#113: generalised from the old Smithing-only SmithingActivity — the
 * recipe itself carries `skill` now, so the activity needs no skill field of its own). */
export interface ProductionActivity {
  kind: "production";
  recipeId: string;
  craftCooldown: number;
  /** Mirrors FishingActivity.cooldownTotal (#284): the exact value `craftCooldown` was last armed
   * to, kept in lockstep at every arm/re-arm site. Internal only, never persisted. */
  cooldownTotal: number;
}

/** The Engine's single "what is the player doing right now" value (#29): at most one of
 * Monster / Fishing Spot / Dungeon run / Recipe is ever active, enforced structurally by this
 * being one field rather than by hand in every select command. Every command that starts an
 * activity assigns this wholesale, which is what makes the exclusivity automatic — there is no
 * per-command "clear the other three" bookkeeping left to forget. */
export type Activity =
  CombatActivity | DungeonActivity | FishingActivity | ProductionActivity | null;

export interface State {
  xp: Record<SkillName, number>;
  hp: number;
  combatStyle: CombatStyle;
  autoEatThreshold: AutoEatThreshold;
  /** Toggles auto-sell of duplicate Equipment (#63) — see creditCombatItem/isDuplicateEquipment. */
  autoSellDuplicates: boolean;
  /** The Active Food Slot loadout (#61), fixed length FOOD_SLOT_COUNT; see FoodSlot's own doc
   * (types.ts) for the home/routing/priority rules. */
  foodSlots: FoodSlot[];
  /** The active-potion loadout slot (#118) — see PotionSlot's own doc (types.ts) for the
   * shape/qualifying-action rules. */
  potionSlot: PotionSlot;
  /** The Quiver (#119) — see Snapshot.player.quiver's own doc (types.ts) for the shape/home
   * rules. `null` = empty; a depleted stack stays loaded at qty 0 (empty != unloaded, mirrors a
   * Food Slot). */
  quiver: { itemId: string; qty: number } | null;
  /** The Rune Slot (#221) — see Snapshot.player.runeSlot's own doc (types.ts) for the shape/home
   * rules. `null` = empty; a depleted stack stays loaded at qty 0 (empty != unloaded, mirrors the
   * Quiver above exactly). The loaded rune's itemId determines the currently castable Spell — see
   * `currentSpell`. */
  runeSlot: { itemId: string; qty: number } | null;
  /** Whether an empty-Quiver out-of-ammo event has already fired for the CURRENT depletion
   * (#119) — reset to false the moment the Quiver holds qty > 0 again, so the next depletion
   * fires its own event instead of staying silently suppressed forever. Never persisted — a fresh
   * load always starts un-warned, same as respawnTicksLeft/regenTicks below. */
  quiverOutWarned: boolean;
  /** Whether an empty/depleted-Rune-Slot out-of-ammo event has already fired for the CURRENT
   * depletion (#221) — mirrors quiverOutWarned's shape exactly, now singular since there is only
   * one Rune Slot. Never persisted. */
  runeOutWarned: boolean;
  activity: Activity;
  /** The player's currency balance (#59) — gold stopped being an item stack; the Bank below is
   * the sole store for every other Item. */
  gold: number;
  bank: Map<string, number>;
  bankCapacity: number;
  /** The Loot Zone (#60): combat Drops land here first, capped at LOOT_ZONE_CAPACITY stacks; a
   * sibling store to `bank`, swept into it on leaving combat or via lootAll(). */
  lootZone: Map<string, number>;
  equipment: Record<GearSlot, string | null>;
  respawnTicksLeft: number;
  regenTicks: number;
  completedDungeonIds: Set<string>;
  /** Owned Pet ids (#120) — mirrors completedDungeonIds' Set shape; see Snapshot.player.ownedPets'
   * own doc for the append-only/serialisation rules. */
  ownedPets: Set<string>;
  /** Pre-#221 `player.runePouch` stacks to bank at Engine construction via `addToBank` — never persisted. */
  pendingLegacyRuneBank: { itemId: string; qty: number }[];
}
