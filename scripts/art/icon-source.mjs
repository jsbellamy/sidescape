import { readFileSync } from "node:fs";
import { PNG } from "pngjs";
import { paintGrid } from "./icon-canvas.mjs";
import { P } from "./palettes.mjs";
import {
  buildNamedPalette,
  despeckle,
  quantizeGrid,
  reducePalette,
  stripExteriorInk,
} from "./trace-core.mjs";

/**
 * Build-time converter for **source-driven** icons: the deterministic Stage 2 of the icon
 * generation pipeline (see docs/icon-gen.md). Stage 1 (`scripts/art/ingest-icon.mjs`) turns an
 * approved prompt-kit image gen into a committed *compact source* — a 1-px-per-cell PNG on the
 * subject's native pseudo-pixel grid, transparent background, raw traced colors. This module reads
 * that compact source at every `npm run art` and conforms it to house style: each cell is quantized
 * to the named ramps (`docs/art-style.md`), the traced exterior outline is stripped, and one clean
 * warm-ink ring is re-derived by `paintGrid`'s `outlineMask`. Quantizing here (not at ingest) means
 * a palette change re-flows every source-driven icon — the "conform to house style" rule lives in
 * exactly one place, and the shipped icon stays byte-deterministic from its committed source.
 */

const OUTLINE_INK_REFS = ["P.ink", "P.outline"];
const LEGEND_POOL = "abcdefghijklmnpqrstuvwxyzABCDEFGHIJKLMNPQRSTUVWXYZ"; // "o" omitted (reads as 0)
/** Body-fill color ceiling: the derived outline ink adds one more, keeping the shipped icon at or
 * under the 12-color budget lint (docs/art-style.md). */
export const MAX_BODY_COLORS = 11;

/**
 * Neutral interior ramp for empty-slot reliefs (#306). Opaque body colors are remapped onto these
 * five values by relative luminance (darkest → lightest); the exterior ring stays `P.ink`.
 * Declaration order is the dark→light ranking used by the bucket map.
 */
export const RELIEF_RAMP_REFS = ["P.outline", "P.shadow", 'P["text-dim"]', "P.sand", "P.cream"];

/** Relative luminance of an sRGB triple — used only to rank distinct source body colors for relief. */
function relativeLuminance([r, g, b]) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Remaps every opaque body cell onto `RELIEF_RAMP_REFS` by the cell's source luminance rank.
 * Equal luminance values share a bucket; ties break by `buildNamedPalette` declaration order.
 * Empty ramp buckets are allowed when the source has fewer distinct body colors than five.
 *
 * @param {(null | { ref: string, hex: string, rgb: [number, number, number] })[][]} cells
 */
function applyReliefRemap(cells) {
  const fullPalette = buildNamedPalette();
  const orderByRef = new Map(fullPalette.map((entry, i) => [entry.ref, i]));
  const byRef = new Map(fullPalette.map((entry) => [entry.ref, entry]));
  const ramp = RELIEF_RAMP_REFS.map((ref) => {
    const entry = byRef.get(ref);
    if (!entry) throw new Error(`paintSourceIcon: relief ramp missing ${JSON.stringify(ref)}`);
    return entry;
  });

  /** @type {Map<string, { ref: string, rgb: [number, number, number], order: number }>} */
  const used = new Map();
  for (const row of cells) {
    for (const cell of row) {
      if (!cell || used.has(cell.ref)) continue;
      used.set(cell.ref, {
        ref: cell.ref,
        rgb: cell.rgb,
        order: orderByRef.get(cell.ref) ?? Number.MAX_SAFE_INTEGER,
      });
    }
  }

  const unique = [...used.values()].sort((a, b) => {
    const d = relativeLuminance(a.rgb) - relativeLuminance(b.rgb);
    return d !== 0 ? d : a.order - b.order;
  });

  const n = unique.length;
  const last = ramp.length - 1;
  /** @type {Map<string, { ref: string, hex: string, rgb: [number, number, number] }>} */
  const remap = new Map();
  for (let i = 0; i < n; i++) {
    const idx = n === 1 ? 0 : Math.round((i * last) / (n - 1));
    const target = ramp[idx];
    remap.set(unique[i].ref, { ref: target.ref, hex: target.hex, rgb: target.rgb });
  }

  return cells.map((row) => row.map((cell) => (cell ? remap.get(cell.ref) : null)));
}

/**
 * Loads a compact source PNG into a 2-D grid of `null | [r, g, b]` (row-major, `null` where the
 * pixel is transparent). This is the same shape `sampleCells` produces, so it feeds straight into
 * `quantizeGrid`.
 *
 * @param {string} pngPath
 * @returns {(null | [number, number, number])[][]}
 */
export function loadSourceGrid(pngPath) {
  const png = PNG.sync.read(readFileSync(pngPath));
  const { width, height, data } = png;
  const grid = [];
  for (let y = 0; y < height; y++) {
    const row = [];
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      row.push(data[o + 3] === 0 ? null : [data[o], data[o + 1], data[o + 2]]);
    }
    grid.push(row);
  }
  return grid;
}

