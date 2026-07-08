/** Ordered list of Skills; order is load-bearing for the XP row render order. */
export const SKILL_NAMES = [
  "attack",
  "strength",
  "defence",
  "hitpoints",
  "fishing",
  "smithing",
] as const;
export type SkillName = (typeof SKILL_NAMES)[number];
export type CombatStyle = "accurate" | "aggressive" | "defensive";
export type GearSlot = "weapon" | "shield" | "head" | "body" | "legs";
export type DropBand = "guaranteed" | "common" | "uncommon" | "rare";

/** Fraction of max HP below which `autoEat` kicks in; 0 disables it entirely. */
export const AUTO_EAT_THRESHOLDS = [0, 0.25, 0.5, 0.75] as const;
export type AutoEatThreshold = (typeof AUTO_EAT_THRESHOLDS)[number];

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
  /** Gold per unit when sold from the Inventory; omit to make it unsellable. */
  value?: number;
}

export interface FoodDef {
  kind: "food";
  id: string;
  name: string;
  heals: number;
  /** Gold per unit when sold from the Inventory; omit to make it unsellable. */
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
  /** Gold per unit when sold from the Inventory; omit to make it unsellable. */
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
  /** wave = 1-based cleared count (e.g. clearing the 2nd of 3 waves emits wave: 2). */
  | { type: "wave-cleared"; dungeonId: string; wave: number; totalWaves: number }
  | { type: "dungeon-completed"; dungeonId: string }
  | {
      type: "chest-opened";
      dungeonId: string;
      items: { itemId: string; qty: number; band: DropBand }[];
    };

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
    skills: Record<SkillName, SkillSnapshot>;
    equipment: Record<GearSlot, string | null>;
    /** Derived totals across every equipped Gear Slot (ADR-0001: a rule, not raw data), computed
     * fresh each snapshot from `content.items` — harmless to persist in a save, ignored on load. */
    bonuses: { atkBonus: number; strBonus: number; defBonus: number; attackSpeed: number };
    inventory: { itemId: string; qty: number }[];
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
  areas: {
    id: string;
    name: string;
    unlocked: boolean;
    monsterIds: string[];
    fishingSpots: { id: string; unlocked: boolean }[];
  }[];
}
