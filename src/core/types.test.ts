import { describe, expect, it } from "vitest";
import { ATTACK_TYPES, SKILL_NAMES } from "./types";

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

describe("ATTACK_TYPES (#99)", () => {
  it("is the single source of truth for Attack Type order: stab, slash, crush, ranged, magic", () => {
    // Order is load-bearing for render order (the Character panel's defence-vector readout) —
    // mirrors SKILL_NAMES's own pinned-order test above.
    expect(ATTACK_TYPES).toEqual(["stab", "slash", "crush", "ranged", "magic"]);
  });
});
