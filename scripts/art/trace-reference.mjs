import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { PNG } from "pngjs";
import { createCanvas, paintGrid, ICON_SIZE } from "./icon-canvas.mjs";
import { P } from "./palettes.mjs";
import {
  buildNamedPalette,
  cropImage,
  detectPitch,
  emitDraft,
  keyBackground,
  quantizeGrid,
  sampleBackground,
  sampleCells,
  scaleGrid,
  stripExteriorInk,
} from "./trace-core.mjs";
import { encodePng, hex } from "./write-png.mjs";

/**
 * CLI front end for the icon reference tracer. Grid-faithfully reconstructs one icon-sized subject
 * from a committed pixel-art reference sheet (see docs/art-style.md) and emits a `paintGrid` DRAFT
 * — never a shipped icon. All outputs land in the git-ignored `--out` dir; the draft must be pasted
 * into `scripts/art/icons.mjs` and hand-cleaned through the native-grid workflow before commit.
 *
 *   node scripts/art/trace-reference.mjs \
 *     --sheet docs/icon-style-golden-master.png --crop 339,60,485,238 --name skill-strength [--fit 28]
 */

const { values } = parseArgs({
  options: {
    sheet: { type: "string" },
    crop: { type: "string" }, // "x0,y0,x1,y1" inclusive
    name: { type: "string" },
    fit: { type: "string", default: "28" },
    pitch: { type: "string" }, // override detected X pitch
    "pitch-y": { type: "string" },
    phase: { type: "string" },
    "phase-y": { type: "string" },
    tolerance: { type: "string", default: "16" },
    out: { type: "string", default: "scripts/art/trace-out" },
    outline: { type: "string", default: "P.ink" },
  },
});

function fail(message) {
  console.error(`trace-reference: ${message}`);
  process.exit(1);
}

if (!values.sheet) fail("--sheet <path> is required");
if (!values.crop) fail("--crop x0,y0,x1,y1 is required");
if (!values.name) fail("--name <icon-name> is required");

const crop = values.crop.split(",").map((n) => Number.parseInt(n, 10));
if (crop.length !== 4 || crop.some((n) => Number.isNaN(n))) fail("--crop must be x0,y0,x1,y1");
const [cx0, cy0, cx1, cy1] = crop;
const fit = Number.parseInt(values.fit, 10);
const tolerance = Number.parseInt(values.tolerance, 10);

const sheetPng = PNG.sync.read(readFileSync(resolve(values.sheet)));
const image = { width: sheetPng.width, height: sheetPng.height, data: sheetPng.data };
const tile = cropImage(image, { x0: cx0, y0: cy0, x1: cx1, y1: cy1 });

const bg = sampleBackground(tile);
const { fg, bbox, enclosedBgCount } = keyBackground(tile, bg, tolerance);
if (!bbox) fail("no foreground found after keying — check the crop and --tolerance");

// Warn if the keyed subject touches the crop edge (a neighbouring tile or label likely bled in).
const touchesEdge =
  bbox.x0 === 0 || bbox.y0 === 0 || bbox.x1 === tile.width - 1 || bbox.y1 === tile.height - 1;

const px = values.pitch
  ? {
      pitch: Number.parseFloat(values.pitch),
      phase: values.phase ? Number.parseFloat(values.phase) : 0,
      score: NaN,
    }
  : detectPitch(tile, fg, "x");
const py = values["pitch-y"]
  ? {
      pitch: Number.parseFloat(values["pitch-y"]),
      phase: values["phase-y"] ? Number.parseFloat(values["phase-y"]) : 0,
      score: NaN,
    }
  : detectPitch(tile, fg, "y");

const sampled = sampleCells(tile, fg, bbox, {
  pitchX: px.pitch,
  phaseX: px.phase,
  pitchY: py.pitch,
  phaseY: py.phase,
});
const named = buildNamedPalette();
const quant = quantizeGrid(sampled, named);

const INK_REFS = ["P.ink", "P.outline"];
const stripped = stripExteriorInk(quant.cells, INK_REFS);
const scaled = scaleGrid(stripped.cells, fit);
const draft = emitDraft(values.name, scaled, {
  source: values.sheet,
  crop: values.crop,
  pitch: `${px.pitch.toFixed(2)}/${py.pitch.toFixed(2)}`,
  fit,
  outline: values.outline,
});

// --- render previews ---

/** 1:1 reconstruction of the quantized cells (pre-strip), one cell per pixel, real alpha. */
function cellsToPixels(cells) {
  const height = cells.length;
  const width = height > 0 ? cells[0].length : 0;
  return { width, height, pixel: (x, y) => (cells[y][x] ? hex(cells[y][x].hex) : [0, 0, 0, 0]) };
}

