import { describe, expect, it } from "vitest";
import { fixtureContent } from "../core/fixture-content";
import { resolveContent } from "../core/validate-content";
import { compareStacks, sortStacks } from "./sort";
import type { Stack } from "./sort";

const resolvedFixtureContent = resolveContent(fixtureContent);

// fixtureContent items: gold (currency), meat (food, value 3), bronze-sword
// (equipment/weapon, value 20), lucky-charm (equipment/head, value 100).
function stacksFor(itemIds: string[]): Stack[] {
  return itemIds.map((itemId) => ({ itemId, qty: 1 }));
}

describe("compareStacks / sortStacks", () => {
  it("sorts by kind: equipment before food before currency, ties broken by name", () => {
    const sorted = sortStacks(
      stacksFor(["gold", "meat", "lucky-charm", "bronze-sword"]),
      "kind",
      resolvedFixtureContent,
    );
    // equipment (Bronze Sword, Lucky Charm — alphabetical) -> food (Cooked Meat) -> currency (Gold)
    expect(sorted.map((s) => s.itemId)).toEqual(["bronze-sword", "lucky-charm", "meat", "gold"]);
  });

  it("sorts by value descending (def.value ?? 0), ties broken by name", () => {
    const sorted = sortStacks(
      stacksFor(["meat", "bronze-sword", "lucky-charm", "gold"]),
      "value",
      resolvedFixtureContent,
    );
    // lucky-charm 100, bronze-sword 20, meat 3, gold has no value field -> 0
    expect(sorted.map((s) => s.itemId)).toEqual(["lucky-charm", "bronze-sword", "meat", "gold"]);
  });

  it("sorts by name ascending", () => {
    const sorted = sortStacks(
      stacksFor(["gold", "bronze-sword", "lucky-charm", "meat"]),
      "name",
      resolvedFixtureContent,
    );
    expect(sorted.map((s) => s.itemId)).toEqual(["bronze-sword", "meat", "gold", "lucky-charm"]);
    // Bronze Sword, Cooked Meat, Gold, Lucky Charm — alphabetical by display name
  });

  it("never mutates the input array", () => {
    const stacks = stacksFor(["gold", "bronze-sword"]);
    const original = [...stacks];
    sortStacks(stacks, "kind", resolvedFixtureContent);
    expect(stacks).toEqual(original);
  });

  it("compareStacks is usable directly as an Array#sort comparator", () => {
    const stacks = stacksFor(["gold", "meat", "bronze-sword"]);
    stacks.sort(compareStacks("name", resolvedFixtureContent));
    expect(stacks.map((s) => s.itemId)).toEqual(["bronze-sword", "meat", "gold"]);
  });
});
