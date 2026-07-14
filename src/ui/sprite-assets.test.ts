import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { buildSpriteContactSheets } from "../../scripts/art/sprite-contact-sheet.mjs";
import { materialPalettes } from "../../scripts/art/palettes.mjs";
import { sprites, writeSprites } from "../../scripts/art/sprites.mjs";
import { encodePng } from "../../scripts/art/write-png.mjs";

/** These are synthetic writeSprites fixtures, not shipped art. Per-asset ramp scoping (#252) is
 * exercised against the real registry by src/ui/art-ramp-isolation.test.ts; here we hand the
 * fixture every ramp so each assertion below keeps testing exactly the color it always did. */
const ALL_RAMPS = Object.keys(materialPalettes);

const EXPECTED_SPRITES = [
  { name: "player", size: 32, alpha: "binary" },
  { name: "chicken", size: 32, alpha: "binary" },
  { name: "cow", size: 32, alpha: "binary" },
  { name: "goblin", size: 32, alpha: "binary" },
  { name: "wolf", size: 32, alpha: "binary" },
  { name: "goblin-warrior", size: 32, alpha: "binary" },
  { name: "bandit", size: 32, alpha: "binary" },
  { name: "giant-rat", size: 32, alpha: "binary" },
  { name: "zombie", size: 32, alpha: "binary" },
  { name: "skeleton", size: 32, alpha: "binary" },
  { name: "crypt-shade", size: 48, alpha: "one-intermediate" },
  { name: "crypt-ghoul", size: 32, alpha: "binary" },
  { name: "bone-knight", size: 32, alpha: "binary" },
] as const;

const SPRITES_DIR = fileURLToPath(new URL("../assets/sprites", import.meta.url));
const SOURCES_DIR = fileURLToPath(new URL("../../scripts/art/sprite-sources", import.meta.url));
const DOCS_DIR = fileURLToPath(new URL("../../docs", import.meta.url));

describe("source-driven combat sprite registry", () => {
  it("declares the immutable runtime ids with explicit canvas and alpha policies", () => {
    expect(sprites.map(({ name, size, alpha }) => ({ name, size, alpha }))).toEqual(
      EXPECTED_SPRITES,
    );
    expect(new Set(sprites.map(({ name }) => name)).size).toBe(EXPECTED_SPRITES.length);
  });

  it("has exactly one committed source and generated PNG per registry entry", () => {
    expect(readdirSync(SOURCES_DIR).sort()).toEqual(sprites.map(({ source }) => source).sort());
    expect(readdirSync(SPRITES_DIR).sort()).toEqual(
      sprites.map(({ name }) => `${name}.png`).sort(),
    );
  });
});

