import { SKILL_NAMES } from "./types";
import { MAX_LEVEL } from "./xp";
import type {
  AmmoDef,
  AreaDef,
  Content,
  DungeonDef,
  FishingSpotDef,
  ItemDef,
  MonsterDef,
  PetDef,
  RecipeDef,
  SpellDef,
} from "./types";

/** Module-private nominal marker: only `resolveContent` attaches this to a value. */
const RESOLVED_CONTENT_MARKER: unique symbol = Symbol("resolvedContent");

function isResolvedContent(content: Content | ResolvedContent): content is ResolvedContent {
  return (
    RESOLVED_CONTENT_MARKER in content &&
    (content as ResolvedContent)[RESOLVED_CONTENT_MARKER] === true
  );
}

/**
 * Validates Content once, at the construction seam (called by `createEngine`).
 * Pure and aggregate: it never stops at the first problem, so a content author
 * can fix every violation in a single pass. Returns [] when Content is valid.
 */
export function validateContent(content: Content): string[] {
  const violations: string[] = [];

  const itemIds = new Set(content.items.map((i) => i.id));
  const monsterIds = new Set(content.monsters.map((m) => m.id));
  const fishingSpotIds = new Set(content.fishingSpots.map((s) => s.id));
  const areaIds = new Set(content.areas.map((a) => a.id));

  // Invariant 1: exactly one currency item (createEngine locates it by kind, never a hard-coded id).
  const currencyCount = content.items.filter((i) => i.kind === "currency").length;
  if (currencyCount === 0) {
    violations.push("Content defines no currency item");
  } else if (currencyCount > 1) {
    violations.push(`Content defines ${currencyCount} currency items, expected exactly 1`);
  }

  // Every Item must declare a non-empty icon (#78): resolved through the UI's icons.ts registry,
  // never a placeholder/fallback in the UI itself — same discipline as a weapon's attackSpeed.
  for (const item of content.items) {
    if (!item.icon) {
      violations.push(`item "${item.id}" declares no icon`);
    }
  }

  // Weapons must declare attackSpeed (#90): the Engine's UNARMED_SPEED fallback is for the
  // truly-unarmed case (weapon slot empty), not a default for content authors to lean on.
  for (const item of content.items) {
    if (item.kind === "equipment" && item.slot === "weapon" && item.attackSpeed === undefined) {
      violations.push(`weapon "${item.id}" declares no attackSpeed`);
    }
  }

  // A weapon (any equipment with attackSpeed) must declare attackType/atkBonus/strBonus (#99);
  // a non-weapon must NOT carry attackType or attackSpeed — jewelry (slot amulet|ring, #117) never
  // attacks either, same as every other non-weapon. atkBonus/strBonus are otherwise weapon-only,
  // EXCEPT on jewelry: the owner's "offence slot" decision (grilled, verbatim: "amulets/rings may
  // carry atk/str bonuses, unlike armour") relaxes this one rule for amulet/ring only — every
  // other armour slot (shield/head/body/legs) still rejects atk/str as before.
  for (const item of content.items) {
    if (item.kind !== "equipment") continue;
    const isJewelry = item.slot === "amulet" || item.slot === "ring";
    if (item.attackSpeed !== undefined) {
      if (item.attackType === undefined) {
        violations.push(`weapon "${item.id}" declares no attackType`);
      }
      if (item.atkBonus === undefined) {
        violations.push(`weapon "${item.id}" declares no atkBonus`);
      }
      if (item.attackType === "ranged") {
        if (item.rangedStr === undefined) {
          violations.push(`weapon "${item.id}" declares no rangedStr`);
        }
      } else if (item.attackType === "magic") {
        if (item.magicDamage === undefined) {
          violations.push(`weapon "${item.id}" declares no magicDamage`);
        }
      } else if (item.strBonus === undefined) {
        violations.push(`weapon "${item.id}" declares no strBonus`);
      }
      if (isJewelry) {
        violations.push(`jewelry "${item.id}" declares attackSpeed`);
      }
    } else {
      if (item.attackType !== undefined) {
        violations.push(`non-weapon "${item.id}" declares attackType`);
      }
      if (!isJewelry) {
        if (item.atkBonus !== undefined) {
          violations.push(`non-weapon "${item.id}" declares atkBonus`);
        }
        if (item.strBonus !== undefined) {
          violations.push(`non-weapon "${item.id}" declares strBonus`);
        }
      }
      if (item.twoHanded !== undefined) {
        violations.push(`non-weapon "${item.id}" declares twoHanded`);
      }
    }
  }

  // Invariant 4: no two entries share an id within a collection.
  violations.push(...duplicateIds(content.items, "items"));
  violations.push(...duplicateIds(content.monsters, "monsters"));
  violations.push(...duplicateIds(content.areas, "areas"));
  violations.push(...duplicateIds(content.fishingSpots, "fishingSpots"));
  violations.push(...duplicateIds(content.recipes, "recipes"));
  violations.push(...duplicateIds(content.spells, "spells"));

  // Spells (#101): non-empty, at least one at levelReq 1 (kept as a content-shape floor even
  // though #221 removed the "spellId: null falls back to it" behaviour a Spell being castable no
  // longer follows from this alone — see currentSpell, engine.ts), and every baseMaxHit is a real
  // hit (>= 1).
  if (content.spells.length === 0) {
    violations.push("Content defines no spells");
  }
  if (content.spells.length > 0 && !content.spells.some((s) => s.levelReq === 1)) {
    violations.push("Content defines no spell with levelReq 1");
  }
  for (const spell of content.spells) {
    if (spell.baseMaxHit < 1) {
      violations.push(`spell "${spell.id}" baseMaxHit must be >= 1`);
    }
  }

  // Rune Slot (#221): the loaded rune IS the Spell choice, so the SpellDef.runeId <-> rune Item
  // link must be exactly 1:1 — every Spell's runeId must resolve to a rune Item with an agreeing
  // Element, no two Spells may share a runeId, and no rune Item may go unreferenced (a dead item
  // the player could buy and never cast).
  const runeItems = content.items.filter(
    (i): i is AmmoDef => i.kind === "ammo" && i.ammoType === "rune",
  );
  const runeItemsById = new Map(runeItems.map((i) => [i.id, i]));
  const runeIdCounts = new Map<string, number>();
  for (const spell of content.spells) {
    const rune = runeItemsById.get(spell.runeId);
    if (!rune) {
      violations.push(
        `spell "${spell.id}" runeId "${spell.runeId}" does not resolve to a rune item`,
      );
    } else if (rune.element !== spell.element) {
      violations.push(
        `spell "${spell.id}" element "${spell.element}" disagrees with rune "${rune.id}" element "${rune.element}"`,
      );
    }
    runeIdCounts.set(spell.runeId, (runeIdCounts.get(spell.runeId) ?? 0) + 1);
  }
  for (const [runeId, count] of runeIdCounts) {
    if (count > 1) {
      violations.push(`runeId "${runeId}" is referenced by ${count} spells, expected exactly 1`);
    }
  }
  for (const rune of runeItems) {
    if (!runeIdCounts.has(rune.id)) {
      violations.push(`rune "${rune.id}" is not referenced by any spell`);
    }
  }

  // Invariant 2: dropTable itemId -> items.
  for (const monster of content.monsters) {
    for (const entry of monster.dropTable) {
      if (!itemIds.has(entry.itemId)) {
        violations.push(`dropTable itemId "${entry.itemId}" not found (monster "${monster.id}")`);
      }
    }
  }

  // Invariant 2: area.monsterIds -> monsters, area.fishingSpotIds -> fishingSpots.
  for (const area of content.areas) {
    for (const monsterId of area.monsterIds) {
      if (!monsterIds.has(monsterId)) {
        violations.push(`area "${area.id}" monsterIds contains unknown monster "${monsterId}"`);
      }
    }
    for (const spotId of area.fishingSpotIds ?? []) {
      if (!fishingSpotIds.has(spotId)) {
        violations.push(
          `area "${area.id}" fishingSpotIds contains unknown fishingSpot "${spotId}"`,
        );
      }
    }
  }

  // Invariant 2 & 3: fishingSpot.itemId -> items, and that item must be a Material (a raw catch;
  // #115 flipped this from Food — Cooking now makes it edible). Cooking recipes convert raw -> Food.
  for (const spot of content.fishingSpots) {
    const item = content.items.find((i) => i.id === spot.itemId);
    if (!item) {
      violations.push(`fishingSpot "${spot.id}" itemId "${spot.itemId}" not found`);
    } else if (item.kind !== "material") {
      violations.push(`fishingSpot "${spot.id}" itemId "${spot.itemId}" is not a Material`);
    }
  }

  // Invariant 2: recipe.inputs itemId -> items, recipe.outputItemId -> items.
  for (const recipe of content.recipes) {
    for (const input of recipe.inputs) {
      if (!itemIds.has(input.itemId)) {
        violations.push(`recipe "${recipe.id}" inputs itemId "${input.itemId}" not found`);
      }
    }
    if (!itemIds.has(recipe.outputItemId)) {
      violations.push(`recipe "${recipe.id}" outputItemId "${recipe.outputItemId}" not found`);
    }
  }

  // #113: every recipe.skill must be a real Skill (SKILL_NAMES), so the multi-skill production
  // chassis (selectRecipe/productionTick gating and granting XP through recipe.skill) never
  // silently no-ops against an unrecognized skill.
  for (const recipe of content.recipes) {
    if (!(SKILL_NAMES as readonly string[]).includes(recipe.skill)) {
      violations.push(`recipe "${recipe.id}" skill "${recipe.skill}" is not a known Skill`);
    }
  }

  // Ammo (#119): a rune must declare its Element (must agree with its owning Spell's own Element —
  // see the Rune Slot 1:1 check above), and an arrow must declare rangedStr (folded into ranged
  // max hit) while NOT declaring an Element (arrows are elementless, like every other non-magic
  // Attack Type — see ELEMENTS' own doc, types.ts).
  for (const item of content.items) {
    if (item.kind !== "ammo") continue;
    if (item.ammoType === "rune" && item.element === undefined) {
      violations.push(`rune "${item.id}" declares no element`);
    }
    if (item.ammoType === "arrow") {
      if (item.rangedStr === undefined) {
        violations.push(`arrow "${item.id}" declares no rangedStr`);
      }
      if (item.element !== undefined) {
        violations.push(`arrow "${item.id}" declares element`);
      }
    }
    if (item.levelReq) {
      violations.push(...levelReqViolations(item.id, item.levelReq));
    }
  }

  for (const item of content.items) {
    if (item.kind === "equipment" && item.levelReq) {
      violations.push(...levelReqViolations(item.id, item.levelReq));
    }
  }

  // Vendor (#119): every entry's itemId must resolve to a real Item, mirroring the dropTable
  // itemId -> items check above.
  for (const entry of content.vendor) {
    if (!itemIds.has(entry.itemId)) {
      violations.push(`vendor itemId "${entry.itemId}" not found`);
    }
  }

  // Pets (#120): a non-empty icon (same discipline as every ItemDef.icon, even though a PetDef
  // isn't an ItemDef) and, for a boss pet, a `source.boss` that resolves to a real Monster
  // (mirrors the dropTable itemId -> items check above).
  for (const pet of content.pets) {
    if (!pet.icon) {
      violations.push(`pet "${pet.id}" declares no icon`);
    }
    if (typeof pet.source === "object" && !monsterIds.has(pet.source.boss)) {
      violations.push(`pet "${pet.id}" source boss "${pet.source.boss}" not found`);
    }
  }
  violations.push(...duplicateIds(content.pets, "pets"));

  // Dungeons (#250): mirrors every other collection's duplicate-id check, plus the referential
  // checks below (areaId -> areas, waves -> monsters, chest itemId -> items) that no other
  // collection needed done here — dungeons was the one collection with none until now.
  violations.push(...duplicateIds(content.dungeons, "dungeons"));

  for (const dungeon of content.dungeons) {
    if (!areaIds.has(dungeon.areaId)) {
      violations.push(`dungeon "${dungeon.id}" areaId "${dungeon.areaId}" not found`);
    }
    if (dungeon.waves.length === 0) {
      violations.push(`dungeon "${dungeon.id}" has no waves`);
    }
    for (const monsterId of dungeon.waves) {
      if (!monsterIds.has(monsterId)) {
        violations.push(`dungeon "${dungeon.id}" wave references unknown monster "${monsterId}"`);
      }
    }
    for (const entry of dungeon.chest) {
      if (!itemIds.has(entry.itemId)) {
        violations.push(`dungeon "${dungeon.id}" chest references unknown item "${entry.itemId}"`);
      }
    }
  }

  return violations;
}

