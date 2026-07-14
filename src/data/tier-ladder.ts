import type { AttackType, EquipmentDef, GearSlot, RecipeDef } from "../core/types";

/**
 * Issue #251: the Gear Tier ladder (bronze -> iron -> steel -> mithril) expressed BY
 * CONSTRUCTION instead of as hand-typed literals re-checked after the fact. Every ladder stat is
 * `base + step * tierIndex` over the tiers below it; `value = baseValue * 2^tierIndex`. Data
 * only — never imports engine code (ADR-0001).
 *
 * This is a DELIBERATE, owner-approved rebalance of a shipped game (decided 2026-07-13), not a
 * byte-for-byte refactor: armour, item values, and iron-tier Smithing levels move on purpose.
 * Melee weapon atk/str and all of bronze reproduce today's shipped numbers exactly; see
 * tier-ladder.test.ts for the worked table this is checked against.
 */

export const GEAR_TIERS = ["bronze", "iron", "steel", "mithril"] as const;
export type GearTier = (typeof GEAR_TIERS)[number];

export const WEAPON_FAMILIES = ["dagger", "mace", "sword", "shortbow", "staff"] as const;
export type WeaponFamily = (typeof WEAPON_FAMILIES)[number];

export const ARMOUR_FAMILIES = ["chainbody", "kiteshield", "full-helm"] as const;
export type ArmourFamily = (typeof ARMOUR_FAMILIES)[number];

/** The families Smithing covers: every weapon family except the two non-metal ones (shortbow has
 * no fletching Skill, staff has no runecrafting Skill — both stay drop-only, unchanged from
 * today), plus every armour family. 6 families x 4 tiers = 24 Recipes. */
export const METAL_FAMILIES = [
  "dagger",
  "mace",
  "sword",
  "chainbody",
  "kiteshield",
  "full-helm",
] as const;
export type MetalFamily = (typeof METAL_FAMILIES)[number];

type DefVector = Record<AttackType, number>;

interface WeaponFamilyRow {
  slot: "weapon";
  attackType: AttackType;
  attackSpeed: number;
  baseAtk: number;
  baseStr: number;
  stepAtk: number;
  stepStr: number;
  baseValue: number;
}

/** Weapon families table — copied verbatim from the issue's own "Weapon families" table. */
export const WEAPON_TABLE: Record<WeaponFamily, WeaponFamilyRow> = {
  dagger: {
    slot: "weapon",
    attackType: "stab",
    attackSpeed: 4,
    baseAtk: 4,
    baseStr: 3,
    stepAtk: 5,
    stepStr: 4,
    baseValue: 10,
  },
  mace: {
    slot: "weapon",
    attackType: "crush",
    attackSpeed: 5,
    baseAtk: 6,
    baseStr: 5,
    stepAtk: 5,
    stepStr: 4,
    baseValue: 15,
  },
  sword: {
    slot: "weapon",
    attackType: "slash",
    attackSpeed: 5,
    baseAtk: 7,
    baseStr: 6,
    stepAtk: 5,
    stepStr: 4,
    baseValue: 20,
  },
  shortbow: {
    slot: "weapon",
    attackType: "ranged",
    attackSpeed: 5,
    baseAtk: 5,
    baseStr: 4,
    stepAtk: 6,
    stepStr: 5,
    baseValue: 25,
  },
  staff: {
    slot: "weapon",
    attackType: "magic",
    attackSpeed: 6,
    baseAtk: 4,
    baseStr: 5,
    stepAtk: 5,
    stepStr: 6,
    baseValue: 25,
  },
};

interface ArmourFamilyRow {
  slot: GearSlot;
  baseDef: DefVector;
  stepDef: DefVector;
  baseValue: number;
}

/** Armour families table — copied verbatim from the issue's own "Armour families" table. The -1
 * magic step is a deliberate fix (today's magic def is incoherent across iron/steel/mithril); a
 * monotonic -1 makes heavy metal a coherent, escalating magic-defence penalty. */
export const ARMOUR_TABLE: Record<ArmourFamily, ArmourFamilyRow> = {
  chainbody: {
    slot: "body",
    baseDef: { stab: 4, slash: 4, crush: 2, ranged: 3, magic: 0 },
    stepDef: { stab: 6, slash: 6, crush: 3, ranged: 5, magic: -1 },
    baseValue: 30,
  },
  kiteshield: {
    slot: "shield",
    baseDef: { stab: 4, slash: 4, crush: 2, ranged: 3, magic: 0 },
    stepDef: { stab: 5, slash: 5, crush: 2, ranged: 4, magic: -1 },
    baseValue: 12,
  },
  "full-helm": {
    slot: "head",
    baseDef: { stab: 2, slash: 2, crush: 1, ranged: 2, magic: 0 },
    stepDef: { stab: 3, slash: 3, crush: 1, ranged: 2, magic: -1 },
    baseValue: 25,
  },
};

interface LegacyOverride {
  id: string;
  name: string;
}

/** Three bronze-tier items shipped under non-conforming ids; saves persist raw item ids, so these
 * can never change. See the issue's own "Legacy id overrides" table. */
const LEGACY_OVERRIDES: Record<string, LegacyOverride> = {
  "bronze/kiteshield": { id: "bronze-shield", name: "Bronze Shield" },
  "bronze/shortbow": { id: "shortbow", name: "Shortbow" },
  "bronze/staff": { id: "apprentice-staff", name: "Apprentice Staff" },
};

