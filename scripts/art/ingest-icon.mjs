import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { PNG } from "pngjs";
import { createCanvas, ICON_SIZE } from "./icon-canvas.mjs";
import { paintSourceIcon } from "./icon-source.mjs";
import { MAX_BODY_COLORS } from "./icon-source.mjs";
import {
  buildNamedPalette,
  cropImage,
  despeckle,
  detectPitch,
  keyBackground,
  quantizeGrid,
  reducePalette,
  sampleBackground,
  sampleCells,
  scaleGrid,
  stripExteriorInk,
} from "./trace-core.mjs";
import { encodePng } from "./write-png.mjs";

/**
 * Stage 1 of the source-driven icon pipeline (see docs/icon-gen.md): ingest one approved prompt-kit
 * image generation into a committed **compact source**. A generation is chunky pixel art rendered
 * large on a flat key-color background; this recovers its native pseudo-pixel grid (key background →
 * detect pitch → majority-vote each cell), validates it against the icon rules that a source can be
 * checked for ahead of build, and writes the compact 1-px-per-cell PNG to
 * `scripts/art/icon-sources/<name>.png` (the only committed artifact) plus a git-ignored preview
 * rendered through the exact Stage-2 build path so it matches what `npm run art` will ship.
 *
 *   node scripts/art/ingest-icon.mjs --name skill-attack \
 *     [--in scripts/art/icon-gen-inbox/skill-attack.png] [--crop x0,y0,x1,y1] [--tolerance 40] \
 *     [--pitch N --pitch-y N] [--max-long 30] [--min-long 24]
 */

const { values } = parseArgs({
  options: {
    name: { type: "string" },
    in: { type: "string" }, // defaults to <inbox>/<name>.png
    inbox: { type: "string", default: "scripts/art/icon-gen-inbox" },
    sources: { type: "string", default: "scripts/art/icon-sources" },
    crop: { type: "string" }, // "x0,y0,x1,y1" inclusive; defaults to the whole image
    tolerance: { type: "string", default: "40" }, // key colors are flat + saturated → generous
    pitch: { type: "string" },
    "pitch-y": { type: "string" },
    // Target LOGICAL grid long axis used only to derive the pitch search band (these generations
    // bake their own outline into the grid, so the rendered icon is ~the grid size, not grid+2).
    "min-long": { type: "string", default: "24" },
    "max-long": { type: "string", default: "32" },
    // Optional: nearest-neighbour scale the compact grid so the rendered icon's long axis is ~this,
    // to rescue a generation that came in a hair under the 26px fill minimum. Despeckle cleans the
    // scaling seams. Leave off unless the fill check below tells you to.
    fit: { type: "string" },
  },
});

function fail(message) {
  console.error(`ingest-icon: ${message}`);
  process.exit(1);
}

if (!values.name) fail("--name <icon-name> is required");
const name = values.name;
const inPath = resolve(values.in ?? `${values.inbox}/${name}.png`);
const minLong = Number.parseInt(values["min-long"], 10);
const maxLong = Number.parseInt(values["max-long"], 10);
const tolerance = Number.parseInt(values.tolerance, 10);

let sheetPng;
try {
  sheetPng = PNG.sync.read(readFileSync(inPath));
} catch (err) {
  fail(`could not read generation at ${inPath} — put it there or pass --in.\n  (${err.message})`);
}
const image = { width: sheetPng.width, height: sheetPng.height, data: sheetPng.data };

const crop = values.crop
  ? values.crop.split(",").map((n) => Number.parseInt(n, 10))
  : [0, 0, image.width - 1, image.height - 1];
if (crop.length !== 4 || crop.some((n) => Number.isNaN(n))) fail("--crop must be x0,y0,x1,y1");
const [cx0, cy0, cx1, cy1] = crop;
const tile = cropImage(image, { x0: cx0, y0: cy0, x1: cx1, y1: cy1 });

