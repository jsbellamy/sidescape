import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PNG } from "pngjs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  assertHorizontalPeriod,
  backdrops,
  BACKDROP_HEIGHT,
  BACKDROP_WIDTH,
  REVIEW_PERIODS,
  renderPeriodicLayer,
  validateBackdropDefinition,
  writeBackdrops,
} from "./backdrops.mjs";
import { prepareBackdropIngest, writeBackdropIngestArtifacts } from "./ingest-backdrop.mjs";
import {
  conformCellPaletteToHslGamut,
  isRgbWithinHslGamut,
  normalizeCellPalette,
} from "./trace-core.mjs";
import { encodePng } from "./write-png.mjs";

/** Permissive Theme gamut so existing #305/#311 fixtures remain valid under #313. */
const PERMISSIVE_GAMUT = {
  neutralMaxSaturation: 100,
  chromaticHueRange: [0, 359],
  chromaticMaxSaturation: 100,
};

/** Glacier-shaped Theme gamut used by focused #313 pipeline fixtures. */
const GLACIER_GAMUT = {
  neutralMaxSaturation: 20,
  chromaticHueRange: [175, 240],
  chromaticMaxSaturation: 65,
};

/** A synthetic registry independent of the production `backdrops` registry (#263/#293) — infra
 * tests inject this so they never depend on Glacier's real compact sources for mechanical checks. */
function makeSyntheticRegistry(): [
  {
    theme: string;
    kind: "paint";
    layers: Record<string, (px: { localX: number; y: number }) => number[]>;
  },
] {
  return [
    {
      theme: "test-theme",
      kind: "paint",
      layers: {
        sky: ({ localX, y }: { localX: number; y: number }) => [localX % 256, y % 256, 10, 255],
        mid: () => [20, 30, 40, 255],
        near: () => [50, 60, 70, 255],
      },
    },
  ];
}

let destDir: string;

beforeEach(async () => {
  destDir = await mkdtemp(join(tmpdir(), "backdrop-generator-test-"));
});

afterEach(async () => {
  await rm(destDir, { recursive: true, force: true });
});

