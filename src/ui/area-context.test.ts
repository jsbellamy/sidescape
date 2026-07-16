import { describe, expect, it } from "vitest";
import { content } from "../data";
import { fixtureContent } from "../core/testing/fixture-content";
import { makeSnapshot } from "../core/testing/make-snapshot";
import { resolveContent } from "../core/validate-content";
import { resolveActiveAreaId } from "./area-context";

const resolvedContent = resolveContent(content);
const resolvedFixtureContent = resolveContent(fixtureContent);

describe("resolveActiveAreaId (#236)", () => {
  it("returns the Dungeon's declared host Area id", () => {
    const snap = makeSnapshot({
      dungeon: { id: "gauntlet", name: "The Gauntlet", wave: 1, totalWaves: 3 },
    });
    expect(resolveActiveAreaId(snap, resolvedFixtureContent)).toBe("meadow");
  });

  it("prefers the Dungeon host even when the active Monster belongs to another Area", () => {
    // "gauntlet" hosts in "meadow", but the current Wave Monster ("brute") is "crypt"'s own —
    // this only passes if the Dungeon branch wins outright, not just "goes first but Monster
    // still applies".
    const snap = makeSnapshot({
      dungeon: { id: "gauntlet", name: "The Gauntlet", wave: 1, totalWaves: 3 },
      monster: { id: "brute", name: "Crypt Brute", hp: 40, maxHp: 40 },
    });
    expect(resolveActiveAreaId(snap, resolvedFixtureContent)).toBe("meadow");
  });

  it("resolves the Dungeon host for a Dungeon-only Wave/Boss absent from every Area's monsterIds", () => {
    const snap = makeSnapshot({
      dungeon: { id: "gauntlet", name: "The Gauntlet", wave: 3, totalWaves: 3 },
      monster: { id: "boss-dummy", name: "Boss Dummy", hp: 5, maxHp: 5 },
    });
    expect(resolveActiveAreaId(snap, resolvedFixtureContent)).toBe("meadow");
  });

  it("resolves an open-world Monster by monsterIds, first matching Content Area in order", () => {
    const snap = makeSnapshot({ monster: { id: "brute", name: "Crypt Brute", hp: 40, maxHp: 40 } });
    expect(resolveActiveAreaId(snap, resolvedFixtureContent)).toBe("crypt");
  });

  it("resolves a Fishing Spot by fishingSpotIds, first matching Content Area in order", () => {
    const snap = makeSnapshot({ fishing: { spotId: "deep-pond", name: "Test Deep Pond" } });
    expect(resolveActiveAreaId(snap, resolvedFixtureContent)).toBe("crypt");
  });

  it("falls through an unknown Dungeon id to the Monster branch", () => {
    const snap = makeSnapshot({
      dungeon: { id: "unknown-dungeon", name: "?", wave: 1, totalWaves: 1 },
      monster: { id: "brute", name: "Crypt Brute", hp: 40, maxHp: 40 },
    });
    expect(resolveActiveAreaId(snap, resolvedFixtureContent)).toBe("crypt");
  });

  it("falls through an unknown Dungeon id all the way to the Fishing branch", () => {
    const snap = makeSnapshot({
      dungeon: { id: "unknown-dungeon", name: "?", wave: 1, totalWaves: 1 },
      fishing: { spotId: "deep-pond", name: "Test Deep Pond" },
    });
    expect(resolveActiveAreaId(snap, resolvedFixtureContent)).toBe("crypt");
  });

  it("falls through an unknown Monster id to the Fishing branch", () => {
    const snap = makeSnapshot({
      monster: { id: "unknown-monster", name: "?", hp: 1, maxHp: 1 },
      fishing: { spotId: "pond", name: "Test Pond" },
    });
    expect(resolveActiveAreaId(snap, resolvedFixtureContent)).toBe("meadow");
  });

  it("returns null for an unknown Fishing Spot id with nothing else active", () => {
    const snap = makeSnapshot({ fishing: { spotId: "unknown-spot", name: "?" } });
    expect(resolveActiveAreaId(snap, resolvedFixtureContent)).toBeNull();
  });

  it("returns null for a Production-only Snapshot (Production is never consulted here)", () => {
    const snap = makeSnapshot({
      production: { recipeId: "test-sword", name: "Test Sword", skill: "smithing" },
    });
    expect(resolveActiveAreaId(snap, resolvedFixtureContent)).toBeNull();
  });

  it("returns null for a fully idle Snapshot", () => {
    const snap = makeSnapshot();
    expect(resolveActiveAreaId(snap, resolvedFixtureContent)).toBeNull();
  });

  it("does not mutate the Snapshot or ResolvedContent arrays/maps", () => {
    const snap = makeSnapshot({
      dungeon: { id: "gauntlet", name: "The Gauntlet", wave: 1, totalWaves: 3 },
    });
    const snapBefore = JSON.parse(JSON.stringify(snap));
    const areasBefore = [...resolvedFixtureContent.areas];
    const dungeonsByIdSizeBefore = resolvedFixtureContent.dungeonsById.size;
    const areasByIdSizeBefore = resolvedFixtureContent.areasById.size;

    resolveActiveAreaId(snap, resolvedFixtureContent);

    expect(snap).toEqual(snapBefore);
    expect(resolvedFixtureContent.areas).toEqual(areasBefore);
    expect(resolvedFixtureContent.dungeonsById.size).toBe(dungeonsByIdSizeBefore);
    expect(resolvedFixtureContent.areasById.size).toBe(areasByIdSizeBefore);
  });

  it("resolves against the real Content the same way as fixtureContent, mid-Dungeon-run for a Dungeon-only Monster", () => {
    const snap = makeSnapshot({
      dungeon: { id: "meadow-depths", name: "Meadow Depths", wave: 2, totalWaves: 3 },
      monster: { id: "goblin-brute", name: "Goblin Brute", hp: 15, maxHp: 15 },
    });
    expect(resolveActiveAreaId(snap, resolvedContent)).toBe("lumbry-meadows");
  });
});
