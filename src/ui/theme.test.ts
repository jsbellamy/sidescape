import { describe, expect, it } from "vitest";
import { content } from "../data";
import { fixtureContent } from "../core/testing/fixture-content";
import { makeSnapshot } from "../core/testing/make-snapshot";
import { resolveContent } from "../core/validate-content";
import { resolveTheme } from "./theme";

const resolvedContent = resolveContent(content);
const resolvedFixtureContent = resolveContent(fixtureContent);

describe("resolveTheme (#80)", () => {
  it("resolves each real Area's own theme while fighting its Monsters", () => {
    const cases: { monsterId: string; areaId: string; theme: string }[] = [
      { monsterId: "chicken", areaId: "lumbry-meadows", theme: "meadow" },
      { monsterId: "wolf", areaId: "darkroot-forest", theme: "forest" },
      { monsterId: "giant-rat", areaId: "old-sewers", theme: "sewer" },
      { monsterId: "crypt-ghoul", areaId: "bone-crypt", theme: "crypt" },
    ];
    for (const { monsterId, areaId, theme } of cases) {
      const snap = makeSnapshot({ monster: { id: monsterId, name: "?", hp: 1, maxHp: 1 } });
      expect(resolveTheme(snap, resolvedContent, null)).toEqual({ theme, areaId });
    }
  });

  it("resolves the host Area's theme while fishing", () => {
    const snap = makeSnapshot({ fishing: { spotId: "trout-run", name: "Trout Run" } });
    expect(resolveTheme(snap, resolvedContent, null)).toEqual({
      theme: "forest",
      areaId: "darkroot-forest",
    });
  });

  it("resolves the host Area's theme mid-Dungeon-run, even for a dungeon-only Monster absent from every Area's monsterIds", () => {
    // "goblin-brute" is dungeon-only (see data/index.ts) — never in any Area's monsterIds — so
    // this only passes if the dungeon branch is checked before (and instead of) the monster
    // branch, per the issue's stated priority.
    const snap = makeSnapshot({
      dungeon: { id: "meadow-depths", name: "Meadow Depths", wave: 2, totalWaves: 3 },
      monster: { id: "goblin-brute", name: "Goblin Brute", hp: 15, maxHp: 15 },
    });
    expect(resolveTheme(snap, resolvedContent, null)).toEqual({
      theme: "meadow",
      areaId: "lumbry-meadows",
    });
  });

  it("resolves the shared workshop theme while Smithing, with no Area id", () => {
    const snap = makeSnapshot({
      production: { recipeId: "bronze-dagger", name: "Bronze Dagger", skill: "smithing" },
    });
    expect(resolveTheme(snap, resolvedContent, null)).toEqual({ theme: "workshop", areaId: null });
  });

  // makeSnapshot()'s default `areas` array is shaped from fixtureContent (2 Areas), not the real
  // 4-Area `content` — mirroring the real Snapshot/Content pairing (`snap.areas` always matches
  // whatever `content` produced it, per Engine's own `snapshot()`) needs an explicit override here.
  function realAreasSnapshot() {
    return makeSnapshot({
      areas: content.areas.map((a) => ({
        id: a.id,
        name: a.name,
        unlocked: !a.unlockedByDungeonId,
        gatedBy: null,
        monsterIds: a.monsterIds,
        fishingSpots: (a.fishingSpotIds ?? []).map((id) => ({ id, unlocked: true })),
      })),
    });
  }

  it("falls back to the first unlocked Area's theme when idle with no last-used Area", () => {
    const snap = realAreasSnapshot(); // monster/fishing/dungeon/production all null: idle
    expect(resolveTheme(snap, resolvedContent, null)).toEqual({
      theme: "meadow",
      areaId: "lumbry-meadows",
    });
  });

  it("prefers the last-used Area's theme over the first-unlocked Area's when idle", () => {
    const snap = realAreasSnapshot();
    expect(resolveTheme(snap, resolvedContent, "bone-crypt")).toEqual({
      theme: "crypt",
      areaId: "bone-crypt",
    });
  });

  it("ignores a stale/unknown last-used Area id and falls back to first-unlocked", () => {
    const snap = realAreasSnapshot();
    expect(resolveTheme(snap, resolvedContent, "not-a-real-area")).toEqual({
      theme: "meadow",
      areaId: "lumbry-meadows",
    });
  });

  it("works against fixtureContent too (theme resolution is generic over Content, not real-data-specific)", () => {
    const snap = makeSnapshot({ monster: { id: "brute", name: "Crypt Brute", hp: 40, maxHp: 40 } });
    expect(resolveTheme(snap, resolvedFixtureContent, null)).toEqual({
      theme: "crypt",
      areaId: "crypt",
    });
  });
});
