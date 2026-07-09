import { describe, expect, it } from "vitest";
import { makeSnapshot } from "../core/make-snapshot";
import { resolveProp } from "./props";

describe("resolveProp (#80)", () => {
  it("shows the anvil while Smithing", () => {
    const snap = makeSnapshot({ smithing: { recipeId: "bronze-dagger", name: "Bronze Dagger" } });
    expect(resolveProp(snap)).toBe("anvil");
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
