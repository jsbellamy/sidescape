import { describe, expect, it } from "vitest";
import { attackRoll, effectiveLevel, hitChance, maxHit, styleBoostSkill, weakSpot } from "./combat";

// Expected values hand-computed from the OSRS formulas (docs/design.md).
describe("effectiveLevel", () => {
  it("adds 8, plus 3 when the Combat Style boosts the skill for melee", () => {
    expect(effectiveLevel(1, "strength", "aggressive", "melee")).toBe(12);
    expect(effectiveLevel(1, "strength", "accurate", "melee")).toBe(9);
    expect(effectiveLevel(40, "defence", "defensive", "melee")).toBe(51);
  });

  it("mode-aware ranged boosts: Accurate boosts Ranged, Rapid does not, Defensive boosts Defence", () => {
    expect(effectiveLevel(10, "ranged", "accurate", "ranged")).toBe(21);
    expect(effectiveLevel(10, "ranged", "rapid", "ranged")).toBe(18);
    expect(effectiveLevel(10, "defence", "defensive", "ranged")).toBe(21);
    expect(effectiveLevel(10, "ranged", "defensive", "ranged")).toBe(18);
  });

  it("mode-aware magic boosts: Accurate boosts Magic, Rapid does not, Defensive boosts Defence", () => {
    expect(effectiveLevel(10, "magic", "accurate", "magic")).toBe(21);
    expect(effectiveLevel(10, "magic", "rapid", "magic")).toBe(18);
    expect(effectiveLevel(10, "defence", "defensive", "magic")).toBe(21);
    expect(effectiveLevel(10, "magic", "defensive", "magic")).toBe(18);
  });
});

describe("styleBoostSkill", () => {
  it("keeps melee mappings unchanged", () => {
    expect(styleBoostSkill("melee", "accurate")).toBe("attack");
    expect(styleBoostSkill("melee", "aggressive")).toBe("strength");
    expect(styleBoostSkill("melee", "defensive")).toBe("defence");
    expect(styleBoostSkill("melee", "rapid")).toBeNull();
  });
});

describe("maxHit", () => {
  it("matches hand-worked examples", () => {
    // eff 12, bonus 0: floor(0.5 + 12*64/640) = floor(1.7) = 1
    expect(maxHit(12, 0)).toBe(1);
    // eff 21, bonus 0: floor(0.5 + 21*64/640) = floor(2.6) = 2
    expect(maxHit(21, 0)).toBe(2);
    // eff 51, bonus 20: floor(0.5 + 51*84/640) = floor(7.19) = 7
    expect(maxHit(51, 20)).toBe(7);
  });
});

describe("hitChance", () => {
  it("attacker roll above defender roll", () => {
    // atk 768 vs def 576: 1 - 578/(2*769) = 0.62419...
    expect(hitChance(768, 576)).toBeCloseTo(0.6242, 4);
  });
  it("attacker roll at or below defender roll", () => {
    // atk 576 vs def 576: 576/(2*577) = 0.49913...
    expect(hitChance(576, 576)).toBeCloseTo(0.4991, 4);
  });
  it("attack roll composes level and bonus", () => {
    expect(attackRoll(12, 0)).toBe(768);
    expect(attackRoll(12, 7)).toBe(852);
  });
});

describe("weakSpot", () => {
  it("returns the lowest Defence Vector entry", () => {
    expect(weakSpot({ stab: 5, slash: 1, crush: 5, ranged: 5, magic: 5 })).toBe("slash");
  });

  it("ties break to the first type in ATTACK_TYPES order (stab, slash, crush, ranged, magic)", () => {
    expect(weakSpot({ stab: 3, slash: 3, crush: 3, ranged: 3, magic: 3 })).toBe("stab");
  });
});