const bg = sampleBackground(tile);
const { fg, bbox, enclosedBgCount } = keyBackground(tile, bg, tolerance);
if (!bbox) fail("no foreground found after keying — check --crop / --tolerance and the key color");

// Prompt-kit generations render each logical pixel as a large block (~30px), far above the tracer's
// default 4..16px pitch band. But we KNOW the intended output size: the subject's long axis should
// become `minLong..maxLong` logical cells. That pins the pitch to `bboxLong / [maxLong, minLong]`,
// which both lifts the search band to the right scale and rejects harmonics. Blocks are square, so
// the same band is used for both axes (each still gets its own detected phase).
const bboxLong = Math.max(bbox.x1 - bbox.x0 + 1, bbox.y1 - bbox.y0 + 1);
const pitchBand = { min: bboxLong / maxLong, max: bboxLong / minLong };

const px = values.pitch
  ? { pitch: Number.parseFloat(values.pitch), phase: 0, score: NaN }
  : detectPitch(tile, fg, "x", pitchBand);
const py = values["pitch-y"]
  ? { pitch: Number.parseFloat(values["pitch-y"]), phase: 0, score: NaN }
  : detectPitch(tile, fg, "y", pitchBand);

let grid = sampleCells(tile, fg, bbox, {
  pitchX: px.pitch,
  phaseX: px.phase,
  pitchY: py.pitch,
  phaseY: py.phase,
});
if (values.fit) {
  grid = scaleGrid(grid, Number.parseInt(values.fit, 10));
}
const gridRows = grid.length;
const gridCols = gridRows > 0 ? grid[0].length : 0;

// Preview quantization purely to REPORT the color budget and any off-ramp warnings; the shipped
// icon re-runs this exact chain at build (icon-source.mjs), so the numbers here match what ships.
const named = buildNamedPalette();
const quant = quantizeGrid(grid, named);
const { cells: peeledPreview, strippedCount } = stripExteriorInk(quant.cells, [
  "P.ink",
  "P.outline",
]);
const { cells: reducedPreview, merged } = reducePalette(peeledPreview, MAX_BODY_COLORS);
const { cells: cleanPreview, changed: despeckled } = despeckle(reducedPreview);
const usedRefs = new Set();
for (const row of cleanPreview) for (const cell of row) if (cell) usedRefs.add(cell.ref);
const budget = usedRefs.size + (usedRefs.has("P.ink") ? 0 : 1); // +1 for the re-derived outline ink

const errors = [];

// --- render the compact source (raw traced colors, transparent bg, one pixel per cell) ---

function gridToPixels(cells) {
  const height = cells.length;
  const width = height > 0 ? cells[0].length : 0;
  return {
    width,
    height,
    pixel: (x, y) => {
      const cell = cells[y][x];
      return cell ? [cell[0], cell[1], cell[2], 255] : [0, 0, 0, 0];
    },
  };
}

const compact = gridToPixels(grid);

// --- render the Stage-2 preview: exactly what `npm run art` will ship from this source ---

function draftPreview() {
  try {
    const canvas = createCanvas();
    paintSourceIcon(canvas, grid, { named });
    return { width: ICON_SIZE, height: ICON_SIZE, pixel: canvas.toPixelFn() };
  } catch (err) {
    // Grid too big for the drawable area, or over the legend budget — paintSourceIcon throws.
    errors.push(`build preview failed: ${err.message}`);
    return null;
  }
}
function upscale({ width, height, pixel }, scale) {
  return {
    width: width * scale,
    height: height * scale,
    pixel: (x, y) => pixel(Math.floor(x / scale), Math.floor(y / scale)),
  };
}

const preview = draftPreview();

// --- validations, measured against exactly what will ship ---

