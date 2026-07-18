import { mkdir, rename, rm, writeFile, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { PNG } from "pngjs";
import {
  BACKDROP_HEIGHT,
  BACKDROP_WIDTH,
  FISHING_VARIANT,
  INGEST_LAYER_NAMES,
  REVIEW_PERIODS,
  backdrops,
  validateBackdropDefinition,
  validateBackdropImage,
} from "./backdrops.mjs";
import {
  conformCellPaletteToHslGamut,
  cropImage,
  detectPitch,
  keyBackground,
  normalizeCellPalette,
  sampleBackground,
  sampleCells,
} from "./trace-core.mjs";
import { encodePng } from "./write-png.mjs";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const defaultInbox = resolve(moduleDir, "backdrop-gen-inbox");
const defaultSources = resolve(moduleDir, "backdrop-sources");

function options() {
  return parseArgs({
    options: {
      theme: { type: "string" },
      layer: { type: "string" },
      in: { type: "string" },
      crop: { type: "string" },
      tolerance: { type: "string", default: "40" },
      pitch: { type: "string" },
      "pitch-y": { type: "string" },
    },
  }).values;
}

function parseCrop(value, image) {
  if (!value) return { x0: 0, y0: 0, x1: image.width - 1, y1: image.height - 1 };
  const values = value.split(",").map(Number);
  if (values.length !== 4 || values.some((n) => !Number.isInteger(n)))
    throw new Error("--crop must be x0,y0,x1,y1");
  const [x0, y0, x1, y1] = values;
  if (x0 < 0 || y0 < 0 || x1 < x0 || y1 < y0 || x1 >= image.width || y1 >= image.height) {
    throw new Error("--crop is outside the input image");
  }
  return { x0, y0, x1, y1 };
}

function definitionFor(registry, theme, layer) {
  const isVariantLayer = layer === "near-fishing";
  const def = registry.find((candidate) => {
    if (candidate.theme !== theme) return false;
    if (isVariantLayer) return candidate.variant === FISHING_VARIANT;
    return candidate.variant === undefined;
  });
  if (!def) {
    const hint = isVariantLayer
      ? `add a variant: ${FISHING_VARIANT} source definition before ingesting`
      : "add its kind: source definition before ingesting";
    throw new Error(`${theme} is not registered; ${hint}`);
  }
  validateBackdropDefinition(def);
  if (def.kind !== "source")
    throw new Error(`${theme} is kind: paint; backdrop ingest requires kind: source`);
  return def;
}

function allForeground(image) {
  return {
    fg: new Uint8Array(image.width * image.height).fill(1),
    bbox: { x0: 0, y0: 0, x1: image.width - 1, y1: image.height - 1 },
    enclosedBgCount: 0,
  };
}

function fullGridBBox(image) {
  return { x0: 0, y0: 0, x1: image.width - 1, y1: image.height - 1 };
}

function gridToImage(cells) {
  const height = cells.length;
  const width = height === 0 ? 0 : cells[0].length;
  if (!width || cells.some((row) => row.length !== width))
    throw new Error("recovered a non-rectangular or empty grid");
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const at = (y * width + x) * 4;
      const cell = cells[y][x];
      if (!cell) continue;
      data[at] = cell[0];
      data[at + 1] = cell[1];
      data[at + 2] = cell[2];
      data[at + 3] = 255;
    }
  return { width, height, data };
}

function assertExactGrid(cells) {
  const height = cells.length;
  const width = height === 0 ? 0 : cells[0].length;
  if (!width || cells.some((row) => row.length !== width))
    throw new Error("recovered a non-rectangular or empty grid");
  if (width !== BACKDROP_WIDTH || height !== BACKDROP_HEIGHT) {
    throw new Error(
      `recovered grid is ${width}x${height}; expected exactly ${BACKDROP_WIDTH}x${BACKDROP_HEIGHT}`,
    );
  }
}

function preview(image, periods = 1) {
  return encodePng(image.width * periods, image.height, (x, y) => {
    const at = (y * image.width + (x % image.width)) * 4;
    return [image.data[at], image.data[at + 1], image.data[at + 2], image.data[at + 3]];
  });
}

