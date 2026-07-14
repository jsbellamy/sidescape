import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import { buildNamedPalette, despeckle, quantizeGrid, reducePalette } from "./trace-core.mjs";
import { writePng } from "./write-png.mjs";

const SPRITE_SOURCES_DIR = fileURLToPath(new URL("./sprite-sources", import.meta.url));

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
 * ownership claim.
 */
export const sprites = [
  {
    name: "player",
    source: "sprite-player.png",
    size: 32,
    alpha: "binary",
    materialRampNames: ["steel"],
    zoneNames: ["forest"],
  },
  {
    name: "chicken",
    source: "sprite-chicken.png",
    size: 32,
    alpha: "binary",
    materialRampNames: ["blood", "ember", "steel"],
    zoneNames: ["town", "forest", "meadow"],
  },
  {
    name: "cow",
    source: "sprite-cow.png",
    size: 32,
    alpha: "binary",
    materialRampNames: ["blood", "ember", "steel"],
    zoneNames: ["town", "forest"],
  },
  {
    name: "goblin",
    source: "sprite-goblin.png",
    size: 32,
    alpha: "binary",
    materialRampNames: ["blood", "steel"],
    zoneNames: ["forest", "meadow", "town"],
  },
  {
    name: "wolf",
    source: "sprite-wolf.png",
    size: 32,
    alpha: "binary",
    materialRampNames: ["gold", "steel"],
    zoneNames: ["sewer", "forest"],
  },
  {
    name: "goblin-warrior",
    source: "sprite-goblin-warrior.png",
    size: 32,
    alpha: "binary",
    materialRampNames: ["blood", "water"],
    zoneNames: ["forest", "crypt"],
  },
  {
    name: "bandit",
    source: "sprite-bandit.png",
    size: 32,
    alpha: "binary",
    materialRampNames: ["blood", "gold", "steel"],
    zoneNames: ["town", "crypt", "meadow"],
  },
  {
    name: "giant-rat",
    source: "sprite-giant-rat.png",
    size: 32,
    alpha: "binary",
    materialRampNames: ["blood", "steel"],
    zoneNames: ["crypt", "sewer"],
  },
  {
    name: "zombie",
    source: "sprite-zombie.png",
    size: 32,
    alpha: "binary",
    materialRampNames: ["blood", "steel", "water"],
    zoneNames: ["forest"],
  },
  {
    name: "skeleton",
    source: "sprite-skeleton.png",
    size: 32,
    alpha: "binary",
    materialRampNames: ["blood", "ember", "steel"],
    zoneNames: [],
  },
  {
    name: "crypt-shade",
    source: "sprite-crypt-shade.png",
    size: 48,
    alpha: "one-intermediate",
    materialRampNames: ["blood", "ember", "steel", "water"],
    zoneNames: ["forest", "town", "meadow"],
  },
  // Shade Crypt (#253): two new open-world Bone Crypt Monsters. Interim CC0 derivatives, same
  // provenance and derivation pattern as the rest of this registry's sources (see docs/assets.md);
  // #142 replaces them along with the rest of the cast.
  {
    name: "crypt-ghoul",
    source: "sprite-crypt-ghoul.png",
    size: 32,
    alpha: "binary",
    materialRampNames: ["steel", "blood", "rune", "adamant"],
    zoneNames: ["forest"],
  },
  {
    name: "bone-knight",
    source: "sprite-bone-knight.png",
    size: 32,
    alpha: "binary",
    materialRampNames: ["steel", "rune", "adamant"],
    zoneNames: ["forest"],
  },
  // Frostspire (#254): the 5th Area's own cast. Interim CC0 derivatives, same provenance and
  // derivation pattern as the rest of this registry's sources (see docs/assets.md); #142 replaces
  // them along with the rest of the cast. frost-warden uses the sanctioned 48x48 Boss canvas.
  {
    name: "frost-wolf",
    source: "sprite-frost-wolf.png",
    size: 32,
    alpha: "binary",
    materialRampNames: ["steel"],
    zoneNames: [],
  },
  {
    name: "ice-wraith",
    source: "sprite-ice-wraith.png",
    size: 32,
    alpha: "binary",
    materialRampNames: ["steel", "water"],
    zoneNames: [],
  },
  {
    name: "frost-giant",
    source: "sprite-frost-giant.png",
    size: 32,
    alpha: "binary",
    materialRampNames: ["steel", "rune", "blood"],
    zoneNames: ["glacier"],
  },
  {
    name: "frost-warden",
    source: "sprite-frost-warden.png",
    size: 48,
    alpha: "binary",
    materialRampNames: ["steel"],
    zoneNames: [],
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
    const { cells: reduced } = reducePalette(quantized, 12);
    const { cells } = despeckle(reduced);
    await writePng(`${destDir}/${sprite.name}.png`, png.width, png.height, (x, y) => {
      const cell = cells[y][x];
      return cell ? [...cell.rgb, alpha[y][x]] : [0, 0, 0, 0];
    });
  }
}
