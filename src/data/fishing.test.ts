import { describe, expect, it } from "vitest";
import { createEngine } from "../core/engine";
import { makeSnapshot } from "../core/make-snapshot";
import { seededRng } from "../core/rng";
import { content } from "./index";

describe("Fishing content", () => {
  it("Shrimp Pool sits in Lumbry Meadows, unlocked for a fresh (level 1) player", () => {
    const spot = content.fishingSpots.find((s) => s.id === "shrimp-pool");
    expect(spot).toEqual({
      id: "shrimp-pool",
      name: "Shrimp Pool",
      levelReq: 1,
      itemId: "raw-shrimp",
      xp: 10,
      catchTicks: 5,
      catchChance: 0.6,
    });

    const meadows = content.areas.find((a) => a.id === "lumbry-meadows");
    expect(meadows?.fishingSpotIds).toEqual(["shrimp-pool"]);

    const fresh = createEngine(content, seededRng(1));
    expect(fresh.snapshot().areas.find((a) => a.id === "lumbry-meadows")?.fishingSpots).toEqual([
      { id: "shrimp-pool", unlocked: true },
    ]);
    expect(() => fresh.selectFishingSpot("shrimp-pool")).not.toThrow();
  });

  it("Trout Run sits in Darkroot Forest, gated by both the Area's Dungeon-completion gate and its own Fishing level 20", () => {
    const spot = content.fishingSpots.find((s) => s.id === "trout-run");
    expect(spot).toEqual({
      id: "trout-run",
      name: "Trout Run",
      levelReq: 20,
      itemId: "raw-trout",
      xp: 50,
      catchTicks: 5,
      catchChance: 0.5,
    });

    const darkroot = content.areas.find((a) => a.id === "darkroot-forest");
    expect(darkroot?.fishingSpotIds).toEqual(["trout-run"]);

    const fresh = createEngine(content, seededRng(1));
    expect(fresh.snapshot().areas.find((a) => a.id === "darkroot-forest")?.fishingSpots).toEqual([
      { id: "trout-run", unlocked: false },
    ]);
    expect(() => fresh.selectFishingSpot("trout-run")).toThrow(
      /Darkroot Forest is locked — defeat Meadow Depths/,
    );
  });

  it("cooked-shrimp is an edible, sellable Food appended after existing items (append-only content order preserved)", () => {
    const shrimp = content.items.find((i) => i.id === "cooked-shrimp");
    expect(shrimp).toEqual({
      kind: "food",
      id: "cooked-shrimp",
      name: "Cooked Shrimp",
      icon: "cooked-shrimp",
      heals: 3,
      value: 2,
    });
    // append-only: existing Food (cooked-meat) still precedes it in content order
    const foodIds = content.items.filter((i) => i.kind === "food").map((i) => i.id);
    expect(foodIds.indexOf("cooked-meat")).toBeLessThan(foodIds.indexOf("cooked-shrimp"));
  });

  it("every Fishing Spot's itemId resolves to a Material item (#115: a raw catch, not edible until Cooked)", () => {
    for (const spot of content.fishingSpots) {
      const item = content.items.find((i) => i.id === spot.itemId);
      expect(item?.kind, `${spot.id} catches non-Material item ${spot.itemId}`).toBe("material");
    }
  });
});

