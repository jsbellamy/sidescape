import { describe, expect, it } from "vitest";
import { formatQty } from "./format";

describe("formatQty (#78)", () => {
  it("renders quantities under 10,000 exactly", () => {
    expect(formatQty(0)).toBe("0");
    expect(formatQty(1)).toBe("1");
    expect(formatQty(9_999)).toBe("9999");
  });

  it("abbreviates thousands from the 10,000 boundary, dropping a whole '.0' decimal", () => {
    expect(formatQty(10_000)).toBe("10k");
    expect(formatQty(99_000)).toBe("99k");
  });

  it("keeps one significant decimal for non-round thousands", () => {
    expect(formatQty(12_345)).toBe("12.3k");
    expect(formatQty(45_600)).toBe("45.6k");
  });

  it("abbreviates millions from the 10,000,000 boundary, dropping a whole '.0' decimal", () => {
    expect(formatQty(10_000_000)).toBe("10M");
  });

  it("keeps one significant decimal for non-round millions", () => {
    expect(formatQty(12_300_000)).toBe("12.3M");
  });

  it("stays just under the 10,000 boundary at the exact-integer threshold", () => {
    expect(formatQty(9_999)).toBe("9999");
  });
});