/** Opaque bounding box long axis of the rendered preview — the real number the fill lint checks. */
function renderedLongAxis({ pixel }) {
  let x0 = ICON_SIZE,
    y0 = ICON_SIZE,
    x1 = -1,
    y1 = -1;
  for (let y = 0; y < ICON_SIZE; y++)
    for (let x = 0; x < ICON_SIZE; x++) {
      if (pixel(x, y)[3] === 0) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  return x1 < 0 ? 0 : Math.max(x1 - x0 + 1, y1 - y0 + 1);
}

const renderedLong = preview ? renderedLongAxis(preview) : 0;
if (preview && renderedLong < 26) {
  errors.push(
    `rendered long axis ${renderedLong}px is under the 26px fill minimum. Regenerate the subject larger in frame, or re-run with --fit 28 to scale this source up.`,
  );
}
if (budget > 12) {
  errors.push(`projected color budget ${budget} exceeds the 12-color limit after quantization.`);
}
const touchesEdge =
  bbox.x0 === 0 || bbox.y0 === 0 || bbox.x1 === tile.width - 1 || bbox.y1 === tile.height - 1;
if (touchesEdge) {
  errors.push(
    "keyed subject touches the crop edge — a neighbour or label likely bled in; tighten --crop.",
  );
}

// --- report ---

console.log(`\ningest-icon: ${name}  (from ${inPath})`);
console.log(`  crop ${crop.join(",")}  →  keyed bbox ${bbox.x0},${bbox.y0}..${bbox.x1},${bbox.y1}`);
console.log(`  background ${bg.join(",")}   enclosed bg cells (holes): ${enclosedBgCount}`);
console.log(
  `  pitch x ${px.pitch.toFixed(2)} score ${Number.isNaN(px.score) ? "(manual)" : px.score.toFixed(3)}` +
    `   pitch y ${py.pitch.toFixed(2)} score ${Number.isNaN(py.score) ? "(manual)" : py.score.toFixed(3)}`,
);
console.log(
  `  compact grid ${gridCols}×${gridRows}${values.fit ? ` (fit ${values.fit})` : ""}  →  rendered long axis ${renderedLong}px (fill lint wants ≥26)`,
);
console.log(
  `  exterior ink stripped: ${strippedCount} cells (outline re-derived at build); despeckled ${despeckled} singleton cells`,
);
console.log(
  `  projected color budget: ${budget} / 12  (from ${quant.distinctCount} anti-aliased traced colors)`,
);
if (merged.length > 0) {
  console.log(
    `  palette reduced to ${MAX_BODY_COLORS} body colors — merged: ${merged.map((m) => `${m.from}→${m.to}`).join(", ")}`,
  );
}
console.log(`  quantization (traced → named, by frequency):`);
for (const r of quant.report) {
  console.log(
    `    ${r.hex} → ${r.ref.padEnd(14)} ×${String(r.count).padStart(3)}  dist ${r.distance.toFixed(1)}${r.warn ? "  ⚠ no faithful ramp" : ""}`,
  );
}

if (errors.length > 0) {
  console.error(`\n  ✗ ${errors.length} problem(s) — nothing written:`);
  for (const e of errors) console.error(`    - ${e}`);
  process.exit(1);
}

// --- write (only on success) ---

const sourcesDir = resolve(values.sources);
const previewDir = resolve(values.inbox, "preview");
await mkdir(sourcesDir, { recursive: true });
await mkdir(previewDir, { recursive: true });

async function write(dir, file, { width, height, pixel }) {
  await writeFile(resolve(dir, file), encodePng(width, height, pixel));
}

await write(sourcesDir, `${name}.png`, compact);
if (preview) {
  await write(previewDir, `${name}.png`, preview);
  await write(previewDir, `${name}@8x.png`, upscale(preview, 8));
}

console.log(`\n  ✓ wrote compact source scripts/art/icon-sources/${name}.png`);
console.log(`    preview (git-ignored): ${values.inbox}/preview/${name}.png and @8x`);
console.log(
  `  → add/switch the "${name}" entry in scripts/art/icons.mjs to { source: "${name}.png" }, then npm run art.\n`,
);
