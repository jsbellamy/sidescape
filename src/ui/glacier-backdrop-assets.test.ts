import { mkdtemp, readFile, rm } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { zonePalettes } from "../../scripts/art/palettes.mjs";
import {
  assertHorizontalPeriod,
  backdrops,
  BACKDROP_WIDTH,
  REVIEW_PERIODS,
  writeBackdrops,
} from "../../scripts/art/backdrops.mjs";
import { isRgbWithinHslGamut } from "../../scripts/art/trace-core.mjs";

const layers = ["sky", "mid", "near"] as const;
const otherThemes = ["meadow", "forest", "sewer", "crypt", "town"] as const;

const GLACIER_GAMUT = {
  neutralMaxSaturation: 20,
  chromaticHueRange: [175, 240] as [number, number],
  chromaticMaxSaturation: 65,
};

const GLACIER_ANCHOR = ["#10263d", "#244763", "#4c718d", "#7f9eb3", "#b8cbd4", "#e8f0ed"];

describe("Glacier source-driven backdrop assets (#293)", () => {
  const glacier = backdrops.find((entry) => entry.theme === "glacier");
  const stylesheet = readFileSync("src/styles.css", "utf8");
  const artStyle = readFileSync("docs/art-style.md", "utf8");

  it("pins the Glacier zone anchor ramp in palettes and art-style docs", () => {
    expect(zonePalettes.glacier).toEqual(GLACIER_ANCHOR);
    expect(artStyle).toContain("`#10263d #244763 #4c718d #7f9eb3 #b8cbd4 #e8f0ed`");
  });

  it("registers Glacier as the first production source Theme with the pinned gamut and caps", () => {
    expect(backdrops).toHaveLength(1);
    expect(glacier).toEqual({
      theme: "glacier",
      kind: "source",
      gamut: GLACIER_GAMUT,
      layers: {
        sky: { source: "glacier-sky.png", alpha: "opaque", maxColors: 48 },
        mid: { source: "glacier-mid.png", alpha: "binary", maxColors: 64 },
        near: { source: "glacier-near.png", alpha: "binary", maxColors: 48 },
      },
    });
  });

  it("uses the pinned Glacier CSS fallbacks without changing shared drift contracts", () => {
    expect(stylesheet).toContain("linear-gradient(to bottom, #10263d, #b8cbd4)");
    expect(stylesheet).toContain(
      "linear-gradient(to top, #244763 0 var(--mid-horizon), rgba(36, 71, 99, 0) var(--tile-h))",
    );
    expect(stylesheet).toContain(
      "linear-gradient(to top, #10263d 0 var(--near-horizon), rgba(16, 38, 61, 0) var(--tile-h))",
    );
    expect(stylesheet).not.toMatch(
      /#backdrop\[data-theme="glacier"\][\s\S]*?#041437|#0e8ae9|#bcdff0/,
    );
  });

  for (const layer of layers) {
    it(`${layer} is a 160x120 source-identical shipped PNG within the Theme gamut`, () => {
      const source = readFileSync(join("scripts/art/backdrop-sources", `glacier-${layer}.png`));
      const shipped = readFileSync(join("src/assets/backdrops", `glacier-${layer}.png`));
      expect(shipped.equals(source)).toBe(true);
      const png = PNG.sync.read(shipped);
      expect([png.width, png.height]).toEqual([160, 120]);
      expect(glacier).toBeDefined();
      for (let i = 0; i < png.data.length; i += 4) {
        const alpha = png.data[i + 3]!;
        if (layer === "sky") expect(alpha).toBe(255);
        else expect(alpha === 0 || alpha === 255).toBe(true);
        if (alpha === 0) continue;
        const rgb: [number, number, number] = [png.data[i]!, png.data[i + 1]!, png.data[i + 2]!];
        expect(isRgbWithinHslGamut(rgb, glacier!.gamut)).toBe(true);
      }
    });
  }

  it("rejects a warm chromatic pixel and saturated cyan under the shared Theme gamut predicate", () => {
    expect(isRgbWithinHslGamut([220, 80, 40], GLACIER_GAMUT)).toBe(false);
    expect(isRgbWithinHslGamut([0, 255, 255], GLACIER_GAMUT)).toBe(false);
    expect(isRgbWithinHslGamut([16, 38, 61], GLACIER_GAMUT)).toBe(true);
  });

  it("Stage 2 writeBackdrops copies Glacier sources byte-identically across two runs and leaves other biomes untouched", async () => {
    const destDir = await mkdtemp(join(tmpdir(), "glacier-stage2-"));
    const before = Object.fromEntries(
      otherThemes.flatMap((theme) =>
        layers.map((layer) => {
          const path = join("src/assets/backdrops", `${theme}-${layer}.png`);
          return [path, readFileSync(path)] as const;
        }),
      ),
    );
    try {
      await writeBackdrops(destDir);
      const first = Object.fromEntries(
        await Promise.all(
          layers.map(async (layer) => {
            const bytes = await readFile(join(destDir, `glacier-${layer}.png`));
            const source = await readFile(
              join("scripts/art/backdrop-sources", `glacier-${layer}.png`),
            );
            expect(bytes.equals(source)).toBe(true);
            return [layer, bytes] as const;
          }),
        ),
      );
      await writeBackdrops(destDir);
      for (const layer of layers) {
        expect((await readFile(join(destDir, `glacier-${layer}.png`))).equals(first[layer]!)).toBe(
          true,
        );
      }
      for (const [path, bytes] of Object.entries(before)) {
        expect(readFileSync(path).equals(bytes)).toBe(true);
      }
    } finally {
      await rm(destDir, { recursive: true, force: true });
    }
  });

  it("each Glacier compact source is exactly horizontally periodic across three 160px periods", () => {
    for (const layer of layers) {
      const png = PNG.sync.read(
        readFileSync(join("scripts/art/backdrop-sources", `glacier-${layer}.png`)),
      );
      const width = BACKDROP_WIDTH * REVIEW_PERIODS;
      const data = new Uint8ClampedArray(width * png.height * 4);
      for (let y = 0; y < png.height; y++)
        for (let x = 0; x < width; x++) {
          const from = (y * BACKDROP_WIDTH + (x % BACKDROP_WIDTH)) * 4;
          data.set(png.data.slice(from, from + 4), (y * width + x) * 4);
        }
      expect(() => assertHorizontalPeriod({ width, height: png.height, data })).not.toThrow();
    }
  });
});
