import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { PNG } from "pngjs";
import { prepareSpriteIngest, writeSpriteIngestArtifacts } from "./ingest-sprite-core.mjs";
import { sprites } from "./sprites.mjs";

/**
 * Stage 1 recovers the generated logical grid, normalizes its recovered cell palette, and writes
 * a compact source. It never resizes, re-exports, or hand-edits the raw generator PNG: subtle RGB
 * variation is expected and is normalized only after logical-cell sampling. Stage 2 remains the
 * named-ramp projection in writeSprites; its 1x preview is the approval target.
 */
function cliValues() {
  return parseArgs({
    options: {
      name: { type: "string" },
      in: { type: "string" },
      inbox: { type: "string", default: "scripts/art/sprite-gen-inbox" },
      sources: { type: "string", default: "scripts/art/sprite-sources" },
      out: { type: "string", default: "scripts/art/sprite-gen-out" },
      size: { type: "string" },
      crop: { type: "string" },
      tolerance: { type: "string", default: "40" },
      pitch: { type: "string" },
      "pitch-y": { type: "string" },
      "min-long": { type: "string" },
      "max-long": { type: "string" },
      flip: { type: "boolean" },
      "dry-run": { type: "boolean" },
    },
  }).values;
}

function showReport(name, inPath, result, paths, dryRun) {
  const r = result.report;
  const score = (value) => (value === "manual" ? "manual" : Number(value).toFixed(3));
  console.log(
    `ingest-sprite: ${name}\n` +
      `  input: ${inPath} (${r.rawDimensions}, ${r.rawPngColors} raw PNG colors)\n` +
      `  background: [${r.sampledBackground.join(", ")}], crop ${r.crop}, bbox ${JSON.stringify(r.keyedBoundingBox)}, enclosed background ${r.enclosedBgCount}\n` +
      `  pitch: ${r.pitch.x.pitch.toFixed(2)} (phase ${r.pitch.x.phase}, ${score(r.pitch.x.score)}) x ${r.pitch.y.pitch.toFixed(2)} (phase ${r.pitch.y.phase}, ${score(r.pitch.y.score)})\n` +
      `  grid: ${r.grid} on ${r.canvas}px canvas at [${r.placementOffset.join(", ")}], flip ${r.flip}\n` +
      `  cells: ${r.sampledColors} sampled → ${r.normalizedColors} normalized (ceiling ${r.sourceMaxColors}, ${r.changedCellCount} changed)\n` +
      `  Stage 2: ${r.shippedColorCount} shipped colors (max ${r.maxColors}, despeckle ${r.despecklePasses}), off-ramp ${(r.offRampShare * 100).toFixed(1)}%\n` +
      `  full palette material: expected ${JSON.stringify(r.expectedMaterialRampNames)}, declared ${JSON.stringify(r.declaredMaterialRampNames)}\n` +
      `  full palette zones: expected ${JSON.stringify(r.expectedZoneNames)}, declared ${JSON.stringify(r.declaredZoneNames)}\n` +
      `  ${dryRun ? "dry run; would write" : "wrote"}: ${paths.sourcePath}\n` +
      `  ${dryRun ? "dry run; would write" : "wrote"}: ${paths.previewPath}`,
  );
}

export async function main(values = cliValues(), { registry = sprites } = {}) {
  if (!values.name) throw new Error("--name is required (the registry id, e.g. player)");
  const entry = registry.find((sprite) => sprite.name === values.name);
  if (!entry)
    throw new Error(
      `${values.name} is not in the sprite registry (scripts/art/sprites.mjs) — add it there first`,
    );
  const inPath = resolve(values.in ?? `${values.inbox}/${values.name}.png`);
  const image = PNG.sync.read(readFileSync(inPath));
  const crop =
    values.crop && (([x0, y0, x1, y1]) => ({ x0, y0, x1, y1 }))(values.crop.split(",").map(Number));
  const result = prepareSpriteIngest({
    image,
    entry,
    options: {
      size: values.size && Number(values.size),
      crop,
      tolerance: Number(values.tolerance),
      pitch: values.pitch && Number(values.pitch),
      pitchY: values["pitch-y"] && Number(values["pitch-y"]),
      minLong: values["min-long"] && Number(values["min-long"]),
      maxLong: values["max-long"] && Number(values["max-long"]),
      flip: values.flip,
    },
  });
  const paths = {
    sourcePath: resolve(`${values.sources}/sprite-${values.name}.png`),
    previewPath: resolve(`${values.out}/${values.name}-preview-8x.png`),
  };
  await writeSpriteIngestArtifacts({ ...paths, ...result, dryRun: values["dry-run"] });
  showReport(values.name, inPath, result, paths, values["dry-run"]);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`ingest-sprite: ${error.message}`);
    process.exitCode = 1;
  });
}
