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

/** A synthetic registry independent of the real (deliberately empty) production `backdrops`
 * registry (#263) — infra tests must never depend on a real theme so they can't accidentally
 * couple to Frostspire/#142's future registration. */
function makeSyntheticRegistry(): [
  {
    theme: string;
    layers: Record<string, (px: { localX: number; y: number }) => number[]>;
  },
] {
  return [
    {
      theme: "test-theme",
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