describe("backdrop generator infrastructure (#263)", () => {
  it("exposes the pinned review constants", () => {
    expect(BACKDROP_WIDTH).toBe(160);
    expect(BACKDROP_HEIGHT).toBe(120);
    expect(REVIEW_PERIODS).toBe(3);
  });

  it("registers Glacier as the first production source backdrop with its pinned compact caps", () => {
    expect(backdrops).toEqual([
      {
        theme: "glacier",
        kind: "source",
        gamut: {
          neutralMaxSaturation: 20,
          chromaticHueRange: [175, 240],
          chromaticMaxSaturation: 65,
        },
        layers: {
          sky: { source: "glacier-sky.png", alpha: "opaque", maxColors: 48 },
          mid: { source: "glacier-mid.png", alpha: "binary", maxColors: 64 },
          near: { source: "glacier-near.png", alpha: "binary", maxColors: 48 },
        },
      },
    ]);
  });

  it("writes exact <theme>-<layer>.png filenames for sky/mid/near", async () => {
    await writeBackdrops(destDir, { registry: makeSyntheticRegistry() });
    const files = (await readdir(destDir)).sort();
    expect(files).toEqual(["test-theme-mid.png", "test-theme-near.png", "test-theme-sky.png"]);
  });

  it("ships each layer at the 160x120 shipped dimensions", async () => {
    await writeBackdrops(destDir, { registry: makeSyntheticRegistry() });
    const png = PNG.sync.read(await readFile(join(destDir, "test-theme-sky.png")));
    expect(png.width).toBe(BACKDROP_WIDTH);
    expect(png.height).toBe(BACKDROP_HEIGHT);
  });

  it("is byte-stable across two runs", async () => {
    const registry = makeSyntheticRegistry();
    await writeBackdrops(destDir, { registry });
    const first = await readFile(join(destDir, "test-theme-near.png"));
    await writeBackdrops(destDir, { registry });
    const second = await readFile(join(destDir, "test-theme-near.png"));
    expect(second.equals(first)).toBe(true);
  });

  it("renders a 480x120 review image whose three 160px periods compare byte-for-byte", () => {
    const paint = ({ localX, y }: { localX: number; y: number }) => [
      localX % 256,
      (y * 3) % 256,
      (localX + y) % 256,
      255,
    ];
    const review = renderPeriodicLayer(paint);
    expect(review.width).toBe(BACKDROP_WIDTH * REVIEW_PERIODS);
    expect(review.height).toBe(BACKDROP_HEIGHT);
    expect(() => assertHorizontalPeriod(review)).not.toThrow();
  });

  // Non-vacuous proof that assertHorizontalPeriod actually inspects every pixel rather than a
  // structural/sampled subset: flips a single color channel of ONE pixel inside the second period
  // (x in [160, 320)) of an otherwise genuinely periodic render, and requires a throw.
  it("assertHorizontalPeriod rejects a single deliberately changed pixel in period two", () => {
    const review = renderPeriodicLayer(({ localX, y }: { localX: number; y: number }) => [
      localX % 256,
      y % 256,
      0,
      255,
    ]);
    expect(() => assertHorizontalPeriod(review)).not.toThrow();

    const corruptX = BACKDROP_WIDTH + 5; // inside period two
    const corruptY = 10;
    const at = (corruptY * review.width + corruptX) * 4;
    review.data[at] = ((review.data[at] ?? 0) + 1) % 256;

    expect(() => assertHorizontalPeriod(review)).toThrow(/mismatch/i);
  });

  it("throws loudly on a duplicate theme", async () => {
    const registry = [...makeSyntheticRegistry(), ...makeSyntheticRegistry()];
    await expect(writeBackdrops(destDir, { registry })).rejects.toThrow(/duplicate/i);
  });

  it("throws loudly when a layer is missing", async () => {
    const [def] = makeSyntheticRegistry();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (def.layers as any).mid;
    await expect(writeBackdrops(destDir, { registry: [def] })).rejects.toThrow(/missing/i);
  });

  it("throws loudly when an extra layer is present", async () => {
    const [def] = makeSyntheticRegistry();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (def.layers as any).extra = () => [0, 0, 0, 255];
    await expect(writeBackdrops(destDir, { registry: [def] })).rejects.toThrow(/unknown|extra/i);
  });

  it("throws loudly on malformed RGBA output", async () => {
    const [def] = makeSyntheticRegistry();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (def.layers as any).sky = () => [0, 0, 0]; // missing alpha channel
    await expect(writeBackdrops(destDir, { registry: [def] })).rejects.toThrow(/rgba/i);
  });

  it("throws loudly on a non-function painter", async () => {
    const [def] = makeSyntheticRegistry();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (def.layers as any).near = "not-a-function";
    await expect(writeBackdrops(destDir, { registry: [def] })).rejects.toThrow(/function/i);
  });

  it("never writes or touches files for themes absent from the registry", async () => {
    const untouchedPath = join(destDir, "other-theme-sky.png");
    await writeFile(untouchedPath, "keep-me");
    await writeBackdrops(destDir, { registry: makeSyntheticRegistry() });
    expect(await readFile(untouchedPath, "utf8")).toBe("keep-me");
  });

  it("the production Glacier registry writes only glacier layers and leaves other themes untouched", async () => {
    const sentinelPath = join(destDir, "meadow-sky.png");
    await writeFile(sentinelPath, "sentinel-bytes");
    await writeBackdrops(destDir);
    expect(await readFile(sentinelPath, "utf8")).toBe("sentinel-bytes");
    const glacierSky = await readFile(join(destDir, "glacier-sky.png"));
    const sourceSky = await readFile(join("scripts/art/backdrop-sources", "glacier-sky.png"));
    expect(glacierSky.equals(sourceSky)).toBe(true);
  });
});

function sourceRegistry(gamut = PERMISSIVE_GAMUT) {
  return [
    {
      theme: "source-theme",
      kind: "source" as const,
      gamut,
      layers: {
        sky: { source: "source-theme-sky.png", alpha: "opaque" as const, maxColors: 4 },
        mid: { source: "source-theme-mid.png", alpha: "binary" as const, maxColors: 4 },
        near: { source: "source-theme-near.png", alpha: "binary" as const, maxColors: 4 },
      },
    },
  ];
}

async function writeFixture(dir: string, name: string, alpha: number) {
  await writeFile(
    join(dir, name),
    encodePng(BACKDROP_WIDTH, BACKDROP_HEIGHT, (x: number, y: number) => [
      x % 2 ? 10 : 20,
      y % 2 ? 30 : 40,
      50,
      alpha,
    ]),
  );
}