function levelReqViolations(
  itemId: string,
  levelReq: Partial<Record<(typeof SKILL_NAMES)[number], number>>,
): string[] {
  const messages: string[] = [];
  for (const [skill, need] of Object.entries(levelReq)) {
    if (!(SKILL_NAMES as readonly string[]).includes(skill)) {
      messages.push(`item "${itemId}" levelReq names unknown skill "${skill}"`);
    }
    if (!Number.isInteger(need) || need < 1 || need > MAX_LEVEL) {
      messages.push(
        `item "${itemId}" levelReq.${skill} must be an integer 1..${MAX_LEVEL}, got ${need}`,
      );
    }
  }
  return messages;
}

function duplicateIds(entries: { id: string }[], collectionName: string): string[] {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    counts.set(entry.id, (counts.get(entry.id) ?? 0) + 1);
  }
  const messages: string[] = [];
  for (const [id, count] of counts) {
    if (count > 1) {
      messages.push(`${collectionName} contains ${count} entries with id "${id}"`);
    }
  }
  return messages;
}

/**
 * Content plus a by-id `ReadonlyMap` for every collection except `vendor` — a `VendorEntry` has
 * no `id` of its own (it's keyed by `itemId`, see VendorEntry's doc); its Item resolves through
 * `itemsById` instead. Built once by `resolveContent` so every consumer (Engine, UI) looks up an
 * id in O(1) instead of re-scanning a `Content` array on every read.
 */
