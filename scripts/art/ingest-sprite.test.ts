import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PNG } from "pngjs";
import { main as ingestSprite } from "./ingest-sprite.mjs";
import {
  deriveInteriorAlpha,
  prepareSpriteIngest,
  validateSpriteEntry,
  writeSpriteIngestArtifacts,
} from "./ingest-sprite-core.mjs";

type RGB = [number, number, number];

function generatedGrid(grid: (RGB | null)[][], pitch = 8) {
  const border = pitch;
  const width = grid[0]!.length * pitch + border * 2;
  const height = grid.length * pitch + border * 2;
  const image = new PNG({ width, height });
  image.data.fill(255);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const at = (y * width + x) * 4;
      image.data[at] = 255;
      image.data[at + 1] = 0;
      image.data[at + 2] = 255;
    }
  for (let gy = 0; gy < grid.length; gy++)
    for (let gx = 0; gx < grid[0]!.length; gx++) {
      const rgb = grid[gy]![gx];
      if (!rgb) continue;
      for (let y = border + gy * pitch; y < border + (gy + 1) * pitch; y++)
        for (let x = border + gx * pitch; x < border + (gx + 1) * pitch; x++) {
          const at = (y * width + x) * 4;
          image.data[at] = rgb[0];
          image.data[at + 1] = rgb[1];
          image.data[at + 2] = rgb[2];
        }
    }
  return image;
}

describe("sprite ingest preparation", () => {
  it("normalizes after sampling, validates the exact full-palette scope, and applies interior alpha", () => {
    const town: RGB = [74, 46, 26];
    const image = generatedGrid(
      Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => town)),
    );
    const result = prepareSpriteIngest({
      image,
      entry: {
        name: "large-monster",
        size: 32,
        alpha: "one-intermediate",
        interiorAlpha: 128,
        materialRampNames: [],
        zoneNames: ["town"],
      },
      options: { pitch: 8, pitchY: 8 },
    });

    const source = PNG.sync.read(result.source);
    const alphas = Array.from(source.data).filter((_, index) => index % 4 === 3);
    expect(alphas).toContain(128);
    expect(alphas).toContain(255);
    expect(result.report.expectedMaterialRampNames).toEqual([]);
    expect(result.report.expectedZoneNames).toEqual(["town"]);
    expect(result.report.sourceMaxColors).toBe(16);
  });

  it("treats transparent holes as their own opaque interior boundary", () => {
    const grid: (RGB | null)[][] = [
      [
        [1, 1, 1],
        [1, 1, 1],
        [1, 1, 1],
      ],
      [[1, 1, 1], null, [1, 1, 1]],
      [
        [1, 1, 1],
        [1, 1, 1],
        [1, 1, 1],
      ],
    ];
    expect(deriveInteriorAlpha(grid, 96)).toEqual([
      [255, 255, 255],
      [255, 0, 255],
      [255, 255, 255],
    ]);
  });

  it("reports the stable exact palette declarations for both missing and extraneous dependencies", () => {
    const town: RGB = [74, 46, 26];
    const image = generatedGrid([
      [town, town],
      [town, town],
    ]);
    const options = { pitch: 8, pitchY: 8 };
    const base = { name: "test", size: 32, alpha: "binary", materialRampNames: [], zoneNames: [] };
    expect(() => prepareSpriteIngest({ image, entry: base, options })).toThrow(
      'zoneNames must be ["town"]',
    );
    expect(() =>
      prepareSpriteIngest({ image, entry: { ...base, zoneNames: ["town", "forest"] }, options }),
    ).toThrow('zoneNames must be ["town"]');
  });

  it("keeps the registry's declared canvas as the authority", () => {
    const town: RGB = [74, 46, 26];
    expect(() =>
      prepareSpriteIngest({
        image: generatedGrid([
          [town, town],
          [town, town],
        ]),
        entry: {
          name: "test",
          size: 32,
          alpha: "binary",
          materialRampNames: [],
          zoneNames: ["town"],
        },
        options: { pitch: 8, pitchY: 8, size: 48 },
      }),
    ).toThrow("conflicts with test's declared 32px canvas");
  });

  it("rejects invalid interior alpha and source color ceilings before any output can be written", () => {
    expect(
      validateSpriteEntry({ size: 32, alpha: "binary", interiorAlpha: 128, sourceMaxColors: 0 }),
    ).toEqual([
      "sourceMaxColors must be a positive integer when declared",
      'interiorAlpha must be an integer from 1 to 254 and requires alpha: "one-intermediate"',
    ]);
  });

  it("keeps dry runs filesystem-free and writes only complete final artifacts", async () => {
    const root = await mkdtemp(join(tmpdir(), "sidescape-ingest-"));
    const sourcePath = join(root, "sources", "sprite-test.png");
    const previewPath = join(root, "out", "test-preview-8x.png");
    const source = Buffer.from("source");
    const preview = Buffer.from("preview");
    try {
      await writeSpriteIngestArtifacts({ sourcePath, previewPath, source, preview, dryRun: true });
      await expect(readFile(sourcePath)).rejects.toThrow();
      await expect(readFile(previewPath)).rejects.toThrow();

      await writeSpriteIngestArtifacts({ sourcePath, previewPath, source, preview });
      await expect(readFile(sourcePath)).resolves.toEqual(source);
      await expect(readFile(previewPath)).resolves.toEqual(preview);
      expect((await readdir(join(root, "sources"))).some((file) => file.includes(".tmp-"))).toBe(
        false,
      );
      expect((await readdir(join(root, "out"))).some((file) => file.includes(".tmp-"))).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("runs the CLI's complete dry-run pipeline without creating either destination", async () => {
    const root = await mkdtemp(join(tmpdir(), "sidescape-ingest-cli-"));
    const input = join(root, "generator.png");
    const sources = join(root, "sources");
    const out = join(root, "out");
    const town: RGB = [74, 46, 26];
    try {
      await writeFile(
        input,
        PNG.sync.write(
          generatedGrid([
            [town, town],
            [town, town],
          ]),
        ),
      );
      await ingestSprite(
        {
          name: "test",
          in: input,
          inbox: root,
          sources,
          out,
          tolerance: "40",
          pitch: "8",
          "pitch-y": "8",
          "dry-run": true,
        },
        {
          registry: [
            {
              name: "test",
              source: "sprite-test.png",
              size: 32,
              alpha: "binary",
              materialRampNames: [],
              zoneNames: ["town"],
            },
          ],
        },
      );
      await expect(readFile(join(sources, "sprite-test.png"))).rejects.toThrow();
      await expect(readFile(join(out, "test-preview-8x.png"))).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
