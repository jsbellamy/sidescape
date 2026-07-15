import { hex, writePng } from "./write-png.mjs";
import { P, zonePalettes } from "./palettes.mjs";

/** Native pixel dimensions of one shipped backdrop layer (#263). */
export const BACKDROP_WIDTH = 160;
export const BACKDROP_HEIGHT = 120;

/** How many horizontal repeats of a layer's 160px tile the review render works across before
 * `assertHorizontalPeriod` checks it and the first period is cropped for shipping. */
export const REVIEW_PERIODS = 3;

const LAYER_NAMES = ["sky", "mid", "near"];

/**
 * Production backdrop registry. Glacier is the first generated production scene (#293); the other
 * five existing themes intentionally remain untouched hand-assembled files.
 *
 * Each entry has the shape:
 *   {
 *     theme: "glacier",
 *     layers: {
 *       sky:  ({ localX, y }) => [r, g, b, a],
 *       mid:  ({ localX, y }) => [r, g, b, a],
 *       near: ({ localX, y }) => [r, g, b, a],
 *     },
 *   }
 */
const [deep, shadow, base, light, snow, glint] = zonePalettes.glacier.map(hex);
const ink = hex(P.ink);
const outline = hex(P.outline);

const between = (value, low, high) => value >= low && value <= high;
const stripe = (localX, phase, width) => (localX - phase + BACKDROP_WIDTH) % BACKDROP_WIDTH < width;

/** Flat, clustered polar atmosphere: thin high clouds and a low snow-haze band. */
function paintGlacierSky({ localX, y }) {
  if (stripe(localX, 16, 31) && between(y, 16, 18)) return snow;
  if (stripe(localX, 75, 23) && between(y, 27, 29)) return light;
  if (stripe(localX, 118, 27) && between(y, 39, 41)) return snow;
  if (stripe(localX, 43, 16) && between(y, 63, 65)) return light;
  if (between(y, 84, 87) && (localX + y * 3) % 11 < 3) return snow;
  if (y < 24) return deep;
  if (y < 48) return shadow;
  if (y < 76) return base;
  if (y < 96) return light;
  if (y < 106) return snow;
  return y < 116 ? snow : glint;
}

/** Distant glacier faces, including a broken central ice ridge. */
function paintGlacierMid({ localX, y }) {
  const far = 83 - Math.max(0, 48 - Math.abs(localX - 26)) / 3;
  const east = 88 - Math.max(0, 43 - Math.abs(localX - 132)) / 4;
  const brokenRidge = 58 + Math.abs(localX - 79) / 2.6 + ((localX * 7) % 19 < 5 ? 4 : 0);
  const summit = Math.min(far, east, brokenRidge);
  if (y < summit) return [0, 0, 0, 0];
  if (y < summit + 5) return shadow;
  if (between(localX, 66, 94) && y < brokenRidge + 16) {
    if (between(localX, 77, 84) && y > brokenRidge + 8) return deep;
    return (localX + y) % 7 < 3 ? snow : light;
  }
  if (y < far + 12 || y < east + 12) return base;
  return shadow;
}

/** Dark shelves and ice teeth leave the combat centre open above the unchanged ground line. */
function paintGlacierNear({ localX, y }) {
  if (y < 94) return [0, 0, 0, 0];
  const leftShelf = localX < 39 && y >= 101 - localX / 3;
  const rightShelf = localX > 119 && y >= 101 - (159 - localX) / 3;
  const tooth =
    (localX % 40 < 7 && y >= 96 + (localX % 40)) ||
    ((localX + 19) % 53 < 6 && y >= 102 + ((localX + 19) % 53));
  if (leftShelf || rightShelf) {
    if (y < 106 && (localX + y) % 6 < 3) return light;
    return y < 112 ? outline : ink;
  }
  if (tooth && y < 112) return shadow;
  if (y >= 112) return outline;
  return [0, 0, 0, 0];
}

/** @type {{ theme: string; layers: Record<string, (px: { localX: number; y: number }) => number[]> }[]} */
export const backdrops = [
  {
    theme: "glacier",
    layers: { sky: paintGlacierSky, mid: paintGlacierMid, near: paintGlacierNear },
  },
];

/**
 * Renders a `REVIEW_PERIODS`-wide-by-`BACKDROP_HEIGHT`-tall working canvas (480x120 at the pinned
 * constants) so periodicity can be mechanically checked BEFORE any pixel ships. `paint` receives
 * `{ localX, y }` where `localX = x % BACKDROP_WIDTH` — the same local coordinate space the
 * shipped 160x120 tile uses — so one painter function defines both the review render and the
 * final crop.
 *
 * Returns a plain decoded-image shape ({ width, height, data }) rather than a PNG buffer so
 * `assertHorizontalPeriod` and the shipping crop can index it directly; `data` is a flat RGBA
 * Uint8ClampedArray identical in layout to a decoded `pngjs` image.
 */
