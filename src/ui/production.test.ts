import { describe, expect, it } from "vitest";
import { fixtureContent } from "../core/testing/fixture-content";
import { makeSnapshot } from "../core/testing/make-snapshot";
import type { RecipeDef } from "../core/types";
import {
  PRODUCTION_SKILLS,
  productionLabel,
  productionPanelMarkup,
  resolveProp,
} from "./production";

describe("PRODUCTION_SKILLS", () => {
  it("holds one descriptor per Production Skill: smithing, cooking, crafting, herblore", () => {
    expect(PRODUCTION_SKILLS.map((d) => d.skill)).toEqual([
      "smithing",
      "cooking",
      "crafting",
      "herblore",
    ]);
  });
});

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

  it("shows the reusable fishing overlay while Fishing", () => {
    const snap = makeSnapshot({ fishing: { spotId: "pond", name: "Test Pond" } });
    expect(resolveProp(snap)).toBe("fishing");
  });

  it("shows no prop while idle", () => {
    expect(resolveProp(makeSnapshot())).toBeNull();
  });
});

describe("productionLabel", () => {
  it("returns each Production Skill's scene label", () => {
    expect(productionLabel("smithing")).toBe("🔨 Smithing");
    expect(productionLabel("cooking")).toBe("🍳 Cooking");
    expect(productionLabel("crafting")).toBe("🧵 Crafting");
    expect(productionLabel("herblore")).toBe("🧪 Herblore");
  });

  it("falls back to the raw skill string for a non-Production Skill", () => {
    expect(productionLabel("attack")).toBe("attack");
  });
});

/** Extract `data-recipe-row` ids in DOM order from production panel markup. */
function recipeRowOrder(markup: string): string[] {
  return [...markup.matchAll(/data-recipe-row="([^"]+)"/g)]
    .map((m) => m[1])
    .filter((id): id is string => id !== undefined);
}

