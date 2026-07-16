import { describe, expect, it } from "vitest";
// icon-canvas.mjs is the plain-JS module `npm run art` actually renders icons with — imported
// directly (tsconfig's `allowJs`) so this test exercises the exact `thickLine` shipped, not a
// parallel TS reimplementation that could drift.
import { createCanvas, createMask, paintGrid } from "./icon-canvas.mjs";

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

describe("mask-first icon painting", () => {
  it("outlines the unioned silhouette once without drawing seams between overlapping parts", () => {
    const body = createMask();
    body.rect(5, 5, 9, 9);
    body.rect(8, 7, 12, 11);

    const canvas = createCanvas();
    canvas.outlineMask(body, "#110d0a");
    canvas.paintMask(body, "#9c6331");
    const pixel = canvas.toPixelFn();

    // The overlap stays body-colored; independently outlined primitives would leave a dark seam.
    expect(pixel(8, 7)).toEqual([156, 99, 49, 255]);
    expect(pixel(9, 9)).toEqual([156, 99, 49, 255]);
    // The outline is derived around the union's exterior.
    expect(pixel(4, 5)).toEqual([17, 13, 10, 255]);
    expect(pixel(13, 11)).toEqual([17, 13, 10, 255]);
  });

  it("clips shadow and highlight primitives to the silhouette mask", () => {
    const body = createMask();
    body.rect(5, 5, 9, 9);

    const canvas = createCanvas();
    canvas.paintMask(body, "#9c6331");
    canvas.paintInside(body, (inside: ReturnType<typeof createCanvas>) =>
      inside.rect(7, 3, 12, 7, "#e2ad57"),
    );
    const pixel = canvas.toPixelFn();

    expect(pixel(7, 5)).toEqual([226, 173, 87, 255]);
    expect(pixel(10, 5)[3]).toBe(0);
    expect(pixel(7, 4)[3]).toBe(0);
  });
});

describe("paintGrid", () => {
  const legend = { b: "#9c6331", h: "#e2ad57" };

  it("places legend colors at the given origin and leaves '.' cells transparent", () => {
    const canvas = createCanvas();
    paintGrid(canvas, legend, ["bh", ".b"], { x0: 5, y0: 6 });
    const pixel = canvas.toPixelFn();

    expect(pixel(5, 6)).toEqual([156, 99, 49, 255]); // 'b'
    expect(pixel(6, 6)).toEqual([226, 173, 87, 255]); // 'h'
    expect(pixel(5, 7)[3]).toBe(0); // '.'
    expect(pixel(6, 7)).toEqual([156, 99, 49, 255]); // 'b'
  });

  it("centers the grid in the 34×34 canvas when no origin is given", () => {
    const canvas = createCanvas();
    paintGrid(canvas, legend, ["bb", "bb"]); // 2×2 → origin (16,16)
    const pixel = canvas.toPixelFn();

    expect(pixel(16, 16)).toEqual([156, 99, 49, 255]);
    expect(pixel(17, 17)).toEqual([156, 99, 49, 255]);
    expect(pixel(15, 16)[3]).toBe(0);
    expect(pixel(18, 18)[3]).toBe(0);
  });

  it("derives one exterior outline identical to a manual outlineMask of the same union", () => {
    const rows = [".bb.", "bbbb", "bbbb", ".bb."];
    const graph = createCanvas();
    paintGrid(graph, legend, rows, { x0: 5, y0: 5, outline: "#110d0a" });

    // Reference: the same filled cells unioned into a mask, outlined once.
    const mask = createMask();
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) if (row[x] !== ".") mask.plot(5 + x, 5 + y);
    });
    const reference = createCanvas();
    reference.outlineMask(mask, "#110d0a");
    reference.paintMask(mask, "#9c6331");

    const got = graph.toPixelFn();
    const want = reference.toPixelFn();
    for (let y = 0; y < 34; y++) for (let x = 0; x < 34; x++) expect(got(x, y)).toEqual(want(x, y));
  });

  it("keeps interior outline-colored cells while the exterior ring is derived", () => {
    const canvas = createCanvas();
    // A 3×3 block whose center is explicitly the outline color.
    paintGrid(canvas, { b: "#9c6331", k: "#110d0a" }, ["bbb", "bkb", "bbb"], {
      x0: 10,
      y0: 10,
      outline: "#110d0a",
    });
    const pixel = canvas.toPixelFn();

    expect(pixel(11, 11)).toEqual([17, 13, 10, 255]); // interior 'k' survives
    expect(pixel(9, 11)).toEqual([17, 13, 10, 255]); // exterior ring, derived
  });

  it("throws on an unknown legend character and on ragged rows", () => {
    expect(() => paintGrid(createCanvas(), legend, ["bz"])).toThrow(/legend/i);
    expect(() => paintGrid(createCanvas(), legend, ["bb", "b"])).toThrow(/ragged|length/i);
  });
});
