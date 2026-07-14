import { describe, expect, it } from "vitest";
import { sprites } from "../../scripts/art/sprites.mjs";
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

  it("maps each Lumbry Meadows Monster to a distinct sprite URL", () => {
    const chicken = monsterSprite("chicken");
    const cow = monsterSprite("cow");
    const goblin = monsterSprite("goblin");

    expect(chicken).toEqual(expect.any(String));
    expect(cow).toEqual(expect.any(String));
    expect(goblin).toEqual(expect.any(String));

    const urls = new Set([chicken, cow, goblin]);
    expect(urls.size).toBe(3);
  });

  it("maps every Darkroot Forest, Old Sewers, and Bone Crypt Monster to a distinct sprite URL", () => {
    const ids = [
      "wolf",
      "goblin-warrior",
      "bandit",
      "giant-rat",
      "zombie",
      "skeleton",
      "crypt-shade",
    ];
    const urls = ids.map(monsterSprite);

    for (const url of urls) {
      expect(url).toEqual(expect.any(String));
    }
    expect(new Set(urls).size).toBe(ids.length);
  });

  it("gives every Monster a sprite distinct from every other Monster's", () => {
    const allIds = [
      "chicken",
      "cow",
      "goblin",
      "wolf",
      "goblin-warrior",
      "bandit",
      "giant-rat",
      "zombie",
      "skeleton",
      "crypt-shade",
    ];
    const urls = allIds.map(monsterSprite);

    expect(new Set(urls).size).toBe(allIds.length);
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
  });
});
