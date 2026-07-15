import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import { writePng } from "./write-png.mjs";

/** Native pixel dimensions of one shipped backdrop layer (#263). */
export const BACKDROP_WIDTH = 160;
export const BACKDROP_HEIGHT = 120;
/** Three exact periods are used for mechanical and human review. */
export const REVIEW_PERIODS = 3;
export const LAYER_NAMES = ["sky", "mid", "near"];

const moduleDir = dirname(fileURLToPath(import.meta.url));
const defaultSourceDir = resolve(moduleDir, "backdrop-sources");
const layerAlpha = { sky: "opaque", mid: "binary", near: "binary" };

/** Production entries are deliberately empty until #293 supplies approved compact sources. */
export const backdrops = [];

export function renderPeriodicLayer(paint) {
  const width = BACKDROP_WIDTH * REVIEW_PERIODS;
  const data = new Uint8ClampedArray(width * BACKDROP_HEIGHT * 4);
  for (let y = 0; y < BACKDROP_HEIGHT; y++)
    for (let x = 0; x < width; x++) {
      const rgba = paint({ localX: x % BACKDROP_WIDTH, y });
      if (
        !Array.isArray(rgba) ||
        rgba.length !== 4 ||
        rgba.some((channel) => !Number.isInteger(channel) || channel < 0 || channel > 255)
      ) {
        throw new Error(
          `renderPeriodicLayer: painter returned malformed RGBA ${JSON.stringify(rgba)} at localX=${x % BACKDROP_WIDTH}, y=${y} (expected four integers 0-255)`,
        );
      }
      data.set(rgba, (y * width + x) * 4);
    }
  return { width, height: BACKDROP_HEIGHT, data };
}

export function assertHorizontalPeriod(image, period = BACKDROP_WIDTH) {
  const { width, height, data } = image;
  const periods = Math.floor(width / period);
  for (let y = 0; y < height; y++)
    for (let localX = 0; localX < period; localX++) {
      const baseAt = (y * width + localX) * 4;
      for (let k = 1; k < periods; k++) {
        const at = (y * width + localX + k * period) * 4;
        for (let channel = 0; channel < 4; channel++) {
          if (data[at + channel] !== data[baseAt + channel]) {
            throw new Error(
              `assertHorizontalPeriod: pixel mismatch at (${localX}, ${y}) — period 0 is ${JSON.stringify(Array.from(data.slice(baseAt, baseAt + 4)))} but period ${k} (x=${localX + k * period}) is ${JSON.stringify(Array.from(data.slice(at, at + 4)))}`,
            );
          }
        }
      }
    }
}

function assertLayers(def) {
  if (!def || typeof def !== "object")
    throw new Error("writeBackdrops: definition must be an object");
  if (!def.theme || typeof def.theme !== "string")
    throw new Error("writeBackdrops: theme is required");
  const declared = Object.keys(def.layers ?? {});
  const missing = LAYER_NAMES.filter((name) => !declared.includes(name));
  const extra = declared.filter((name) => !LAYER_NAMES.includes(name));
  if (missing.length)
    throw new Error(`writeBackdrops: ${def.theme} is missing layer(s) ${missing.join(", ")}`);
  if (extra.length)
    throw new Error(`writeBackdrops: ${def.theme} declares unknown layer(s) ${extra.join(", ")}`);
}

function validateSourceFilename(source) {
  if (
    typeof source !== "string" ||
    !source ||
    source !== source.trim() ||
    !/^[^/\\]+\.png$/i.test(source) ||
    source.includes("..")
  ) {
    throw new Error(
      `writeBackdrops: source filename ${JSON.stringify(source)} is missing or unsafe`,
    );
  }
}

