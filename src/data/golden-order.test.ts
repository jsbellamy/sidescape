import { describe, expect, it } from "vitest";
import { content } from "./index";

/**
 * Issue #251: `src/data/index.ts` is append-only — saves persist raw item ids (Bank stacks,
 * equipment slots, Food Slots, quiver, rune slot). The Gear Tier ladder builder must call its
 * per-item accessors IN PLACE at each id's existing array slot, never emit one contiguous
 * generated block that reorders the array. These two golden lists are the pre-#251 `content.items`
 * / `content.recipes` id order (captured from `git show <pre-#251 commit>:src/data/index.ts`,
 * an independent source of truth outside the builder) — this test proves every one of those ids
 * still sits at its exact original index, and that the four new items / sixteen new recipes this
 * slice adds appear only after them, never inserted in between.
 */

const PRE_251_ITEM_IDS = [
  "gold",
  "cooked-meat",
  "bronze-dagger",
  "bronze-sword",
  "bronze-mace",
  "leather-body",
  "bronze-shield",
  "goblin-charm",
  "cooked-trout",
  "iron-dagger",
  "iron-chainbody",
  "iron-kiteshield",
  "iron-full-helm",
  "iron-sword",
  "iron-mace",
  "cooked-shrimp",
  "bronze-bar",
  "iron-bar",
  "steel-dagger",
  "steel-chainbody",
  "steel-kiteshield",
  "steel-full-helm",
  "steel-sword",
  "steel-mace",
  "cooked-pike",
  "mithril-dagger",
  "mithril-chainbody",
  "mithril-kiteshield",
  "mithril-full-helm",
  "mithril-sword",
  "mithril-mace",
  "shade-blade",
  "shortbow",
  "apprentice-staff",
  "iron-shortbow",
  "iron-staff",
  "steel-shortbow",
  "steel-staff",
  "mithril-shortbow",
  "mithril-staff",
  "raw-beef",
  "raw-shrimp",
  "raw-trout",
  "raw-pike",
  "cowhide",
  "wolf-hide",
  "thick-hide",
  "leather-chaps",
  "leather-coif",
  "hard-leather-coif",
  "hard-leather-chaps",
  "hard-leather-body",
  "sapphire",
  "emerald",
  "ruby",
  "sapphire-amulet",
  "sapphire-ring",
  "emerald-amulet",
  "emerald-ring",
  "ruby-amulet",
  "ruby-ring",
  "guam-herb",
  "marrentill-herb",
  "tarromin-herb",
  "harralander-herb",
  "strength-potion",
  "attack-potion",
  "fishing-potion",
  "production-potion",
  "bronze-arrow",
  "steel-arrow",
  "mithril-arrow",
  "air-rune",
  "water-rune",
  "earth-rune",
  "fire-rune",
] as const;

/** The four new items #251 added, followed by #252's 20 new items (16 adamant/rune Equipment +
 * adamant-bar/rune-bar + adamant-arrow/rune-arrow, issue's "Full generated Equipment" family
 * order per tier, then the bars, then the arrows), then #342's six platelegs — must appear only
 * after every PRE_251_ITEM_IDS entry, in this exact order (append-only). */
const NEW_ITEM_IDS = [
  "bronze-chainbody",
  "bronze-full-helm",
  "steel-bar",
  "mithril-bar",
  "adamant-dagger",
  "adamant-mace",
  "adamant-sword",
  "adamant-shortbow",
  "adamant-staff",
  "adamant-chainbody",
  "adamant-kiteshield",
  "adamant-full-helm",
  "rune-dagger",
  "rune-mace",
  "rune-sword",
  "rune-shortbow",
  "rune-staff",
  "rune-chainbody",
  "rune-kiteshield",
  "rune-full-helm",
  "adamant-bar",
  "rune-bar",
  "adamant-arrow",
  "rune-arrow",
  "bronze-platelegs",
  "iron-platelegs",
  "steel-platelegs",
  "mithril-platelegs",
  "adamant-platelegs",
  "rune-platelegs",
] as const;

const PRE_251_RECIPE_IDS = [
  "bronze-dagger",
  "bronze-shield",
  "bronze-sword",
  "bronze-mace",
  "iron-dagger",
  "iron-chainbody",
  "iron-mace",
  "iron-sword",
  "cook-beef",
  "cook-shrimp",
  "cook-trout",
  "cook-pike",
  "craft-leather-body",
  "craft-leather-chaps",
  "craft-leather-coif",
  "craft-hard-leather-coif",
  "craft-hard-leather-chaps",
  "craft-hard-leather-body",
  "craft-sapphire-ring",
  "craft-sapphire-amulet",
  "craft-emerald-ring",
  "craft-emerald-amulet",
  "craft-ruby-ring",
  "craft-ruby-amulet",
  "brew-strength-potion",
  "brew-attack-potion",
  "brew-fishing-potion",
  "brew-production-potion",
] as const;

/** The 16 new Smithing recipes #251 added (24 total - the 8 pre-existing above), followed by
 * #252's 12 new recipes (6 METAL_FAMILIES-order families x adamant, then x rune), then #342's
 * six platelegs — appended after every PRE_251_RECIPE_IDS entry. */
const NEW_RECIPE_IDS = [
  "bronze-chainbody",
  "bronze-full-helm",
  "iron-kiteshield",
  "iron-full-helm",
  "steel-dagger",
  "steel-kiteshield",
  "steel-sword",
  "steel-mace",
  "steel-chainbody",
  "steel-full-helm",
  "mithril-dagger",
  "mithril-kiteshield",
  "mithril-sword",
  "mithril-mace",
  "mithril-chainbody",
  "mithril-full-helm",
  "adamant-dagger",
  "adamant-mace",
  "adamant-sword",
  "adamant-chainbody",
  "adamant-kiteshield",
  "adamant-full-helm",
  "rune-dagger",
  "rune-mace",
  "rune-sword",
  "rune-chainbody",
  "rune-kiteshield",
  "rune-full-helm",
  "bronze-platelegs",
  "iron-platelegs",
  "steel-platelegs",
  "mithril-platelegs",
  "adamant-platelegs",
  "rune-platelegs",
] as const;

describe("Golden order (#251): every pre-existing id keeps its exact array index", () => {
  it("content.items: the pre-#251 ids occupy indices 0..75 unchanged, appended new ids follow at the end", () => {
    const currentIds = content.items.map((i) => i.id);
    expect(currentIds).toEqual([...PRE_251_ITEM_IDS, ...NEW_ITEM_IDS]);
    // Explicit per-id index check — fails loudly on any single id's exact position, not just the
    // list shape.
    PRE_251_ITEM_IDS.forEach((id, index) => {
      expect(currentIds.indexOf(id), `"${id}" moved from its pre-#251 index ${index}`).toBe(index);
    });
  });

  it("content.recipes: the pre-#251 ids occupy indices 0..27 unchanged, appended new ids follow at the end", () => {
    const currentIds = content.recipes.map((r) => r.id);
    expect(currentIds).toEqual([...PRE_251_RECIPE_IDS, ...NEW_RECIPE_IDS]);
    PRE_251_RECIPE_IDS.forEach((id, index) => {
      expect(currentIds.indexOf(id), `"${id}" moved from its pre-#251 index ${index}`).toBe(index);
    });
  });
});
