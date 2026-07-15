import { masterPalette, materialPalettes, zonePalettes } from "./palettes.mjs";

/**
 * Pure, filesystem-free stages of the icon reference tracer (`scripts/art/trace-reference.mjs`).
 * A "reference sheet" here is committed pixel art rendered large (see docs/art-style.md): every
 * source pixel occupies a `pitch`×`pitch` block. These stages recover that native grid —
 * crop → key background → detect cell pitch → majority-vote each cell → quantize to the named
 * ramps → strip the traced exterior outline (it is re-derived by `paintGrid`'s `outlineMask`) →
 * scale to a legibility-lint-satisfying size → emit a `paintGrid` draft. Every function takes/
 * returns plain data (`{ width, height, data }` RGBA like pngjs, or 2-D cell arrays) so
 * `src/ui/trace-core.test.ts` can round-trip them against synthetic sheets with no disk I/O.
 */

// --- small color helpers ---

export function hexToRgb(hex) {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex([r, g, b]) {
  const h = (v) => v.toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

function sqDist(a, b) {
  const dr = a[0] - b[0],
    dg = a[1] - b[1],
    db = a[2] - b[2];
  return dr * dr + dg * dg + db * db;
}

function median(values) {
  values.sort((a, b) => a - b);
  return values[Math.floor((values.length - 1) / 2)];
}

// --- stage 1: crop ---

/** Inclusive sub-rectangle `{ x0, y0, x1, y1 }` of an RGBA image. */
export function cropImage(image, { x0, y0, x1, y1 }) {
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const src = ((y0 + y) * image.width + (x0 + x)) * 4;
      const dst = (y * w + x) * 4;
      for (let c = 0; c < 4; c++) data[dst + c] = image.data[src + c];
    }
  return { width: w, height: h, data };
}

// --- stage 2: background keying ---

/** Per-channel median color of the crop's 2px border ring — the presumed background. */
export function sampleBackground(image) {
  const { width: w, height: h, data } = image;
  const rs = [],
    gs = [],
    bs = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (x >= 2 && x < w - 2 && y >= 2 && y < h - 2) continue;
      const o = (y * w + x) * 4;
      rs.push(data[o]);
      gs.push(data[o + 1]);
      bs.push(data[o + 2]);
    }
  return [median(rs), median(gs), median(bs)];
}

/**
 * 4-connected flood fill from the crop border, consuming pixels within per-channel `tolerance` of
 * `bg` (a zero-alpha pixel counts as background regardless of its RGB). Returns `fg`
 * (1 = foreground, 0 = background) for every pixel, the foreground `bbox`, and `enclosedBgCount` —
 * bg-colored/transparent pixels the flood never reached (holes enclosed by the subject).
 *
 * By default enclosed holes stay foreground and are only reported, deliberately NOT a global
 * color-distance test: on a reference sheet a near-black outline the same color as a dark bg is
 * only ever eaten where it is edge-connected to the bg (harmless — the outline is re-derived
 * downstream), and the flood provably cannot leak through the outline into a lighter body.
 * `keyEnclosed: true` (the ingest path, where the bg is a saturated key color no subject ever
 * uses) also keys the enclosed holes out, so a bow's window or a ring's center stays transparent
 * instead of quantizing into a body color.
 */
