import { describe, expect, it } from "vitest";
import { createEngine } from "../core/engine";
import { seededRng } from "../core/rng";
import { content } from "./index";

describe("Fishing content", () => {
  it("Shrimp Pool sits in Lumbry Meadows, unlocked for a fresh (level 1) player", () => {
    const spot = content.fishingSpots.find((s) => s.id === "shrimp-pool");
    expect(spot).toEqual({
      id: "shrimp-pool",
      name: "Shrimp Pool",
      levelReq: 1,
      itemId: "cooked-shrimp",
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
      itemId: "cooked-trout",
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

  it("every Fishing Spot's itemId resolves to a Food item (a Catch is always edible)", () => {
    for (const spot of content.fishingSpots) {
      const item = content.items.find((i) => i.id === spot.itemId);
      expect(item?.kind, `${spot.id} catches non-Food item ${spot.itemId}`).toBe("food");
    }
  });
});
