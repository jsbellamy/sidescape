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
 */
export const sprites = [
  { name: "player", source: "sprite-player.png", size: 32, alpha: "binary" },
  { name: "chicken", source: "sprite-chicken.png", size: 32, alpha: "binary" },
  { name: "cow", source: "sprite-cow.png", size: 32, alpha: "binary" },
  { name: "goblin", source: "sprite-goblin.png", size: 32, alpha: "binary" },
  { name: "wolf", source: "sprite-wolf.png", size: 32, alpha: "binary" },
  {
    name: "goblin-warrior",
    source: "sprite-goblin-warrior.png",
    size: 32,
    alpha: "binary",
  },
  { name: "bandit", source: "sprite-bandit.png", size: 32, alpha: "binary" },
  { name: "giant-rat", source: "sprite-giant-rat.png", size: 32, alpha: "binary" },
  { name: "zombie", source: "sprite-zombie.png", size: 32, alpha: "binary" },
  { name: "skeleton", source: "sprite-skeleton.png", size: 32, alpha: "binary" },
  {
    name: "crypt-shade",
    source: "sprite-crypt-shade.png",
    size: 48,
    alpha: "one-intermediate",
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
  const named = buildNamedPalette();
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