export function keyBackground(image, bg, tolerance = 16, { keyEnclosed = false } = {}) {
  const { width: w, height: h, data } = image;
  const within = (o) =>
    data[o + 3] < 128 ||
    (Math.abs(data[o] - bg[0]) <= tolerance &&
      Math.abs(data[o + 1] - bg[1]) <= tolerance &&
      Math.abs(data[o + 2] - bg[2]) <= tolerance);

  const flooded = new Uint8Array(w * h);
  const stack = [];
  const seed = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const idx = y * w + x;
    if (flooded[idx] || !within(idx * 4)) return;
    flooded[idx] = 1;
    stack.push(idx);
  };
  for (let x = 0; x < w; x++) {
    seed(x, 0);
    seed(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    seed(0, y);
    seed(w - 1, y);
  }
  while (stack.length > 0) {
    const idx = stack.pop();
    const x = idx % w;
    const y = (idx / w) | 0;
    seed(x - 1, y);
    seed(x + 1, y);
    seed(x, y - 1);
    seed(x, y + 1);
  }

  const fg = new Uint8Array(w * h);
  let enclosedBgCount = 0;
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -1,
    y1 = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (flooded[idx]) continue;
      if (within(idx * 4)) {
        enclosedBgCount++;
        if (keyEnclosed) continue;
      }
      fg[idx] = 1;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  const bbox = x1 < 0 ? null : { x0, y0, x1, y1 };
  return { fg, bbox, enclosedBgCount };
}

// --- stage 3: pitch/phase detection ---

function axisExtent(fg, w, h, axis) {
  let lo = Infinity,
    hi = -Infinity;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!fg[y * w + x]) continue;
      const a = axis === "x" ? x : y;
      if (a < lo) lo = a;
      if (a > hi) hi = a;
    }
  return { lo, hi };
}

/** 1-D edge-energy profile along `axis`: |ΔRGB| between neighbouring foreground pixels, summed
 * across the other axis. Cell boundaries in the pseudo-pixel grid show up as sharp peaks. */
function edgeProfile(image, fg, axis) {
  const { width: w, height: h, data } = image;
  const len = axis === "x" ? w : h;
  const other = axis === "x" ? h : w;
  const prof = new Float64Array(len);
  for (let a = 1; a < len; a++) {
    let e = 0;
    for (let b = 0; b < other; b++) {
      const x = axis === "x" ? a : b;
      const y = axis === "x" ? b : a;
      const px = axis === "x" ? a - 1 : b;
      const py = axis === "x" ? b : a - 1;
      const i1 = y * w + x;
      const i0 = py * w + px;
      if (!fg[i1] || !fg[i0]) continue;
      const o1 = i1 * 4,
        o0 = i0 * 4;
      e +=
        Math.abs(data[o1] - data[o0]) +
        Math.abs(data[o1 + 1] - data[o0 + 1]) +
        Math.abs(data[o1 + 2] - data[o0 + 2]);
    }
    prof[a] = e;
  }
  return prof;
}

/**
 * Recovers the pseudo-pixel `pitch` and boundary `phase` along one axis by fitting a comb to the
 * edge profile. `score = coverage * occupancy`: coverage is the fraction of total edge energy that
 * lands on comb teeth (penalizes harmonics like 2× that miss half the boundaries); occupancy is the
 * fraction of teeth that actually carry energy (penalizes subharmonics like ½× whose extra teeth
 * fall on flat interiors). The product peaks at the fundamental, including fractional pitches that
 * absorb ±1px grid drift. `phase` is a boundary-line position in `[0, pitch)`.
 */
export function detectPitch(
  image,
  fg,
  axis,
  { min = 4, max = 16, pitchStep = 0.05, phaseStep = 0.5 } = {},
) {
  const { width: w, height: h } = image;
  const len = axis === "x" ? w : h;
  const { lo, hi } = axisExtent(fg, w, h, axis);
  const prof = edgeProfile(image, fg, axis);
  let total = 0,
    maxE = 0;
  for (let i = lo; i <= hi; i++) {
    total += prof[i];
    if (prof[i] > maxE) maxE = prof[i];
  }
  const eps = maxE * 0.15;

  let best = { pitch: min, phase: 0, score: -1 };
  if (total <= 0) return best;
  for (let p = min; p <= max + 1e-9; p += pitchStep) {
    for (let ph = 0; ph < p; ph += phaseStep) {
      const kmin = Math.ceil((lo - ph) / p);
      const kmax = Math.floor((hi - ph) / p);
      let teeth = 0,
        hit = 0,
        coveredEnergy = 0;
      const covered = new Set();
      for (let k = kmin; k <= kmax; k++) {
        const pos = ph + k * p;
        if (pos <= lo + 0.5 || pos >= hi - 0.5) continue; // ignore shape-edge teeth
        teeth++;
        let em = 0,
          col = -1;
        for (let d = -1; d <= 1; d++) {
          const c = Math.round(pos) + d;
          if (c >= 0 && c < len && prof[c] > em) {
            em = prof[c];
            col = c;
          }
        }
        if (em > eps) hit++;
        if (col >= 0 && !covered.has(col)) {
          covered.add(col);
          coveredEnergy += prof[col];
        }
      }
      if (teeth === 0) continue;
      const score = (coveredEnergy / total) * (hit / teeth);
      if (score > best.score) best = { pitch: p, phase: ph, score };
    }
  }
  return best;
}

