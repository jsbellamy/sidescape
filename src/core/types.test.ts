import { describe, expect, it } from "vitest";
import { SKILL_NAMES } from "./types";

describe("SKILL_NAMES", () => {
  it("is the single source of truth for Skill order: attack, strength, defence, hitpoints, fishing", () => {
    // Order is load-bearing for the XP row (issue #36) — pin it here so a drift
    // is caught at this seam rather than in a UI snapshot test.
    expect(SKILL_NAMES).toEqual(["attack", "strength", "defence", "hitpoints", "fishing"]);
  });
});
