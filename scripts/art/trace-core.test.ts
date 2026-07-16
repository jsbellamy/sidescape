import { describe, expect, it } from "vitest";
// trace-core.mjs is the plain-JS pipeline `scripts/art/trace-reference.mjs` runs; imported directly
// (tsconfig allowJs) so this test exercises the exact stages the tracer ships, not a TS twin.
import {
  buildNamedPalette,
  cropImage,
  despeckle,
  detectPitch,
  emitDraft,
  keyBackground,
  normalizeCellPalette,
  quantizeGrid,
  reducePalette,
  sampleBackground,
  sampleCells,
  scaleGrid,
  stripExteriorInk,
} from "./trace-core.mjs";

/** A tiny RGBA image ({width,height,data}) built from a rows-of-hex grid, each cell upscaled by
 * `pitch` px and embedded in a `border`-px background frame — a synthetic "reference sheet" whose
 * true grid we know exactly, so the pipeline can be round-tripped. `null` cells render as `bg`. */
interface Image {
  width: number;
  height: number;
  data: Uint8Array;
}
type Grid = (string | null)[][];
type RGB = [number, number, number];

function synthSheet(
  grid: Grid,
  hexOf: (key: string) => string,
  { pitch, border, bg, jitter = 0 }: { pitch: number; border: number; bg: RGB; jitter?: number },
): Image {
  const cols = grid[0]!.length;
  const rows = grid.length;
  // Rounded like a real bitmap: a fractional pitch must never yield fractional pixel dimensions.
  const width = Math.round(cols * pitch) + border * 2;
  const height = Math.round(rows * pitch) + border * 2;
  const data = new Uint8Array(width * height * 4);
  const put = (x: number, y: number, [r, g, b]: RGB) => {
    const at = (y * width + x) * 4;
    data[at] = r;
    data[at + 1] = g;
    data[at + 2] = b;
    data[at + 3] = 255;
  };
  const [br, bgn, bb] = bg;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) put(x, y, [br, bgn, bb]);
  // `pitch` may be fractional to model grid drift; cell edges land on rounded boundaries.
  const edge = (i: number) => border + Math.round(i * pitch);
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      const key = grid[j]![i];
      if (key === null || key === undefined) continue;
      const [r, g, b] = hexToRgb(hexOf(key));
      for (let y = edge(j); y < edge(j + 1); y++)
        for (let x = edge(i); x < edge(i + 1); x++) {
          const jz = jitter ? ((x * 7 + y * 13) % (2 * jitter + 1)) - jitter : 0;
          put(x, y, [clamp(r + jz), clamp(g + jz), clamp(b + jz)]);
        }
    }
  return { width, height, data };
}

