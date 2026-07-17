import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";

const overlaysDir = fileURLToPath(new URL("../assets/activity-overlays", import.meta.url));
const overlays = [
  "anvil",
  "cooking",
  "crafting",
  "cauldron",
  "fishing",
  "fishing-meadow",
  "fishing-forest",
  "fishing-sewer",
  "fishing-crypt",
  "fishing-glacier",
];

describe("activity near-scene overlays (#141)", () => {
  for (const name of overlays) {
    it(`${name} is an 80×60 transparent PNG`, () => {
      const png = PNG.sync.read(readFileSync(join(overlaysDir, `activity-${name}-near.png`)));
      expect(png.width).toBe(80);
      expect(png.height).toBe(60);
      expect([...png.data].some((_, index) => index % 4 === 3 && png.data[index]! === 0)).toBe(
        true,
      );
      const colors = new Set<string>();
      for (let index = 0; index < png.data.length; index += 4) {
        if (png.data[index + 3] !== 0) {
          colors.add(`${png.data[index]},${png.data[index + 1]},${png.data[index + 2]}`);
        }
      }
      expect(colors.size).toBeLessThanOrEqual(12);
    });
  }
});