function titleCase(family: string): string {
  return family
    .split("-")
    .map((word) => word[0]!.toUpperCase() + word.slice(1))
    .join(" ");
}

function titleTier(tier: GearTier): string {
  return tier[0]!.toUpperCase() + tier.slice(1);
}

function resolveIdName(tier: GearTier, family: WeaponFamily | ArmourFamily) {
  const override = LEGACY_OVERRIDES[`${tier}/${family}`];
  if (override) return override;
  return { id: `${tier}-${family}`, name: `${titleTier(tier)} ${titleCase(family)}` };
}

/** Generates one weapon Equipment entry for `tier`/`family`. `icon` always equals the item's
 * final id (the issue's own rule). */
export function ladderWeapon(tier: GearTier, family: WeaponFamily): EquipmentDef {
  const tierIndex = GEAR_TIERS.indexOf(tier);
  const row = WEAPON_TABLE[family];
  const { id, name } = resolveIdName(tier, family);
  return {
    kind: "equipment",
    id,
    name,
    icon: id,
    slot: row.slot,
    attackType: row.attackType,
    atkBonus: row.baseAtk + row.stepAtk * tierIndex,
    strBonus: row.baseStr + row.stepStr * tierIndex,
    def: { stab: 0, slash: 0, crush: 0, ranged: 0, magic: 0 },
    attackSpeed: row.attackSpeed,
    value: row.baseValue * 2 ** tierIndex,
  };
}

/** Generates one armour Equipment entry for `tier`/`family`. `icon` always equals the item's
 * final id (the issue's own rule). */
export function ladderArmour(tier: GearTier, family: ArmourFamily): EquipmentDef {
  const tierIndex = GEAR_TIERS.indexOf(tier);
  const row = ARMOUR_TABLE[family];
  const { id, name } = resolveIdName(tier, family);
  const def: DefVector = {
    stab: row.baseDef.stab + row.stepDef.stab * tierIndex,
    slash: row.baseDef.slash + row.stepDef.slash * tierIndex,
    crush: row.baseDef.crush + row.stepDef.crush * tierIndex,
    ranged: row.baseDef.ranged + row.stepDef.ranged * tierIndex,
    magic: row.baseDef.magic + row.stepDef.magic * tierIndex,
  };
  return {
    kind: "equipment",
    id,
    name,
    icon: id,
    slot: row.slot,
    def,
    value: row.baseValue * 2 ** tierIndex,
  };
}

/** Smithing level = TIER_BASE_LEVEL[tierIndex] + FAMILY_LEVEL_OFFSET[family] — copied verbatim
 * from the issue's own "Smithing is part of the ladder" tables. */
const TIER_BASE_LEVEL: Record<GearTier, number> = { bronze: 1, iron: 15, steel: 30, mithril: 45 };
const FAMILY_LEVEL_OFFSET: Record<MetalFamily, number> = {
  dagger: 0,
  "full-helm": 2,
  kiteshield: 4,
  mace: 5,
  sword: 7,
  chainbody: 9,
};
const FAMILY_BAR_COST: Record<MetalFamily, number> = {
  dagger: 1,
  "full-helm": 2,
  kiteshield: 2,
  mace: 2,
  sword: 2,
  chainbody: 3,
};
const TIER_XP_PER_BAR: Record<GearTier, number> = { bronze: 12, iron: 28, steel: 50, mithril: 80 };
const FAMILY_CRAFT_TICKS: Record<MetalFamily, number> = {
  dagger: 8,
  mace: 9,
  kiteshield: 10,
  sword: 10,
  "full-helm": 10,
  chainbody: 12,
};

/** The Bar Material consumed by a Recipe at this tier. */
export const BAR_ITEM_ID: Record<GearTier, string> = {
  bronze: "bronze-bar",
  iron: "iron-bar",
  steel: "steel-bar",
  mithril: "mithril-bar",
};

function isWeaponFamily(family: MetalFamily): family is WeaponFamily & MetalFamily {
  return (WEAPON_FAMILIES as readonly string[]).includes(family);
}

/** Generates one Smithing Recipe for `tier`/`family`. `RecipeDef.id` equals `outputItemId` (the
 * existing Smithing convention), and `skill` is always `"smithing"`. `shortbow`/`staff` are not
 * `MetalFamily` members, so they have no accessor here — they stay drop-only. */
export function ladderRecipe(tier: GearTier, family: MetalFamily): RecipeDef {
  const tierIndex = GEAR_TIERS.indexOf(tier);
  const item = isWeaponFamily(family) ? ladderWeapon(tier, family) : ladderArmour(tier, family);
  const barCost = FAMILY_BAR_COST[family];
  return {
    id: item.id,
    name: item.name,
    skill: "smithing",
    levelReq: TIER_BASE_LEVEL[tier] + FAMILY_LEVEL_OFFSET[family],
    inputs: [{ itemId: BAR_ITEM_ID[tier], qty: barCost }],
    outputItemId: item.id,
    xp: barCost * TIER_XP_PER_BAR[tier],
    craftTicks: FAMILY_CRAFT_TICKS[family] + tierIndex,
  };
}
