import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import { buildNamedPalette, despeckle, quantizeGrid, reducePalette } from "./trace-core.mjs";
import { writePng } from "./write-png.mjs";

const SPRITE_SOURCES_DIR = fileURLToPath(new URL("./sprite-sources", import.meta.url));

/**
 * Per-sprite finishing budget, overridable per registry entry (#264).
 *
 * These were hardcoded constants applied identically to every sprite, which is the right default
 * for a 32x32 Monster read at a glance but actively destroys a hero sprite. `maxColors` merges the
 * least-used colors away, so a rendered character's whole shading vocabulary — the second skin
 * tone, the leather's highlight, the blade's glint — is exactly what falls off the bottom of a
 * 12-color budget. `despecklePasses` then deletes any pixel with no matching 8-neighbor, and on a
 * hand-authored source EVERY isolated pixel is deliberate (the eye, the buckle, the edge highlight)
 * — the cleanup that rescues a machine downscale is vandalism on art someone placed by hand.
 *
 * The defaults reproduce the previously shipped bytes for every entry that does not override them.
 */
const DEFAULT_MAX_COLORS = 12;
const DEFAULT_DESPECKLE_PASSES = 3;

/**
 * Complete combat-sprite registry. Policies are explicit per entry so canvas and alpha behavior
 * never depend on filename conventions. The registry began with interim reconstructions of the
 * current CC0 sprites; issue #142 replaces them slice by slice with original art without changing
 * this runtime contract.
 *
 * `materialRampNames`/`zoneNames` (#252, #261) are the same per-asset quantization scoping the icon
 * pipeline uses (see `scripts/art/icons.mjs`'s SOURCE_PALETTES/`paletteForSource` and
 * `buildNamedPalette`'s doc): each sprite quantizes only against the material ramps and zones its
 * own source actually lands on, so an entry it does not use can never alter it. Before this,
 * quantizing against every ramp in the project meant adding `rune` (a cyan metal) visibly shifted
 * the crypt-shade and zombie sprites, and `zonePalettes` had no allowlist at all so a new zone
 * could do the same. Each list is exactly the set of ramps/zones that win at least one cell of
 * that source; dropping the never-winning ones cannot change any cell's nearest color, so this
 * reproduces the shipped bytes exactly. `zoneNames` is a palette dependency, not a semantic Area
 * ownership claim. `sourceMaxColors` is a separate Stage-1 recovered-cell normalization ceiling
 * (default 16); it does not change the Stage-2 `maxColors` shipped-art budget. `interiorAlpha`
 * is optional authoring metadata for one-intermediate sources: ingest derives it from the placed
 * silhouette, keeping every 8-neighbour boundary opaque.
 */