function upscale({ width, height, pixel }, scale) {
  return {
    width: width * scale,
    height: height * scale,
    pixel: (x, y) => pixel(Math.floor(x / scale), Math.floor(y / scale)),
  };
}

/** The draft rendered exactly as `npm run art` would render it — through `paintGrid`. */
function draftPixels() {
  const canvas = createCanvas();
  paintGrid(canvas, draft.legendHex, draft.rows, {
    x0: draft.x0,
    y0: draft.y0,
    outline: hexOf(values.outline),
  });
  const fn = canvas.toPixelFn();
  return { width: ICON_SIZE, height: ICON_SIZE, pixel: fn };
}

/** Resolves the outline expression the draft uses to a concrete hex for previewing. */
function hexOf(expr) {
  if (expr.startsWith("P.")) return P[expr.slice(2)];
  return P.ink;
}

const outDir = resolve(values.out);
await mkdir(outDir, { recursive: true });

async function write(name, { width, height, pixel }) {
  await writeFile(resolve(outDir, name), encodePng(width, height, pixel));
}

const recon = cellsToPixels(quant.cells);
await write(`${values.name}.recon.png`, recon);
await write(`${values.name}.recon@8x.png`, upscale(recon, 8));
const dp = draftPixels();
await write(`${values.name}.draft.png`, dp);
await write(`${values.name}.draft@8x.png`, upscale(dp, 8));
await writeFile(resolve(outDir, `${values.name}.draft.mjs`), `${draft.code}\n`);

// --- report ---

const reconRows = quant.cells.length;
const reconCols = reconRows > 0 ? quant.cells[0].length : 0;
const scaledRows = scaled.length;
const scaledCols = scaledRows > 0 ? scaled[0].length : 0;
const fillLongAxis = Math.max(scaledRows, scaledCols) + 2; // +2 for the derived outline ring
// The lint budget counts distinct opaque colors in the shipped icon: the named fills present after
// stripping, plus the one derived outline ink. (quant.distinctCount counts raw traced colors, which
// is only useful for judging how noisy the source sheet's anti-aliasing was.)
const usedRefs = new Set();
for (const row of scaled) for (const cell of row) if (cell) usedRefs.add(cell.ref);
const budget = usedRefs.size + (usedRefs.has(values.outline) ? 0 : 1);

console.log(`\ntrace-reference: ${values.name}  (source ${values.sheet})`);
console.log(`  crop ${values.crop}  →  keyed bbox ${bbox.x0},${bbox.y0}..${bbox.x1},${bbox.y1}`);
if (touchesEdge)
  console.log(`  ⚠ keyed subject touches the crop edge — a neighbour/label may have bled in`);
console.log(`  background ${bg.join(",")}   enclosed bg cells (holes): ${enclosedBgCount}`);
console.log(
  `  pitch x ${px.pitch.toFixed(2)} phase ${px.phase.toFixed(2)} score ${Number.isNaN(px.score) ? "(manual)" : px.score.toFixed(3)}`,
);
console.log(
  `  pitch y ${py.pitch.toFixed(2)} phase ${py.phase.toFixed(2)} score ${Number.isNaN(py.score) ? "(manual)" : py.score.toFixed(3)}`,
);
console.log(
  `  reconstructed grid ${reconCols}×${reconRows}  →  scaled ${scaledCols}×${scaledRows} (fit ${fit})`,
);
console.log(
  `  exterior ink stripped: ${stripped.strippedCount} cells (outline re-derived by paintGrid)`,
);
console.log(
  `  named colors used: ${budget} / 12 budget (from ${quant.distinctCount} anti-aliased traced colors)  projected fill long axis: ${fillLongAxis}px (lint wants 26–32)`,
);
console.log(`  quantization (traced → named, by frequency):`);
for (const r of quant.report) {
  console.log(
    `    ${r.hex} → ${r.ref.padEnd(14)} ×${String(r.count).padStart(3)}  dist ${r.distance.toFixed(1)}${r.warn ? "  ⚠ no faithful ramp" : ""}`,
  );
}
console.log(
  `\n  wrote previews + draft to ${values.out}/${values.name}.{recon,recon@8x,draft,draft@8x}.png, ${values.name}.draft.mjs`,
);
console.log(
  `  → paste ${values.name}.draft.mjs into scripts/art/icons.mjs, then clean per docs/art-style.md.\n`,
);
