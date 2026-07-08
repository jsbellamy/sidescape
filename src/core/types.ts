export type SkillName = "attack" | "strength" | "defence" | "hitpoints";
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

export type ItemDef = EquipmentDef | FoodDef | CurrencyDef;

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

export interface AreaDef {
  id: string;
  name: string;
  combatLevelReq: number;
  monsterIds: string[];
}

export interface Content {
  areas: AreaDef[];
  monsters: MonsterDef[];
  items: ItemDef[];
}

export type EngineEvent =
  | { type: "kill"; monsterId: string }
  | { type: "drop"; itemId: string; qty: number; band: DropBand }
  | { type: "levelup"; skill: SkillName; level: number }
  | { type: "death" }
  | { type: "food-eaten"; itemId: string; healed: number }
  | { type: "item-sold"; itemId: string; qty: number; gold: number };

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
    inventory: { itemId: string; qty: number }[];
    respawning: boolean;
  };
  monster: { id: string; name: string; hp: number; maxHp: number } | null;
  areas: { id: string; name: string; unlocked: boolean; monsterIds: string[] }[];
}
