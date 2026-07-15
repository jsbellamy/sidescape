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
  writeBackdrops,
} from "../../scripts/art/backdrops.mjs";
import {
  prepareBackdropIngest,
  writeBackdropIngestArtifacts,
} from "../../scripts/art/ingest-backdrop.mjs";
import { encodePng } from "../../scripts/art/write-png.mjs";

/** A synthetic registry independent of the real (deliberately empty) production `backdrops`
 * registry (#263) — infra tests must never depend on a real theme so they can't accidentally
 * couple to Frostspire/#142's future registration. */
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

  it("the production registry is deliberately empty (Frostspire/#142 registers the first entry)", () => {
    expect(backdrops).toEqual([]);
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

  it("the empty production registry writes nothing, leaving an existing backdrop untouched", async () => {
    const sentinelPath = join(destDir, "meadow-sky.png");
    await writeFile(sentinelPath, "sentinel-bytes");
    await writeBackdrops(destDir); // default registry = production `backdrops`, which is []
    expect(await readFile(sentinelPath, "utf8")).toBe("sentinel-bytes");
  });
});

function sourceRegistry() {
  return [
    {
      theme: "source-theme",
      kind: "source",
      layers: {
        sky: { source: "source-theme-sky.png", alpha: "opaque", maxColors: 4 },
        mid: { source: "source-theme-mid.png", alpha: "binary", maxColors: 4 },
        near: { source: "source-theme-near.png", alpha: "binary", maxColors: 4 },
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
  cell,
}: {
  layer?: "sky" | "mid" | "near";
  maxColors?: number;
  cell: (x: number, y: number) => [number, number, number] | null;
}) {
  return prepareBackdropIngest({
    image: recoveredRaw(layer, cell),
    theme: "source-theme",
    layer,
    registry: sourceRegistry().map((definition) => ({
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
