import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { materialPalettes, zonePalettes } from "./palettes.mjs";
import {
  buildNamedPalette,
  cropImage,
  despeckle,
  detectPitch,
  keyBackground,
  normalizeCellPalette,
  quantizeGrid,
  reducePalette,
  sampleBackground,
  sampleCells,
} from "./trace-core.mjs";
import { encodePng } from "./write-png.mjs";

export const SUPPORTED_SPRITE_CANVAS_SIZES = new Set([32, 48, 64]);
const DEFAULT_SOURCE_MAX_COLORS = 16;
const DEFAULT_MAX_COLORS = 12;
const DEFAULT_DESPECKLE_PASSES = 3;

export function validateSpriteEntry(entry) {
  const errors = [];
  if (!SUPPORTED_SPRITE_CANVAS_SIZES.has(entry.size)) {
    errors.push(`declared canvas must be 32, 48, or 64 (got ${entry.size})`);
  }
  if (entry.alpha !== "binary" && entry.alpha !== "one-intermediate") {
    errors.push(`unknown alpha policy ${JSON.stringify(entry.alpha)}`);
  }
  if (
    entry.sourceMaxColors !== undefined &&
    (!Number.isInteger(entry.sourceMaxColors) || entry.sourceMaxColors <= 0)
  ) {
    errors.push("sourceMaxColors must be a positive integer when declared");
  }
  if (
    entry.interiorAlpha !== undefined &&
    (entry.alpha !== "one-intermediate" ||
      !Number.isInteger(entry.interiorAlpha) ||
      entry.interiorAlpha < 1 ||
      entry.interiorAlpha > 254)
  ) {
    errors.push(
      'interiorAlpha must be an integer from 1 to 254 and requires alpha: "one-intermediate"',
    );
  }
  return errors;
}

/** Derives an opaque 8-neighbourhood boundary, preserving transparent holes as boundaries. */
export function deriveInteriorAlpha(grid, interiorAlpha) {
  return grid.map((row, y) =>
    row.map((cell, x) => {
      if (!cell) return 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          if (!grid[y + dy]?.[x + dx]) return 255;
        }
      return interiorAlpha;
    }),
  );
}

function paletteScopeAudit(grid, entry) {
  const { cells, report } = quantizeGrid(grid, buildNamedPalette());
  const materialWins = new Set();
  const zoneWins = new Set();
  for (const row of cells)
    for (const cell of row) {
      if (!cell) continue;
      for (const name of Object.keys(materialPalettes))
        if (cell.ref.startsWith(`${name}.`)) materialWins.add(name);
      for (const name of Object.keys(zonePalettes))
        if (cell.ref.startsWith(`${name}[`)) zoneWins.add(name);
    }
  const expectedMaterialRampNames = Object.keys(materialPalettes).filter((name) =>
    materialWins.has(name),
  );
  const expectedZoneNames = Object.keys(zonePalettes).filter((name) => zoneWins.has(name));
  const declaredMaterialRampNames = entry.materialRampNames ?? [];
  const declaredZoneNames = entry.zoneNames ?? [];
  const sameSet = (actual, expected) =>
    actual.length === expected.length && actual.every((name) => expected.includes(name));
  const errors = [];
  if (!sameSet(declaredMaterialRampNames, expectedMaterialRampNames)) {
    errors.push(`materialRampNames must be ${JSON.stringify(expectedMaterialRampNames)}`);
  }
  if (!sameSet(declaredZoneNames, expectedZoneNames)) {
    errors.push(`zoneNames must be ${JSON.stringify(expectedZoneNames)}`);
  }
  const opaqueCount = grid.flat().filter(Boolean).length;
  return {
    errors,
    expectedMaterialRampNames,
    expectedZoneNames,
    declaredMaterialRampNames,
    declaredZoneNames,
    offRampShare: opaqueCount === 0 ? 0 : report.filter((row) => row.warn).length / opaqueCount,
  };
}

function placeGrid(cells, size) {
  const gridH = cells.length;
  const gridW = gridH === 0 ? 0 : cells[0].length;
  if (gridW === 0 || gridH === 0) throw new Error("recovered an empty grid — check --tolerance");
  if (cells.some((row) => row.length !== gridW))
    throw new Error("recovered a non-rectangular grid");
  if (gridW > size || gridH > size) {
    throw new Error(`recovered grid is ${gridW}x${gridH}, larger than the ${size}x${size} canvas`);
  }
  const offX = Math.floor((size - gridW) / 2);
  const offY = size - gridH;
  const grid = Array.from({ length: size }, () => Array(size).fill(null));
  for (let y = 0; y < gridH; y++)
    for (let x = 0; x < gridW; x++) grid[y + offY][x + offX] = cells[y][x];
  return { grid, gridW, gridH, offX, offY };
}