export function renderPeriodicLayer(paint) {
  const width = BACKDROP_WIDTH * REVIEW_PERIODS;
  const height = BACKDROP_HEIGHT;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const localX = x % BACKDROP_WIDTH;
      const rgba = paint({ localX, y });
      if (
        !Array.isArray(rgba) ||
        rgba.length !== 4 ||
        rgba.some((channel) => !Number.isInteger(channel) || channel < 0 || channel > 255)
      ) {
        throw new Error(
          `renderPeriodicLayer: painter returned malformed RGBA ${JSON.stringify(rgba)} at localX=${localX}, y=${y} (expected four integers 0-255)`,
        );
      }
      const at = (y * width + x) * 4;
      data[at] = rgba[0];
      data[at + 1] = rgba[1];
      data[at + 2] = rgba[2];
      data[at + 3] = rgba[3];
    }
  }
  return { width, height, data };
}

/**
 * Mechanically verifies horizontal periodicity: for every row and every local-x inside one
 * `period`-wide tile, every later repeat of that tile (x + period, x + 2*period, ...) across
 * `image` must carry the EXACT same RGBA pixel. Compares every RGBA pixel across all
 * `image.width / period` periods (three at the pinned constants) — not a sample — and throws with
 * the offending coordinate on the first mismatch.
 */
export function assertHorizontalPeriod(image, period = BACKDROP_WIDTH) {
  const { width, height, data } = image;
  const periods = Math.floor(width / period);
  for (let y = 0; y < height; y++) {
    for (let localX = 0; localX < period; localX++) {
      const baseAt = (y * width + localX) * 4;
      const base = [data[baseAt], data[baseAt + 1], data[baseAt + 2], data[baseAt + 3]];
      for (let k = 1; k < periods; k++) {
        const x = localX + k * period;
        const at = (y * width + x) * 4;
        const candidate = [data[at], data[at + 1], data[at + 2], data[at + 3]];
        if (
          candidate[0] !== base[0] ||
          candidate[1] !== base[1] ||
          candidate[2] !== base[2] ||
          candidate[3] !== base[3]
        ) {
          throw new Error(
            `assertHorizontalPeriod: pixel mismatch at (${localX}, ${y}) — period 0 is ${JSON.stringify(base)} but period ${k} (x=${x}) is ${JSON.stringify(candidate)}`,
          );
        }
      }
    }
  }
}

/**
 * Writes every registered theme's `sky`/`mid`/`near` layers as `<theme>-<layer>.png` under
 * `destDir`, mirroring `writeIcons`/`writeSprites`'s injectable-registry shape so tests can pass a
 * synthetic registry and temp `destDir` instead of touching real assets.
 *
 * For every layer: render the 480x120 review image (`renderPeriodicLayer`), mechanically verify
 * all three periods compare byte-for-byte (`assertHorizontalPeriod`) BEFORE writing anything, crop
 * the first 160x120 period, then write it via the existing deterministic `writePng`.
 *
 * Validates loudly and never partially trusts a definition: duplicate themes, a layer missing
 * from `layers`, an extra/unknown layer name, a non-function painter, and malformed RGBA output
 * (surfaced by `renderPeriodicLayer` itself) all throw before any file is written for that
 * definition. A theme absent from `registry` is never read, written, or deleted — with the
 * registry this function writes only its declared theme, so untouched themes retain their
 * hand-assembled bytes.
 */
export async function writeBackdrops(destDir, { registry = backdrops } = {}) {
  const seenThemes = new Set();
  for (const def of registry) {
    if (seenThemes.has(def.theme)) {
      throw new Error(`writeBackdrops: duplicate theme ${JSON.stringify(def.theme)}`);
    }
    seenThemes.add(def.theme);

    const declaredLayers = Object.keys(def.layers ?? {});
    const missing = LAYER_NAMES.filter((name) => !declaredLayers.includes(name));
    if (missing.length > 0) {
      throw new Error(
        `writeBackdrops: ${def.theme} is missing layer(s) ${missing.join(", ")} (expected exactly ${LAYER_NAMES.join(", ")})`,
      );
    }
    const extra = declaredLayers.filter((name) => !LAYER_NAMES.includes(name));
    if (extra.length > 0) {
      throw new Error(
        `writeBackdrops: ${def.theme} declares unknown layer(s) ${extra.join(", ")} (expected exactly ${LAYER_NAMES.join(", ")})`,
      );
    }

    for (const layerName of LAYER_NAMES) {
      const painter = def.layers[layerName];
      if (typeof painter !== "function") {
        throw new Error(
          `writeBackdrops: ${def.theme}.${layerName} must be a painter function, got ${JSON.stringify(painter)}`,
        );
      }
      const review = renderPeriodicLayer(painter);
      assertHorizontalPeriod(review);
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
