import { writePng } from "./write-png.mjs";

/** Native pixel dimensions of one shipped backdrop layer (#263). */
export const BACKDROP_WIDTH = 160;
export const BACKDROP_HEIGHT = 120;

/** How many horizontal repeats of a layer's 160px tile the review render works across before
 * `assertHorizontalPeriod` checks it and the first period is cropped for shipping. */
export const REVIEW_PERIODS = 3;

const LAYER_NAMES = ["sky", "mid", "near"];

/**
 * Production backdrop registry. Deliberately EMPTY: this issue (#263) adds the reusable
 * generator infrastructure only, parallel to `icons.mjs`/`sprites.mjs`, without migrating any of
 * the five currently-shipped, hand-assembled themes (meadow/forest/sewer/crypt/town) or the
 * hand-assembled `glacier` set (#254). The Frostspire slice (#142) is the named follow-up that
 * registers the first real definition (`glacier`) here and retires its hand-assembled bytes.
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
export const backdrops = [];

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
 * default empty production `backdrops` registry this function writes nothing at all, so `npm run
 * art` cannot change a single existing backdrop byte.
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