/**
 * Renders a compact source grid onto the shared 34×34 icon canvas, conformed to house style. The
 * grid is quantized to the named ramps, its traced exterior ink peeled (the ring is re-derived), and
 * the result centered — or placed at `x0`/`y0` — and painted through `paintGrid` with one derived
 * `outline` ring. Throws if the grid (plus its 1px outline ring) cannot fit the drawable 1..32 area.
 *
 * @param {ReturnType<typeof import("./icon-canvas.mjs").createCanvas>} canvas
 * @param {(null | [number, number, number])[][]} grid
 * `scope` (#252, #261) scopes the QUANTIZATION vocabulary to the material ramps and zones this
 * icon's own source actually uses (`scripts/art/icons.mjs`'s SOURCE_PALETTES/`paletteForSource`).
 * Quantization snaps each cell to the globally nearest palette entry, so without this scoping
 * every material ramp AND zone in the project is a candidate color for every cell — and merely
 * ADDING one silently recolors unrelated shipped icons (see `buildNamedPalette`'s doc). RECOLOR
 * targets are resolved against the FULL palette: remapping into a ramp the source does not itself
 * quantize into is exactly what a tier recolor does (a mithril icon's steel cells becoming
 * `rune.*`), and a recolor is an explicit, per-icon instruction rather than a global
 * nearest-color accident.
 *
 * `relief` (#306) remaps opaque interiors onto the pinned neutral ramp after the normal
 * quantize/strip/reduce/despeckle/recolor path, preserving the connected subject mask and letting
 * `paintGrid` still derive one `P.ink` exterior ring. Allowed only for source-backed registry
 * entries (see `validateIconEntry` in `icons.mjs`).
 *
 * @param {{ x0?: number, y0?: number, outline?: string, named?: ReturnType<typeof buildNamedPalette>, scope?: { materialRampNames?: readonly string[], zoneNames?: readonly string[] }, recolor?: Record<string, string>, relief?: boolean }} [opts]
 */
export function paintSourceIcon(
  canvas,
  grid,
  { x0, y0, outline = P.ink, named, scope, recolor = {}, relief = false } = {},
) {
  const quantizePalette = named ?? buildNamedPalette(scope);
  // Full vocabulary — recolor may name any ramp, including one this source never quantizes into.
  const paletteByRef = new Map(buildNamedPalette().map((entry) => [entry.ref, entry]));
  for (const [from, to] of Object.entries(recolor)) {
    if (!paletteByRef.has(from)) {
      throw new Error(`paintSourceIcon: unknown named palette ref ${JSON.stringify(from)}`);
    }
    if (!paletteByRef.has(to)) {
      throw new Error(`paintSourceIcon: unknown named palette ref ${JSON.stringify(to)}`);
    }
  }
  const { cells } = quantizeGrid(grid, quantizePalette);
  // Strip the traced exterior ink first (it is re-derived as one clean ring), THEN reduce the
  // remaining body fills to the color budget, so a budget slot is never spent on ink that is
  // about to be peeled away.
  const { cells: peeled } = stripExteriorInk(cells, OUTLINE_INK_REFS);
  const { cells: reduced } = reducePalette(peeled, MAX_BODY_COLORS);
  const { cells: stripped } = despeckle(reduced);
  // Family variants share one approved compact silhouette. Recolor only named material regions
  // after cleanup so geometry, outline stripping, and despeckling remain byte-identical across the
  // family; the mapping can never introduce an off-palette color.
  const recolored = stripped.map((row) =>
    row.map((cell) => {
      if (!cell) return null;
      const targetRef = recolor[cell.ref];
      return targetRef ? paletteByRef.get(targetRef) : cell;
    }),
  );
  const body = relief ? applyReliefRemap(recolored) : recolored;

  const height = body.length;
  const width = height > 0 ? body[0].length : 0;
  // The derived outline ring adds 1px on every side, so the body must leave room for it inside the
  // drawable 1..32 area (a 34-wide canvas with a 1px transparent margin each side).
  if (width + 2 > 32 || height + 2 > 32) {
    throw new Error(
      `paintSourceIcon: source grid ${width}×${height} plus its outline ring exceeds the 32×32 drawable area`,
    );
  }

  // `paintGrid` keys cells by single characters, but quantized refs are multi-char palette
  // expressions (e.g. `steel.base`), so assign each distinct ref its own legend char.
  const charOf = new Map();
  const legend = {};
  const rows = body.map((row) =>
    row
      .map((cell) => {
        if (!cell) return ".";
        let ch = charOf.get(cell.ref);
        if (!ch) {
          ch = LEGEND_POOL[charOf.size];
          if (!ch) throw new Error("paintSourceIcon: more distinct colors than legend chars");
          charOf.set(cell.ref, ch);
          legend[ch] = cell.hex;
        }
        return ch;
      })
      .join(""),
  );

  const ox = x0 ?? Math.floor((34 - width) / 2);
  const oy = y0 ?? Math.floor((34 - height) / 2);
  paintGrid(canvas, legend, rows, { x0: ox, y0: oy, outline });
}
