import { describe, expect, it } from "vitest";
import { levelForXp, xpForLevel } from "./xp";

// Expected values are the published RuneScape XP table.
describe("xpForLevel", () => {
  it("matches known table values", () => {
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(2)).toBe(83);
    expect(xpForLevel(10)).toBe(1154);
    expect(xpForLevel(50)).toBe(101333);
    expect(xpForLevel(92)).toBe(6517253);
    expect(xpForLevel(99)).toBe(13034431);
  });

  it("rejects out-of-range levels", () => {
    expect(() => xpForLevel(0)).toThrow(RangeError);
    expect(() => xpForLevel(100)).toThrow(RangeError);
  });
});

describe("levelForXp", () => {
  it("is the inverse of xpForLevel at boundaries", () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(82)).toBe(1);
    expect(levelForXp(83)).toBe(2);
    expect(levelForXp(101332)).toBe(49);
    expect(levelForXp(101333)).toBe(50);
  });

  it("caps at 99", () => {
    expect(levelForXp(13034431)).toBe(99);
    expect(levelForXp(200_000_000)).toBe(99);
  });
});
