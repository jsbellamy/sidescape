import { describe, expect, it } from "vitest";
import type { Content, DungeonDef, FoodDef, ItemDef, MonsterDef } from "../core/types";
import { content } from "./index";

/** Mirrors `sellValue` in src/core/bank.ts — currency has no value; items may omit `value`. */
function sellValue(def: ItemDef): number | undefined {
  return def.kind === "currency" ? undefined : def.value;
}

function itemById(items: ItemDef[], itemId: string): ItemDef | undefined {
  return items.find((i) => i.id === itemId);
}

function guaranteedGoldQty(monster: MonsterDef): number {
  const goldDrops = monster.dropTable.filter(
    (entry) => entry.itemId === "gold" && entry.band === "guaranteed",
  );
  return goldDrops.length === 0 ? 0 : Math.max(...goldDrops.map((entry) => entry.qty));
}

function chestGuaranteedGold(dungeon: DungeonDef): number {
  const entry = dungeon.chest.find((drop) => drop.itemId === "gold" && drop.band === "guaranteed");
  return entry?.qty ?? 0;
}

function regularMonstersForArea(c: Content, areaId: string): MonsterDef[] {
  const area = c.areas.find((a) => a.id === areaId);
  if (!area) return [];
  const openWorldIds = new Set(area.monsterIds);
  return c.monsters.filter((monster) => openWorldIds.has(monster.id));
}

function dungeonBossMonster(c: Content, dungeon: DungeonDef): MonsterDef {
  const bossId = dungeon.waves[dungeon.waves.length - 1]!;
  const boss = c.monsters.find((monster) => monster.id === bossId);
  if (!boss) {
    throw new Error(`dungeon ${dungeon.id} boss ${bossId} missing from content.monsters`);
  }
  return boss;
}

/**
 * Issue #432: OSRS-style economy invariants against composed `content` — keep existing curves,
 * encode rules as tests, fix only violating outliers. Five invariants from the issue body.
 */
