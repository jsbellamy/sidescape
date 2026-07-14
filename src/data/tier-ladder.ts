import type { AttackType, EquipmentDef, GearSlot, RecipeDef } from "../core/types";

/**
 * Issue #251: the Gear Tier ladder (bronze -> iron -> steel -> mithril) expressed BY
 * CONSTRUCTION instead of as hand-typed literals re-checked after the fact. Every ladder stat is
 * `base + sum(steps below this tier)`; `value = baseValue * 2^tierIndex`. Data only — never
 * imports engine code (ADR-0001).
 *
 * This is a DELIBERATE, owner-approved rebalance of a shipped game (decided 2026-07-13), not a
 * byte-for-byte refactor: armour, item values, and iron-tier Smithing levels move on purpose.
 * Melee weapon atk/str and all of bronze reproduce today's shipped numbers exactly; see
 * tier-ladder.test.ts for the worked table this is checked against.
 *
 * Issue #252: appends adamant/rune. THE STEP TABLE IS PER-TIER (a `steps` array, one entry per
 * transition into the next tier), not a single flat number — the step steepens above mithril
 * (e.g. melee +8/+7 instead of +5/+4) so a rune weapon still out-classes the previous era's gear
 * (see the module doc on `stepFor`). iron/steel/mithril numbers are unaffected: they only ever
 * sum the first three (unchanged) step entries.
 */

export const GEAR_TIERS = ["bronze", "iron", "steel", "mithril", "adamant", "rune"] as const;
export type GearTier = (typeof GEAR_TIERS)[number];

/** Sums the first `tierIndex` entries of a per-transition step array — `steps[i]` is the step
 * FROM `GEAR_TIERS[i]` TO `GEAR_TIERS[i + 1]`, so a tier at `tierIndex` accumulates `steps[0..
 * tierIndex-1]`. One array entry per non-bronze tier (`GEAR_TIERS.length - 1` entries). */
function sumSteps(steps: readonly number[], tierIndex: number): number {
  let total = 0;
  for (let i = 0; i < tierIndex; i++) total += steps[i]!;
  return total;
}

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
  /** Per-transition step, one entry per non-bronze tier (bronze->iron, iron->steel,
   * steel->mithril, mithril->adamant, adamant->rune). #252: the last two entries steepen. */
  stepAtk: readonly number[];
  stepStr: readonly number[];
  baseValue: number;
}

/** Weapon families table — copied verbatim from the issue's own "Weapon families" table (#251)
 * and its "step (adamant, rune)" table (#252). */
export const WEAPON_TABLE: Record<WeaponFamily, WeaponFamilyRow> = {
  dagger: {
    slot: "weapon",
    attackType: "stab",
    attackSpeed: 4,
    baseAtk: 4,
    baseStr: 3,
    stepAtk: [5, 5, 5, 8, 8],
    stepStr: [4, 4, 4, 7, 7],
    baseValue: 10,
  },
  mace: {
    slot: "weapon",
    attackType: "crush",
    attackSpeed: 5,
    baseAtk: 6,
    baseStr: 5,
    stepAtk: [5, 5, 5, 8, 8],
    stepStr: [4, 4, 4, 7, 7],
    baseValue: 15,
  },
  sword: {
    slot: "weapon",
    attackType: "slash",
    attackSpeed: 5,
    baseAtk: 7,
    baseStr: 6,
    stepAtk: [5, 5, 5, 8, 8],
    stepStr: [4, 4, 4, 7, 7],
    baseValue: 20,
  },
  shortbow: {
    slot: "weapon",
    attackType: "ranged",
    attackSpeed: 5,
    baseAtk: 5,
    baseStr: 4,
    stepAtk: [6, 6, 6, 9, 9],
    stepStr: [5, 5, 5, 8, 8],
    baseValue: 25,
  },
  staff: {
    slot: "weapon",
    attackType: "magic",
    attackSpeed: 6,
    baseAtk: 4,
    baseStr: 5,
    stepAtk: [5, 5, 5, 8, 8],
    stepStr: [6, 6, 6, 9, 9],
    baseValue: 25,
  },
};

