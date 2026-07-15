import { describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sprites } from "../../scripts/art/sprites.mjs";
import { writeSprites } from "../../scripts/art/sprites.mjs";
import { encodePng } from "../../scripts/art/write-png.mjs";
import {
  monsterSprite,
  monsterSpriteSize,
  playerSprite,
  playerSpriteSize,
  SPRITE_GRAIN,
  spriteEdgePx,
} from "./sprites";

describe("sprites", () => {
  it("gives the player a sprite URL", () => {
    expect(playerSprite).toEqual(expect.any(String));
    expect(playerSprite.length).toBeGreaterThan(0);
  });

  it("maps every production Monster sprite, including dungeon-only bosses, to a distinct URL", () => {
    const ids = [
      "chicken",
      "cow",
      "goblin",
      "goblin-brute",
      "goblin-chief",
      "wolf",
      "goblin-warrior",
      "bandit",
      "hollow-warden",
      "giant-rat",
      "zombie",
      "skeleton",
      "crypt-shade",
      "crypt-ghoul",
      "bone-knight",
      "frost-wolf",
      "ice-wraith",
      "frost-giant",
      "frost-warden",
    ];
    const urls = ids.map(monsterSprite);

    for (const url of urls) {
      expect(url).toEqual(expect.any(String));
    }
    expect(new Set(urls).size).toBe(ids.length);
  });

  it("returns undefined for a Monster with no sprite (e.g. test fixtures)", () => {
    expect(monsterSprite("dummy")).toBeUndefined();
    expect(monsterSprite("some-unmapped-monster")).toBeUndefined();
  });

  it("carries a native size for every mapped Monster that matches the art registry", () => {
    // The runtime size map (sprites.ts) is a hand-maintained parallel of the art build registry
    // (scripts/art/sprites.mjs); this guards them from drifting, so the on-screen box is always the
    // real canvas x grain. `player` lives in the registry too but is served by playerSpriteSize.
    for (const { name, size } of sprites) {
      if (name === "player") continue;
      expect(monsterSpriteSize(name), name).toBe(size);
    }
    const registryPlayer = sprites.find((s) => s.name === "player");
    expect(playerSpriteSize).toBe(registryPlayer?.size);
  });

  it("scales the on-screen box by the global grain (48-native hero is 96px, 32-native mob 64px)", () => {
    expect(SPRITE_GRAIN).toBe(2);
    expect(spriteEdgePx(playerSpriteSize)).toBe(96);
    expect(spriteEdgePx(32)).toBe(64);
    expect(spriteEdgePx(monsterSpriteSize("crypt-shade")!)).toBe(96);
    expect(spriteEdgePx(monsterSpriteSize("hollow-warden")!)).toBe(128);
  });
});

describe("writeSprites canvas sizes", () => {
  it("accepts an explicitly declared 64px canvas without treating it as a Boss-only size", async () => {
    const root = await mkdtemp(join(tmpdir(), "sidescape-sprites-"));
    const sourceDir = join(root, "sources");
    const destDir = join(root, "dest");
    await mkdir(sourceDir);
    await writeFile(
      join(sourceDir, "sprite-large-monster.png"),
      encodePng(64, 64, (x: number, y: number) =>
        x === 0 && y === 0 ? [74, 46, 26, 255] : [0, 0, 0, 0],
      ),
    );

    try {
      await writeSprites(destDir, {
        sourceDir,
        registry: [
          {
            name: "large-monster",
            source: "sprite-large-monster.png",
            size: 64,
            alpha: "binary",
            materialRampNames: [],
            zoneNames: [],
          },
        ],
      });

      expect(await readFile(join(destDir, "large-monster.png"))).toBeInstanceOf(Buffer);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
