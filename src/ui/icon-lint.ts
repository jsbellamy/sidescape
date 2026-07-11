/** Objective, mechanically-checkable icon legibility rules (issue #166). Every function here
 * takes a decoded 34×34 PNG (pngjs' `{ width, height, data }` shape, RGBA row-major) and answers
 * one rule from docs/art-style.md's "Icon legibility (34×34)" [lint] list. Kept free of `fs` /
 * `pngjs` so the rules themselves can be unit-tested with tiny synthetic fixtures — only
 * `icon-assets.test.ts` reads real files off disk. */

export interface DecodedIcon {
  width: number;
  height: number;
  /** RGBA bytes, row-major, 4 bytes per pixel — the pngjs `PNG#data` layout. */
  data: Uint8Array | Buffer;
}

export const RULE_IDS = ["color-budget", "binary-alpha", "margin", "fill", "connected"] as const;
export type RuleId = (typeof RULE_IDS)[number];

function pixelAt(icon: DecodedIcon, x: number, y: number): [number, number, number, number] {
  const at = (y * icon.width + x) * 4;
  return [icon.data[at]!, icon.data[at + 1]!, icon.data[at + 2]!, icon.data[at + 3]!];
}

/** Rule 1 input: the number of distinct opaque (alpha != 0) RGBA colors in the icon. */
export function countOpaqueColors(icon: DecodedIcon): number {
  const colors = new Set<string>();
  for (let y = 0; y < icon.height; y++)
    for (let x = 0; x < icon.width; x++) {
      const [r, g, b, a] = pixelAt(icon, x, y);
      if (a === 0) continue;
      colors.add(`${r},${g},${b},${a}`);
    }
  return colors.size;
}

/** Rule 1 [lint: color-budget]: the approved clustered-shading reference uses up to twelve colors
 * across outline, shadow, base, highlight, material, and accent roles. */
export function checkColorBudget(icon: DecodedIcon, limit = 12): boolean {
  return countOpaqueColors(icon) <= limit;
}

/** Counts one-pixel 8-connected components within each individual opaque color. Diagonal pixels
 * of one deliberate line/plane remain a cluster, while isolated eyes, glints, and sparkle noise
 * remain singletons. */
export function countSingletonColorClusters(icon: DecodedIcon): number {
  const { width: w, height: h } = icon;
  const colorAt = (x: number, y: number): string | null => {
    if (x < 0 || y < 0 || x >= w || y >= h) return null;
    const [r, g, b, a] = pixelAt(icon, x, y);
    return a === 0 ? null : `${r},${g},${b},${a}`;
  };
  const visited = new Uint8Array(w * h);
  let singletons = 0;

  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const color = colorAt(x, y);
      if (color === null || visited[y * w + x]) continue;
      let size = 0;
      const stack: [number, number][] = [[x, y]];
      visited[y * w + x] = 1;
      while (stack.length > 0) {
        const [cx, cy] = stack.pop()!;
        size++;
        for (const [dx, dy] of [
          [-1, -1],
          [0, -1],
          [1, -1],
          [-1, 0],
          [1, 0],
          [-1, 1],
          [0, 1],
          [1, 1],
        ] as const) {
          const nx = cx + dx,
            ny = cy + dy;
          if (
            nx >= 0 &&
            ny >= 0 &&
            nx < w &&
            ny < h &&
            !visited[ny * w + nx] &&
            colorAt(nx, ny) === color
          ) {
            visited[ny * w + nx] = 1;
            stack.push([nx, ny]);
          }
        }
      }
      if (size === 1) singletons++;
    }

  return singletons;
}

/** Native-grid shading gate: preserve a few intentional one-pixel details, reject confetti. */
export function checkClusterNoise(icon: DecodedIcon, maxSingletons = 3): boolean {
  return countSingletonColorClusters(icon) <= maxSingletons;
}

/** Distinct alpha VALUES strictly between 0 and 255 (fully transparent / fully opaque are
 * excluded — those are the two allowed values, never counted as "intermediate"). */
export function distinctIntermediateAlphaValues(icon: DecodedIcon): number[] {
  const values = new Set<number>();
  for (let y = 0; y < icon.height; y++)
    for (let x = 0; x < icon.width; x++) {
      const a = pixelAt(icon, x, y)[3];
      if (a !== 0 && a !== 255) values.add(a);
    }
  return [...values];
}

/** Rule 2 [lint: binary-alpha]: every pixel is fully transparent or fully opaque, except icons in
 * `TRANSLUCENT_ALLOWED` (`allowOneIntermediate`), which may use exactly one intermediate alpha
 * VALUE (any number of pixels at that one value). */
export function checkBinaryAlpha(icon: DecodedIcon, allowOneIntermediate: boolean): boolean {
  const intermediates = distinctIntermediateAlphaValues(icon);
  if (!allowOneIntermediate) return intermediates.length === 0;
  return intermediates.length <= 1;
}

