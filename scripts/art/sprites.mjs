import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import { buildNamedPalette, despeckle, quantizeGrid, reducePalette } from "./trace-core.mjs";
import { writePng } from "./write-png.mjs";

const SPRITE_SOURCES_DIR = fileURLToPath(new URL("./sprite-sources", import.meta.url));

/**
 * Complete combat-sprite registry. Policies are explicit per entry so canvas and alpha behavior
 * never depend on filename conventions. The committed sources are interim reconstructions of the
 * current CC0 sprites; issue #142 replaces their art without changing this runtime contract.
 *
 * `ramps` (#252) is the same per-asset quantization scoping the icon pipeline uses (see
 * `scripts/art/icons.mjs`'s SOURCE_RAMPS and `buildNamedPalette`'s doc): each sprite quantizes
 * only against the material ramps its own source actually lands on, so a ramp it does not use can
 * never alter it. Before this, quantizing against every ramp in the project meant adding `rune`
 * (a cyan metal) visibly shifted the crypt-shade and zombie sprites. Each list is exactly the set
 * of ramps that win at least one cell of that source; dropping the never-winning ramps cannot
 * change any cell's nearest color, so this reproduces the shipped bytes exactly.
 */
export const sprites = [
  {
    name: "player",
    source: "sprite-player.png",
    size: 32,
    alpha: "binary",
    ramps: ["blood", "ember", "steel"],
  },
  {
    name: "chicken",
    source: "sprite-chicken.png",
    size: 32,
    alpha: "binary",
    ramps: ["blood", "ember", "steel"],
  },
  {
    name: "cow",
    source: "sprite-cow.png",
    size: 32,
    alpha: "binary",
    ramps: ["blood", "ember", "steel"],
  },
  {
    name: "goblin",
    source: "sprite-goblin.png",
    size: 32,
    alpha: "binary",
    ramps: ["blood", "steel"],
  },
  { name: "wolf", source: "sprite-wolf.png", size: 32, alpha: "binary", ramps: ["gold", "steel"] },
  {
    name: "goblin-warrior",
    source: "sprite-goblin-warrior.png",
    size: 32,
    alpha: "binary",
    ramps: ["blood", "water"],
  },
  {
    name: "bandit",
    source: "sprite-bandit.png",
    size: 32,
    alpha: "binary",
    ramps: ["blood", "gold", "steel"],
  },
  {
    name: "giant-rat",
    source: "sprite-giant-rat.png",
    size: 32,
    alpha: "binary",
    ramps: ["blood", "steel"],
  },
  {
    name: "zombie",
    source: "sprite-zombie.png",
    size: 32,
    alpha: "binary",
    ramps: ["blood", "steel", "water"],
  },
  {
    name: "skeleton",
    source: "sprite-skeleton.png",
    size: 32,
    alpha: "binary",
    ramps: ["blood", "ember", "steel"],
  },
  {
    name: "crypt-shade",
    source: "sprite-crypt-shade.png",
    size: 48,
    alpha: "one-intermediate",
    ramps: ["blood", "ember", "steel", "water"],
  },
  // Shade Crypt (#253): two new open-world Bone Crypt Monsters. Interim CC0 derivatives, same
  // provenance and derivation pattern as the rest of this registry's sources (see docs/assets.md);
  // #142 replaces them along with the rest of the cast.
  {
    name: "crypt-ghoul",
    source: "sprite-crypt-ghoul.png",
    size: 32,
    alpha: "binary",
    ramps: ["steel", "blood", "rune", "adamant"],
  },
  {
    name: "bone-knight",
    source: "sprite-bone-knight.png",
    size: 32,
    alpha: "binary",
    ramps: ["steel", "rune", "adamant"],
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
    if (sprite.size !== 32 && sprite.size !== 48) {
      throw new Error(
        `writeSprites: ${sprite.name} has unsupported canvas size ${JSON.stringify(sprite.size)}`,
      );
    }
    if (sprite.alpha !== "binary" && sprite.alpha !== "one-intermediate") {
      throw new Error(
        `writeSprites: ${sprite.name} has unknown alpha policy ${JSON.stringify(sprite.alpha)}`,
      );
    }
    if (!sprite.ramps) {
      throw new Error(
        `writeSprites: ${sprite.name} declares no material ramps — list the ramps its source quantizes into (see the registry's doc)`,
      );
    }
    // Quantize against ONLY the ramps this sprite's source uses (#252) — a ramp it does not
    // declare can never win one of its cells.
    const named = buildNamedPalette(sprite.ramps);
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
    const { cells: reduced } = reducePalette(quantized, 12);
    const { cells } = despeckle(reduced);
    await writePng(`${destDir}/${sprite.name}.png`, png.width, png.height, (x, y) => {
      const cell = cells[y][x];
      return cell ? [...cell.rgb, alpha[y][x]] : [0, 0, 0, 0];
    });
  }
}
