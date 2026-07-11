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
  quantizeGrid,
  reducePalette,
  sampleBackground,
  sampleCells,
  scaleGrid,
  stripExteriorInk,
} from "../../scripts/art/trace-core.mjs";

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
  const width = cols * pitch + border * 2;
  const height = rows * pitch + border * 2;
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
    expect(bbox).toEqual({ x0: 4, y0: 4, x1: 33, y1: 33 });
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
