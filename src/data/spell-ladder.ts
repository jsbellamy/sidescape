import type { AmmoDef, Element, SpellDef, VendorEntry } from "../core/types";

/**
 * Issue #364: the elemental Spell ladder (Strike → Bolt → Blast) expressed by construction,
 * mirroring tier-ladder.ts's table-driven shape. Strike tier reproduces shipped numbers exactly;
 * Bolt/Blast max hits scale the Strike row's element ratios onto each tier's Fire ceiling.
 * Data only — never imports engine code (ADR-0001).
 */

export const SPELL_ELEMENTS = ["air", "water", "earth", "fire"] as const;
export type SpellElement = (typeof SPELL_ELEMENTS)[number];

export const SPELL_TIERS = ["strike", "bolt", "blast"] as const;
export type SpellTier = (typeof SPELL_TIERS)[number];

/** Shipped Strike row — the ratio reference for every tier's element spread. */
const STRIKE_MAX_HITS: readonly [number, number, number, number] = [6, 9, 12, 16];

/** Fire (top element) max hit per tier — OSRS tier ratio carried onto the repo's Strike scale. */
const FIRE_TOP_BY_TIER: Record<SpellTier, number> = {
  strike: 16,
  bolt: 24,
  blast: 32,
};

/** OSRS level gates per tier, air → water → earth → fire. */
const LEVEL_REQS: Record<SpellTier, readonly [number, number, number, number]> = {
  strike: [1, 5, 9, 13],
  bolt: [17, 23, 29, 35],
  blast: [41, 47, 53, 59],
};

function titleElement(element: SpellElement): string {
  return element[0]!.toUpperCase() + element.slice(1);
}

function titleTier(tier: SpellTier): string {
  return tier[0]!.toUpperCase() + tier.slice(1);
}

function runeIdFor(element: SpellElement, tier: SpellTier): string {
  return tier === "strike" ? `${element}-rune` : `${element}-${tier}-rune`;
}

function baseMaxHitFor(elementIndex: number, tier: SpellTier): number {
  const fireTop = FIRE_TOP_BY_TIER[tier];
  if (elementIndex === 3) return fireTop;
  return Math.round((fireTop * STRIKE_MAX_HITS[elementIndex]!) / STRIKE_MAX_HITS[3]!);
}

/** All twelve elemental spells in tier-major order (Strike, Bolt, Blast × four elements). */
export function spellLadder(): SpellDef[] {
  const spells: SpellDef[] = [];
  for (const tier of SPELL_TIERS) {
    SPELL_ELEMENTS.forEach((element, elementIndex) => {
      spells.push({
        id: `${element}-${tier}`,
        name: `${titleElement(element)} ${titleTier(tier)}`,
        element: element as Element,
        levelReq: LEVEL_REQS[tier][elementIndex]!,
        baseMaxHit: baseMaxHitFor(elementIndex, tier),
        runeId: runeIdFor(element, tier),
      });
    });
  }
  return spells;
}

/** Bolt and Blast rune Items only — Strike runes are the four shipped element runes above. */
export function spellLadderRunes(): AmmoDef[] {
  const runes: AmmoDef[] = [];
  for (const tier of ["bolt", "blast"] as const) {
    const value = tier === "bolt" ? 2 : 4;
    for (const element of SPELL_ELEMENTS) {
      const id = runeIdFor(element, tier);
      runes.push({
        kind: "ammo",
        id,
        name: `${titleElement(element)} ${titleTier(tier)} Rune`,
        icon: id,
        ammoType: "rune",
        element: element as Element,
        value,
      });
    }
  }
  return runes;
}

/** Vendor prices for Bolt/Blast runes — Strike runes stay in index.ts's existing vendor block. */
export function spellLadderVendor(): VendorEntry[] {
  const boltPrice = 6;
  const blastPrice = 20;
  const entries: VendorEntry[] = [];
  for (const element of SPELL_ELEMENTS) {
    entries.push({ itemId: `${element}-bolt-rune`, price: boltPrice });
  }
  for (const element of SPELL_ELEMENTS) {
    entries.push({ itemId: `${element}-blast-rune`, price: blastPrice });
  }
  return entries;
}