// --- stage 4: per-cell sampling ---

function cellIndices(lo, hi, pitch, phase) {
  const kmin = Math.ceil((lo - phase) / pitch - 0.5);
  const kmax = Math.floor((hi - phase) / pitch - 0.5);
  const out = [];
  for (let k = kmin; k <= kmax; k++) out.push(k);
  return out;
}

/**
 * Majority-votes each grid cell to a color (or `null` when the cell is mostly background). Cell
 * centers are accumulated fractionally (`phase + (k + 0.5) * pitch`) so drift never shears the
 * later columns; only the central 60% of each cell is sampled, and a cell needs ≥50% foreground
 * coverage to be opaque. Returns a 2-D array of `null | [r, g, b]` indexed `[row][col]`.
 */
export function sampleCells(image, fg, bbox, { pitchX, phaseX, pitchY, phaseY }) {
  const { width: w, height: h, data } = image;
  const xs = cellIndices(bbox.x0, bbox.x1, pitchX, phaseX);
  const ys = cellIndices(bbox.y0, bbox.y1, pitchY, phaseY);
  const hwX = 0.3 * pitchX;
  const hwY = 0.3 * pitchY;
  const grid = [];
  for (const ky of ys) {
    const cy = phaseY + (ky + 0.5) * pitchY;
    const row = [];
    for (const kx of xs) {
      const cx = phaseX + (kx + 0.5) * pitchX;
      const xa = Math.round(cx - hwX),
        xb = Math.round(cx + hwX);
      const ya = Math.round(cy - hwY),
        yb = Math.round(cy + hwY);
      const rs = [],
        gs = [],
        bs = [];
      let fgc = 0,
        tot = 0;
      for (let y = ya; y <= yb; y++)
        for (let x = xa; x <= xb; x++) {
          if (x < 0 || y < 0 || x >= w || y >= h) continue;
          tot++;
          if (!fg[y * w + x]) continue;
          fgc++;
          const o = (y * w + x) * 4;
          rs.push(data[o]);
          gs.push(data[o + 1]);
          bs.push(data[o + 2]);
        }
      row.push(tot === 0 || fgc / tot < 0.5 ? null : [median(rs), median(gs), median(bs)]);
    }
    grid.push(row);
  }
  return grid;
}

// --- stage 5: source-local palette normalization ---

/**
 * Reduces sampled source colors before the later named-palette projection. Its medoids are always
 * exact recovered RGB triples, and grids already within budget remain unchanged.
 */