export function validateBackdropDefinition(def) {
  assertLayers(def);
  if (def.kind !== "paint" && def.kind !== "source") {
    throw new Error(
      `writeBackdrops: ${def.theme} has missing or unknown kind ${JSON.stringify(def.kind)}`,
    );
  }
  for (const layerName of LAYER_NAMES) {
    const layer = def.layers[layerName];
    if (def.kind === "paint") {
      if (typeof layer !== "function")
        throw new Error(`writeBackdrops: ${def.theme}.${layerName} must be a painter function`);
      continue;
    }
    if (!layer || typeof layer !== "object" || Array.isArray(layer)) {
      throw new Error(`writeBackdrops: ${def.theme}.${layerName} must be a source layer object`);
    }
    validateSourceFilename(layer.source);
    if (layer.alpha !== layerAlpha[layerName]) {
      throw new Error(
        `writeBackdrops: ${def.theme}.${layerName} must declare alpha ${JSON.stringify(layerAlpha[layerName])}`,
      );
    }
    if (!Number.isInteger(layer.maxColors) || layer.maxColors <= 0) {
      throw new Error(
        `writeBackdrops: ${def.theme}.${layerName}.maxColors must be a positive integer`,
      );
    }
  }
  return def;
}

export function validateBackdropImage(image, { layerName, maxColors, label = layerName }) {
  if (image.width !== BACKDROP_WIDTH || image.height !== BACKDROP_HEIGHT) {
    throw new Error(
      `${label}: expected ${BACKDROP_WIDTH}x${BACKDROP_HEIGHT}, got ${image.width}x${image.height}`,
    );
  }
  const colors = new Set();
  for (let i = 0; i < image.data.length; i += 4) {
    const alpha = image.data[i + 3];
    if (layerName === "sky" && alpha !== 255) throw new Error(`${label}: sky must be fully opaque`);
    if (layerName !== "sky" && alpha !== 0 && alpha !== 255) {
      throw new Error(`${label}: ${layerName} requires binary alpha (0 or 255)`);
    }
    if (alpha !== 0) colors.add(`${image.data[i]},${image.data[i + 1]},${image.data[i + 2]}`);
  }
  if (colors.size > maxColors)
    throw new Error(`${label}: ${colors.size} recovered colors exceeds cap ${maxColors}`);
  return { colorCount: colors.size };
}

function sourceReview(image) {
  const width = BACKDROP_WIDTH * REVIEW_PERIODS;
  const data = new Uint8ClampedArray(width * BACKDROP_HEIGHT * 4);
  for (let y = 0; y < BACKDROP_HEIGHT; y++)
    for (let x = 0; x < width; x++) {
      const from = (y * BACKDROP_WIDTH + (x % BACKDROP_WIDTH)) * 4;
      data.set(image.data.slice(from, from + 4), (y * width + x) * 4);
    }
  return { width, height: BACKDROP_HEIGHT, data };
}

async function prepareSourceDefinition(def, sourceDir) {
  const prepared = [];
  for (const layerName of LAYER_NAMES) {
    const layer = def.layers[layerName];
    const path = resolve(sourceDir, layer.source);
    let image;
    try {
      image = PNG.sync.read(await readFile(path));
    } catch (error) {
      throw new Error(
        `writeBackdrops: could not read ${def.theme}.${layerName} source ${path}: ${error.message}`,
      );
    }
    validateBackdropImage(image, {
      layerName,
      maxColors: layer.maxColors,
      label: `writeBackdrops: ${def.theme}.${layerName}`,
    });
    const review = sourceReview(image);
    assertHorizontalPeriod(review);
    prepared.push({ layerName, review });
  }
  return prepared;
}

function preparePaintDefinition(def) {
  return LAYER_NAMES.map((layerName) => {
    const review = renderPeriodicLayer(def.layers[layerName]);
    assertHorizontalPeriod(review);
    return { layerName, review };
  });
}

/** Writes validated source or painter definitions through the same deterministic PNG writer. */
export async function writeBackdrops(
  destDir,
  { registry = backdrops, sourceDir = defaultSourceDir } = {},
) {
  const seenThemes = new Set();
  for (const def of registry) {
    validateBackdropDefinition(def);
    if (seenThemes.has(def.theme))
      throw new Error(`writeBackdrops: duplicate theme ${JSON.stringify(def.theme)}`);
    seenThemes.add(def.theme);
    const prepared =
      def.kind === "source"
        ? await prepareSourceDefinition(def, sourceDir)
        : preparePaintDefinition(def);
    for (const { layerName, review } of prepared) {
      await writePng(
        `${destDir}/${def.theme}-${layerName}.png`,
        BACKDROP_WIDTH,
        BACKDROP_HEIGHT,
        (x, y) => {
          const at = (y * review.width + x) * 4;
          return [review.data[at], review.data[at + 1], review.data[at + 2], review.data[at + 3]];
        },
      );
    }
  }
}