interface ArmourFamilyRow {
  slot: GearSlot;
  baseDef: DefVector;
  /** Per-transition step vector, one entry per non-bronze tier (see WeaponFamilyRow.stepAtk's
   * doc). #252: the last two entries steepen; magic stays a flat -1 per transition throughout. */
  stepDef: readonly DefVector[];
  baseValue: number;
}

/** Armour families table — copied verbatim from the issue's own "Armour families" table (#251)
 * and its "step (adamant, rune)" table (#252). The -1 magic step is a deliberate fix (today's
 * magic def is incoherent across iron/steel/mithril); a monotonic -1 per transition makes heavy
 * metal a coherent, escalating magic-defence penalty all the way to rune. */
export const ARMOUR_TABLE: Record<ArmourFamily, ArmourFamilyRow> = {
  chainbody: {
    slot: "body",
    baseDef: { stab: 4, slash: 4, crush: 2, ranged: 3, magic: 0 },
    stepDef: [
      { stab: 6, slash: 6, crush: 3, ranged: 5, magic: -1 },
      { stab: 6, slash: 6, crush: 3, ranged: 5, magic: -1 },
      { stab: 6, slash: 6, crush: 3, ranged: 5, magic: -1 },
      { stab: 9, slash: 9, crush: 5, ranged: 8, magic: -1 },
      { stab: 9, slash: 9, crush: 5, ranged: 8, magic: -1 },
    ],
    baseValue: 30,
  },
  kiteshield: {
    slot: "shield",
    baseDef: { stab: 4, slash: 4, crush: 2, ranged: 3, magic: 0 },
    stepDef: [
      { stab: 5, slash: 5, crush: 2, ranged: 4, magic: -1 },
      { stab: 5, slash: 5, crush: 2, ranged: 4, magic: -1 },
      { stab: 5, slash: 5, crush: 2, ranged: 4, magic: -1 },
      { stab: 8, slash: 8, crush: 3, ranged: 6, magic: -1 },
      { stab: 8, slash: 8, crush: 3, ranged: 6, magic: -1 },
    ],
    baseValue: 12,
  },
  "full-helm": {
    slot: "head",
    baseDef: { stab: 2, slash: 2, crush: 1, ranged: 2, magic: 0 },
    stepDef: [
      { stab: 3, slash: 3, crush: 1, ranged: 2, magic: -1 },
      { stab: 3, slash: 3, crush: 1, ranged: 2, magic: -1 },
      { stab: 3, slash: 3, crush: 1, ranged: 2, magic: -1 },
      { stab: 5, slash: 5, crush: 2, ranged: 3, magic: -1 },
      { stab: 5, slash: 5, crush: 2, ranged: 3, magic: -1 },
    ],
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
    atkBonus: row.baseAtk + sumSteps(row.stepAtk, tierIndex),
    strBonus: row.baseStr + sumSteps(row.stepStr, tierIndex),
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
    stab:
      row.baseDef.stab +
      sumSteps(
        row.stepDef.map((s) => s.stab),
        tierIndex,
      ),
    slash:
      row.baseDef.slash +
      sumSteps(
        row.stepDef.map((s) => s.slash),
        tierIndex,
      ),
    crush:
      row.baseDef.crush +
      sumSteps(
        row.stepDef.map((s) => s.crush),
        tierIndex,
      ),
    ranged:
      row.baseDef.ranged +
      sumSteps(
        row.stepDef.map((s) => s.ranged),
        tierIndex,
      ),
    magic:
      row.baseDef.magic +
      sumSteps(
        row.stepDef.map((s) => s.magic),
        tierIndex,
      ),
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
const TIER_BASE_LEVEL: Record<GearTier, number> = {
  bronze: 1,
  iron: 15,
  steel: 30,
  mithril: 45,
  adamant: 60,
  rune: 75,
};
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
const TIER_XP_PER_BAR: Record<GearTier, number> = {
  bronze: 12,
  iron: 28,
  steel: 50,
  mithril: 80,
  adamant: 120,
  rune: 170,
};
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
  adamant: "adamant-bar",
  rune: "rune-bar",
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