describe("writeSprites", () => {
  it("projects source colors onto the house palette without changing its alpha mask", async () => {
    const root = mkdtempSync(join(tmpdir(), "sprite-writer-"));
    const sourceDir = join(root, "sources");
    const destDir = join(root, "output");
    const sourcePath = join(sourceDir, "fixture.png");
    mkdirSync(sourceDir);

    const source = encodePng(32, 32, (x: number, y: number) =>
      x === 10 && y === 12 ? [0xc2, 0x85, 0x3e, 255] : [0, 0, 0, 0],
    );
    writeFileSync(sourcePath, source);

    await writeSprites(destDir, {
      sourceDir,
      registry: [
        { name: "fixture", source: "fixture.png", size: 32, alpha: "binary", ramps: ALL_RAMPS },
      ],
    });

    const output = PNG.sync.read(readFileSync(join(destDir, "fixture.png")));
    expect([output.width, output.height]).toEqual([32, 32]);
    const at = (12 * output.width + 10) * 4;
    expect([...output.data.subarray(at, at + 4)]).toEqual([0xc5, 0x82, 0x3b, 255]);
    expect([...output.data.subarray(0, 4)]).toEqual([0, 0, 0, 0]);
  });

  it("rejects a source whose canvas differs from its declared size", async () => {
    const root = mkdtempSync(join(tmpdir(), "sprite-writer-"));
    const sourceDir = join(root, "sources");
    mkdirSync(sourceDir);
    writeFileSync(
      join(sourceDir, "fixture.png"),
      encodePng(31, 32, () => [0, 0, 0, 0]),
    );

    await expect(
      writeSprites(join(root, "output"), {
        sourceDir,
        registry: [
          { name: "fixture", source: "fixture.png", size: 32, alpha: "binary", ramps: ALL_RAMPS },
        ],
      }),
    ).rejects.toThrow(/fixture.*31.32.*32.32/i);
  });

  it("rejects intermediate opacity for a binary-alpha sprite", async () => {
    const root = mkdtempSync(join(tmpdir(), "sprite-writer-"));
    const sourceDir = join(root, "sources");
    mkdirSync(sourceDir);
    writeFileSync(
      join(sourceDir, "fixture.png"),
      encodePng(32, 32, (x: number, y: number) =>
        x === 1 && y === 1 ? [0xc5, 0x82, 0x3b, 128] : [0, 0, 0, 0],
      ),
    );

    await expect(
      writeSprites(join(root, "output"), {
        sourceDir,
        registry: [
          { name: "fixture", source: "fixture.png", size: 32, alpha: "binary", ramps: ALL_RAMPS },
        ],
      }),
    ).rejects.toThrow(/fixture.*binary.*128/i);
  });

  it("preserves one intermediate opacity step but rejects two", async () => {
    const root = mkdtempSync(join(tmpdir(), "sprite-writer-"));
    const sourceDir = join(root, "sources");
    mkdirSync(sourceDir);
    const policy = {
      name: "fixture",
      source: "fixture.png",
      size: 32,
      alpha: "one-intermediate",
      ramps: ALL_RAMPS,
    };
    writeFileSync(
      join(sourceDir, "fixture.png"),
      encodePng(32, 32, (x: number, y: number) =>
        x === 1 && y === 1 ? [0xc5, 0x82, 0x3b, 128] : [0, 0, 0, 0],
      ),
    );
    const destDir = join(root, "output");
    await writeSprites(destDir, { sourceDir, registry: [policy] });
    const output = PNG.sync.read(readFileSync(join(destDir, "fixture.png")));
    expect(output.data[(1 * output.width + 1) * 4 + 3]).toBe(128);

    writeFileSync(
      join(sourceDir, "fixture.png"),
      encodePng(32, 32, (x: number) =>
        x === 1 ? [0xc5, 0x82, 0x3b, 96] : x === 2 ? [0xc5, 0x82, 0x3b, 160] : [0, 0, 0, 0],
      ),
    );
    await expect(writeSprites(destDir, { sourceDir, registry: [policy] })).rejects.toThrow(
      /fixture.*one-intermediate.*96, 160/i,
    );
  });

  it("reduces shipped sprites to at most twelve house-palette colors", async () => {
    const colors = [
      [0x1a, 0x14, 0x10],
      [0x26, 0x20, 0x19],
      [0x3d, 0x33, 0x2a],
      [0xe8, 0xdc, 0xc8],
      [0x9a, 0x8a, 0x72],
      [0xd4, 0xa0, 0x17],
      [0x11, 0x0d, 0x0a],
      [0x29, 0x20, 0x17],
      [0x4b, 0x38, 0x28],
      [0x70, 0x50, 0x3a],
      [0xf5, 0xeb, 0xcf],
      [0xe6, 0xd4, 0xaa],
      [0xc6, 0xad, 0x79],
    ];
    const root = mkdtempSync(join(tmpdir(), "sprite-writer-"));
    const sourceDir = join(root, "sources");
    const destDir = join(root, "output");
    mkdirSync(sourceDir);
    writeFileSync(
      join(sourceDir, "fixture.png"),
      encodePng(32, 32, (x: number, y: number) => {
        const index = Math.floor(x / 2);
        return y < 2 && index < colors.length ? [...colors[index]!, 255] : [0, 0, 0, 0];
      }),
    );
    await writeSprites(destDir, {
      sourceDir,
      registry: [
        { name: "fixture", source: "fixture.png", size: 32, alpha: "binary", ramps: ALL_RAMPS },
      ],
    });

    const output = PNG.sync.read(readFileSync(join(destDir, "fixture.png")));
    const outputColors = new Set<string>();
    let occupied = 0;
    for (let at = 0; at < output.data.length; at += 4) {
      if (output.data[at + 3] === 0) continue;
      occupied++;
      outputColors.add(`${output.data[at]},${output.data[at + 1]},${output.data[at + 2]}`);
    }
    expect(outputColors.size).toBeLessThanOrEqual(12);
    expect(occupied).toBe(26 * 2);
  });

  it("identifies the sprite when its committed source is missing", async () => {
    const root = mkdtempSync(join(tmpdir(), "sprite-writer-"));
    const sourceDir = join(root, "sources");
    mkdirSync(sourceDir);
    await expect(
      writeSprites(join(root, "output"), {
        sourceDir,
        registry: [
          {
            name: "missing-beast",
            source: "missing.png",
            size: 32,
            alpha: "binary",
            ramps: ALL_RAMPS,
          },
        ],
      }),
    ).rejects.toThrow(/missing-beast.*missing\.png/i);
  });

  it("rejects an unknown alpha policy", async () => {
    const root = mkdtempSync(join(tmpdir(), "sprite-writer-"));
    const sourceDir = join(root, "sources");
    mkdirSync(sourceDir);
    writeFileSync(
      join(sourceDir, "fixture.png"),
      encodePng(32, 32, () => [0, 0, 0, 0]),
    );
    await expect(
      writeSprites(join(root, "output"), {
        sourceDir,
        registry: [
          { name: "fixture", source: "fixture.png", size: 32, alpha: "soft", ramps: ALL_RAMPS },
        ],
      }),
    ).rejects.toThrow(/fixture.*unknown alpha policy.*soft/i);
  });

  it("rejects a canvas policy other than 32 or 48", async () => {
    const root = mkdtempSync(join(tmpdir(), "sprite-writer-"));
    const sourceDir = join(root, "sources");
    mkdirSync(sourceDir);
    writeFileSync(
      join(sourceDir, "fixture.png"),
      encodePng(24, 24, () => [0, 0, 0, 0]),
    );
    await expect(
      writeSprites(join(root, "output"), {
        sourceDir,
        registry: [
          { name: "fixture", source: "fixture.png", size: 24, alpha: "binary", ramps: ALL_RAMPS },
        ],
      }),
    ).rejects.toThrow(/fixture.*unsupported canvas size.*24/i);
  });

  it("ships production canvases with source-identical masks and declared alpha policies", () => {
    for (const sprite of sprites) {
      const source = PNG.sync.read(readFileSync(join(SOURCES_DIR, sprite.source)));
      const output = PNG.sync.read(readFileSync(join(SPRITES_DIR, `${sprite.name}.png`)));
      expect([output.width, output.height], sprite.name).toEqual([sprite.size, sprite.size]);
      const colors = new Set<string>();
      const intermediate = new Set<number>();
      for (let at = 0; at < output.data.length; at += 4) {
        expect(output.data[at + 3], `${sprite.name} alpha at byte ${at}`).toBe(source.data[at + 3]);
        const alpha = output.data[at + 3]!;
        if (alpha === 0) continue;
        colors.add(`${output.data[at]},${output.data[at + 1]},${output.data[at + 2]}`);
        if (alpha !== 255) intermediate.add(alpha);
      }
      expect(colors.size, `${sprite.name} color budget`).toBeLessThanOrEqual(12);
      expect(intermediate.size, `${sprite.name} intermediate alpha steps`).toBeLessThanOrEqual(
        sprite.alpha === "one-intermediate" ? 1 : 0,
      );
    }
  });

  it("writes byte-identical production sprites across independent runs", async () => {
    const root = mkdtempSync(join(tmpdir(), "sprite-determinism-"));
    const first = join(root, "first");
    const second = join(root, "second");
    await writeSprites(first);
    await writeSprites(second);
    for (const { name } of sprites) {
      expect(
        Buffer.compare(
          readFileSync(join(first, `${name}.png`)),
          readFileSync(join(second, `${name}.png`)),
        ),
        name,
      ).toBe(0);
    }
  });
});

