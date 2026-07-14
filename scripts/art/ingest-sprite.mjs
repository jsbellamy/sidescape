import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { PNG } from "pngjs";
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
} from "./trace-core.mjs";
import { sprites } from "./sprites.mjs";
import { encodePng } from "./write-png.mjs";

/**
 * Stage 1 of the source-driven COMBAT SPRITE pipeline (#264), the sibling of `ingest-icon.mjs`.
 *
 * Until now there was no sprite ingest at all: every source under `sprite-sources/` was either a
 * crop of a CC0 tile sheet or a hand-reconstruction of a generation, eyeballed pixel by pixel into
 * a 32x32 canvas. That hand step — not the build — is what flattened the rendered player: a
 * generation carrying a ~110px-tall character was redrawn by eye at 32px.
 *
 * This recovers the generation's OWN pixel grid instead of redrawing it. A generation is chunky
 * pixel art on a flat key-color background, so its pseudo-pixels are exact and recoverable: key the
 * background out, detect the pitch (the pseudo-pixel size in real pixels), and majority-vote each
 * cell. That is lossless with respect to the art the model actually drew — no averaging, no
 * resampling, no interpretation. The only lossy stage left is the Stage-2 palette projection in
 * `writeSprites`, which is the house style and is meant to be lossy.
 *
 * The generation must therefore be a FULL-BODY character on a FLAT, SATURATED background (magenta
 * works) with no scene behind it. A lit scene render — a character standing in a sewer, however
 * gorgeous — cannot be keyed, and area-averaging it into 48px would produce exactly the mush this
 * pipeline exists to avoid.
 *
 * The sprite is bottom-anchored on its canvas (characters stand on the combat scene's ground plane;
 * a vertically centred sprite floats) and horizontally centred.
 *
 *   node scripts/art/ingest-sprite.mjs --name player \
 *     [--in scripts/art/sprite-gen-inbox/player.png] [--size 48] \
 *     [--crop x0,y0,x1,y1] [--tolerance 40] [--pitch N --pitch-y N]
 *
 * Writes the compact source to `scripts/art/sprite-sources/sprite-<name>.png` (the only committed
 * artifact) plus a git-ignored 8x preview rendered through the exact Stage-2 build path, so what
 * you review is what `npm run art` will ship.
 */

const { values } = parseArgs({
  options: {
    name: { type: "string" },
    in: { type: "string" }, // defaults to <inbox>/<name>.png
    inbox: { type: "string", default: "scripts/art/sprite-gen-inbox" },
    sources: { type: "string", default: "scripts/art/sprite-sources" },
    out: { type: "string", default: "scripts/art/sprite-gen-out" },
    size: { type: "string" }, // defaults to the registry entry's declared canvas
    crop: { type: "string" }, // "x0,y0,x1,y1" inclusive; defaults to the whole image
    tolerance: { type: "string", default: "40" }, // key colors are flat + saturated → generous
    pitch: { type: "string" },
    "pitch-y": { type: "string" },
    "min-long": { type: "string" }, // defaults to size - 8
    "max-long": { type: "string" }, // defaults to size
    flip: { type: "boolean" }, // mirror horizontally (a generation drawn facing left)
  },
});

function fail(message) {
  console.error(`ingest-sprite: ${message}`);
  process.exit(1);
}

const name = values.name;
if (!name) fail("--name is required (the registry id, e.g. player)");

const entry = sprites.find((s) => s.name === name);
if (!entry) {
  fail(`${name} is not in the sprite registry (scripts/art/sprites.mjs) — add it there first`);
}

const size = values.size ? Number(values.size) : entry.size;
if (size !== 32 && size !== 48) fail(`--size must be 32 or 48 (got ${values.size})`);

const inPath = resolve(values.in ?? `${values.inbox}/${name}.png`);
const image = PNG.sync.read(readFileSync(inPath));

const cropped = values.crop
  ? cropImage(
      image,
      (([x0, y0, x1, y1]) => ({ x0, y0, x1, y1 }))(values.crop.split(",").map(Number)),
    )
  : image;

// Key the flat background out, then recover the generation's own pseudo-pixel grid.
// `keyEnclosed` matches the icon ingest: the key color is a saturated magenta no subject ever uses,
// so a hole the flood cannot reach from the border (the gap under a sword arm, between the legs)
// is still background and must key out, not quantize into a body color.
const bg = sampleBackground(cropped);
const { fg, bbox } = keyBackground(cropped, bg, Number(values.tolerance), { keyEnclosed: true });
if (!bbox) fail("keyed out the entire image — check --crop and --tolerance");

