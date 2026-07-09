/** Ordered list of Skills; order is load-bearing for the XP row render order. Ranged and Magic
 * (#7) are appended, never inserted earlier — mirrors items.ts's own append-only convention. */
export const SKILL_NAMES = [
  "attack",
  "strength",
  "defence",
  "hitpoints",
  "fishing",
  "smithing",
  "ranged",
  "magic",
] as const;
export type SkillName = (typeof SKILL_NAMES)[number];
export type CombatStyle = "accurate" | "aggressive" | "defensive";
/** A weapon's Combat Mode (#7) — deliberately NOT a widening of CombatStyle: CombatStyle is the
 * player's melee training selector (Accurate/Aggressive/Defensive), while Combat Mode is which of
 * Attack's three families a weapon belongs to. A melee weapon's damage XP still routes through
 * CombatStyle (STYLE_SKILL in engine.ts); a ranged or magic weapon routes straight to its own
 * Skill instead, bypassing Combat Style entirely. See ADR-0002 for why STYLE_SKILL/STYLE_BOOST
 * stay separate maps — this type is orthogonal to both. */
export type CombatMode = "melee" | "ranged" | "magic";
export type GearSlot = "weapon" | "shield" | "head" | "body" | "legs";
export type DropBand = "guaranteed" | "common" | "uncommon" | "rare";

/** Fraction of max HP below which `autoEat` kicks in; 0 disables it entirely. */
export const AUTO_EAT_THRESHOLDS = [0, 0.25, 0.5, 0.75] as const;
export type AutoEatThreshold = (typeof AUTO_EAT_THRESHOLDS)[number];

/** One of the FOOD_SLOT_COUNT (engine.ts) Active Food Slots (#61): a slot IS the assigned Food's
 * home — while assigned, its entire Bank stock lives here and every new arrival of that Food
 * (fishing Catches, Loot Zone sweeps) routes here instead of the Bank. `null` = unassigned. A
 * slot may sit at `qty: 0` while still assigned — the itemId persists (empty != unassigned), so
 * the next arrival refills it automatically. Slot order (array index) is auto-eat's draining
 * priority, 1→2→3. */
export type FoodSlot = { itemId: string; qty: number } | null;

/** Source of randomness; next() returns a float in [0, 1). */
export interface Rng {
  next(): number;
}

export interface EquipmentDef {
  kind: "equipment";
  id: string;
  name: string;
  slot: GearSlot;
  atkBonus: number;
  strBonus: number;
  defBonus: number;
  /** Weapons only: Ticks between player attacks. */
  attackSpeed?: number;
  /** Weapons only: which Combat Mode this weapon trains; omitted means "melee" (every pre-#7
   * weapon in data/index.ts relies on this default rather than declaring it explicitly). */
  combatMode?: CombatMode;
  /** Gold per unit when sold from the Bank; omit to make it unsellable. */
  value?: number;
}

export interface FoodDef {
  kind: "food";
  id: string;
  name: string;
  heals: number;
  /** Gold per unit when sold from the Bank; omit to make it unsellable. */
  value?: number;
}

export interface CurrencyDef {
  kind: "currency";
  id: string;
  name: string;
}

/** A Smithing input/output ingredient (e.g. a Bar). Stackable, unequippable, uneatable; sellable
 * when it carries a `value` and always bankable, same as Food/Equipment. NOT a currency-kind
 * item: `content.items.find(i => i.kind === "currency")` resolves THE currency, so a second
 * currency-kind item would silently corrupt the sell-credit target. */
export interface MaterialDef {
  kind: "material";
  id: string;
  name: string;
  /** Gold per unit when sold from the Bank; omit to make it unsellable. */
  value?: number;
}

export type ItemDef = EquipmentDef | FoodDef | CurrencyDef | MaterialDef;

export interface RecipeDef {
  id: string;
  name: string;
  /** Smithing level required to select this Recipe. */
  levelReq: number;
  inputs: { itemId: string; qty: number }[];
  /** Item produced per craft; always qty 1 (see the item-crafted event). */
  outputItemId: string;
  /** Smithing XP per craft. */
  xp: number;
  /** Ticks per craft. */
  craftTicks: number;
}

export interface DropTableEntry {
  itemId: string;
  qty: number;
  /** Probability per kill, 0..1; 1 = guaranteed. Rolled independently per entry. */
  chance: number;
  band: DropBand;
}

export interface MonsterDef {
  id: string;
  name: string;
  hp: number;
  attackLevel: number;
  defenceLevel: number;
  maxHit: number;
  /** Ticks between monster attacks. */
  attackSpeed: number;
  dropTable: DropTableEntry[];
}

export interface FishingSpotDef {
  id: string;
  name: string;
  /** Fishing level required to fish here. */
  levelReq: number;
  /** Caught item; must be a FoodDef. */
  itemId: string;
  /** Fishing XP per successful Catch. */
  xp: number;
  /** Ticks between Catch attempts. */
  catchTicks: number;
  /** Probability per attempt, 0..1; rolled via Rng. */
  catchChance: number;
}

export interface AreaDef {
  id: string;
  name: string;
  /** DungeonDef id whose completion unlocks this Area; absent = unlocked from the start. */
  unlockedByDungeonId?: string;
  monsterIds: string[];
  fishingSpotIds?: string[];
}

export interface DungeonDef {
  id: string;
  name: string;
  /** Area whose picker section hosts this dungeon; entry requires that Area unlocked. */
  areaId: string;
  /** MonsterDef ids fought in order; the last entry is the boss. Length >= 1. */
  waves: string[];
  /** Chest reward table: every entry rolled independently per completion (multi-roll);
   * chance 1 = guaranteed. Reuses DropTableEntry — same semantics as rollDrops. */
  chest: DropTableEntry[];
}

