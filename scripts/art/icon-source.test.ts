import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// icon-source.mjs is the plain-JS Stage-2 build converter `scripts/art/icons.mjs` runs for
// source-driven icons; imported directly (tsconfig allowJs) so this exercises the shipped code.
import { createCanvas } from "./icon-canvas.mjs";
import { loadSourceGrid, MAX_BODY_COLORS, paintSourceIcon } from "./icon-source.mjs";
import { encodePng } from "./write-png.mjs";

type RGB = [number, number, number];
type Grid = (RGB | null)[][];

// Real named-ramp hexes (so quantization is an identity map for these fixtures).
const INK: RGB = [0x11, 0x0d, 0x0a]; // P.ink
const TOWN3: RGB = [0xc5, 0x82, 0x3b]; // town[3], a mid-light body brown
const TOWN4: RGB = [0xe2, 0xad, 0x57]; // town[4], a highlight brown
const BLOOD_BASE: RGB = [0xa5, 0x30, 0x26]; // blood.base
const WATER_BASE: RGB = [0x72, 0xa7, 0xcc]; // water.base

/** Renders a source grid to the 34×34 canvas and returns a pixel reader + the set of opaque colors,
 * exactly as `writeIcons` would ship it. */
function render(grid: Grid, opts?: Record<string, unknown>) {
  const canvas = createCanvas();
  paintSourceIcon(canvas, grid, opts);
  const fn = canvas.toPixelFn();
  const colors = new Set<string>();
  for (let y = 0; y < 34; y++)
    for (let x = 0; x < 34; x++) {
      const [r, g, b, a] = fn(x, y);
      if (a !== 0) colors.add(`${r},${g},${b}`);
    }
  return { fn, colors };
}

/** A solid `w`×`h` block of one color, no ink — the body whose outline is re-derived. */
function block(w: number, h: number, color: RGB): Grid {
  return Array.from({ length: h }, () => Array.from({ length: w }, () => color));
}