describe("source-driven backdrop definitions (#305)", () => {
  it("reads injected compact sources outside the repository and writes identical decoded RGBA", async () => {
    const sourceDir = await mkdtemp(join(tmpdir(), "backdrop-source-test-"));
    try {
      await writeFixture(sourceDir, "source-theme-sky.png", 255);
      await writeFixture(sourceDir, "source-theme-mid.png", 0);
      await writeFixture(sourceDir, "source-theme-near.png", 255);
      await writeBackdrops(destDir, { registry: sourceRegistry(), sourceDir });
      const input = PNG.sync.read(await readFile(join(sourceDir, "source-theme-sky.png")));
      const output = PNG.sync.read(await readFile(join(destDir, "source-theme-sky.png")));
      expect(Array.from(output.data)).toEqual(Array.from(input.data));
      const first = await readFile(join(destDir, "source-theme-near.png"));
      await writeBackdrops(destDir, { registry: sourceRegistry(), sourceDir });
      expect((await readFile(join(destDir, "source-theme-near.png"))).equals(first)).toBe(true);
    } finally {
      await rm(sourceDir, { recursive: true, force: true });
    }
  });

  it("rejects partial alpha, bad dimensions, excess colors, traversal, mixed shapes, and invalid caps before output", async () => {
    const sourceDir = await mkdtemp(join(tmpdir(), "backdrop-invalid-source-"));
    try {
      await writeFixture(sourceDir, "source-theme-sky.png", 255);
      await writeFixture(sourceDir, "source-theme-mid.png", 128);
      await writeFixture(sourceDir, "source-theme-near.png", 255);
      await expect(
        writeBackdrops(destDir, { registry: sourceRegistry(), sourceDir }),
      ).rejects.toThrow(/binary alpha/i);
      expect(await readdir(destDir)).toEqual([]);
      const bad = sourceRegistry()[0]!;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (bad.layers.sky as any).source = "../escape.png";
      await expect(writeBackdrops(destDir, { registry: [bad], sourceDir })).rejects.toThrow(
        /unsafe/i,
      );
      const mixed = sourceRegistry()[0]!;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mixed.layers.mid as any) = () => [0, 0, 0, 255];
      await expect(writeBackdrops(destDir, { registry: [mixed], sourceDir })).rejects.toThrow(
        /source layer/i,
      );
      const cap = sourceRegistry()[0]!;
      cap.layers.near.maxColors = 0;
      await expect(writeBackdrops(destDir, { registry: [cap], sourceDir })).rejects.toThrow(
        /positive integer/i,
      );
    } finally {
      await rm(sourceDir, { recursive: true, force: true });
    }
  });

  it("recovers a chunky 160x120 grid by majority vote without resampling", () => {
    const raw = PNG.sync.read(
      encodePng(BACKDROP_WIDTH * 2, BACKDROP_HEIGHT * 2, (x: number, y: number) => {
        const gx = Math.floor(x / 2),
          gy = Math.floor(y / 2);
        return gx < 8 && gy < 8 ? [20, 40, 60, 255] : [255, 0, 255, 255];
      }),
    );
    const result = prepareBackdropIngest({
      image: raw,
      theme: "source-theme",
      layer: "mid",
      registry: sourceRegistry(),
      pitch: 2,
      pitchY: 2,
    });
    expect(result.compact.width).toBe(BACKDROP_WIDTH);
    expect(result.compact.height).toBe(BACKDROP_HEIGHT);
    expect(result.compact.data[3]).toBe(255);
    expect(result.compact.data[(20 * BACKDROP_WIDTH + 20) * 4 + 3]).toBe(0);
  });
});

function recoveredRaw(
  layer: "sky" | "mid" | "near",
  cell: (x: number, y: number) => [number, number, number] | null,
) {
  return PNG.sync.read(
    encodePng(BACKDROP_WIDTH * 2, BACKDROP_HEIGHT * 2, (x: number, y: number) => {
      const rgb = cell(Math.floor(x / 2), Math.floor(y / 2));
      return rgb ? [...rgb, 255] : layer === "sky" ? [0, 0, 0, 0] : [255, 0, 255, 255];
    }),
  );
}