/** Rule 3 [lint: margin]: the outermost ring (row/col 0 and the last row/col) must be fully
 * transparent — the 34×34 grid's 1px margin, so drawable art stays confined to 1..32. */
export function checkMargin(icon: DecodedIcon): boolean {
  const { width: w, height: h } = icon;
  for (let x = 0; x < w; x++) {
    if (pixelAt(icon, x, 0)[3] !== 0) return false;
    if (pixelAt(icon, x, h - 1)[3] !== 0) return false;
  }
  for (let y = 0; y < h; y++) {
    if (pixelAt(icon, 0, y)[3] !== 0) return false;
    if (pixelAt(icon, w - 1, y)[3] !== 0) return false;
  }
  return true;
}

/** The smallest axis-aligned box covering every opaque pixel, or `null` if the icon has none. */
export function opaqueBoundingBox(icon: DecodedIcon): { width: number; height: number } | null {
  let minX = icon.width,
    maxX = -1,
    minY = icon.height,
    maxY = -1;
  for (let y = 0; y < icon.height; y++)
    for (let x = 0; x < icon.width; x++) {
      if (pixelAt(icon, x, y)[3] === 0) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  if (maxX < 0) return null;
  return { width: maxX - minX + 1, height: maxY - minY + 1 };
}

/** Rule 4 [lint: fill]: one dominant object filling the canvas — the opaque bounding box's long
 * axis must be at least 26px (of the 32px drawable area). */
export function checkFill(icon: DecodedIcon, minLongAxis = 26): boolean {
  const box = opaqueBoundingBox(icon);
  if (!box) return false;
  return Math.max(box.width, box.height) >= minLongAxis;
}

/** Sizes of connected components among the icon's opaque pixels. Compatibility lint defaults to
 * eight-neighbor adjacency because imported legacy PNGs historically used diagonal joins; new
 * native-grid art opts into four-neighbor structural connectivity below. */
export function connectedComponentSizes(icon: DecodedIcon, connectivity: 4 | 8 = 8): number[] {
  const { width: w, height: h } = icon;
  const opaque = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < w && y < h && pixelAt(icon, x, y)[3] !== 0;
  const visited = new Uint8Array(w * h);
  const sizes: number[] = [];
  const offsets =
    connectivity === 4
      ? ([
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1],
        ] as const)
      : ([
          [-1, -1],
          [0, -1],
          [1, -1],
          [-1, 0],
          [1, 0],
          [-1, 1],
          [0, 1],
          [1, 1],
        ] as const);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!opaque(x, y) || visited[y * w + x]) continue;
      let size = 0;
      const stack: [number, number][] = [[x, y]];
      visited[y * w + x] = 1;
      while (stack.length > 0) {
        const [cx, cy] = stack.pop()!;
        size++;
        for (const [dx, dy] of offsets) {
          const nx = cx + dx,
            ny = cy + dy;
          if (opaque(nx, ny) && !visited[ny * w + nx]) {
            visited[ny * w + nx] = 1;
            stack.push([nx, ny]);
          }
        }
      }
      sizes.push(size);
    }
  return sizes.sort((a, b) => b - a);
}

export function countConnectedComponents(icon: DecodedIcon): number {
  return connectedComponentSizes(icon).length;
}

function hasSingleConnectedBody(icon: DecodedIcon, connectivity: 4 | 8): boolean {
  return connectedComponentSizes(icon, connectivity).length === 1;
}

/** Rule 5 [lint: connected]: legacy compatibility requires exactly one 8-connected silhouette. */
export function checkConnected(icon: DecodedIcon): boolean {
  return hasSingleConnectedBody(icon, 8);
}

/** Native-grid structural gate: code-generated icons require exactly one shared-edge-connected
 * body, so even a one-pixel diagonal-only limb or inferred "accent" fails. */
export function checkStructuralConnected(icon: DecodedIcon): boolean {
  return hasSingleConnectedBody(icon, 4);
}

export interface StaleExemption {
  icon: string;
  rule: RuleId;
}

/** The ratchet direction of `ICON_LINT_EXEMPTIONS`: an exemption entry only earns its keep while
 * its icon still fails the rule it names. Once `passes(icon, rule)` reports the icon clean, the
 * entry is stale and must be deleted — the exemption list can shrink but never silently regrow
 * to cover an icon that no longer needs it. */
export function findStaleExemptions(
  exemptions: Record<string, readonly RuleId[]>,
  passes: (icon: string, rule: RuleId) => boolean,
): StaleExemption[] {
  const stale: StaleExemption[] = [];
  for (const [icon, rules] of Object.entries(exemptions)) {
    for (const rule of rules) {
      if (passes(icon, rule)) stale.push({ icon, rule });
    }
  }
  return stale;
}