export function prepareSpriteIngest({ image, entry, options = {} }) {
  const entryErrors = validateSpriteEntry(entry);
  if (entryErrors.length) throw new Error(entryErrors.join("; "));
  const size = options.size ?? entry.size;
  if (options.size !== undefined && options.size !== entry.size) {
    throw new Error(
      `--size ${options.size} conflicts with ${entry.name}'s declared ${entry.size}px canvas`,
    );
  }
  if (!SUPPORTED_SPRITE_CANVAS_SIZES.has(size))
    throw new Error(`--size must be 32, 48, or 64 (got ${size})`);
  const cropped = options.crop ? cropImage(image, options.crop) : image;
  const background = sampleBackground(cropped);
  const { fg, bbox, enclosedBgCount } = keyBackground(
    cropped,
    background,
    options.tolerance ?? 40,
    { keyEnclosed: true },
  );
  if (!bbox) throw new Error("keyed out the entire image — check --crop and --tolerance");
  const bboxLong = Math.max(bbox.x1 - bbox.x0 + 1, bbox.y1 - bbox.y0 + 1);
  const minLong = options.minLong ?? size - 8;
  const maxLong = options.maxLong ?? size;
  const band = { min: bboxLong / maxLong, max: bboxLong / minLong };
  const px = options.pitch
    ? { pitch: options.pitch, phase: bbox.x0, score: "manual" }
    : detectPitch(cropped, fg, "x", band);
  const py = options.pitchY
    ? { pitch: options.pitchY, phase: bbox.y0, score: "manual" }
    : detectPitch(cropped, fg, "y", band);
  let cells = sampleCells(cropped, fg, bbox, {
    pitchX: px.pitch,
    phaseX: px.phase,
    pitchY: py.pitch,
    phaseY: py.phase,
  });
  const normalized = normalizeCellPalette(cells, {
    maxColors: entry.sourceMaxColors ?? DEFAULT_SOURCE_MAX_COLORS,
  });
  cells = normalized.cells;
  if (options.flip) cells = cells.map((row) => [...row].reverse());
  const placed = placeGrid(cells, size);
  const alpha =
    entry.interiorAlpha === undefined
      ? placed.grid.map((row) => row.map((cell) => (cell ? 255 : 0)))
      : deriveInteriorAlpha(placed.grid, entry.interiorAlpha);
  const audit = paletteScopeAudit(placed.grid, entry);
  if (audit.errors.length) throw new Error(audit.errors.join("; "));
  const named = buildNamedPalette({
    materialRampNames: entry.materialRampNames,
    zoneNames: entry.zoneNames,
  });
  const { cells: quantized } = quantizeGrid(placed.grid, named);
  const { cells: reduced } = reducePalette(quantized, entry.maxColors ?? DEFAULT_MAX_COLORS);
  const { cells: finished } = despeckle(reduced, entry.despecklePasses ?? DEFAULT_DESPECKLE_PASSES);
  const source = encodePng(size, size, (x, y) =>
    placed.grid[y][x] ? [...placed.grid[y][x], alpha[y][x]] : [0, 0, 0, 0],
  );
  const scale = 8;
  const preview = encodePng(size * scale, size * scale, (x, y) => {
    const cell = finished[Math.floor(y / scale)][Math.floor(x / scale)];
    return cell ? [...cell.rgb, alpha[Math.floor(y / scale)][Math.floor(x / scale)]] : [0, 0, 0, 0];
  });
  const shipped = new Set();
  for (const row of finished) for (const cell of row) if (cell) shipped.add(cell.ref);
  return {
    source,
    preview,
    report: {
      rawDimensions: `${image.width}x${image.height}`,
      rawPngColors: new Set(
        Array.from({ length: image.width * image.height }, (_, index) => {
          const at = index * 4;
          return `${image.data[at]},${image.data[at + 1]},${image.data[at + 2]},${image.data[at + 3]}`;
        }),
      ).size,
      sampledBackground: background,
      crop: `${cropped.width}x${cropped.height}`,
      keyedBoundingBox: bbox,
      enclosedBgCount,
      pitch: { x: px, y: py },
      grid: `${placed.gridW}x${placed.gridH}`,
      canvas: size,
      placementOffset: [placed.offX, placed.offY],
      flip: Boolean(options.flip),
      sampledColors: normalized.inputColorCount,
      normalizedColors: normalized.outputColorCount,
      sourceMaxColors: entry.sourceMaxColors ?? DEFAULT_SOURCE_MAX_COLORS,
      changedCellCount: normalized.changedCellCount,
      shippedColorCount: shipped.size,
      maxColors: entry.maxColors ?? DEFAULT_MAX_COLORS,
      despecklePasses: entry.despecklePasses ?? DEFAULT_DESPECKLE_PASSES,
      offRampShare: audit.offRampShare,
      ...audit,
    },
  };
}

async function atomicWrite(path, buffer) {
  const target = resolve(path);
  await mkdir(dirname(target), { recursive: true });
  const temporary = `${target}.tmp-${process.pid}-${Math.random().toString(16).slice(2)}`;
  try {
    await writeFile(temporary, buffer);
    await rename(temporary, target);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

/** Writes fully prepared artifacts only after all transforms and validations have completed. */
export async function writeSpriteIngestArtifacts({
  sourcePath,
  previewPath,
  source,
  preview,
  dryRun = false,
}) {
  if (dryRun) return;
  await atomicWrite(sourcePath, source);
  await atomicWrite(previewPath, preview);
}