describe("buildSpriteContactSheets", () => {
  it("places native canvases on the panel background and scales the complete sheet to 4x", () => {
    const root = mkdtempSync(join(tmpdir(), "sprite-sheet-"));
    writeFileSync(
      join(root, "small.png"),
      encodePng(32, 32, (x: number, y: number) =>
        x === 0 && y === 0 ? [255, 0, 0, 255] : [0, 0, 0, 0],
      ),
    );
    writeFileSync(
      join(root, "boss.png"),
      encodePng(48, 48, (x: number, y: number) =>
        x === 0 && y === 0 ? [0, 0, 255, 255] : [0, 0, 0, 0],
      ),
    );
    const built = buildSpriteContactSheets(root, [
      { name: "small", size: 32 },
      { name: "boss", size: 48 },
    ]);

    const oneX = PNG.sync.read(built.oneX);
    expect([oneX.width, oneX.height]).toEqual([100, 48]);
    const pixel = (png: PNG, x: number, y: number) => {
      const at = (y * png.width + x) * 4;
      return [...png.data.subarray(at, at + 4)];
    };
    expect(pixel(oneX, 8, 16)).toEqual([255, 0, 0, 255]);
    expect(pixel(oneX, 52, 0)).toEqual([0, 0, 255, 255]);
    expect(pixel(oneX, 0, 0)).toEqual([0x26, 0x20, 0x19, 255]);

    const fourX = PNG.sync.read(built.fourX);
    expect([fourX.width, fourX.height]).toEqual([400, 192]);
    expect(pixel(fourX, 8 * 4 + 3, 16 * 4 + 3)).toEqual([255, 0, 0, 255]);
  });

  it("matches the committed sprite review sheets generated by npm run art", () => {
    const built = buildSpriteContactSheets(SPRITES_DIR, sprites);
    expect(Buffer.compare(built.oneX, readFileSync(join(DOCS_DIR, "sprite-sheet-1x.png")))).toBe(0);
    expect(Buffer.compare(built.fourX, readFileSync(join(DOCS_DIR, "sprite-sheet-4x.png")))).toBe(
      0,
    );
  });
});