export function normalizeCellPalette(cells, { maxColors } = {}) {
  if (!Number.isInteger(maxColors) || maxColors <= 0) {
    throw new Error("maxColors must be a positive integer");
  }

  const colors = new Map();
  for (const row of cells)
    for (const rgb of row) {
      if (rgb === null) continue;
      const key = rgb.join(",");
      colors.set(key, (colors.get(key) ?? 0) + 1);
    }

  const observations = [...colors.entries()]
    .map(([key, weight]) => {
      const rgb = key.split(",").map(Number);
      return { key, rgb, lab: srgbToOklab(rgb), weight };
    })
    .sort((a, b) => compareRgb(a.rgb, b.rgb));
  if (observations.length <= maxColors) {
    return {
      cells,
      inputColorCount: observations.length,
      outputColorCount: observations.length,
      changedCellCount: 0,
      medoids: observations.map(({ rgb }) => rgb),
    };
  }

  let medoids = [selectFirstMedoid(observations)];
  while (medoids.length < maxColors) medoids.push(selectNextMedoid(observations, medoids));

  const iterationLimit = 1_000;
  for (let iteration = 0; iteration < iterationLimit; iteration++) {
    const clusters = medoids.map(() => []);
    for (const observation of observations) {
      clusters[nearestMedoidIndex(observation, medoids)].push(observation);
    }
    const nextMedoids = clusters.map((cluster, index) =>
      cluster.length === 0 ? medoids[index] : selectClusterMedoid(cluster),
    );
    if (nextMedoids.every((medoid, index) => medoid.key === medoids[index].key)) {
      medoids = nextMedoids;
      break;
    }
    medoids = nextMedoids;
    if (iteration === iterationLimit - 1) {
      throw new Error("palette normalization did not converge");
    }
  }

  let changedCellCount = 0;
  const normalizedCells = cells.map((row) =>
    row.map((rgb) => {
      if (rgb === null) return null;
      const source = observations.find((observation) => observation.key === rgb.join(","));
      const medoid = medoids[nearestMedoidIndex(source, medoids)];
      if (source.key !== medoid.key) changedCellCount++;
      return medoid.rgb;
    }),
  );
  const orderedMedoids = [...medoids].sort((a, b) => compareRgb(a.rgb, b.rgb));
  return {
    cells: normalizedCells,
    inputColorCount: observations.length,
    outputColorCount: medoids.length,
    changedCellCount,
    medoids: orderedMedoids.map(({ rgb }) => rgb),
  };
}