describe("productionPanelMarkup", () => {
  const smithing = PRODUCTION_SKILLS.find((d) => d.skill === "smithing")!;

  const sortFixtureContent = {
    ...fixtureContent,
    recipes: [
      {
        id: "z-high",
        name: "High Level",
        skill: "smithing" as const,
        levelReq: 8,
        inputs: [{ itemId: "bar", qty: 1 }],
        outputItemId: "bronze-sword",
        xp: 10,
        craftTicks: 1,
      } satisfies RecipeDef,
      {
        id: "a-low",
        name: "Low Level",
        skill: "smithing" as const,
        levelReq: 1,
        inputs: [{ itemId: "bar", qty: 1 }],
        outputItemId: "bronze-sword",
        xp: 10,
        craftTicks: 1,
      } satisfies RecipeDef,
      {
        id: "m-mid",
        name: "Mid Level",
        skill: "smithing" as const,
        levelReq: 6,
        inputs: [{ itemId: "bar", qty: 1 }],
        outputItemId: "bronze-sword",
        xp: 10,
        craftTicks: 1,
      } satisfies RecipeDef,
      // Same levelReq — input order is z-before-a; display must sort by id ascending.
      {
        id: "z-tie",
        name: "Z Tie",
        skill: "smithing" as const,
        levelReq: 3,
        inputs: [{ itemId: "bar", qty: 1 }],
        outputItemId: "bronze-sword",
        xp: 10,
        craftTicks: 1,
      } satisfies RecipeDef,
      {
        id: "a-tie",
        name: "A Tie",
        skill: "smithing" as const,
        levelReq: 3,
        inputs: [{ itemId: "bar", qty: 1 }],
        outputItemId: "bronze-sword",
        xp: 10,
        craftTicks: 1,
      } satisfies RecipeDef,
    ],
  };

  it("sorts recipes by levelReq ascending, then id, regardless of content.recipes insertion order (#338)", () => {
    const markup = productionPanelMarkup(smithing, sortFixtureContent, [], 99);
    expect(recipeRowOrder(markup)).toEqual(["a-low", "a-tie", "z-tie", "m-mid", "z-high"]);
  });

  it("sorts cooking, crafting, and herblore recipe lists the same way (#338)", () => {
    const sharedRecipes = [
      {
        id: "z-recipe",
        name: "Z Recipe",
        skill: "cooking" as const,
        levelReq: 10,
        inputs: [{ itemId: "raw-fish", qty: 1 }],
        outputItemId: "meat",
        xp: 10,
        craftTicks: 1,
      } satisfies RecipeDef,
      {
        id: "a-recipe",
        name: "A Recipe",
        skill: "cooking" as const,
        levelReq: 2,
        inputs: [{ itemId: "raw-fish", qty: 1 }],
        outputItemId: "meat",
        xp: 10,
        craftTicks: 1,
      } satisfies RecipeDef,
    ];

    const cooking = PRODUCTION_SKILLS.find((d) => d.skill === "cooking")!;
    const cookingMarkup = productionPanelMarkup(
      cooking,
      { ...fixtureContent, recipes: sharedRecipes },
      [],
      99,
    );
    expect(recipeRowOrder(cookingMarkup)).toEqual(["a-recipe", "z-recipe"]);

    const craftingRecipes = sharedRecipes.map((r) => ({
      ...r,
      skill: "crafting" as const,
      inputs: [{ itemId: "hide", qty: 1 }],
    }));
    const crafting = PRODUCTION_SKILLS.find((d) => d.skill === "crafting")!;
    const craftingMarkup = productionPanelMarkup(
      crafting,
      { ...fixtureContent, recipes: craftingRecipes },
      [],
      99,
    );
    expect(recipeRowOrder(craftingMarkup)).toEqual(["a-recipe", "z-recipe"]);

    const herbloreRecipes = sharedRecipes.map((r) => ({
      ...r,
      skill: "herblore" as const,
      inputs: [{ itemId: "herb", qty: 1 }],
    }));
    const herblore = PRODUCTION_SKILLS.find((d) => d.skill === "herblore")!;
    const herbloreMarkup = productionPanelMarkup(
      herblore,
      { ...fixtureContent, recipes: herbloreRecipes },
      [],
      99,
    );
    expect(recipeRowOrder(herbloreMarkup)).toEqual(["a-recipe", "z-recipe"]);
  });

  it("renders one recipe row per matching Recipe, with level req and owned counts for each input", () => {
    const markup = productionPanelMarkup(smithing, fixtureContent, [{ itemId: "bar", qty: 0 }], 1);

    expect(markup).toContain('data-recipe-row="test-sword"');
    expect(markup).toContain("Test Sword");
    expect(markup).toContain("Lvl 1");
    expect(markup).toContain("1× Test Bar (have 0)");

    expect(markup).toContain('data-recipe-row="test-charm"');
    expect(markup).toContain("Test Charm");
    expect(markup).toContain("Lvl 20");
    expect(markup).toContain("3× Test Bar (have 0)");
  });

  it("reflects the owned count from bankItems", () => {
    const markup = productionPanelMarkup(smithing, fixtureContent, [{ itemId: "bar", qty: 5 }], 1);
    expect(markup).toContain("1× Test Bar (have 5)");
  });

  it("disables the Craft button when short on inputs, enables it once inputs are sufficient", () => {
    const short = productionPanelMarkup(smithing, fixtureContent, [{ itemId: "bar", qty: 0 }], 1);
    expect(short).toMatch(/data-recipe="test-sword" disabled/);

    const enough = productionPanelMarkup(smithing, fixtureContent, [{ itemId: "bar", qty: 1 }], 1);
    expect(enough).toMatch(/data-recipe="test-sword" \s*>/);
    expect(enough).not.toMatch(/data-recipe="test-sword" disabled/);
  });

  it("disables the Craft button when under-leveled, even with enough inputs", () => {
    const markup = productionPanelMarkup(smithing, fixtureContent, [{ itemId: "bar", qty: 5 }], 1);
    expect(markup).toMatch(/data-recipe="test-charm" disabled/);
  });

  it("filters to the descriptor's own skill only", () => {
    const markup = productionPanelMarkup(smithing, fixtureContent, [], 1);
    expect(markup).not.toContain("test-cook");
    expect(markup).not.toContain("test-craft");
    expect(markup).not.toContain("test-brew");
  });

  it("renders a correct panel for a descriptor outside the hardcoded four, proving a fifth Production Skill needs no new renderer code", () => {
    const fakeDescriptor = {
      skill: "smithing" as const,
      label: "⚗️ Alchemy",
      prop: "alembic",
    };
    const fakeContent = {
      ...fixtureContent,
      recipes: [
        {
          id: "fake-potion",
          name: "Fake Potion",
          skill: "smithing",
          levelReq: 5,
          inputs: [{ itemId: "bar", qty: 2 }],
          outputItemId: "bronze-sword",
          xp: 5,
          craftTicks: 1,
        } satisfies RecipeDef,
      ],
    };

    const markup = productionPanelMarkup(
      fakeDescriptor,
      fakeContent,
      [{ itemId: "bar", qty: 2 }],
      5,
    );

    expect(markup).toContain('data-recipe-row="fake-potion"');
    expect(markup).toContain("Fake Potion");
    expect(markup).toContain("Lvl 5");
    expect(markup).toContain("2× Test Bar (have 2)");
    expect(markup).not.toMatch(/data-recipe="fake-potion" disabled/);
  });
});
