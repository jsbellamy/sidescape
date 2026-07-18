import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import { isRgbWithinHslGamut, rgbToHsl, validateHslGamut } from "./trace-core.mjs";
import { writePng } from "./write-png.mjs";

/** Native pixel dimensions of one shipped backdrop layer (#263). */
export const BACKDROP_WIDTH = 160;
export const BACKDROP_HEIGHT = 120;
/** Three exact periods are used for mechanical and human review. */
export const REVIEW_PERIODS = 3;
export const LAYER_NAMES = ["sky", "mid", "near"];
export const VARIANT_LAYER_NAMES = ["near-fishing"];
/** Layers accepted by backdrop ingest (`sky`/`mid`/`near` plus variant names). */
export const INGEST_LAYER_NAMES = [...LAYER_NAMES, ...VARIANT_LAYER_NAMES];
export const FISHING_VARIANT = "fishing";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const defaultSourceDir = resolve(moduleDir, "backdrop-sources");
const layerAlpha = { sky: "opaque", mid: "binary", near: "binary", "near-fishing": "binary" };

function entryKey(def) {
  return `${def.theme}:${def.variant ?? ""}`;
}

function isFishingVariantEntry(def) {
  return def.variant === FISHING_VARIANT;
}

function layerNamesFor(def) {
  return isFishingVariantEntry(def) ? VARIANT_LAYER_NAMES : LAYER_NAMES;
}

/** Approved compact sources; source layers are validated before every deterministic build. */
export const backdrops = [
  {
    theme: "glacier",
    kind: "source",
    gamut: {
      neutralMaxSaturation: 20,
      chromaticHueRange: [175, 240],
      chromaticMaxSaturation: 65,
    },
    layers: {
      sky: { source: "glacier-sky.png", alpha: "opaque", maxColors: 48 },
      mid: { source: "glacier-mid.png", alpha: "binary", maxColors: 64 },
      near: { source: "glacier-near.png", alpha: "binary", maxColors: 48 },
    },
  },
  {
    theme: "workshop",
    kind: "source",
    gamut: {
      neutralMaxSaturation: 20,
      chromaticHueRange: [15, 45],
      chromaticMaxSaturation: 65,
    },
    layers: {
      sky: { source: "workshop-sky.png", alpha: "opaque", maxColors: 48 },
      mid: { source: "workshop-mid.png", alpha: "binary", maxColors: 64 },
      near: { source: "workshop-near.png", alpha: "binary", maxColors: 48 },
    },
  },
];

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
  if (def.variant !== undefined && def.variant !== FISHING_VARIANT) {
    throw new Error(
      `writeBackdrops: ${def.theme} has unknown variant ${JSON.stringify(def.variant)}`,
    );
  }
  const expected = layerNamesFor(def);
  const declared = Object.keys(def.layers ?? {});
  const missing = expected.filter((name) => !declared.includes(name));
  const extra = declared.filter((name) => !expected.includes(name));
  const label = isFishingVariantEntry(def) ? `${def.theme} (variant: fishing)` : def.theme;
  if (missing.length)
    throw new Error(`writeBackdrops: ${label} is missing layer(s) ${missing.join(", ")}`);
  if (extra.length)
    throw new Error(`writeBackdrops: ${label} declares unknown layer(s) ${extra.join(", ")}`);
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
  if (def.kind === "paint") {
    if (def.gamut !== undefined) {
      throw new Error(`writeBackdrops: ${def.theme} painter definition must not declare gamut`);
    }
  } else {
    if (def.gamut === undefined) {
      throw new Error(`writeBackdrops: ${def.theme} source definition requires gamut`);
    }
    validateHslGamut(def.gamut, { label: `writeBackdrops: ${def.theme}.gamut` });
  }
  for (const layerName of layerNamesFor(def)) {
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

function formatHslChannel(value) {
  return String(Number(value.toFixed(3)));
}

function describeHslGamutRule(gamut) {
  const [minHue, maxHue] = gamut.chromaticHueRange;
  return `allowed saturation <= ${gamut.neutralMaxSaturation}% OR hue ${minHue}..${maxHue} and saturation <= ${gamut.chromaticMaxSaturation}%`;
}

export function validateBackdropImage(image, { layerName, maxColors, gamut, label = layerName }) {
  if (image.width !== BACKDROP_WIDTH || image.height !== BACKDROP_HEIGHT) {
    throw new Error(
      `${label}: expected ${BACKDROP_WIDTH}x${BACKDROP_HEIGHT}, got ${image.width}x${image.height}`,
    );
  }
  if (gamut === undefined) {
    throw new Error(`${label}: gamut is required`);
  }
  validateHslGamut(gamut, { label: `${label} gamut` });
  const colors = new Set();
  for (let y = 0; y < image.height; y++)
    for (let x = 0; x < image.width; x++) {
      const i = (y * image.width + x) * 4;
      const alpha = image.data[i + 3];
      if (layerName === "sky" && alpha !== 255)
        throw new Error(`${label}: sky must be fully opaque`);
      if (layerName !== "sky" && alpha !== 0 && alpha !== 255) {
        throw new Error(`${label}: ${layerName} requires binary alpha (0 or 255)`);
      }
      if (alpha === 0) continue;
      const rgb = [image.data[i], image.data[i + 1], image.data[i + 2]];
      colors.add(rgb.join(","));
      if (!isRgbWithinHslGamut(rgb, gamut)) {
        const { h, s, l } = rgbToHsl(rgb);
        throw new Error(
          `${label}: out-of-gamut pixel at (${x}, ${y}): RGB [${rgb.join(", ")}], HSL [${formatHslChannel(h)}, ${formatHslChannel(s)}%, ${formatHslChannel(l)}%]; ${describeHslGamutRule(gamut)}`,
        );
      }
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
  for (const layerName of layerNamesFor(def)) {
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
      gamut: def.gamut,
      label: `writeBackdrops: ${def.theme}.${layerName}`,
    });
    const review = sourceReview(image);
    assertHorizontalPeriod(review);
    prepared.push({ layerName, review });
  }
  return prepared;
}

function preparePaintDefinition(def) {
  return layerNamesFor(def).map((layerName) => {
    const review = renderPeriodicLayer(def.layers[layerName]);
    assertHorizontalPeriod(review);
    return { layerName, review };
  });
}

/**
 * Writes validated source or painter definitions through the same deterministic PNG writer.
 * @param {string} destDir
 * @param {{registry?: any[], sourceDir?: string}} [options]
 */
export async function writeBackdrops(
  destDir,
  { registry = backdrops, sourceDir = defaultSourceDir } = {},
) {
  const seenEntries = new Set();
  for (const def of registry) {
    validateBackdropDefinition(def);
    const key = entryKey(def);
    if (seenEntries.has(key))
      throw new Error(
        `writeBackdrops: duplicate entry for theme ${JSON.stringify(def.theme)} variant ${JSON.stringify(def.variant ?? null)}`,
      );
    seenEntries.add(key);
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