function ingestFixture({
  layer = "sky",
  maxColors = 4,
  gamut = PERMISSIVE_GAMUT,
  cell,
}: {
  layer?: "sky" | "mid" | "near";
  maxColors?: number;
  gamut?: typeof PERMISSIVE_GAMUT;
  cell: (x: number, y: number) => [number, number, number] | null;
}) {
  return prepareBackdropIngest({
    image: recoveredRaw(layer, cell),
    theme: "source-theme",
    layer,
    registry: sourceRegistry(gamut).map((definition) => ({
      ...definition,
      layers: Object.fromEntries(
        Object.entries(definition.layers).map(([name, target]) => [name, { ...target, maxColors }]),
      ),
    })),
    pitch: 2,
    pitchY: 2,
  });
}

describe("backdrop ingest palette normalization (#311)", () => {
  it("normalizes an over-cap recovered sky and reports the source-local change", () => {
    const result = ingestFixture({
      maxColors: 3,
      cell: (x, y) => {
        const color = (x + y) % 5;
        return [color * 40, color * 30, color * 20];
      },
    });
    expect(result.report.sampledColors).toBeGreaterThan(result.report.maxColors);
    expect(result.report.normalizedColors).toBeLessThanOrEqual(result.report.maxColors);
    expect(result.report.changedCellCount).toBeGreaterThan(0);
    expect(result.colorCount).toBeLessThanOrEqual(result.report.maxColors);
    expect(
      result.compact.data.every(
        (_, index) => index % 4 !== 3 || result.compact.data[index] === 255,
      ),
    ).toBe(true);
  });

  it("preserves a within-cap recovered grid byte-for-byte", () => {
    const raw = recoveredRaw("sky", (x, y) => ((x + y) % 2 ? [10, 20, 30] : [40, 50, 60]));
    const result = prepareBackdropIngest({
      image: raw,
      theme: "source-theme",
      layer: "sky",
      registry: sourceRegistry(),
      pitch: 2,
      pitchY: 2,
    });
    const expected = PNG.sync.read(
      encodePng(BACKDROP_WIDTH, BACKDROP_HEIGHT, (x: number, y: number) =>
        (x + y) % 2 ? [10, 20, 30, 255] : [40, 50, 60, 255],
      ),
    );
    expect(Array.from(result.compact.data)).toEqual(Array.from(expected.data));
    expect(result.report.changedCellCount).toBe(0);
  });

  it("is deterministic and keeps binary-alpha transparent masks out of palette counts", () => {
    const fixture = {
      layer: "mid" as const,
      maxColors: 3,
      cell: (x: number, y: number) =>
        x < 20 || x >= 139 || y < 20 || y >= 99
          ? null
          : ([((x + y) % 5) * 40, ((x + y) % 5) * 30, ((x + y) % 5) * 20] as [
              number,
              number,
              number,
            ]),
    };
    const first = ingestFixture(fixture);
    const second = ingestFixture(fixture);
    expect(Array.from(second.compact.data)).toEqual(Array.from(first.compact.data));
    expect(second.report).toEqual(first.report);
    expect(first.compact.data[3]).toBe(0);
    expect(first.compact.data[(50 * BACKDROP_WIDTH + 50) * 4 + 3]).toBe(255);
    expect(first.report.sampledColors).toBeGreaterThan(first.report.maxColors);
    expect(first.report.normalizedColors).toBeLessThanOrEqual(first.report.maxColors);
  });

  it("uses identical normalized pixels for compact, 1x, and every 3x preview period", async () => {
    const result = ingestFixture({
      maxColors: 3,
      cell: (x, y) => {
        const color = (x + y) % 5;
        return [color * 40, color * 30, color * 20];
      },
    });
    const sourcePath = join(destDir, "source.png");
    const oneXPath = join(destDir, "preview.png");
    const stripPath = join(destDir, "strip.png");
    await writeBackdropIngestArtifacts({
      sourcePath,
      oneXPath,
      stripPath,
      compact: result.compact,
    });
    const oneX = PNG.sync.read(await readFile(oneXPath));
    const strip = PNG.sync.read(await readFile(stripPath));
    expect(Array.from(oneX.data)).toEqual(Array.from(result.compact.data));
    for (let period = 0; period < REVIEW_PERIODS; period++)
      for (let y = 0; y < BACKDROP_HEIGHT; y++)
        for (let x = 0; x < BACKDROP_WIDTH; x++) {
          const compactAt = (y * BACKDROP_WIDTH + x) * 4;
          const stripAt = (y * strip.width + period * BACKDROP_WIDTH + x) * 4;
          expect(Array.from(strip.data.slice(stripAt, stripAt + 4))).toEqual(
            Array.from(result.compact.data.slice(compactAt, compactAt + 4)),
          );
        }
  });

  it("keeps existing artifacts untouched when post-recovery validation fails", async () => {
    const sourcePath = join(destDir, "source.png");
    const oneXPath = join(destDir, "preview.png");
    const stripPath = join(destDir, "strip.png");
    await Promise.all(
      [sourcePath, oneXPath, stripPath].map((path) => writeFile(path, "unchanged")),
    );
    const wrongGeometry = PNG.sync.read(
      encodePng(BACKDROP_WIDTH * 2 - 2, BACKDROP_HEIGHT * 2 - 2, () => [20, 30, 40, 255]),
    );
    expect(() =>
      prepareBackdropIngest({
        image: wrongGeometry,
        theme: "source-theme",
        layer: "sky",
        registry: sourceRegistry(),
        pitch: 2,
        pitchY: 2,
      }),
    ).toThrow(/recovered grid/i);
    await expect(
      Promise.all([sourcePath, oneXPath, stripPath].map((path) => readFile(path, "utf8"))),
    ).resolves.toEqual(["unchanged", "unchanged", "unchanged"]);
  });
});