describe("Cooking content (#115)", () => {
  it("raw-shrimp and raw-trout exist as stackable, sellable Materials, appended after the ranged/magic tier weapons (append-only content order preserved)", () => {
    const rawShrimp = content.items.find((i) => i.id === "raw-shrimp");
    const rawTrout = content.items.find((i) => i.id === "raw-trout");
    expect(rawShrimp).toEqual({
      kind: "material",
      id: "raw-shrimp",
      name: "Raw Shrimp",
      icon: "raw-shrimp",
      value: 1,
    });
    expect(rawTrout).toEqual({
      kind: "material",
      id: "raw-trout",
      name: "Raw Trout",
      icon: "raw-trout",
      value: 2,
    });
    const ids = content.items.map((i) => i.id);
    expect(ids.indexOf("mithril-staff")).toBeLessThan(ids.indexOf("raw-shrimp"));
  });

  it("cook-beef and cook-shrimp both sit at Cooking level 1, so a fresh player is never foodless (owner decision)", () => {
    const cookBeef = content.recipes.find((r) => r.id === "cook-beef");
    const cookShrimp = content.recipes.find((r) => r.id === "cook-shrimp");
    expect(cookBeef?.skill).toBe("cooking");
    expect(cookBeef?.levelReq).toBe(1);
    expect(cookBeef?.outputItemId).toBe("cooked-meat");
    expect(cookShrimp?.skill).toBe("cooking");
    expect(cookShrimp?.levelReq).toBe(1);
    expect(cookShrimp?.outputItemId).toBe("cooked-shrimp");

    // A fresh (level-1) player can select cook-shrimp the instant they own its raw input — no
    // Cooking-level gate blocks it, unlike cook-trout (15) / cook-pike (25) below.
    const fresh = createEngine(
      content,
      seededRng(1),
      makeSnapshot({ bank: { items: [{ itemId: "raw-shrimp", qty: 1 }] } }),
    );
    expect(() => fresh.selectRecipe("cook-shrimp")).not.toThrow();
  });

  it("cook-trout (levelReq 15) and cook-pike (levelReq 25) gate progressively later than the level-1 recipes", () => {
    const cookTrout = content.recipes.find((r) => r.id === "cook-trout");
    const cookPike = content.recipes.find((r) => r.id === "cook-pike");
    expect(cookTrout?.skill).toBe("cooking");
    expect(cookTrout?.levelReq).toBe(15);
    expect(cookTrout?.outputItemId).toBe("cooked-trout");
    expect(cookPike?.skill).toBe("cooking");
    expect(cookPike?.levelReq).toBe(25);
    expect(cookPike?.outputItemId).toBe("cooked-pike");
  });

  it("cooking a raw catch grants Cooking XP, not Smithing (#113-chassis regression)", () => {
    const engine = createEngine(
      content,
      seededRng(1),
      makeSnapshot({ bank: { items: [{ itemId: "raw-beef", qty: 1 }] } }),
    );
    engine.selectRecipe("cook-beef");
    for (let i = 0; i < 5 && engine.snapshot().player.skills.cooking.xp === 0; i++) engine.tick();

    expect(engine.snapshot().player.skills.cooking.xp).toBeGreaterThan(0);
    expect(engine.snapshot().player.skills.smithing.xp).toBe(0);
    expect(engine.snapshot().bank.items.find((s) => s.itemId === "cooked-meat")?.qty).toBe(1);
  });

  it("every beast/fish Monster drop that used to be cooked Food now drops the matching raw Material", () => {
    const cookedToRaw: Record<string, string> = {
      "cooked-meat": "raw-beef",
      "cooked-trout": "raw-trout",
      "cooked-pike": "raw-pike",
    };
    for (const monster of content.monsters) {
      for (const entry of monster.dropTable) {
        expect(
          Object.keys(cookedToRaw).includes(entry.itemId),
          `${monster.id} still drops cooked Food "${entry.itemId}" directly`,
        ).toBe(false);
      }
    }
    // And the raw side actually appears somewhere (chicken/cow/goblin -> raw-beef, etc.).
    const droppedItemIds = new Set(
      content.monsters.flatMap((m) => m.dropTable.map((e) => e.itemId)),
    );
    for (const raw of Object.values(cookedToRaw)) {
      expect(droppedItemIds.has(raw), `no monster drops "${raw}"`).toBe(true);
    }
  });

  it("every Dungeon Chest keeps its guaranteed cooked Food reward untouched (owner decision: 'keep boss cooked')", () => {
    const meadowDepths = content.dungeons.find((d) => d.id === "meadow-depths");
    const darkrootHollow = content.dungeons.find((d) => d.id === "darkroot-hollow");
    const sewerKing = content.dungeons.find((d) => d.id === "sewer-king");

    expect(meadowDepths?.chest).toContainEqual({
      itemId: "cooked-meat",
      qty: 3,
      chance: 1,
      band: "guaranteed",
    });
    expect(darkrootHollow?.chest).toContainEqual({
      itemId: "cooked-trout",
      qty: 3,
      chance: 1,
      band: "guaranteed",
    });
    expect(sewerKing?.chest).toContainEqual({
      itemId: "cooked-pike",
      qty: 3,
      chance: 1,
      band: "guaranteed",
    });
  });
});