function compareRgb(a, b) {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

function srgbToOklab([r, g, b]) {
  const linear = (channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const lr = linear(r),
    lg = linear(g),
    lb = linear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklabDistanceSquared(a, b) {
  const dl = a[0] - b[0],
    da = a[1] - b[1],
    db = a[2] - b[2];
  return dl * dl + da * da + db * db;
}

function isDistanceTie(a, b) {
  return Number.isFinite(a) && Number.isFinite(b) && a === b;
}

function selectFirstMedoid(observations) {
  let best = observations[0];
  let bestCost = Infinity;
  for (const candidate of observations) {
    const cost = observations.reduce(
      (sum, observation) =>
        sum + observation.weight * oklabDistanceSquared(candidate.lab, observation.lab),
      0,
    );
    if (cost < bestCost && !isDistanceTie(cost, bestCost)) {
      best = candidate;
      bestCost = cost;
    }
  }
  return best;
}

function selectNextMedoid(observations, selected) {
  let best = null;
  let bestDistance = -Infinity;
  for (const candidate of observations) {
    if (selected.some((medoid) => medoid.key === candidate.key)) continue;
    const distance = Math.min(
      ...selected.map((medoid) => oklabDistanceSquared(candidate.lab, medoid.lab)),
    );
    if (
      (distance > bestDistance && !isDistanceTie(distance, bestDistance)) ||
      (isDistanceTie(distance, bestDistance) &&
        (best === null ||
          candidate.weight > best.weight ||
          (candidate.weight === best.weight && compareRgb(candidate.rgb, best.rgb) < 0)))
    ) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

function nearestMedoidIndex(observation, medoids) {
  let bestIndex = 0;
  let bestDistance = Infinity;
  for (let index = 0; index < medoids.length; index++) {
    const distance = oklabDistanceSquared(observation.lab, medoids[index].lab);
    if (
      (distance < bestDistance && !isDistanceTie(distance, bestDistance)) ||
      (isDistanceTie(distance, bestDistance) &&
        compareRgb(medoids[index].rgb, medoids[bestIndex].rgb) < 0)
    ) {
      bestIndex = index;
      bestDistance = distance;
    }
  }
  return bestIndex;
}

function selectClusterMedoid(cluster) {
  let best = cluster[0];
  let bestCost = Infinity;
  for (const candidate of cluster) {
    const cost = cluster.reduce(
      (sum, observation) =>
        sum + observation.weight * oklabDistanceSquared(candidate.lab, observation.lab),
      0,
    );
    if (
      (cost < bestCost && !isDistanceTie(cost, bestCost)) ||
      (isDistanceTie(cost, bestCost) && compareRgb(candidate.rgb, best.rgb) < 0)
    ) {
      best = candidate;
      bestCost = cost;
    }
  }
  return best;
}

// --- stage 6: quantization to named ramps ---

/**
 * Every named palette color with the code expression that references it (`P.ink`, `town[2]`,
 * `steel.light`) — the vocabulary drafts are quantized into and emitted with.
 *
 * `materialRampNames` and `zoneNames` each SCOPE their category (#252, #261). `quantizeGrid` snaps
 * every cell to the globally nearest entry of whatever palette it is handed, so any material ramp
 * OR zone in that palette is a candidate color for every cell of every asset. Passing the whole
 * project's ramps/zones therefore makes each new one silently re-quantize UNRELATED shipped art:
 * adding `adamant` (a green metal) pulled mithril-chainbody's blue-grey pixels onto it, adding
 * `rune` (a cyan metal) shifted the crypt-shade and zombie sprites, and `zonePalettes` had no
 * allowlist at all so a new zone could do the same. Generation callers must instead pass only the
 * ramps and zones THAT asset's own source actually uses, so a category entry an asset does not use
 * can never alter it (see `scripts/art/icons.mjs`'s `SOURCE_PALETTES`/`paletteForSource` and
 * `sprites.mjs`'s per-sprite scope, and the `src/ui/art-ramp-isolation.test.ts` regression test
 * that locks this property).
 *
 * Omitting a property keeps that category's every-entry behavior, which is what the AUTHORING
 * tools want: an ingest/trace pass is precisely trying to discover which ramps/zones a new source
 * is closest to, and its >15%-off-ramp rejection (docs/icon-gen.md) is only meaningful against the
 * full vocabulary. `icon-source.mjs`'s explicit recolor-target lookup also relies on this bare,
 * full-vocabulary default.
 *
 * `[]` includes no entries from that category. An unknown material or zone name throws and lists
 * the known names. Caller argument order never affects output order — see below.
 *
 * @param {{ materialRampNames?: readonly string[], zoneNames?: readonly string[] }} [scope]
 */
export function buildNamedPalette({ materialRampNames, zoneNames } = {}) {
  const out = [];
  for (const [name, hex] of masterPalette) {
    const ref = /^[a-zA-Z_$][\w$]*$/.test(name) ? `P.${name}` : `P[${JSON.stringify(name)}]`;
    out.push({ ref, hex, rgb: hexToRgb(hex) });
  }

  if (zoneNames !== undefined) {
    for (const name of zoneNames) {
      if (!zonePalettes[name]) {
        throw new Error(
          `buildNamedPalette: unknown zone ${JSON.stringify(name)} (known: ${Object.keys(zonePalettes).join(", ")})`,
        );
      }
    }
  }
  // Emit zones in `zonePalettes` DECLARATION order, and materials in `materialPalettes`
  // DECLARATION order — never the caller's argument order. `quantizeGrid` breaks an exact distance
  // tie by palette position (first entry wins, since it compares with a strict `<`), so the order
  // here is load-bearing: listing a subset in a different order would silently flip a tied cell
  // (the mace's one gold.shadow/ember.shadow tie is a real instance) and change shipped art.
  // Scoping must only REMOVE candidates, never reorder the survivors.
  const allowedZones = zoneNames === undefined ? null : new Set(zoneNames);
  for (const [zone, colors] of Object.entries(zonePalettes)) {
    if (allowedZones && !allowedZones.has(zone)) continue;
    colors.forEach((hex, i) => out.push({ ref: `${zone}[${i}]`, hex, rgb: hexToRgb(hex) }));
  }

  if (materialRampNames !== undefined) {
    for (const name of materialRampNames) {
      if (!materialPalettes[name]) {
        throw new Error(
          `buildNamedPalette: unknown material ramp ${JSON.stringify(name)} (known: ${Object.keys(materialPalettes).join(", ")})`,
        );
      }
    }
  }
  const allowedMaterials = materialRampNames === undefined ? null : new Set(materialRampNames);
  for (const [mat, ramp] of Object.entries(materialPalettes)) {
    if (allowedMaterials && !allowedMaterials.has(mat)) continue;
    for (const [role, hex] of Object.entries(ramp)) {
      out.push({ ref: `${mat}.${role}`, hex, rgb: hexToRgb(hex) });
    }
  }
  return out;
}

/**
 * Snaps each sampled cell to its nearest named color. Returns quantized `cells`
 * (`null | { ref, hex, rgb, distance }`) plus a `report` (one row per distinct traced color, most
 * frequent first, `warn` set when the nearest named color is farther than `warnDistance` — i.e.
 * the reference used a color no faithful ramp reproduces).
 */
export function quantizeGrid(grid, named, warnDistance = 40) {
  const cache = new Map();
  const reportMap = new Map();
  const cells = grid.map((row) =>
    row.map((cell) => {
      if (!cell) return null;
      const key = cell.join(",");
      let entry = cache.get(key);
      if (!entry) {
        let best = named[0],
          bestSq = Infinity;
        for (const n of named) {
          const d = sqDist(cell, n.rgb);
          if (d < bestSq) {
            bestSq = d;
            best = n;
          }
        }
        entry = { ref: best.ref, hex: best.hex, rgb: best.rgb, distance: Math.sqrt(bestSq) };
        cache.set(key, entry);
      }
      let rep = reportMap.get(key);
      if (!rep) {
        rep = {
          hex: rgbToHex(cell),
          ref: entry.ref,
          distance: entry.distance,
          count: 0,
          warn: entry.distance > warnDistance,
        };
        reportMap.set(key, rep);
      }
      rep.count++;
      return entry;
    }),
  );
  const report = [...reportMap.values()].sort((a, b) => b.count - a.count);
  return { cells, report, distinctCount: reportMap.size };
}

// --- stage 6: strip the traced exterior outline ---

/**
 * Removes one layer of outline-ink cells that are 4-adjacent to a transparent cell or the grid
 * edge, computed from the original grid in a single pass so only the true exterior ring is peeled
 * (a 2px outer weight loses one layer; fully interior ink seams are kept). `paintGrid`'s `outline`
 * option then re-derives a clean exterior ring, so the ambiguous bg/ink boundary never matters.
 */
export function stripExteriorInk(cells, inkRefs) {
  const inks = new Set(inkRefs);
  const h = cells.length;
  const w = h > 0 ? cells[0].length : 0;
  const transparent = (x, y) => x < 0 || y < 0 || x >= w || y >= h || cells[y][x] === null;
  const isInk = (cell) => cell !== null && inks.has(cell.ref);
  let strippedCount = 0;
  const out = cells.map((row, y) =>
    row.map((cell, x) => {
      if (!isInk(cell)) return cell;
      const exterior =
        transparent(x - 1, y) ||
        transparent(x + 1, y) ||
        transparent(x, y - 1) ||
        transparent(x, y + 1);
      if (exterior) {
        strippedCount++;
        return null;
      }
      return cell;
    }),
  );
  return { cells: out, strippedCount };
}

// --- stage 6b: reduce the quantized palette to a color budget ---

/**
 * Collapses a quantized grid to at most `maxColors` distinct named colors, so an auto-converted
 * source can satisfy the icon color-budget lint without hand-tuning. Keeps the `maxColors` most
 * frequent refs (ties broken by ref name for determinism) and remaps every other cell to the
 * nearest kept ref by RGB distance. A no-op when the grid already fits the budget. Returns the
 * remapped `cells` plus a `merged` list (dropped ref → kept ref) for reporting.
 */
export function reducePalette(cells, maxColors) {
  const freq = new Map();
  for (const row of cells)
    for (const cell of row) {
      if (!cell) continue;
      const e = freq.get(cell.ref);
      if (e) e.count++;
      else freq.set(cell.ref, { entry: cell, count: 1 });
    }
  if (freq.size <= maxColors) return { cells, merged: [] };

  const ranked = [...freq.values()].sort(
    (a, b) => b.count - a.count || (a.entry.ref < b.entry.ref ? -1 : 1),
  );
  const kept = ranked.slice(0, maxColors).map((r) => r.entry);
  const keptRefs = new Set(kept.map((e) => e.ref));

  const remap = new Map();
  const merged = [];
  for (const { entry } of ranked) {
    if (keptRefs.has(entry.ref)) {
      remap.set(entry.ref, entry);
      continue;
    }
    let best = kept[0],
      bestSq = Infinity;
    for (const k of kept) {
      const d = sqDist(entry.rgb, k.rgb);
      if (d < bestSq) {
        bestSq = d;
        best = k;
      }
    }
    remap.set(entry.ref, best);
    merged.push({ from: entry.ref, to: best.ref });
  }
  const out = cells.map((row) => row.map((cell) => (cell ? remap.get(cell.ref) : null)));
  return { cells: out, merged };
}

// --- stage 6c: despeckle isolated single-pixel colors ---

/**
 * Reassigns each opaque cell that is a one-pixel island of its color — no 8-neighbor shares its
 * exact ref — to the most common ref among its non-null neighbors (ties broken by ref name for
 * determinism). This is the confetti the quantizer leaves when a lone transitional cell snaps to a
 * ramp step none of its neighbors use; a human would merge it into the surrounding plane, and the
 * icon `cluster-noise` lint caps such singletons at three. Repeated up to `passes` times because
 * clearing one singleton can leave an adjacent cell newly isolated. Returns the cleaned `cells` and
 * the number of cells `changed`.
 */
export function despeckle(cells, passes = 3) {
  const h = cells.length;
  const w = h > 0 ? cells[0].length : 0;
  const N8 = [
    [-1, -1],
    [0, -1],
    [1, -1],
    [-1, 0],
    [1, 0],
    [-1, 1],
    [0, 1],
    [1, 1],
  ];
  let grid = cells.map((row) => row.slice());
  let changed = 0;
  for (let pass = 0; pass < passes; pass++) {
    let passChanged = 0;
    const next = grid.map((row) => row.slice());
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const cell = grid[y][x];
        if (!cell) continue;
        let sameNeighbor = false;
        const votes = new Map();
        for (const [dx, dy] of N8) {
          const nx = x + dx,
            ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const n = grid[ny][nx];
          if (!n) continue;
          if (n.ref === cell.ref) {
            sameNeighbor = true;
            break;
          }
          const v = votes.get(n.ref);
          if (v) v.count++;
          else votes.set(n.ref, { entry: n, count: 1 });
        }
        if (sameNeighbor || votes.size === 0) continue;
        let best = null;
        for (const { entry, count } of votes.values()) {
          if (!best || count > best.count || (count === best.count && entry.ref < best.entry.ref)) {
            best = { entry, count };
          }
        }
        next[y][x] = best.entry;
        passChanged++;
      }
    grid = next;
    changed += passChanged;
    if (passChanged === 0) break;
  }
  return { cells: grid, changed };
}

// --- stage 7: scale to a legibility size ---

/** Nearest-neighbour resample so the long axis becomes `targetLongAxis`, preserving aspect. The
 * non-integer factor leaves uneven cells on purpose — the author resolves them during cleanup. */
export function scaleGrid(cells, targetLongAxis) {
  const rows = cells.length;
  const cols = rows > 0 ? cells[0].length : 0;
  if (rows === 0 || cols === 0) return cells;
  const factor = targetLongAxis / Math.max(rows, cols);
  const newRows = Math.max(1, Math.round(rows * factor));
  const newCols = Math.max(1, Math.round(cols * factor));
  const out = [];
  for (let y = 0; y < newRows; y++) {
    const sy = Math.min(rows - 1, Math.floor((y * rows) / newRows));
    const row = [];
    for (let x = 0; x < newCols; x++) {
      const sx = Math.min(cols - 1, Math.floor((x * cols) / newCols));
      row.push(cells[sy][sx]);
    }
    out.push(row);
  }
  return out;
}

// --- stage 8: emit a paintGrid draft ---

const LEGEND_POOL = "abcdefghijklmnpqrstuvwxyz"; // no "o" (reads as zero); "." is reserved

/**
 * Renders quantized cells as a `paintGrid` draft snippet ready to paste into `scripts/art/icons.mjs`
 * for cleanup. Returns the `code` string (legend uses named palette expressions, not hex literals,
 * so it stays within palette discipline), `legendHex`/`legendRef` maps, the `rows` strings, and the
 * centered `x0`/`y0` origin (clamped so `paintGrid`'s derived outline ring stays inside 1..32).
 *
 * @param {string} name
 * @param {(null | { ref: string, hex: string, rgb: number[] })[][]} cells
 * @param {{ source?: string, crop?: string, pitch?: string, fit?: number, outline?: string }} [opts]
 * @returns {{ code: string, legendHex: Record<string, string>, legendRef: Record<string, string>, rows: string[], x0: number, y0: number }}
 */
export function emitDraft(name, cells, { source, crop, pitch, fit, outline = "P.ink" } = {}) {
  const height = cells.length;
  const width = height > 0 ? cells[0].length : 0;
  const charOf = new Map();
  const legendHex = {};
  const legendRef = {};
  for (const row of cells)
    for (const cell of row) {
      if (!cell || charOf.has(cell.ref)) continue;
      const ch = LEGEND_POOL[charOf.size];
      if (!ch) throw new Error(`emitDraft: more than ${LEGEND_POOL.length} distinct colors`);
      charOf.set(cell.ref, ch);
      legendHex[ch] = cell.hex;
      legendRef[ch] = cell.ref;
    }
  const rows = cells.map((row) => row.map((cell) => (cell ? charOf.get(cell.ref) : ".")).join(""));

  const x0 = Math.max(2, Math.min(32 - width, Math.floor((34 - width) / 2)));
  const y0 = Math.max(2, Math.min(32 - height, Math.floor((34 - height) / 2)));

  const legendEntries = Object.entries(legendRef)
    .map(([ch, ref]) => `${ch}: ${ref}`)
    .join(", ");
  const rowLines = rows.map((r) => `        ${JSON.stringify(r)},`).join("\n");
  const provenance =
    `// Traced from ${source ?? "reference"}` +
    (crop ? ` crop ${crop}` : "") +
    (pitch ? `, pitch ${pitch}` : "") +
    `; ${width}x${height} cells` +
    (fit ? ` (fit ${fit})` : "") +
    ". Hand-clean per docs/art-style.md before shipping.";
  const code = `  {
    name: ${JSON.stringify(name)},
    paint(c) {
      ${provenance}
      const L = { ${legendEntries} };
      paintGrid(c, L, [
${rowLines}
      ], { x0: ${x0}, y0: ${y0}, outline: ${outline} });
    },
  },`;

  return { code, legendHex, legendRef, rows, x0, y0 };
}