/** Pure Stage-1 recovery used by the CLI and synthetic fixture tests. */
/** @param {any} input */
export function prepareBackdropIngest(input) {
  const {
    image,
    theme,
    layer,
    registry = backdrops,
    crop = undefined,
    tolerance = 40,
    pitch = undefined,
    pitchY = undefined,
  } = input;
  if (!INGEST_LAYER_NAMES.includes(layer))
    throw new Error(
      `unknown layer ${JSON.stringify(layer)}; expected ${INGEST_LAYER_NAMES.join(", ")}`,
    );
  const def = definitionFor(registry, theme, layer);
  const target = def.layers[layer];
  const tile = cropImage(image, crop ?? parseCrop(undefined, image));
  const keyed =
    layer === "sky"
      ? allForeground(tile)
      : keyBackground(tile, sampleBackground(tile), tolerance, { keyEnclosed: true });
  if (!keyed.bbox) throw new Error("no foreground found after keying — check --crop / --tolerance");
  const pitchBand = {
    min: Math.min(tile.width / (BACKDROP_WIDTH + 2), tile.height / (BACKDROP_HEIGHT + 2)),
    max: Math.max(tile.width / (BACKDROP_WIDTH - 2), tile.height / (BACKDROP_HEIGHT - 2)),
    pitchStep: 0.05,
  };
  const px = pitch
    ? { pitch, phase: 0, score: "manual" }
    : detectPitch(tile, keyed.fg, "x", pitchBand);
  const py = pitchY
    ? { pitch: pitchY, phase: 0, score: "manual" }
    : detectPitch(tile, keyed.fg, "y", pitchBand);
  const sampledCells = sampleCells(tile, keyed.fg, fullGridBBox(tile), {
    pitchX: px.pitch,
    phaseX: px.phase,
    pitchY: py.pitch,
    phaseY: py.phase,
  });
  try {
    assertExactGrid(sampledCells);
  } catch (error) {
    throw new Error(
      `${error.message} (detected pitch ${px.pitch.toFixed(2)}×${py.pitch.toFixed(2)}). Adjust --crop, --pitch, or --pitch-y; do not resize or downsample the raw raster.`,
    );
  }
  const conformed = conformCellPaletteToHslGamut(sampledCells, def.gamut);
  const normalized = normalizeCellPalette(conformed.cells, {
    maxColors: target.maxColors,
  });
  const compact = gridToImage(normalized.cells);
  const { colorCount } = validateBackdropImage(compact, {
    layerName: layer,
    maxColors: target.maxColors,
    gamut: def.gamut,
    label: `ingest-backdrop: ${theme}-${layer}`,
  });
  let originalToFinalChanged = 0;
  for (let y = 0; y < sampledCells.length; y++)
    for (let x = 0; x < sampledCells[y].length; x++) {
      const original = sampledCells[y][x];
      const final = normalized.cells[y][x];
      if (original === null && final === null) continue;
      if (
        original === null ||
        final === null ||
        original[0] !== final[0] ||
        original[1] !== final[1] ||
        original[2] !== final[2]
      ) {
        originalToFinalChanged++;
      }
    }
  return {
    compact,
    colorCount,
    report: {
      crop: `${tile.width}x${tile.height}`,
      pitchX: px,
      pitchY: py,
      enclosedBgCount: keyed.enclosedBgCount,
      sampledColors: conformed.inputColorCount,
      gamutConformedColors: conformed.outputColorCount,
      normalizedColors: normalized.outputColorCount,
      maxColors: target.maxColors,
      gamutChangedCellCount: conformed.changedCellCount,
      normalizationChangedCellCount: normalized.changedCellCount,
      changedCellCount: originalToFinalChanged,
    },
  };
}

async function atomicWrite(path, buffer) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}-${Math.random().toString(16).slice(2)}`;
  try {
    await writeFile(temporary, buffer);
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

/** Writes the compact source and its previews only after deriving every buffer from one compact image. */
export async function writeBackdropIngestArtifacts({ sourcePath, oneXPath, stripPath, compact }) {
  const oneX = preview(compact);
  const strip = preview(compact, REVIEW_PERIODS);
  await atomicWrite(sourcePath, oneX);
  await atomicWrite(oneXPath, oneX);
  await atomicWrite(stripPath, strip);
}

export async function main(values = options(), { registry = backdrops } = {}) {
  if (!values.theme) throw new Error("--theme <theme> is required");
  if (!values.layer) throw new Error("--layer <sky|mid|near|near-fishing> is required");
  if (!INGEST_LAYER_NAMES.includes(values.layer))
    throw new Error(`--layer must be one of ${INGEST_LAYER_NAMES.join(", ")}`);
  const tolerance = Number(values.tolerance);
  const pitch = values.pitch === undefined ? undefined : Number(values.pitch);
  const pitchY = values["pitch-y"] === undefined ? undefined : Number(values["pitch-y"]);
  if (
    !Number.isInteger(tolerance) ||
    tolerance < 0 ||
    (pitch !== undefined && (!Number.isInteger(pitch) || pitch <= 0)) ||
    (pitchY !== undefined && (!Number.isInteger(pitchY) || pitchY <= 0))
  ) {
    throw new Error(
      "--tolerance must be a non-negative integer; --pitch and --pitch-y must be positive integers",
    );
  }
  const rawPath = resolve(values.in ?? `${defaultInbox}/${values.theme}-${values.layer}.png`);
  let image;
  try {
    image = PNG.sync.read(await readFile(rawPath));
  } catch (error) {
    throw new Error(
      `could not read generation at ${rawPath} — put the untouched raw there or pass --in. (${error.message})`,
    );
  }
  const crop = parseCrop(values.crop, image);
  const result = prepareBackdropIngest({
    image,
    theme: values.theme,
    layer: values.layer,
    registry,
    crop,
    tolerance,
    pitch,
    pitchY,
  });
  const sourcePath = resolve(defaultSources, `${values.theme}-${values.layer}.png`);
  const previewDir = resolve(defaultInbox, "preview");
  await writeBackdropIngestArtifacts({
    sourcePath,
    oneXPath: resolve(previewDir, `${values.theme}-${values.layer}@1x.png`),
    stripPath: resolve(previewDir, `${values.theme}-${values.layer}@3x-strip.png`),
    compact: result.compact,
  });
  console.log(
    `ingest-backdrop: ${values.theme}-${values.layer}\n  input: ${rawPath}\n  grid: ${result.compact.width}x${result.compact.height}\n  cells: ${result.report.sampledColors} sampled -> ${result.report.gamutConformedColors} gamut-conformed (${result.report.gamutChangedCellCount} cells changed) -> ${result.report.normalizedColors} normalized (ceiling ${result.report.maxColors}, ${result.report.normalizationChangedCellCount} normalization changes, ${result.report.changedCellCount} original-to-final changes)\n  pitch: ${result.report.pitchX.pitch.toFixed(2)} × ${result.report.pitchY.pitch.toFixed(2)}\n  wrote compact source: ${sourcePath}\n  previews (ignored): ${resolve(previewDir, `${values.theme}-${values.layer}@1x.png`)} and @3x-strip`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`ingest-backdrop: ${error.message}`);
    process.exitCode = 1;
  });
}
