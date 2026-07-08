import { describe, expect, it } from "vitest";
import { validateContent } from "./validate-content";
import { fixtureContent } from "./fixture-content";
import { content as realContent } from "../data";
import type { Content } from "./types";

describe("validateContent", () => {
  it("returns [] for the fixture Content", () => {
    expect(validateContent(fixtureContent)).toEqual([]);
  });

  it("returns [] for the real v1 Content", () => {
    expect(validateContent(realContent)).toEqual([]);
  });

  it("reports zero currency items", () => {
    const content: Content = {
      ...fixtureContent,
      items: fixtureContent.items.filter((i) => i.kind !== "currency"),
    };
    expect(validateContent(content)).toContain("Content defines no currency item");
  });

  it("reports two currency items", () => {
    const content: Content = {
      ...fixtureContent,
      items: [...fixtureContent.items, { kind: "currency", id: "gems", name: "Gems" }],
    };
    const violations = validateContent(content);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/currency/i);
    expect(violations[0]).toContain("2");
  });

  it("reports a dangling dropTable itemId", () => {
    const content: Content = {
      ...fixtureContent,
      monsters: fixtureContent.monsters.map((m) =>
        m.id === "dummy"
          ? {
              ...m,
              dropTable: [
                ...m.dropTable,
                { itemId: "gold-bar", qty: 1, chance: 1, band: "rare" as const },
              ],
            }
          : m,
      ),
    };
    expect(validateContent(content)).toContain(
      'dropTable itemId "gold-bar" not found (monster "dummy")',
    );
  });

  it("reports a dangling area.monsterIds reference", () => {
    const content: Content = {
      ...fixtureContent,
      areas: fixtureContent.areas.map((a) =>
        a.id === "meadow" ? { ...a, monsterIds: [...a.monsterIds, "ogre"] } : a,
      ),
    };
    const violations = validateContent(content);
    expect(violations.some((v) => v.includes("ogre") && v.includes("meadow"))).toBe(true);
  });

  it("reports a dangling area.fishingSpotIds reference", () => {
    const content: Content = {
      ...fixtureContent,
      areas: fixtureContent.areas.map((a) =>
        a.id === "meadow" ? { ...a, fishingSpotIds: [...(a.fishingSpotIds ?? []), "lake"] } : a,
      ),
    };
    const violations = validateContent(content);
    expect(violations.some((v) => v.includes("lake") && v.includes("meadow"))).toBe(true);
  });

  it("reports a dangling fishingSpot.itemId reference", () => {
    const content: Content = {
      ...fixtureContent,
      fishingSpots: fixtureContent.fishingSpots.map((s) =>
        s.id === "pond" ? { ...s, itemId: "no-such-item" } : s,
      ),
    };
    const violations = validateContent(content);
    expect(violations.some((v) => v.includes("no-such-item") && v.includes("pond"))).toBe(true);
  });

  it("reports a fishingSpot.itemId that resolves but is not a Food", () => {
    const content: Content = {
      ...fixtureContent,
      fishingSpots: fixtureContent.fishingSpots.map((s) =>
        s.id === "pond" ? { ...s, itemId: "gold" } : s,
      ),
    };
    expect(validateContent(content)).toContain('fishingSpot "pond" itemId "gold" is not a Food');
  });

  it("reports a dangling recipe inputs itemId reference", () => {
    const content: Content = {
      ...fixtureContent,
      recipes: fixtureContent.recipes.map((r) =>
        r.id === "test-sword" ? { ...r, inputs: [{ itemId: "no-such-bar", qty: 1 }] } : r,
      ),
    };
    const violations = validateContent(content);
    expect(violations.some((v) => v.includes("no-such-bar") && v.includes("test-sword"))).toBe(
      true,
    );
  });

  it("reports a dangling recipe outputItemId reference", () => {
    const content: Content = {
      ...fixtureContent,
      recipes: fixtureContent.recipes.map((r) =>
        r.id === "test-sword" ? { ...r, outputItemId: "no-such-output" } : r,
      ),
    };
    const violations = validateContent(content);
    expect(violations.some((v) => v.includes("no-such-output") && v.includes("test-sword"))).toBe(
      true,
    );
  });

  it("reports a duplicate id within a collection", () => {
    const meat = fixtureContent.items.find((i) => i.id === "meat")!;
    const content: Content = {
      ...fixtureContent,
      items: [...fixtureContent.items, { ...meat }],
    };
    const violations = validateContent(content);
    expect(violations).toEqual([`items contains 2 entries with id "${meat.id}"`]);
  });

  it("aggregates every violation instead of failing fast", () => {
    const content: Content = {
      ...fixtureContent,
      items: fixtureContent.items.filter((i) => i.kind !== "currency"),
      monsters: fixtureContent.monsters.map((m) =>
        m.id === "dummy"
          ? {
              ...m,
              dropTable: [
                ...m.dropTable,
                { itemId: "gold-bar", qty: 1, chance: 1, band: "rare" as const },
              ],
            }
          : m,
      ),
      fishingSpots: fixtureContent.fishingSpots.map((s) =>
        s.id === "pond" ? { ...s, itemId: "gold" } : s,
      ),
    };
    const violations = validateContent(content);
    expect(violations.length).toBeGreaterThanOrEqual(3);
    expect(violations.some((v) => v.includes("no currency"))).toBe(true);
    expect(violations.some((v) => v.includes("gold-bar"))).toBe(true);
    // "gold" was stripped from items above, so the fishingSpot itemId is now dangling,
    // not "not a Food" — both are violations, exercised as the third one here.
    expect(violations.some((v) => v.includes("gold") && v.includes("pond"))).toBe(true);
  });

  it("allows orphans: a monster or fishingSpot unreferenced by any Area is valid", () => {
    const content: Content = {
      ...fixtureContent,
      monsters: [
        ...fixtureContent.monsters,
        {
          id: "orphan-monster",
          name: "Orphan",
          hp: 1,
          attackLevel: 1,
          defenceLevel: 1,
          maxHit: 1,
          attackSpeed: 4,
          dropTable: [],
        },
      ],
      fishingSpots: [
        ...fixtureContent.fishingSpots,
        {
          id: "orphan-spot",
          name: "Orphan Spot",
          levelReq: 1,
          itemId: "meat",
          xp: 1,
          catchTicks: 1,
          catchChance: 1,
        },
      ],
    };
    expect(validateContent(content)).toEqual([]);
  });

  it("allows empty collections", () => {
    const content: Content = {
      areas: [],
      monsters: [],
      items: fixtureContent.items,
      fishingSpots: [],
      dungeons: [],
      recipes: [],
    };
    expect(validateContent(content)).toEqual([]);
  });
});