export const sprites = [
  // The player is the one sprite on screen 100% of the time, and the only one ingested from an
  // original full-body generation rather than a CC0 tile crop (#264) — so she is also the only
  // entry that overrides the finishing budget. `skin`/`leather`/`moss` give quantization the
  // vocabulary her render actually needs (without them her face, hands, belt, boots, and tunic all
  // collapse into the master ramp's umber/shadow browns — `moss` closes that last gap, #278), the
  // wider `maxColors` keeps the shading steps that a 12-color cap merges away, and
  // `despecklePasses: 0` preserves the deliberate single pixels — the eye, the blade highlight —
  // that the 3-pass cleanup deletes.
  {
    name: "player",
    source: "sprite-player.png",
    size: 48,
    alpha: "binary",
    materialRampNames: ["steel", "skin", "leather", "moss"],
    zoneNames: ["forest"],
    sourceMaxColors: 24,
    maxColors: 24,
    despecklePasses: 0,
  },
  {
    name: "chicken",
    source: "sprite-chicken.png",
    size: 32,
    alpha: "binary",
    materialRampNames: ["blood", "ember", "gold", "leather", "skin"],
    zoneNames: ["town"],
  },
  {
    name: "spider",
    source: "sprite-spider.png",
    size: 32,
    alpha: "binary",
    materialRampNames: ["skin", "leather"],
    zoneNames: ["town"],
  },
  {
    name: "boar",
    source: "sprite-boar.png",
    size: 32,
    alpha: "binary",
    materialRampNames: ["steel", "gold", "skin", "leather"],
    zoneNames: ["meadow", "town"],
  },
  {
    name: "cow",
    source: "sprite-cow.png",
    size: 48,
    alpha: "binary",
    materialRampNames: ["blood", "skin", "leather"],
    zoneNames: ["town"],
  },
  {
    name: "goblin",
    source: "sprite-goblin.png",
    size: 32,
    alpha: "binary",
    materialRampNames: ["leather", "moss"],
    zoneNames: ["sewer", "town"],
  },
  {
    name: "goblin-brute",
    source: "sprite-goblin-brute.png",
    size: 48,
    alpha: "binary",
    materialRampNames: ["blood", "skin", "leather", "moss"],
    zoneNames: ["sewer", "town"],
  },
  {
    name: "goblin-chief",
    source: "sprite-goblin-chief.png",
    size: 48,
    alpha: "binary",
    materialRampNames: ["steel", "leather", "moss"],
    zoneNames: ["crypt"],
  },
  {
    name: "wolf",
    source: "sprite-wolf.png",
    size: 32,
    alpha: "binary",
    materialRampNames: ["steel"],
    zoneNames: ["forest", "crypt", "town"],
  },
  {
    name: "goblin-warrior",
    source: "sprite-goblin-warrior.png",
    size: 32,
    alpha: "binary",
    materialRampNames: ["gold", "moss"],
    zoneNames: ["sewer", "town"],
  },
  {
    name: "bandit",
    source: "sprite-bandit.png",
    size: 48,
    alpha: "binary",
    materialRampNames: ["steel", "blood", "adamant", "leather"],
    zoneNames: ["sewer", "town"],
  },
  {
    name: "giant-spider",
    source: "sprite-giant-spider.png",
    size: 48,
    alpha: "binary",
    materialRampNames: ["skin", "leather", "moss"],
    zoneNames: ["town"],
  },
  {
    name: "dark-druid",
    source: "sprite-dark-druid.png",
    size: 48,
    alpha: "binary",
    materialRampNames: ["gold", "blood", "ember", "adamant", "leather"],
    zoneNames: ["forest", "sewer", "crypt", "town"],
  },
  {
    name: "hollow-warden",
    source: "sprite-hollow-warden.png",
    size: 64,
    alpha: "binary",
    materialRampNames: ["leather", "moss"],
    zoneNames: ["forest", "sewer"],
  },
  {
    name: "giant-rat",
    source: "sprite-giant-rat.png",
    size: 32,
    alpha: "binary",
    materialRampNames: ["skin", "leather"],
    zoneNames: ["sewer", "town"],
  },
  {
    name: "zombie",
    source: "sprite-zombie.png",
    size: 48,
    alpha: "binary",
    materialRampNames: ["adamant", "leather", "moss"],
    zoneNames: ["sewer", "town"],
  },
  {
    name: "skeleton",
    source: "sprite-skeleton.png",
    size: 48,
    alpha: "binary",
    materialRampNames: ["gold", "blood", "ember", "skin", "leather"],
    zoneNames: ["town"],
  },
  {
    name: "sewer-king",
    source: "sprite-sewer-king.png",
    size: 48,
    alpha: "binary",
    materialRampNames: ["steel", "blood", "leather"],
    zoneNames: ["crypt", "town"],
  },
  {
    name: "sewer-slime",
    source: "sprite-sewer-slime.png",
    size: 48,
    alpha: "binary",
    materialRampNames: ["gold", "adamant", "skin", "moss"],
    zoneNames: ["meadow", "sewer"],
  },
  {
    name: "grave-robber",
    source: "sprite-grave-robber.png",
    size: 48,
    alpha: "binary",
    materialRampNames: ["steel", "ember", "leather"],
    zoneNames: ["town"],
  },
  {
    name: "crypt-shade",
    source: "sprite-crypt-shade.png",
    size: 64,
    alpha: "one-intermediate",
    interiorAlpha: 160,
    materialRampNames: ["steel", "adamant"],
    zoneNames: ["forest", "sewer", "crypt"],
  },
  // Bone Crypt (#268): original-art player-scale open-world cast.
  {
    name: "crypt-ghoul",
    source: "sprite-crypt-ghoul.png",
    size: 48,
    alpha: "binary",
    materialRampNames: ["blood", "skin", "leather"],
    zoneNames: ["sewer", "town"],
  },
  {
    name: "bone-knight",
    source: "sprite-bone-knight.png",
    size: 48,
    alpha: "binary",
    materialRampNames: ["steel", "water", "rune", "skin"],
    zoneNames: ["meadow", "forest", "sewer", "crypt"],
  },
  // Bone Crypt ranged / caster (#392): original-art recovered through the source-driven sprite pipeline.
  // materialRampNames/zoneNames filled from ingest dry-run audits.
  {
    name: "bone-archer",
    source: "sprite-bone-archer.png",
    size: 48,
    alpha: "binary",
    materialRampNames: ["skin", "leather"],
    zoneNames: ["town"],
  },
  {
    name: "tomb-wight",
    source: "sprite-tomb-wight.png",
    size: 48,
    alpha: "binary",
    materialRampNames: ["steel", "skin", "leather"],
    zoneNames: ["sewer", "crypt"],
  },
  // Frostspire (#269): original-art cast recovered through the source-driven sprite pipeline.
  // Canvas size is explicit visual scale (wolf 32, wraith 48, giant/warden 64), not a Boss-only
  // allowance. materialRampNames/zoneNames are filled from ingest dry-run audits.
  {
    name: "frost-wolf",
    source: "sprite-frost-wolf.png",
    size: 32,
    alpha: "binary",
    materialRampNames: ["water", "rune"],
    zoneNames: ["forest", "sewer", "crypt", "town", "glacier"],
  },
  {
    name: "ice-wraith",
    source: "sprite-ice-wraith.png",
    size: 48,
    alpha: "binary",
    materialRampNames: ["steel", "water"],
    zoneNames: ["meadow", "crypt", "town", "glacier"],
  },
  {
    name: "frost-giant",
    source: "sprite-frost-giant.png",
    size: 64,
    alpha: "binary",
    materialRampNames: ["steel", "water"],
    zoneNames: ["meadow", "sewer", "crypt", "glacier"],
  },
  {
    name: "frost-warden",
    source: "sprite-frost-warden.png",
    size: 64,
    alpha: "binary",
    materialRampNames: ["steel", "water"],
    zoneNames: ["meadow", "forest", "crypt", "glacier"],
  },
];

