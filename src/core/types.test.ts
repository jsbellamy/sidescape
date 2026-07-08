import { describe, expect, it } from "vitest";
import { SKILL_NAMES } from "./types";

describe("SKILL_NAMES", () => {
  it("is the single source of truth for Skill order: attack, strength, defence, hitpoints, fishing, smithing, ranged, magic", () => {
    // Order is load-bearing for the XP row (issue #36) — pin it here so a drift
    // is caught at this seam rather than in a UI snapshot test. Ranged/Magic (#7) are
    // appended last, never inserted earlier — mirrors items.ts's append-only convention.
    expect(SKILL_NAMES).toEqual([
      "attack",
      "strength",
      "defence",
      "hitpoints",
      "fishing",
      "smithing",
      "ranged",
      "magic",
    ]);
  });
});
