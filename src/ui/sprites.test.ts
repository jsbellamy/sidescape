import { describe, expect, it } from "vitest";
import { monsterSprite, playerSprite } from "./sprites";

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

  it("returns undefined for a Monster with no sprite (e.g. test fixtures)", () => {
    expect(monsterSprite("dummy")).toBeUndefined();
    expect(monsterSprite("some-unmapped-monster")).toBeUndefined();
  });
});