function hexToRgb(hex: string): RGB {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const clamp = (v: number) => Math.max(0, Math.min(255, v));

// Named palette hexes used by the fixtures (all real entries, so quantization is an identity map).
const TOWN0 = "#4a2e1a";
const TOWN2 = "#9c6331";
const TOWN3 = "#c5823b";
const TOWN4 = "#e2ad57";
const INK = "#110d0a";
const HEX: Record<string, string> = { A: TOWN0, B: TOWN2, C: TOWN3, D: TOWN4, K: INK };

describe("normalizeCellPalette", () => {
  it("preserves an already-within-budget grid and reports an identity normalization", () => {
    const cells: (RGB | null)[][] = [
      [[12, 34, 56], null],
      [
        [200, 210, 220],
        [12, 34, 56],
      ],
    ];

    expect(normalizeCellPalette(cells, { maxColors: 2 })).toEqual({
      cells,
      inputColorCount: 2,
      outputColorCount: 2,
      changedCellCount: 0,
      medoids: [
        [12, 34, 56],
        [200, 210, 220],
      ],
    });
  });

  it("collapses noisy source colors into exact input medoids without changing geometry", () => {
    const cells: (RGB | null)[][] = [
      [[16, 19, 25], [18, 20, 26], null, [228, 80, 48]],
      [[16, 19, 25], [17, 18, 25], null, [230, 82, 49]],
    ];

    const normalized = normalizeCellPalette(cells, { maxColors: 2 });
    const input = new Set(
      cells
        .flat()
        .filter((rgb): rgb is RGB => rgb !== null)
        .map((rgb) => rgb.join(",")),
    );
    const output: RGB[] = normalized.cells
      .flat()
      .filter((rgb: RGB | null): rgb is RGB => rgb !== null);

    expect(normalized.outputColorCount).toBe(2);
    expect(normalized.changedCellCount).toBeGreaterThan(0);
    expect(normalized.cells).toHaveLength(cells.length);
    expect(normalized.cells[0]).toHaveLength(cells[0]!.length);
    expect(normalized.cells[0]![2]).toBeNull();
    expect(normalized.cells[1]![2]).toBeNull();
    expect(output.every((rgb) => input.has(rgb.join(",")))).toBe(true);
    expect(new Set(output.filter((rgb) => rgb[0] < 100).map((rgb) => rgb.join(","))).size).toBe(1);
    expect(new Set(output.filter((rgb) => rgb[0] > 100).map((rgb) => rgb.join(","))).size).toBe(1);
  });

  it("is deterministic, idempotent, and orders the final medoid report by RGB", () => {
    const cells: (RGB | null)[][] = [
      [
        [0, 0, 0],
        [128, 128, 128],
        [255, 255, 255],
      ],
      [[0, 0, 0], null, [255, 255, 255]],
    ];

    const first = normalizeCellPalette(cells, { maxColors: 2 });
    const second = normalizeCellPalette(cells, { maxColors: 2 });
    const renormalized = normalizeCellPalette(first.cells, { maxColors: 2 });

    expect(second).toEqual(first);
    expect(first.medoids).toEqual([
      [0, 0, 0],
      [255, 255, 255],
    ]);
    expect(renormalized.cells).toEqual(first.cells);
    expect(renormalized.changedCellCount).toBe(0);
  });

  it("uses stable RGB tie breaks for one-medoid refinement and two-medoid assignment", () => {
    const grayscale = (value: number): RGB => [value, value, value];

    // With one medoid, 128 minimizes the histogram-weighted OKLab cost; this pins first-seed and
    // refinement selection. With two medoids, black wins the farthest-first tie from 128 by RGB.
    expect(
      normalizeCellPalette([[grayscale(0), grayscale(128), grayscale(255)]], { maxColors: 1 }),
    ).toMatchObject({
      medoids: [grayscale(128)],
    });
    expect(
      normalizeCellPalette([[grayscale(0), grayscale(128), grayscale(255)]], { maxColors: 2 }),
    ).toMatchObject({
      cells: [[grayscale(0), grayscale(128), grayscale(128)]],
      medoids: [grayscale(0), grayscale(128)],
    });
  });

  it("returns valid transparent and one-color reports, and rejects invalid budgets", () => {
    const transparent: (RGB | null)[][] = [
      [null, null],
      [null, null],
    ];
    expect(normalizeCellPalette(transparent, { maxColors: 3 })).toEqual({
      cells: transparent,
      inputColorCount: 0,
      outputColorCount: 0,
      changedCellCount: 0,
      medoids: [],
    });
    expect(normalizeCellPalette([[[7, 8, 9]]], { maxColors: 1 })).toMatchObject({
      inputColorCount: 1,
      outputColorCount: 1,
      changedCellCount: 0,
      medoids: [[7, 8, 9]],
    });
    for (const maxColors of [undefined, 0, -1, 1.5, Number.NaN, "2"]) {
      expect(() => normalizeCellPalette([[[7, 8, 9]]], { maxColors })).toThrow("positive integer");
    }
  });
});

describe("detectPitch + sampleCells round-trip", () => {
  // A 6×5 grid where every 4-neighbour differs, so each cell boundary yields a strong edge comb.
  const grid = [
    ["A", "B", "C", "D", "A", "B"],
    ["B", "C", "D", "A", "B", "C"],
    ["C", "D", "A", "B", "C", "D"],
    ["D", "A", "B", "C", "D", "A"],
    ["A", "B", "C", "D", "A", "B"],
  ];

  it("recovers an integer pitch and reproduces every cell color", () => {
    const sheet = synthSheet(grid, (k: string) => HEX[k]!, {
      pitch: 8,
      border: 5,
      bg: [235, 8, 230],
      jitter: 2,
    });
    const bg = sampleBackground(sheet);
    const { fg, bbox } = keyBackground(sheet, bg, 20);
    const px = detectPitch(sheet, fg, "x");
    const py = detectPitch(sheet, fg, "y");
    expect(px.pitch).toBeCloseTo(8, 0);
    expect(py.pitch).toBeCloseTo(8, 0);

    const cells = sampleCells(sheet, fg, bbox, {
      pitchX: px.pitch,
      phaseX: px.phase,
      pitchY: py.pitch,
      phaseY: py.phase,
    });
    expect(cells.length).toBe(5);
    expect(cells[0]!.length).toBe(6);
    const named = buildNamedPalette();
    const { cells: quant } = quantizeGrid(cells, named);
    for (let j = 0; j < grid.length; j++)
      for (let i = 0; i < grid[0]!.length; i++)
        expect(quant[j][i].hex.toLowerCase()).toBe(HEX[grid[j]![i]!]!.toLowerCase());
  });

  it("recovers a fractional/drifting pitch (cells alternate 9/10px wide)", () => {
    const sheet = synthSheet(grid, (k: string) => HEX[k]!, {
      pitch: 9.5,
      border: 6,
      bg: [235, 8, 230],
    });
    const bg = sampleBackground(sheet);
    const { fg, bbox } = keyBackground(sheet, bg, 20);
    const px = detectPitch(sheet, fg, "x");
    expect(px.pitch).toBeCloseTo(9.5, 0); // ~9.5, distinguishable from integer 9 or 10

    const py = detectPitch(sheet, fg, "y");
    const cells = sampleCells(sheet, fg, bbox, {
      pitchX: px.pitch,
      phaseX: px.phase,
      pitchY: py.pitch,
      phaseY: py.phase,
    });
    const named = buildNamedPalette();
    const { cells: quant } = quantizeGrid(cells, named);
    for (let j = 0; j < grid.length; j++)
      for (let i = 0; i < grid[0]!.length; i++)
        expect(quant[j][i].hex.toLowerCase()).toBe(HEX[grid[j]![i]!]!.toLowerCase());
  });
});

describe("keyBackground", () => {
  it("keeps an ink ring against a contrasting background and reports enclosed holes", () => {
    // A 5×5 shape on a magenta sheet (like icon-reference.png): ink border ring, town-brown body,
    // and one enclosed bg-colored hole in the center. Ink is far from magenta, so the ring survives.
    const grid = [
      ["K", "K", "K", "K", "K"],
      ["K", "B", "B", "B", "K"],
      ["K", "B", null, "B", "K"],
      ["K", "B", "B", "B", "K"],
      ["K", "K", "K", "K", "K"],
    ];
    const sheet = synthSheet(grid, (k: string) => HEX[k]!, {
      pitch: 6,
      border: 4,
      bg: [235, 8, 230],
    });
    const bg = sampleBackground(sheet);
    const { fg, bbox, enclosedBgCount } = keyBackground(sheet, bg, 16);
    const at = (x: number, y: number) => fg[y * sheet.width + x];

    expect(at(4, 4)).toBe(1); // top-left of the ink ring survives
    expect(at(0, 0)).toBe(0); // outer background corner keyed out
    // The enclosed center hole is bg-colored but unreachable from the border → not keyed as bg.
    expect(enclosedBgCount).toBeGreaterThan(0);
    expect(at(16, 16)).toBe(1); // center of the hole stays foreground by default
    expect(bbox).toEqual({ x0: 4, y0: 4, x1: 33, y1: 33 });
  });

  it("keyEnclosed also keys bg-colored holes the flood cannot reach", () => {
    // Same ring-with-hole sheet as above; the ingest path passes keyEnclosed because its key color
    // is saturated magenta no subject uses — the hole must become background, the ring must stay.
    const grid = [
      ["K", "K", "K", "K", "K"],
      ["K", "B", "B", "B", "K"],
      ["K", "B", null, "B", "K"],
      ["K", "B", "B", "B", "K"],
      ["K", "K", "K", "K", "K"],
    ];
    const sheet = synthSheet(grid, (k: string) => HEX[k]!, {
      pitch: 6,
      border: 4,
      bg: [235, 8, 230],
    });
    const bg = sampleBackground(sheet);
    const { fg, bbox, enclosedBgCount } = keyBackground(sheet, bg, 16, { keyEnclosed: true });
    const at = (x: number, y: number) => fg[y * sheet.width + x];

    expect(at(16, 16)).toBe(0); // enclosed hole keyed out
    expect(at(4, 4)).toBe(1); // ring survives
    expect(at(10, 10)).toBe(1); // body survives
    expect(enclosedBgCount).toBeGreaterThan(0); // still reported
    expect(bbox).toEqual({ x0: 4, y0: 4, x1: 33, y1: 33 }); // bbox is the ring, unchanged
  });

  it("treats zero-alpha pixels as background regardless of their RGB", () => {
    // A transparent-background export: the border ring and an enclosed hole are opaque-black in
    // RGB but alpha 0. Both must key out (the hole via keyEnclosed), leaving only the body.
    const grid = [
      ["B", "B", "B"],
      ["B", null, "B"],
      ["B", "B", "B"],
    ];
    const sheet = synthSheet(grid, (k: string) => HEX[k]!, {
      pitch: 6,
      border: 4,
      bg: [0, 0, 0],
    });
    // Zero out alpha on every non-body pixel (synthSheet writes bg as opaque [0,0,0]).
    for (let i = 0; i < sheet.data.length; i += 4) {
      if (sheet.data[i] === 0 && sheet.data[i + 1] === 0 && sheet.data[i + 2] === 0) {
        sheet.data[i + 3] = 0;
      }
    }
    // Pretend background sampling reported a color nowhere near the outside pixels' RGB — the
    // alpha rule alone must carry the keying.
    const { fg, bbox, enclosedBgCount } = keyBackground(sheet, [255, 0, 255], 16, {
      keyEnclosed: true,
    });
    const at = (x: number, y: number) => fg[y * sheet.width + x];
    expect(at(0, 0)).toBe(0); // transparent border keyed despite RGB mismatch with bg
    expect(at(13, 13)).toBe(0); // transparent enclosed hole keyed
    expect(at(5, 5)).toBe(1); // opaque body survives
    expect(enclosedBgCount).toBeGreaterThan(0);
    expect(bbox).toEqual({ x0: 4, y0: 4, x1: 21, y1: 21 });
  });

  it("removes a near-ink dark background without leaking through into the body", () => {
    // On the dark golden master, an ink outline is ~8 Manhattan from bg — indistinguishable by
    // color, so an EXTERIOR ink edge is keyed out with the bg (harmless: the outline is re-derived
    // via paintGrid's outlineMask downstream). The safety property that MUST hold is that the flood
    // never leaks through the ink into the lighter body. A body-only shape must survive intact.
    const grid = [
      ["B", "C", "B"],
      ["C", "D", "C"],
      ["B", "C", "B"],
    ];
    const sheet = synthSheet(grid, (k: string) => HEX[k]!, {
      pitch: 5,
      border: 4,
      bg: [19, 16, 13],
    });
    const bg = sampleBackground(sheet);
    expect(bg[0]).toBeGreaterThanOrEqual(17);
    expect(bg[0]).toBeLessThanOrEqual(21);

    const { fg, bbox } = keyBackground(sheet, bg, 16);
    const at = (x: number, y: number) => fg[y * sheet.width + x];
    expect(at(0, 0)).toBe(0); // exterior removed
    // Every body pixel survives — no leak-through.
    for (let y = 4; y < 4 + 15; y++) for (let x = 4; x < 4 + 15; x++) expect(at(x, y)).toBe(1);
    expect(bbox).toEqual({ x0: 4, y0: 4, x1: 18, y1: 18 });
  });
});

describe("quantizeGrid", () => {
  it("maps exact named hexes to themselves with the right code ref and zero distance", () => {
    const named = buildNamedPalette();
    const grid = [
      [hexToRgb(TOWN2), hexToRgb(INK)],
      [null, hexToRgb(TOWN4)],
    ];
    const { cells, report } = quantizeGrid(grid, named);
    expect(cells[0][0].ref).toBe("town[2]");
    expect(cells[0][1].ref).toBe("P.ink");
    expect(cells[1][0]).toBeNull();
    expect(cells[1][1].ref).toBe("town[4]");
    expect(report.every((r) => r.distance < 2)).toBe(true);
    expect(report.some((r) => r.warn)).toBe(false);
  });

  it("flags a color with no faithful named match", () => {
    const named = buildNamedPalette();
    const grid = [[[0, 255, 0]]]; // pure green — no icon ramp is close
    const { report } = quantizeGrid(grid, named, 40);
    expect(report[0].warn).toBe(true);
    expect(report[0].distance).toBeGreaterThan(40);
  });

  it("gives red and orange subjects a faithful ramp (blood/ember)", () => {
    // Before the blood/ember ramps existed, potion reds and flame oranges quantized into the
    // brown/gold ramps — a red potion shipped brown. Representative generation colors must now
    // land on the red/orange vocabulary within the 40-distance warn threshold.
    const named = buildNamedPalette();
    const grid = [
      [
        [192, 40, 35], // potion red
        [230, 150, 60], // flame orange
      ],
    ];
    const { cells, report } = quantizeGrid(grid, named, 40);
    expect(cells[0][0].ref).toMatch(/^blood\./);
    expect(cells[0][1].ref).toMatch(/^ember\./);
    expect(report.some((r) => r.warn)).toBe(false);
  });
});

describe("stripExteriorInk", () => {
  it("removes one layer of exterior ink but keeps interior ink details", () => {
    const ink = { ref: "P.ink", hex: INK, rgb: hexToRgb(INK) };
    const body = { ref: "town[2]", hex: TOWN2, rgb: hexToRgb(TOWN2) };
    // 4×4 block: full ink top row (exterior), body below with one interior ink pixel.
    const cells = [
      [ink, ink, ink, ink],
      [body, body, ink, body],
      [body, body, body, body],
      [ink, body, body, ink],
    ];
    const { cells: out, strippedCount } = stripExteriorInk(cells, ["P.ink"]);
    expect(out[0][0]).toBeNull(); // exterior ink stripped
    expect(out[3][0]).toBeNull();
    expect(out[3][3]).toBeNull();
    expect(out[1][2].ref).toBe("P.ink"); // interior ink (fully surrounded) kept
    expect(strippedCount).toBeGreaterThan(0);
  });
});

describe("reducePalette", () => {
  const cell = (ref: string, rgb: RGB) => ({ ref, hex: "#000000", rgb });
  const A = cell("A", [10, 10, 10]);
  const B = cell("B", [200, 200, 200]);
  const C = cell("C", [12, 12, 12]); // near A
  const D = cell("D", [198, 198, 198]); // near B

  it("is a no-op when the grid already fits the budget", () => {
    const cells = [
      [A, B],
      [B, A],
    ];
    const { cells: out, merged } = reducePalette(cells, 4);
    expect(merged).toEqual([]);
    expect(out[0][0]!.ref).toBe("A");
  });

  it("keeps the most frequent colors and remaps the rest to the nearest kept color", () => {
    // A×3, B×2 are frequent; the lone C and D must merge into their nearest kept neighbours A and B.
    const cells = [
      [A, A, A, C],
      [B, B, D, null],
    ];
    const { cells: out, merged } = reducePalette(cells, 2);
    const refs = new Set<string>();
    for (const row of out) for (const c of row) if (c) refs.add(c.ref);
    expect([...refs].sort()).toEqual(["A", "B"]);
    expect(out[0][3]!.ref).toBe("A"); // C (near A) remapped
    expect(out[1][2]!.ref).toBe("B"); // D (near B) remapped
    expect(out[1][3]).toBeNull(); // transparent preserved
    expect(merged.map((m) => `${m.from}->${m.to}`).sort()).toEqual(["C->A", "D->B"]);
  });
});

describe("despeckle", () => {
  const cell = (ref: string, rgb: RGB) => ({ ref, hex: "#000000", rgb });
  const A = cell("A", [10, 10, 10]);
  const B = cell("B", [200, 200, 200]);

  it("merges a one-pixel color island into its dominant neighbour", () => {
    // A single B pixel surrounded entirely by A — a confetti singleton — becomes A.
    const cells = [
      [A, A, A],
      [A, B, A],
      [A, A, A],
    ];
    const { cells: out, changed } = despeckle(cells);
    expect(out[1][1]!.ref).toBe("A");
    expect(changed).toBe(1);
  });

  it("leaves a color cluster (2+ same-color neighbours) untouched", () => {
    const cells = [
      [A, A, B],
      [A, A, B], // the B column is a 2-cell cluster, not a singleton
    ];
    const { cells: out, changed } = despeckle(cells);
    expect(out[0][2]!.ref).toBe("B");
    expect(out[1][2]!.ref).toBe("B");
    expect(changed).toBe(0);
  });
});

describe("scaleGrid", () => {
  it("nearest-neighbour scales the long axis to the target, preserving aspect", () => {
    const c = (n: number) => ({ ref: `r${n}`, hex: "#000000", rgb: [n, n, n] });
    const cells = [
      [c(0), c(1), c(2)],
      [c(3), c(4), c(5)],
    ]; // 2 rows × 3 cols, long axis 3
    const out = scaleGrid(cells, 6); // long axis 3 → 6, factor 2
    expect(out.length).toBe(4); // 2 → 4 rows
    expect(out[0].length).toBe(6); // 3 → 6 cols
    expect(out[0][0].ref).toBe("r0");
    expect(out[0][5].ref).toBe("r2");
    expect(out[3][5].ref).toBe("r5");
  });
});

describe("emitDraft", () => {
  it("produces a legend per distinct color, equal-length rows, and a centered origin", () => {
    const B = { ref: "town[2]", hex: TOWN2, rgb: hexToRgb(TOWN2) };
    const D = { ref: "town[4]", hex: TOWN4, rgb: hexToRgb(TOWN4) };
    const cells = [
      [B, D, null],
      [D, B, B],
    ];
    const draft = emitDraft("skill-strength", cells, {
      source: "docs/icon-style-golden-master.png",
      outline: "P.ink",
    });
    expect(draft.rows.length).toBe(2);
    expect(draft.rows.every((r) => r.length === 3)).toBe(true);
    // Two distinct refs → two legend entries; every non-"." char is defined.
    expect(Object.keys(draft.legendHex).length).toBe(2);
    const used = new Set(
      draft.rows
        .join("")
        .split("")
        .filter((ch) => ch !== "."),
    );
    for (const ch of used) expect(draft.legendHex[ch]).toBeDefined();
    // The emitted code references named palette expressions, not raw hex literals.
    expect(draft.code).toContain("town[2]");
    expect(draft.code).toContain("paintGrid");
    expect(draft.code).toContain('name: "skill-strength"');
  });
});

describe("cropImage", () => {
  it("extracts an inclusive sub-rectangle", () => {
    const img = { width: 3, height: 2, data: new Uint8Array(3 * 2 * 4) };
    for (let i = 0; i < img.data.length; i++) img.data[i] = i;
    const sub = cropImage(img, { x0: 1, y0: 0, x1: 2, y1: 1 });
    expect(sub.width).toBe(2);
    expect(sub.height).toBe(2);
    // Top-left of the crop is the original pixel (1,0) = byte offset (0*3+1)*4 = 4.
    expect(sub.data[0]).toBe(4);
  });
});

/**
 * Per-asset ramp scoping (#252). `quantizeGrid` snaps to the nearest entry of whatever palette it
 * gets, so an unscoped palette makes every material ramp a candidate color for every asset — that
 * is how adding `adamant`/`rune` silently recolored ~35 shipped icons and 4 sprites. These lock the
 * `buildNamedPalette` half of the fix; `art-ramp-isolation.test.ts` locks the end-to-end property.
 */
describe("buildNamedPalette ramp scoping (#252)", () => {
  // Material refs are `<lowercase ramp>.<role>` (e.g. `steel.base`); master refs are `P.*` and
  // zone refs are `town[2]`, so neither is picked up here.
  const materialRefs = (palette: { ref: string }[]) =>
    palette.map((e) => e.ref).filter((ref) => /^[a-z][a-z-]*\./.test(ref));

  it("includes every material ramp when no allowlist is given (authoring tools want the full vocabulary)", () => {
    const refs = materialRefs(buildNamedPalette());
    for (const ramp of ["steel", "water", "gold", "blood", "ember", "adamant", "rune"]) {
      expect(refs).toContain(`${ramp}.base`);
    }
  });

  it("includes ONLY the allowlisted material ramps, so an undeclared ramp can never win a cell", () => {
    const refs = materialRefs(buildNamedPalette({ materialRampNames: ["steel", "water"] }));
    expect(refs).toContain("steel.base");
    expect(refs).toContain("water.base");
    for (const excluded of ["gold", "blood", "ember", "adamant", "rune"]) {
      expect(refs.some((ref) => ref.startsWith(`${excluded}.`))).toBe(false);
    }
  });

  it("keeps master and zone colors regardless of the allowlist (they are the shared neutrals)", () => {
    const palette = buildNamedPalette({ materialRampNames: [] });
    const refs = palette.map((e) => e.ref);
    expect(refs).toContain("P.ink");
    expect(refs).toContain("town[2]");
    expect(materialRefs(palette)).toEqual([]);
  });

  it("emits ramps in declaration order, not argument order — a tie is broken by palette position", () => {
    // quantizeGrid compares with a strict `<`, so the FIRST equidistant entry wins. If scoping
    // honored the caller's argument order, a subset listed differently would flip a tied cell and
    // change shipped art (the mace's one gold.shadow/ember.shadow tie is a real instance). Scoping
    // must only remove candidates, never reorder the survivors.
    const forward = materialRefs(buildNamedPalette({ materialRampNames: ["gold", "ember"] }));
    const reversed = materialRefs(buildNamedPalette({ materialRampNames: ["ember", "gold"] }));
    expect(forward).toEqual(reversed);
    expect(forward.indexOf("gold.shadow")).toBeLessThan(forward.indexOf("ember.shadow"));
  });

  it("throws on an unknown ramp name rather than silently ignoring it", () => {
    expect(() => buildNamedPalette({ materialRampNames: ["steel", "not-a-ramp"] })).toThrow(
      /unknown material ramp/,
    );
  });
});

/**
 * Zone-palette scoping (#261). `zonePalettes` had NO allowlist at all — every zone in
 * `zonePalettes` was emitted for every icon/sprite build regardless of that asset's own
 * dependencies, so adding a new zone (like `glacier`, #254) could silently re-quantize unrelated
 * shipped art the same way an unscoped material ramp could (#252). This locks the options-object
 * API's zone half of that fix, parallel to the material-ramp cases above.
 */
describe("buildNamedPalette zone scoping (#261)", () => {
  // Zone refs are `<zone>[<index>]`, e.g. `town[2]`; master refs are `P.*` and material refs are
  // `<ramp>.<role>`, so neither is picked up here.
  const zoneRefs = (palette: { ref: string }[]) =>
    palette.map((e) => e.ref).filter((ref) => /^[a-z][a-z]*\[\d+\]$/.test(ref));

  it("includes every zone when no allowlist is given (bare buildNamedPalette() stays full-vocabulary)", () => {
    const refs = zoneRefs(buildNamedPalette());
    for (const zone of ["meadow", "forest", "sewer", "crypt", "town", "glacier"]) {
      expect(refs.some((ref) => ref.startsWith(`${zone}[`))).toBe(true);
    }
  });

  it("includes ONLY the allowlisted zones, so an undeclared zone can never win a cell", () => {
    const refs = zoneRefs(buildNamedPalette({ zoneNames: ["town", "meadow"] }));
    expect(refs.some((ref) => ref.startsWith("town["))).toBe(true);
    expect(refs.some((ref) => ref.startsWith("meadow["))).toBe(true);
    for (const excluded of ["forest", "sewer", "crypt", "glacier"]) {
      expect(refs.some((ref) => ref.startsWith(`${excluded}[`))).toBe(false);
    }
  });

  it("zoneNames: [] excludes zones while retaining master and selected materials", () => {
    const palette = buildNamedPalette({ zoneNames: [], materialRampNames: ["steel"] });
    const refs = palette.map((e) => e.ref);
    expect(refs).toContain("P.ink");
    expect(refs).toContain("steel.base");
    expect(zoneRefs(palette)).toEqual([]);
  });

  it("emits zones in zonePalettes declaration order regardless of caller order — a tie is broken by palette position", () => {
    const forward = zoneRefs(buildNamedPalette({ zoneNames: ["crypt", "meadow"] }));
    const reversed = zoneRefs(buildNamedPalette({ zoneNames: ["meadow", "crypt"] }));
    expect(forward).toEqual(reversed);
    expect(forward.indexOf("meadow[0]")).toBeLessThan(forward.indexOf("crypt[0]"));
  });

  it("throws on an unknown zone name rather than silently ignoring it", () => {
    expect(() => buildNamedPalette({ zoneNames: ["town", "not-a-zone"] })).toThrow(/unknown zone/);
  });

  it("scopes materials and zones together, and master colors always come first", () => {
    const palette = buildNamedPalette({ materialRampNames: ["steel"], zoneNames: ["town"] });
    expect(palette[0]?.ref).toBe("P.bg");
    const refs = palette.map((e) => e.ref);
    expect(refs).toContain("town[0]");
    expect(refs).toContain("steel.base");
    expect(zoneRefs(palette)).toEqual([
      "town[0]",
      "town[1]",
      "town[2]",
      "town[3]",
      "town[4]",
      "town[5]",
    ]);
  });
});
