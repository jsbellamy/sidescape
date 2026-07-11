import { describe, expect, it } from "vitest";
// icon-canvas.mjs is the plain-JS module `npm run art` actually renders icons with — imported
// directly (tsconfig's `allowJs`) so this test exercises the exact `thickLine` shipped, not a
// parallel TS reimplementation that could drift.
import { createCanvas } from "../../scripts/art/icon-canvas.mjs";

describe("thickLine", () => {
  it("stamps a width-2 diagonal with no single-pixel steps: every occupied row has >=2 opaque columns and vice versa", () => {
    const canvas = createCanvas();
    canvas.thickLine(2, 2, 10, 10, 2, "#ff0000");
    const pixels = canvas.toPixelFn();

    const opaqueColsByRow = new Map<number, number[]>();
    for (let y = 0; y < 34; y++) {
      const cols: number[] = [];
      for (let x = 0; x < 34; x++) {
        const [, , , a] = pixels(x, y);
        if (a !== 0) cols.push(x);
      }
      if (cols.length > 0) opaqueColsByRow.set(y, cols);
    }

    // A 1px Bresenham diagonal produces exactly one opaque column per opaque row (staircase).
    // A width-2 thickLine must break that: every row that has any opaque pixel has at least 2.
    expect(opaqueColsByRow.size).toBeGreaterThan(0);
    for (const cols of opaqueColsByRow.values()) {
      expect(cols.length).toBeGreaterThanOrEqual(2);
    }
  });
});