describe("economy invariants (#432)", () => {
  it("vendor spread: every vendor entry whose Item carries a sell value has price >= 2 * value", () => {
    const violations: string[] = [];
    for (const entry of content.vendor) {
      const def = itemById(content.items, entry.itemId);
      if (!def) {
        violations.push(`${entry.itemId}: missing from content.items`);
        continue;
      }
      const value = sellValue(def);
      if (value === undefined) continue;
      if (entry.price < 2 * value) {
        violations.push(
          `${entry.itemId}: vendor price ${entry.price} < 2× sell value ${value} (${2 * value})`,
        );
      }
    }
    expect(violations, violations.join("\n")).toEqual([]);
  });

  it("cooking margin: output Food value strictly exceeds raw input Material value; Food heals ladder is non-decreasing in value", () => {
    const cookingRecipes = content.recipes.filter((recipe) => recipe.skill === "cooking");
    const marginViolations: string[] = [];

    for (const recipe of cookingRecipes) {
      if (recipe.inputs.length !== 1) {
        marginViolations.push(`${recipe.id}: expected exactly one input`);
        continue;
      }
      const inputId = recipe.inputs[0]!.itemId;
      const inputDef = itemById(content.items, inputId);
      const outputDef = itemById(content.items, recipe.outputItemId);
      if (!inputDef || inputDef.kind !== "material") {
        marginViolations.push(`${recipe.id}: input ${inputId} is not a Material`);
        continue;
      }
      if (!outputDef || outputDef.kind !== "food") {
        marginViolations.push(`${recipe.id}: output ${recipe.outputItemId} is not Food`);
        continue;
      }
      const inputValue = inputDef.value ?? 0;
      const outputValue = outputDef.value ?? 0;
      if (outputValue <= inputValue) {
        marginViolations.push(
          `${recipe.id}: cooked value ${outputValue} must exceed raw ${inputId} value ${inputValue}`,
        );
      }
    }

    const foods = content.items.filter((item): item is FoodDef => item.kind === "food");
    const healsLadderViolations: string[] = [];
    const byHeals = [...foods].sort((a, b) => a.heals - b.heals || a.id.localeCompare(b.id));
    for (let i = 1; i < byHeals.length; i++) {
      const prev = byHeals[i - 1]!;
      const curr = byHeals[i]!;
      const prevValue = prev.value ?? 0;
      const currValue = curr.value ?? 0;
      if (currValue < prevValue) {
        healsLadderViolations.push(
          `${curr.id} (heals ${curr.heals}, value ${currValue}) < ${prev.id} (heals ${prev.heals}, value ${prevValue})`,
        );
      }
    }

    expect(marginViolations, marginViolations.join("\n")).toEqual([]);
    expect(healsLadderViolations, healsLadderViolations.join("\n")).toEqual([]);
  });

  it("catch ladder: five Fishing Spots by levelReq have non-decreasing raw-Material sell values", () => {
    const spotOrder = [
      "shrimp-pool",
      "trout-run",
      "sewer-outflow",
      "flooded-ossuary",
      "glacial-melt",
    ] as const;

    const values: number[] = [];
    const violations: string[] = [];

    for (const spotId of spotOrder) {
      const spot = content.fishingSpots.find((s) => s.id === spotId);
      if (!spot) {
        violations.push(`${spotId}: missing Fishing Spot`);
        continue;
      }
      const material = itemById(content.items, spot.itemId);
      if (!material || material.kind !== "material") {
        violations.push(`${spotId}: catch ${spot.itemId} is not a Material`);
        continue;
      }
      values.push(material.value ?? 0);
    }

    for (let i = 1; i < values.length; i++) {
      if (values[i]! < values[i - 1]!) {
        violations.push(
          `${spotOrder[i]} raw value ${values[i]} < ${spotOrder[i - 1]} raw value ${values[i - 1]}`,
        );
      }
    }

    expect(violations, violations.join("\n")).toEqual([]);
  });

  it("gold bands: Area regular-monster gold steps up; each Dungeon boss beats its Area regular max; chest gold rises in Area order", () => {
    const areaIds = content.areas.map((area) => area.id);
    const regularMaxByArea = new Map(
      areaIds.map((areaId) => {
        const monsters = regularMonstersForArea(content, areaId);
        const maxGold = monsters.reduce(
          (max, monster) => Math.max(max, guaranteedGoldQty(monster)),
          0,
        );
        return [areaId, maxGold] as const;
      }),
    );
    const regularMinByArea = new Map(
      areaIds.map((areaId) => {
        const monsters = regularMonstersForArea(content, areaId);
        const minGold = monsters.reduce(
          (min, monster) => Math.min(min, guaranteedGoldQty(monster)),
          Number.POSITIVE_INFINITY,
        );
        return [areaId, minGold === Number.POSITIVE_INFINITY ? 0 : minGold] as const;
      }),
    );

    const areaStepViolations: string[] = [];
    for (let i = 0; i < areaIds.length - 1; i++) {
      const currentId = areaIds[i]!;
      const nextId = areaIds[i + 1]!;
      const currentMax = regularMaxByArea.get(currentId)!;
      const nextMin = regularMinByArea.get(nextId)!;
      if (currentMax >= nextMin) {
        areaStepViolations.push(
          `${currentId} regular max gold ${currentMax} must be < ${nextId} regular min gold ${nextMin}`,
        );
      }
    }

    const bossViolations: string[] = [];
    for (const dungeon of content.dungeons) {
      const areaMax = regularMaxByArea.get(dungeon.areaId);
      if (areaMax === undefined) {
        bossViolations.push(`${dungeon.id}: host area ${dungeon.areaId} not found`);
        continue;
      }
      const bossGold = guaranteedGoldQty(dungeonBossMonster(content, dungeon));
      if (bossGold <= areaMax) {
        bossViolations.push(
          `${dungeon.id} boss gold ${bossGold} must exceed ${dungeon.areaId} regular max ${areaMax}`,
        );
      }
    }

    const chestGoldByArea = areaIds.map((areaId) => {
      const dungeon = content.dungeons.find((d) => d.areaId === areaId);
      return { areaId, gold: dungeon ? chestGuaranteedGold(dungeon) : 0 };
    });
    const chestViolations: string[] = [];
    for (let i = 1; i < chestGoldByArea.length; i++) {
      const prev = chestGoldByArea[i - 1]!;
      const curr = chestGoldByArea[i]!;
      if (curr.gold <= prev.gold) {
        chestViolations.push(
          `${curr.areaId} chest gold ${curr.gold} must exceed ${prev.areaId} chest gold ${prev.gold}`,
        );
      }
    }

    expect(areaStepViolations, areaStepViolations.join("\n")).toEqual([]);
    expect(bossViolations, bossViolations.join("\n")).toEqual([]);
    expect(chestViolations, chestViolations.join("\n")).toEqual([]);
  });

  it("material family ladders: bars, hides, herbs, and gems strictly increase along their tiers", () => {
    const families: { name: string; itemIds: string[] }[] = [
      {
        name: "bars",
        itemIds: ["bronze-bar", "iron-bar", "steel-bar", "mithril-bar", "adamant-bar", "rune-bar"],
      },
      { name: "hides", itemIds: ["cowhide", "wolf-hide", "thick-hide"] },
      {
        name: "herbs",
        itemIds: ["guam-herb", "marrentill-herb", "tarromin-herb", "harralander-herb"],
      },
      { name: "gems", itemIds: ["sapphire", "emerald", "ruby"] },
    ];

    const violations: string[] = [];
    for (const family of families) {
      const values = family.itemIds.map((itemId) => {
        const def = itemById(content.items, itemId);
        if (!def || def.kind !== "material") {
          violations.push(`${family.name}: ${itemId} is not a Material`);
          return undefined;
        }
        return def.value;
      });
      for (let i = 1; i < values.length; i++) {
        const prev = values[i - 1];
        const curr = values[i];
        if (prev === undefined || curr === undefined) continue;
        if (curr <= prev) {
          violations.push(
            `${family.name}: ${family.itemIds[i]} value ${curr} must exceed ${family.itemIds[i - 1]} value ${prev}`,
          );
        }
      }
    }

    expect(violations, violations.join("\n")).toEqual([]);
  });
});