export interface Content {
  areas: AreaDef[];
  monsters: MonsterDef[];
  items: ItemDef[];
  fishingSpots: FishingSpotDef[];
  dungeons: DungeonDef[];
  recipes: RecipeDef[];
}

export type EngineEvent =
  | { type: "kill"; monsterId: string }
  | { type: "drop"; itemId: string; qty: number; band: DropBand }
  | { type: "levelup"; skill: SkillName; level: number }
  | { type: "death" }
  | { type: "food-eaten"; itemId: string; healed: number }
  | { type: "item-sold"; itemId: string; qty: number; gold: number }
  | { type: "fish-caught"; spotId: string; itemId: string; qty: number }
  | { type: "item-crafted"; recipeId: string; itemId: string }
  | { type: "equipped"; itemId: string }
  /** A passive arrival (drop, Catch, craft output) that needed a NEW Bank stack while the Bank
   * was full: sellable, so it was auto-sold instead of lost (#59 — passive flows auto-sell on
   * overflow, player commands throw). Top-ups of an existing stack never trigger this. */
  | { type: "overflow-sold"; itemId: string; qty: number; gold: number }
  /** Sibling to overflow-sold (#59): the same full-Bank/new-stack situation, but the item has no
   * `value` (unsellable), so it was discarded instead. */
  | { type: "overflow-lost"; itemId: string; qty: number }
  /** wave = 1-based cleared count (e.g. clearing the 2nd of 3 waves emits wave: 2). */
  | { type: "wave-cleared"; dungeonId: string; wave: number; totalWaves: number }
  | { type: "dungeon-completed"; dungeonId: string }
  | {
      type: "chest-opened";
      dungeonId: string;
      items: { itemId: string; qty: number; band: DropBand }[];
    }
  /** A sweep of the Loot Zone into the Bank (#60) — fired by leaving combat (selectFishingSpot,
   * selectRecipe, enterDungeon, dungeon completion) or by the on-demand lootAll() command. Lists
   * only the stacks actually banked; a stack that needed a new Bank Slot at capacity stays in the
   * Loot Zone and is left out. Never fires when nothing moved. */
  | { type: "looted"; items: { itemId: string; qty: number }[] }
  /** Death mid-Dungeon-run (#60): the run is abandoned (mirrors the existing death/ejection
   * handling) AND the Loot Zone is emptied — the failed run's own drops are lost, not banked.
   * Open-world death is unchanged: no sweep, no loss, same fight resumes. */
  | { type: "dungeon-failed"; dungeonId: string; lostItems: { itemId: string; qty: number }[] };

export interface SkillSnapshot {
  level: number;
  xp: number;
}

export interface Snapshot {
  player: {
    hp: number;
    maxHp: number;
    combatLevel: number;
    combatStyle: CombatStyle;
    autoEatThreshold: AutoEatThreshold;
    /** The Active Food Slot loadout (#61), fixed length FOOD_SLOT_COUNT (3): replaces free-form
     * eat-from-Bank. See FoodSlot's own doc for the home/routing/priority rules. */
    foodSlots: FoodSlot[];
    skills: Record<SkillName, SkillSnapshot>;
    equipment: Record<GearSlot, string | null>;
    /** Derived totals across every equipped Gear Slot (ADR-0001: a rule, not raw data), computed
     * fresh each snapshot from `content.items` — harmless to persist in a save, ignored on load. */
    bonuses: { atkBonus: number; strBonus: number; defBonus: number; attackSpeed: number };
    /** The player's currency balance (#59) — a number on the player, not an Item stack; the Bank
     * is the sole store for every other Item. */
    gold: number;
    respawning: boolean;
    completedDungeonIds: string[];
  };
  monster: { id: string; name: string; hp: number; maxHp: number } | null;
  fishing: { spotId: string; name: string } | null;
  /** Sibling to monster/fishing; monster stays populated with the current wave Monster so the
   * existing HP-bar rendering works untouched. 1-based wave, mid-run only — never persisted
   * across a reload (a reload is an abandon, see engine.ts's loadState). */
  dungeon: { id: string; name: string; wave: number; totalWaves: number } | null;
  /** Sibling to monster/fishing/dungeon; at most one of the four is non-null at a time (#28's
   * four-way mutual exclusion). Unlike dungeon, Smithing RESUMES on load like fishing does. */
  smithing: { recipeId: string; name: string } | null;
  bank: {
    items: { itemId: string; qty: number }[];
    capacity: number;
    /** Derived, not stored: the gold cost of the next `buyBankSlots()` call. */
    nextSlotsPrice: number;
  };
  /** The Loot Zone (#60): a small buffer, capped at LOOT_ZONE_CAPACITY stacks, that combat Drops
   * (kill Drops and Dungeon Chest items) land in on their way to the Bank, instead of going there
   * directly — a sibling store to `bank`, not a subset of it. Currency Drops still bypass it
   * straight to `player.gold`; non-combat outputs (Catches, Smithing outputs) still go straight to
   * the Bank, unchanged. Swept into the Bank on leaving combat, or on demand via `lootAll()`. */
  lootZone: { itemId: string; qty: number }[];
  areas: {
    id: string;
    name: string;
    unlocked: boolean;
    monsterIds: string[];
    fishingSpots: { id: string; unlocked: boolean }[];
  }[];
}
