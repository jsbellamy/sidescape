import type { Content } from "./types";

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
  // a non-weapon must NOT carry any of those weapon-only fields — armour carries only `def`.
  for (const item of content.items) {
    if (item.kind !== "equipment") continue;
    if (item.attackSpeed !== undefined) {
      if (item.attackType === undefined) {
        violations.push(`weapon "${item.id}" declares no attackType`);
      }
      if (item.atkBonus === undefined) {
        violations.push(`weapon "${item.id}" declares no atkBonus`);
      }
      if (item.strBonus === undefined) {
        violations.push(`weapon "${item.id}" declares no strBonus`);
      }
    } else {
      if (item.attackType !== undefined) {
        violations.push(`non-weapon "${item.id}" declares attackType`);
      }
      if (item.atkBonus !== undefined) {
        violations.push(`non-weapon "${item.id}" declares atkBonus`);
      }
      if (item.strBonus !== undefined) {
        violations.push(`non-weapon "${item.id}" declares strBonus`);
      }
    }
  }

  // Invariant 4: no two entries share an id within a collection.
  violations.push(...duplicateIds(content.items, "items"));
  violations.push(...duplicateIds(content.monsters, "monsters"));
  violations.push(...duplicateIds(content.areas, "areas"));
  violations.push(...duplicateIds(content.fishingSpots, "fishingSpots"));
  violations.push(...duplicateIds(content.recipes, "recipes"));

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

  // Invariant 2 & 3: fishingSpot.itemId -> items, and that item must be a Food (a Catch).
  for (const spot of content.fishingSpots) {
    const item = content.items.find((i) => i.id === spot.itemId);
    if (!item) {
      violations.push(`fishingSpot "${spot.id}" itemId "${spot.itemId}" not found`);
    } else if (item.kind !== "food") {
      violations.push(`fishingSpot "${spot.id}" itemId "${spot.itemId}" is not a Food`);
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

  return violations;
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
