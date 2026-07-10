import { describe, expect, it } from "vitest";
import { makeSnapshot } from "../core/make-snapshot";
import { resolveProp } from "./props";

describe("resolveProp (#80)", () => {
  it("shows the anvil while Smithing", () => {
    const snap = makeSnapshot({
      production: { recipeId: "bronze-dagger", name: "Bronze Dagger", skill: "smithing" },
    });
    expect(resolveProp(snap)).toBe("anvil");
  });

  it("shows the cooking (range/campfire) prop while Cooking (#115)", () => {
    const snap = makeSnapshot({
      production: { recipeId: "cook-beef", name: "Cook Beef", skill: "cooking" },
    });
    expect(resolveProp(snap)).toBe("cooking");
  });

  it("shows the crafting (workbench/tanning rack) prop while Crafting (#116)", () => {
    const snap = makeSnapshot({
      production: { recipeId: "craft-leather-body", name: "Leather Body", skill: "crafting" },
    });
    expect(resolveProp(snap)).toBe("crafting");
  });

  it("shows the cauldron prop while Herblore (#118)", () => {
    const snap = makeSnapshot({
      production: { recipeId: "brew-strength-potion", name: "Strength Potion", skill: "herblore" },
    });
    expect(resolveProp(snap)).toBe("cauldron");
  });

  it("shows no prop while fighting (the Monster IS the foreground)", () => {
    const snap = makeSnapshot({
      monster: { id: "dummy", name: "Training Dummy", hp: 3, maxHp: 3 },
    });
    expect(resolveProp(snap)).toBeNull();
  });

  it("shows no prop while fishing (no CC0/hand-built prop registered yet)", () => {
    const snap = makeSnapshot({ fishing: { spotId: "pond", name: "Test Pond" } });
    expect(resolveProp(snap)).toBeNull();
  });

  it("shows no prop while idle", () => {
    expect(resolveProp(makeSnapshot())).toBeNull();
  });
});