/**
 * Conforms committed native-canvas sources and writes the production combat-sprite set.
 * `sourceDir` and `registry` are injectable filesystem-boundary inputs for independent callers and
 * tests; production uses the committed source directory and complete registry above.
 */
export async function writeSprites(
  destDir,
  { sourceDir = SPRITE_SOURCES_DIR, registry = sprites } = {},
) {
  for (const sprite of registry) {
    if (sprite.size !== 32 && sprite.size !== 48 && sprite.size !== 64) {
      throw new Error(
        `writeSprites: ${sprite.name} has unsupported canvas size ${JSON.stringify(sprite.size)}`,
      );
    }
    if (sprite.alpha !== "binary" && sprite.alpha !== "one-intermediate") {
      throw new Error(
        `writeSprites: ${sprite.name} has unknown alpha policy ${JSON.stringify(sprite.alpha)}`,
      );
    }
    if (
      sprite.sourceMaxColors !== undefined &&
      (!Number.isInteger(sprite.sourceMaxColors) || sprite.sourceMaxColors <= 0)
    ) {
      throw new Error(
        `writeSprites: ${sprite.name} sourceMaxColors must be a positive integer when declared`,
      );
    }
    if (
      sprite.interiorAlpha !== undefined &&
      (sprite.alpha !== "one-intermediate" ||
        !Number.isInteger(sprite.interiorAlpha) ||
        sprite.interiorAlpha < 1 ||
        sprite.interiorAlpha > 254)
    ) {
      throw new Error(
        `writeSprites: ${sprite.name} interiorAlpha must be an integer from 1 to 254 and requires one-intermediate alpha`,
      );
    }
    if (!sprite.materialRampNames) {
      throw new Error(
        `writeSprites: ${sprite.name} declares no material ramps — list the ramps its source quantizes into (see the registry's doc)`,
      );
    }
    if (!sprite.zoneNames) {
      throw new Error(
        `writeSprites: ${sprite.name} declares no zones — list the zones its source quantizes into, or [] if none win a cell (see the registry's doc)`,
      );
    }
    // Quantize against ONLY the material ramps and zones this sprite's source uses (#252, #261) —
    // an entry it does not declare can never win one of its cells.
    const named = buildNamedPalette({
      materialRampNames: sprite.materialRampNames,
      zoneNames: sprite.zoneNames,
    });
    const sourcePath = `${sourceDir}/${sprite.source}`;
    if (!existsSync(sourcePath)) {
      throw new Error(`writeSprites: ${sprite.name} source ${sprite.source} is missing`);
    }
    const png = PNG.sync.read(readFileSync(sourcePath));
    if (png.width !== sprite.size || png.height !== sprite.size) {
      throw new Error(
        `writeSprites: ${sprite.name} source is ${png.width}x${png.height}; expected ${sprite.size}x${sprite.size}`,
      );
    }
    const alpha = [];
    const grid = [];
    const intermediateAlpha = new Set();
    for (let y = 0; y < png.height; y++) {
      const alphaRow = [];
      const gridRow = [];
      for (let x = 0; x < png.width; x++) {
        const at = (y * png.width + x) * 4;
        const a = png.data[at + 3];
        if (a !== 0 && a !== 255) intermediateAlpha.add(a);
        alphaRow.push(a);
        gridRow.push(a === 0 ? null : [png.data[at], png.data[at + 1], png.data[at + 2]]);
      }
      alpha.push(alphaRow);
      grid.push(gridRow);
    }
    if (sprite.alpha === "binary" && intermediateAlpha.size > 0) {
      throw new Error(
        `writeSprites: ${sprite.name} declares binary alpha but source contains intermediate values ${[...intermediateAlpha].sort((a, b) => a - b).join(", ")}`,
      );
    }
    if (sprite.alpha === "one-intermediate" && intermediateAlpha.size > 1) {
      throw new Error(
        `writeSprites: ${sprite.name} declares one-intermediate alpha but source contains intermediate values ${[...intermediateAlpha].sort((a, b) => a - b).join(", ")}`,
      );
    }
    const { cells: quantized } = quantizeGrid(grid, named);
    const { cells: reduced } = reducePalette(quantized, sprite.maxColors ?? DEFAULT_MAX_COLORS);
    const { cells } = despeckle(reduced, sprite.despecklePasses ?? DEFAULT_DESPECKLE_PASSES);
    await writePng(`${destDir}/${sprite.name}.png`, png.width, png.height, (x, y) => {
      const cell = cells[y][x];
      return cell ? [...cell.rgb, alpha[y][x]] : [0, 0, 0, 0];
    });
  }
}