export interface ResolvedContent extends Content {
  [RESOLVED_CONTENT_MARKER]: true;
  areasById: ReadonlyMap<string, AreaDef>;
  monstersById: ReadonlyMap<string, MonsterDef>;
  itemsById: ReadonlyMap<string, ItemDef>;
  fishingSpotsById: ReadonlyMap<string, FishingSpotDef>;
  dungeonsById: ReadonlyMap<string, DungeonDef>;
  recipesById: ReadonlyMap<string, RecipeDef>;
  spellsById: ReadonlyMap<string, SpellDef>;
  /** Rune itemId -> the one Spell it casts (#221) — validateContent's 1:1 rule guarantees this is
   * total over every rune item, so `currentSpell()`/`assignLoadoutSlot` (engine.ts) never need to
   * re-scan `content.spells` on every lookup. */
  spellsByRuneId: ReadonlyMap<string, SpellDef>;
  petsById: ReadonlyMap<string, PetDef>;
}

/**
 * Validates `content` (same aggregate pass as `validateContent`, thrown with the byte-identical
 * message `createEngine` used to build inline) and, once clean, builds the by-id maps once. The
 * single construction seam for `ResolvedContent` — `createEngine` and `boot.ts` both call this
 * instead of validating and indexing separately. Idempotent: an already-resolved value (private
 * marker present) is returned as-is without re-validating or rebuilding maps.
 */
export function resolveContent(content: Content | ResolvedContent): ResolvedContent {
  if (isResolvedContent(content)) {
    return content;
  }

  const violations = validateContent(content);
  if (violations.length > 0) {
    throw new Error(`Invalid Content:\n${violations.map((v) => `  - ${v}`).join("\n")}`);
  }

  return {
    ...content,
    areasById: byId(content.areas),
    monstersById: byId(content.monsters),
    itemsById: byId(content.items),
    fishingSpotsById: byId(content.fishingSpots),
    dungeonsById: byId(content.dungeons),
    recipesById: byId(content.recipes),
    spellsById: byId(content.spells),
    spellsByRuneId: new Map(content.spells.map((s) => [s.runeId, s])),
    petsById: byId(content.pets),
    [RESOLVED_CONTENT_MARKER]: true,
  };
}

function byId<T extends { id: string }>(entries: T[]): ReadonlyMap<string, T> {
  return new Map(entries.map((entry) => [entry.id, entry]));
}