describe("source-driven backdrop Theme gamut (#313)", () => {
  it("requires Theme-level gamut on source definitions and rejects it on painters", () => {
    expect(() => validateBackdropDefinition(sourceRegistry()[0]!)).not.toThrow();
    const missing = { ...sourceRegistry()[0]! };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (missing as any).gamut;
    expect(() => validateBackdropDefinition(missing)).toThrow(/requires gamut/i);

    const painter = makeSyntheticRegistry()[0]!;
    expect(() => validateBackdropDefinition(painter)).not.toThrow();
    expect(() => validateBackdropDefinition({ ...painter, gamut: PERMISSIVE_GAMUT })).toThrow(
      /must not declare gamut/i,
    );
  });

  it("conforms recovered cells after exact grid validation and before Oklab medoids", () => {
    // Warm out-of-gamut variants plus a large cold-legal plane. Normalize-first keeps an
    // illegal warm medoid; conform-first projects warms into gamut and retains the cold plane.
    const result = ingestFixture({
      maxColors: 2,
      gamut: GLACIER_GAMUT,
      cell: (x, y) => {
        if (x < 80) return [40, 70, 90];
        const hueShift = (x + y) % 5;
        return [200 - hueShift * 10, 80 + hueShift * 5, 30] as [number, number, number];
      },
    });
    expect(result.report.gamutChangedCellCount).toBeGreaterThan(0);
    expect(result.report.normalizedColors).toBeLessThanOrEqual(2);

    const sampled = Array.from({ length: BACKDROP_HEIGHT }, (_, y) =>
      Array.from({ length: BACKDROP_WIDTH }, (_, x) => {
        if (x < 80) return [40, 70, 90] as [number, number, number];
        const hueShift = (x + y) % 5;
        return [200 - hueShift * 10, 80 + hueShift * 5, 30] as [number, number, number];
      }),
    );
    const conformed = conformCellPaletteToHslGamut(sampled, GLACIER_GAMUT);
    const normalizeFirst = normalizeCellPalette(sampled, { maxColors: 2 });
    const conformThenNormalize = normalizeCellPalette(conformed.cells, { maxColors: 2 });
    expect(
      normalizeFirst.medoids.some((rgb: number[]) => !isRgbWithinHslGamut(rgb, GLACIER_GAMUT)),
    ).toBe(true);
    expect(
      conformThenNormalize.medoids.every((rgb: number[]) =>
        isRgbWithinHslGamut(rgb, GLACIER_GAMUT),
      ),
    ).toBe(true);
    expect(conformThenNormalize.medoids.some((rgb: number[]) => rgb.join(",") === "40,70,90")).toBe(
      true,
    );
  });

  it("reports all seven color/change fields with non-additive original-to-final semantics", () => {
    const result = ingestFixture({
      maxColors: 2,
      gamut: GLACIER_GAMUT,
      cell: (x, y) => {
        if ((x + y) % 3 === 0) return [0, 24, 50]; // over-sat cold → gamut change
        if ((x + y) % 3 === 1) return [40, 70, 90];
        return [50, 80, 100];
      },
    });
    expect(result.report).toMatchObject({
      sampledColors: expect.any(Number),
      gamutConformedColors: expect.any(Number),
      normalizedColors: expect.any(Number),
      maxColors: 2,
      gamutChangedCellCount: expect.any(Number),
      normalizationChangedCellCount: expect.any(Number),
      changedCellCount: expect.any(Number),
    });
    expect(result.report.gamutChangedCellCount).toBeGreaterThan(0);
    // A cell can change in both stages; original-to-final is not the sum.
    expect(result.report.changedCellCount).toBeLessThanOrEqual(
      result.report.gamutChangedCellCount + result.report.normalizationChangedCellCount,
    );
    expect(result.report.changedCellCount).toBeGreaterThan(0);
  });

  it("still normalizes over-cap input after gamut conformance", () => {
    const result = ingestFixture({
      maxColors: 3,
      gamut: GLACIER_GAMUT,
      cell: (x, y) => {
        const t = (x + y) % 6;
        return [30 + t * 5, 50 + t * 8, 80 + t * 10];
      },
    });
    expect(result.report.sampledColors).toBeGreaterThan(result.report.maxColors);
    expect(result.report.normalizedColors).toBeLessThanOrEqual(result.report.maxColors);
    expect(result.colorCount).toBeLessThanOrEqual(result.report.maxColors);
  });

  it("preserves sky opacity and mid/near binary alpha through gamut conformance", () => {
    const sky = ingestFixture({
      layer: "sky",
      gamut: GLACIER_GAMUT,
      cell: (x, y) => ((x + y) % 2 ? [0, 24, 50] : [40, 70, 90]),
    });
    expect(sky.compact.data.every((_, i) => i % 4 !== 3 || sky.compact.data[i] === 255)).toBe(true);

    const mid = ingestFixture({
      layer: "mid",
      gamut: GLACIER_GAMUT,
      cell: (x, y) => (x < 20 || x >= 139 || y < 20 || y >= 99 ? null : [0, 24, 50]),
    });
    expect(mid.compact.data[3]).toBe(0);
    expect(mid.compact.data[(50 * BACKDROP_WIDTH + 50) * 4 + 3]).toBe(255);
  });

  it("keeps compact, 1x, every 3x period, and Stage 2 decoded-RGBA identical", async () => {
    const result = ingestFixture({
      maxColors: 3,
      gamut: GLACIER_GAMUT,
      cell: (x, y) => ((x + y) % 2 ? [0, 100, 200] : [40, 70, 90]),
    });
    const sourcePath = join(destDir, "source-theme-sky.png");
    const oneXPath = join(destDir, "preview.png");
    const stripPath = join(destDir, "strip.png");
    await writeBackdropIngestArtifacts({
      sourcePath,
      oneXPath,
      stripPath,
      compact: result.compact,
    });
    const oneX = PNG.sync.read(await readFile(oneXPath));
    const strip = PNG.sync.read(await readFile(stripPath));
    expect(Array.from(oneX.data)).toEqual(Array.from(result.compact.data));
    for (let period = 0; period < REVIEW_PERIODS; period++)
      for (let y = 0; y < BACKDROP_HEIGHT; y++)
        for (let x = 0; x < BACKDROP_WIDTH; x++) {
          const compactAt = (y * BACKDROP_WIDTH + x) * 4;
          const stripAt = (y * strip.width + period * BACKDROP_WIDTH + x) * 4;
          expect(Array.from(strip.data.slice(stripAt, stripAt + 4))).toEqual(
            Array.from(result.compact.data.slice(compactAt, compactAt + 4)),
          );
        }

    const sourceDir = await mkdtemp(join(tmpdir(), "backdrop-gamut-stage2-"));
    try {
      for (const layer of ["sky", "mid", "near"] as const) {
        await writeFile(
          join(sourceDir, `source-theme-${layer}.png`),
          encodePng(BACKDROP_WIDTH, BACKDROP_HEIGHT, (x: number, y: number) => {
            const at = (y * BACKDROP_WIDTH + x) * 4;
            if (layer === "mid" && x < 2) return [0, 0, 0, 0];
            return [
              result.compact.data[at]!,
              result.compact.data[at + 1]!,
              result.compact.data[at + 2]!,
              255,
            ];
          }),
        );
      }
      const shipDir = await mkdtemp(join(tmpdir(), "backdrop-gamut-ship-"));
      try {
        await writeBackdrops(shipDir, {
          registry: sourceRegistry(GLACIER_GAMUT).map((definition) => ({
            ...definition,
            layers: {
              sky: { ...definition.layers.sky, maxColors: 3 },
              mid: { ...definition.layers.mid, maxColors: 3 },
              near: { ...definition.layers.near, maxColors: 3 },
            },
          })),
          sourceDir,
        });
        const shipped = PNG.sync.read(await readFile(join(shipDir, "source-theme-sky.png")));
        expect(Array.from(shipped.data)).toEqual(Array.from(result.compact.data));
      } finally {
        await rm(shipDir, { recursive: true, force: true });
      }
    } finally {
      await rm(sourceDir, { recursive: true, force: true });
    }
  });

  it("Stage 2 rejects a manually altered out-of-gamut source with full diagnostics before writing", async () => {
    const sourceDir = await mkdtemp(join(tmpdir(), "backdrop-oog-"));
    try {
      await writeFile(
        join(sourceDir, "source-theme-sky.png"),
        encodePng(BACKDROP_WIDTH, BACKDROP_HEIGHT, (x: number, y: number) =>
          x === 0 && y === 0 ? [0, 24, 50, 255] : [40, 70, 90, 255],
        ),
      );
      await writeFile(
        join(sourceDir, "source-theme-mid.png"),
        encodePng(BACKDROP_WIDTH, BACKDROP_HEIGHT, () => [40, 70, 90, 255]),
      );
      await writeFile(
        join(sourceDir, "source-theme-near.png"),
        encodePng(BACKDROP_WIDTH, BACKDROP_HEIGHT, () => [40, 70, 90, 255]),
      );
      await expect(
        writeBackdrops(destDir, { registry: sourceRegistry(GLACIER_GAMUT), sourceDir }),
      ).rejects.toThrow(
        /writeBackdrops: source-theme\.sky: out-of-gamut pixel at \(0, 0\): RGB \[0, 24, 50\], HSL \[211\.2, 100%, 9\.804%\]; allowed saturation <= 20% OR hue 175\.\.240 and saturation <= 65%/,
      );
      expect(await readdir(destDir)).toEqual([]);
    } finally {
      await rm(sourceDir, { recursive: true, force: true });
    }
  });

  it("leaves an existing compact source and both previews untouched on pre-write gamut failure", async () => {
    const sourcePath = join(destDir, "compact-source.png");
    const oneXPath = join(destDir, "preview@1x.png");
    const stripPath = join(destDir, "preview@3x-strip.png");
    const sentinel = "unchanged-ingest-artifacts";
    await Promise.all([sourcePath, oneXPath, stripPath].map((path) => writeFile(path, sentinel)));

    // Stage-2 / compact validation rejects out-of-gamut pixels before any theme outputs
    // are written. Ingest mirrors that: prepareBackdropIngest validates before
    // writeBackdropIngestArtifacts, so seeded compact+preview paths stay untouched.
    const sourceDir = await mkdtemp(join(tmpdir(), "backdrop-prewrite-gamut-"));
    try {
      await writeFile(
        join(sourceDir, "source-theme-sky.png"),
        encodePng(BACKDROP_WIDTH, BACKDROP_HEIGHT, () => [0, 24, 50, 255]),
      );
      await writeFile(
        join(sourceDir, "source-theme-mid.png"),
        encodePng(BACKDROP_WIDTH, BACKDROP_HEIGHT, () => [40, 70, 90, 255]),
      );
      await writeFile(
        join(sourceDir, "source-theme-near.png"),
        encodePng(BACKDROP_WIDTH, BACKDROP_HEIGHT, () => [40, 70, 90, 255]),
      );
      await expect(
        writeBackdrops(join(destDir, "out"), {
          registry: sourceRegistry(GLACIER_GAMUT),
          sourceDir,
        }),
      ).rejects.toThrow(/out-of-gamut/);
      expect(await readdir(join(destDir, "out")).catch(() => [])).toEqual([]);
    } finally {
      await rm(sourceDir, { recursive: true, force: true });
    }

    await expect(
      Promise.all([sourcePath, oneXPath, stripPath].map((path) => readFile(path, "utf8"))),
    ).resolves.toEqual([sentinel, sentinel, sentinel]);
  });
});
