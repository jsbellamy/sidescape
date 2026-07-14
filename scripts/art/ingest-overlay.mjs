import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { PNG } from "pngjs";
import {
  cropImage,
  despeckle,
  detectPitch,
  keyBackground,
  sampleBackground,
  sampleCells,
  quantizeGrid,
} from "./trace-core.mjs";
import { masterPalette, materialPalettes, zonePalettes } from "./palettes.mjs";
import { encodePng } from "./write-png.mjs";

/**
 * Recover a chunky-pixel generated subject and compose it onto the transparent player-plane
 * canvas. Unlike ingest-icon this deliberately has no icon canvas, palette budget, or exterior
 * ink pass: overlays are small pieces of scene art, bottom-anchored at the ground line.
 *
 * node scripts/art/ingest-overlay.mjs --name activity-anvil-near \
 *   --in scripts/art/icon-gen-inbox/activity-anvil-near.png --place 48,50 --fit 14,10
 */
const { values } = parseArgs({
  options: {
    name: { type: "string" },
    in: { type: "string" },
    inbox: { type: "string", default: "scripts/art/icon-gen-inbox" },
    out: { type: "string", default: "src/assets/activity-overlays" },
    crop: { type: "string" },
    tolerance: { type: "string", default: "40" },
    pitch: { type: "string" },
    "pitch-y": { type: "string" },
    place: { type: "string" },
    fit: { type: "string" },
  },
});

function fail(message) {
  console.error(`ingest-overlay: ${message}`);
  process.exit(1);
}

if (!values.name) fail("--name <overlay-name> is required");
if (!values.place) fail("--place x,groundY is required");
const [placeX, groundY] = values.place.split(",").map(Number);
if (!Number.isInteger(placeX) || !Number.isInteger(groundY))
  fail("--place must be integer x,groundY");
const inPath = resolve(values.in ?? `${values.inbox}/${values.name}.png`);

let decoded;
try {
  decoded = PNG.sync.read(readFileSync(inPath));
} catch (error) {
  fail(`could not read ${inPath} (${error.message})`);
}
const image = { width: decoded.width, height: decoded.height, data: decoded.data };
const crop = values.crop
  ? values.crop.split(",").map(Number)
  : [0, 0, image.width - 1, image.height - 1];
if (crop.length !== 4 || crop.some((value) => !Number.isInteger(value))) {
  fail("--crop must be integer x0,y0,x1,y1");
}
const tile = cropImage(image, { x0: crop[0], y0: crop[1], x1: crop[2], y1: crop[3] });
const background = sampleBackground(tile);
const { fg, bbox } = keyBackground(tile, background, Number(values.tolerance), {
  keyEnclosed: true,
});
if (!bbox) fail("no foreground found after background keying");

const bboxLong = Math.max(bbox.x1 - bbox.x0 + 1, bbox.y1 - bbox.y0 + 1);
const fit = values.fit?.split(",").map(Number);
if (fit && (fit.length !== 2 || fit.some((value) => !Number.isInteger(value) || value < 1))) {
  fail("--fit must be integer width,height when provided");
}
// Omitted --fit keeps the recovered generation's native grid. A 24px expected long side keeps the
// pitch detector in the same icon-scale range while still accepting the pinned CLI form in #141.
const intendedLong = fit ? Math.max(...fit) : 24;
const pitchBand = {
  min: bboxLong / (intendedLong + 4),
  max: bboxLong / Math.max(1, intendedLong - 4),
};
const pitchX = values.pitch
  ? { pitch: Number(values.pitch), phase: 0 }
  : detectPitch(tile, fg, "x", pitchBand);
const pitchY = values["pitch-y"]
  ? { pitch: Number(values["pitch-y"]), phase: 0 }
  : detectPitch(tile, fg, "y", pitchBand);
let grid = sampleCells(tile, fg, bbox, {
  pitchX: pitchX.pitch,
  phaseX: pitchX.phase,
  pitchY: pitchY.pitch,
  phaseY: pitchY.phase,
});
if (fit) grid = resizeGrid(grid, fit[0], fit[1]);
// This skips icon-only outline stripping but still locks scene art to the town palette. Fishing
// additionally gets water highlights for a neutral ripple: twelve named colors at most.
const overlayPalette = [
  ...masterPalette
    .filter(([name]) => ["ink", "outline", "shadow"].includes(name))
    .map(([name, hex]) => ({ ref: `P.${name}`, rgb: hexToRgb(hex) })),
  ...zonePalettes.town.map((hex, index) => ({ ref: `town[${index}]`, rgb: hexToRgb(hex) })),
  ...["base", "light", "glint"].map((role) => ({
    ref: `water.${role}`,
    rgb: hexToRgb(materialPalettes.water[role]),
  })),
];
grid = despeckle(quantizeGrid(grid, overlayPalette).cells).cells;

const CANVAS_W = 80;
const CANVAS_H = 60;
const top = groundY - grid.length;
if (placeX < 0 || top < 0 || placeX + grid[0].length > CANVAS_W || groundY > CANVAS_H) {
  fail(
    `placed ${grid[0].length}×${grid.length} subject does not fit the 80×60 canvas at ${placeX},${groundY}`,
  );
}
const pixel = (x, y) => {
  const localX = x - placeX;
  const localY = y - top;
  const color = grid[localY]?.[localX];
  return color ? [...color.rgb, 255] : [0, 0, 0, 0];
};
const output = resolve(values.out, `${values.name}.png`);
await mkdir(resolve(values.out), { recursive: true });
await writeFile(output, encodePng(CANVAS_W, CANVAS_H, pixel));
console.log(
  `ingest-overlay: wrote ${output} (${grid[0].length}×${grid.length} at ${placeX},${groundY})`,
);

function resizeGrid(source, width, height) {
  const sourceHeight = source.length;
  const sourceWidth = source[0]?.length ?? 0;
  if (sourceWidth === 0 || sourceHeight === 0)
    fail("traced generation produced an empty pixel grid");
  return Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => {
      const sourceY = Math.min(sourceHeight - 1, Math.floor((y * sourceHeight) / height));
      const sourceX = Math.min(sourceWidth - 1, Math.floor((x * sourceWidth) / width));
      return source[sourceY][sourceX];
    }),
  );
}

function hexToRgb(hex) {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}