// The subject fills the canvas, so its keyed bbox long axis IS ~`size` logical cells. That pins the
// pitch search to `bboxLong / [maxLong, minLong]` instead of trusting a blind frequency peak.
const maxLong = values["max-long"] ? Number(values["max-long"]) : size;
const minLong = values["min-long"] ? Number(values["min-long"]) : size - 8;
const bboxLong = Math.max(bbox.x1 - bbox.x0 + 1, bbox.y1 - bbox.y0 + 1);
const pitchBand = { min: bboxLong / maxLong, max: bboxLong / minLong };

const px = values.pitch
  ? { pitch: Number(values.pitch), phase: bbox.x0 }
  : detectPitch(cropped, fg, "x", pitchBand);
const py = values["pitch-y"]
  ? { pitch: Number(values["pitch-y"]), phase: bbox.y0 }
  : detectPitch(cropped, fg, "y", pitchBand);

let cells = sampleCells(cropped, fg, bbox, {
  pitchX: px.pitch,
  phaseX: px.phase,
  pitchY: py.pitch,
  phaseY: py.phase,
});

// Opt-in mirror, for a generation that came out facing the wrong way. The player faces LEFT (the
// committed source puts every blade pixel in its left half, and the Monster stands to her left), so
// a generation already drawn facing left needs no flip. Mirroring a recovered grid is free and
// lossless, and far safer than asking the model to redraw a mirrored pose.
if (values.flip) cells = cells.map((row) => [...row].reverse());

const gridH = cells.length;
const gridW = gridH > 0 ? cells[0].length : 0;
if (gridW === 0 || gridH === 0) {
  fail("recovered an empty grid — the key/pitch detection found nothing; check --tolerance");
}
if (gridW > size || gridH > size) {
  fail(
    `recovered grid is ${gridW}x${gridH}, larger than the ${size}x${size} canvas — the generation ` +
      `has more pseudo-pixels than the canvas can hold. Regenerate it chunkier, or raise --size.`,
  );
}
// Characters stand on the ground plane: bottom-anchor, horizontally centre.
const offX = Math.floor((size - gridW) / 2);
const offY = size - gridH;

const source = encodePng(size, size, (x, y) => {
  const cell = cells[y - offY]?.[x - offX];
  return cell ? [...cell, 255] : [0, 0, 0, 0];
});
await mkdir(resolve(values.sources), { recursive: true });
await writeFile(resolve(`${values.sources}/sprite-${name}.png`), source);

// Preview through the EXACT Stage-2 path writeSprites uses, so review matches what ships.
const named = buildNamedPalette({
  materialRampNames: entry.materialRampNames,
  zoneNames: entry.zoneNames,
});
const grid = [];
for (let y = 0; y < size; y++) {
  const row = [];
  for (let x = 0; x < size; x++) {
    const cell = cells[y - offY]?.[x - offX];
    row.push(cell ? [...cell] : null);
  }
  grid.push(row);
}
const { cells: quantized } = quantizeGrid(grid, named);
const { cells: reduced } = reducePalette(quantized, entry.maxColors ?? 12);
const { cells: finished } = despeckle(reduced, entry.despecklePasses ?? 3);

const SCALE = 8;
await mkdir(resolve(values.out), { recursive: true });
await writeFile(
  resolve(`${values.out}/${name}-preview-8x.png`),
  encodePng(size * SCALE, size * SCALE, (x, y) => {
    const cell = finished[Math.floor(y / SCALE)][Math.floor(x / SCALE)];
    return cell ? [...cell.rgb, 255] : [0, 0, 0, 0];
  }),
);

const shipped = new Set();
for (const row of finished) for (const cell of row) if (cell) shipped.add(cell.ref);
console.log(
  `ingest-sprite: ${name} — pitch ${px.pitch.toFixed(2)}x${py.pitch.toFixed(2)}, grid ${gridW}x${gridH} ` +
    `on a ${size}x${size} canvas, ${shipped.size} shipped colors ` +
    `(budget ${entry.maxColors ?? 12}, despeckle ${entry.despecklePasses ?? 3})\n` +
    `  source:  ${values.sources}/sprite-${name}.png\n` +
    `  preview: ${values.out}/${name}-preview-8x.png`,
);