describe("paintSourceIcon", () => {
  it("renders a body and re-derives one exterior warm-ink ring around it", () => {
    const grid = block(6, 8, TOWN3);
    const { fn, colors } = render(grid);
    // Body centered on 34×34: width 6 → ox = 14, height 8 → oy = 13. Interior is town[3].
    expect(fn(16, 16).slice(0, 3)).toEqual(TOWN3);
    // One cell to the left of the body's left edge (x=13) is the derived ink ring.
    expect(fn(13, 16).slice(0, 3)).toEqual(INK);
    // The icon contains exactly the body color plus the ink ring.
    expect(colors.has(`${INK[0]},${INK[1]},${INK[2]}`)).toBe(true);
    expect(colors.has(`${TOWN3[0]},${TOWN3[1]},${TOWN3[2]}`)).toBe(true);
  });

  it("quantizes an off-ramp color to its nearest named ramp entry", () => {
    // A brown a few RGB steps off town[3] must snap onto town[3] exactly.
    const off: RGB = [0xc2, 0x85, 0x3e];
    const { colors } = render(block(6, 8, off));
    expect(colors.has(`${off[0]},${off[1]},${off[2]}`)).toBe(false);
    expect(colors.has(`${TOWN3[0]},${TOWN3[1]},${TOWN3[2]}`)).toBe(true);
  });

  it("strips traced exterior ink so the body's own outline is not doubled", () => {
    // A town body wrapped in a traced ink ring: after stripping + re-derivation there is still just
    // one ink layer around the body, i.e. no ink two cells out from the body.
    const grid: Grid = [
      [INK, INK, INK, INK],
      [INK, TOWN3, TOWN3, INK],
      [INK, TOWN3, TOWN3, INK],
      [INK, INK, INK, INK],
    ];
    const { fn } = render(grid);
    // Grid 4×4 → ox = oy = 15; the traced ink ring occupied the grid border, now stripped and the
    // ring re-derived one cell outside the 2×2 body (cols 16..17, rows 16..17).
    expect(fn(16, 16).slice(0, 3)).toEqual(TOWN3); // body survives
    expect(fn(15, 16).slice(0, 3)).toEqual(INK); // one derived ink layer
    expect(fn(14, 16)[3]).toBe(0); // nothing two cells out — no doubled outline
  });

  it("reduces an over-budget palette so the shipped icon stays within 12 colors", () => {
    // 15 distinct near-black body colors (plus the derived ink) would blow the budget; reduction
    // collapses them to MAX_BODY_COLORS, keeping the whole icon ≤ 12 colors.
    const grid: Grid = [];
    for (let y = 0; y < 8; y++) {
      const row: (RGB | null)[] = [];
      for (let x = 0; x < 15; x++) row.push([x, x, x] as RGB);
      grid.push(row);
    }
    const { colors } = render(grid);
    expect(colors.size).toBeLessThanOrEqual(MAX_BODY_COLORS + 1);
    expect(colors.size).toBeLessThanOrEqual(12);
  });

  it("throws when the grid plus its outline ring cannot fit the 32px drawable area", () => {
    expect(() => render(block(31, 8, TOWN3))).toThrow(/drawable area/);
  });

  it("honors an explicit x0/y0 origin", () => {
    const { fn } = render(block(4, 4, TOWN4), { x0: 3, y0: 3 });
    expect(fn(4, 4).slice(0, 3)).toEqual(TOWN4); // body placed at the given origin
  });

  it("recolors named source regions without changing the family silhouette", () => {
    const source = render(block(4, 4, BLOOD_BASE));
    const recolored = render(block(4, 4, BLOOD_BASE), {
      recolor: { "blood.base": "water.base" },
    });
    expect(recolored.fn(16, 16).slice(0, 3)).toEqual(WATER_BASE);
    expect(recolored.fn(14, 16).slice(0, 3)).toEqual(INK);
    for (let y = 0; y < 34; y++)
      for (let x = 0; x < 34; x++) expect(recolored.fn(x, y)[3]).toBe(source.fn(x, y)[3]);
  });

  it("rejects recolor mappings that are not named palette references", () => {
    expect(() =>
      render(block(4, 4, BLOOD_BASE), { recolor: { "blood.base": "water.neon" } }),
    ).toThrow(/unknown named palette ref/);
  });

  // #306: relief remaps quantized interiors onto the pinned neutral ramp while keeping the
  // same connected subject mask and one derived P.ink exterior ring.
  describe("relief: true (#306)", () => {
    const OUTLINE: RGB = [0x29, 0x20, 0x17]; // P.outline
    const SHADOW: RGB = [0x4b, 0x38, 0x28]; // P.shadow
    const TEXT_DIM: RGB = [0x9a, 0x8a, 0x72]; // P["text-dim"]
    const SAND: RGB = [0xc6, 0xad, 0x79]; // P.sand
    const CREAM: RGB = [0xe6, 0xd4, 0xaa]; // P.cream
    const ALLOWED = new Set(
      [INK, OUTLINE, SHADOW, TEXT_DIM, SAND, CREAM].map((c) => `${c[0]},${c[1]},${c[2]}`),
    );

    /** Three stacked luminance bands so relief has distinct ranks to map. */
    function shadedBlock(): Grid {
      const dark: RGB = [0x59, 0x63, 0x6d]; // steel.shadow
      const mid: RGB = [0x8d, 0x99, 0xa3]; // steel.base
      const light: RGB = [0xc4, 0xcc, 0xd1]; // steel.light
      return [
        ...Array.from({ length: 3 }, () => Array.from({ length: 6 }, () => dark)),
        ...Array.from({ length: 3 }, () => Array.from({ length: 6 }, () => mid)),
        ...Array.from({ length: 3 }, () => Array.from({ length: 6 }, () => light)),
      ];
    }

    it("preserves the subject alpha mask of the non-relief render", () => {
      const grid = shadedBlock();
      const plain = render(grid);
      const relief = render(grid, { relief: true });
      for (let y = 0; y < 34; y++)
        for (let x = 0; x < 34; x++) expect(relief.fn(x, y)[3]).toBe(plain.fn(x, y)[3]);
    });

    it("emits only P.ink plus the five neutral relief values", () => {
      const { colors } = render(shadedBlock(), { relief: true });
      for (const c of colors) expect(ALLOWED.has(c)).toBe(true);
      expect(colors.has(`${INK[0]},${INK[1]},${INK[2]}`)).toBe(true);
    });

    it("uses at least three interior relief values plus the exterior ink ring", () => {
      const { colors } = render(shadedBlock(), { relief: true });
      const interior = [...colors].filter((c) => c !== `${INK[0]},${INK[1]},${INK[2]}`);
      expect(interior.length).toBeGreaterThanOrEqual(3);
    });

    it("maps darker source planes to darker relief values", () => {
      const { fn } = render(shadedBlock(), { relief: true });
      // Grid 6×9 → ox=14, oy=12. Sample each of the three stacked bands.
      const top = fn(16, 13).slice(0, 3) as RGB;
      const mid = fn(16, 16).slice(0, 3) as RGB;
      const bot = fn(16, 19).slice(0, 3) as RGB;
      const lum = (c: RGB) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
      expect(lum(top)).toBeLessThan(lum(mid));
      expect(lum(mid)).toBeLessThan(lum(bot));
    });

    it("is byte-identical across repeated renders", () => {
      const grid = shadedBlock();
      const a = render(grid, { relief: true });
      const b = render(grid, { relief: true });
      for (let y = 0; y < 34; y++)
        for (let x = 0; x < 34; x++) expect(a.fn(x, y)).toEqual(b.fn(x, y));
    });
  });
});

describe("loadSourceGrid", () => {
  it("reads a compact PNG into a null-for-transparent RGB grid", () => {
    const dir = mkdtempSync(join(tmpdir(), "icon-source-"));
    const path = join(dir, "tiny.png");
    // 2×1: one opaque town pixel, one transparent.
    const png = encodePng(2, 1, (x: number) => (x === 0 ? [...TOWN3, 255] : [0, 0, 0, 0]));
    writeFileSync(path, png);
    const grid = loadSourceGrid(path);
    expect(grid.length).toBe(1);
    expect(grid[0]!.length).toBe(2);
    expect(grid[0]![0]).toEqual(TOWN3);
    expect(grid[0]![1]).toBeNull();
  });
});
