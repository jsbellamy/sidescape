import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fixtureContent } from "../core/fixture-content";
import { resolveContent } from "../core/validate-content";
import { BANK_FILTERS, BANK_VIEW_KEY, createBankPresentation } from "./bank-view";
import type { Snapshot } from "../core/types";

const content = resolveContent(fixtureContent);

/**
 * happy-dom's localStorage getter doesn't resolve reliably under Vitest's global-population
 * strategy (mirrors the stub in ui/sfx.test.ts and ui/sort.test.ts).
 */
function stubLocalStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => (store.has(key) ? (store.get(key) as string) : null),
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
}

// fixtureContent items relevant here: bronze-sword/lucky-charm/bow/staff (equipment), meat/bread
// (food), bar/raw-fish/hide/herb (material), strength-potion/fishing-potion/production-potion
// (potion), arrow/iron-arrow/air-rune/water-rune/earth-rune/fire-rune (ammo), gold (currency).
function stacksFor(itemIds: string[]): Snapshot["bank"]["items"] {
  return itemIds.map((itemId) => ({ itemId, qty: 1 }));
}

describe("BANK_FILTERS", () => {
  it("covers every bankable ItemDef.kind plus 'all', excluding currency", () => {
    expect(BANK_FILTERS).toEqual(["all", "equipment", "food", "material", "potion", "ammo"]);
  });
});

describe("createBankPresentation", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", stubLocalStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("construction / tolerant load", () => {
    it("defaults to filter 'all', sort 'name', empty search when nothing is persisted", () => {
      const presentation = createBankPresentation(content);
      expect(presentation.state()).toEqual({ filter: "all", sort: "name", search: "" });
    });

    it("restores a validly stored filter and sort", () => {
      localStorage.setItem(
        BANK_VIEW_KEY,
        JSON.stringify({ version: 1, filter: "food", sort: "value" }),
      );
      const presentation = createBankPresentation(content);
      expect(presentation.state()).toEqual({ filter: "food", sort: "value", search: "" });
    });

    it("falls back to the default for malformed JSON", () => {
      localStorage.setItem(BANK_VIEW_KEY, "{not json");
      expect(createBankPresentation(content).state()).toEqual({
        filter: "all",
        sort: "name",
        search: "",
      });
    });

    it("falls back to the default for a JSON value that isn't an object", () => {
      localStorage.setItem(BANK_VIEW_KEY, "42");
      expect(createBankPresentation(content).state()).toEqual({
        filter: "all",
        sort: "name",
        search: "",
      });
    });

    it("defaults only the invalid field when the filter is unknown", () => {
      localStorage.setItem(
        BANK_VIEW_KEY,
        JSON.stringify({ version: 1, filter: "not-a-filter", sort: "value" }),
      );
      expect(createBankPresentation(content).state()).toEqual({
        filter: "all",
        sort: "value",
        search: "",
      });
    });

    it("defaults only the invalid field when the sort is unknown", () => {
      localStorage.setItem(
        BANK_VIEW_KEY,
        JSON.stringify({ version: 1, filter: "food", sort: "not-a-sort" }),
      );
      expect(createBankPresentation(content).state()).toEqual({
        filter: "food",
        sort: "name",
        search: "",
      });
    });

    it("tolerates missing fields entirely", () => {
      localStorage.setItem(BANK_VIEW_KEY, JSON.stringify({ version: 1 }));
      expect(createBankPresentation(content).state()).toEqual({
        filter: "all",
        sort: "name",
        search: "",
      });
    });

    it("never throws when localStorage access itself fails", () => {
      vi.stubGlobal("localStorage", {
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: () => {
          throw new Error("blocked");
        },
      } as unknown as Storage);
      let presentation: ReturnType<typeof createBankPresentation> | undefined;
      expect(() => {
        presentation = createBankPresentation(content);
      }).not.toThrow();
      expect(presentation?.state()).toEqual({ filter: "all", sort: "name", search: "" });
      expect(() => presentation?.setFilter("food")).not.toThrow();
    });
  });

  describe("persistence timing", () => {
    it("setFilter immediately persists with the current sort", () => {
      const presentation = createBankPresentation(content);
      presentation.setSort("value");
      presentation.setFilter("food");
      expect(JSON.parse(localStorage.getItem(BANK_VIEW_KEY) as string)).toEqual({
        version: 1,
        filter: "food",
        sort: "value",
      });
    });

    it("setSort immediately persists with the current filter", () => {
      const presentation = createBankPresentation(content);
      presentation.setFilter("potion");
      presentation.setSort("kind");
      expect(JSON.parse(localStorage.getItem(BANK_VIEW_KEY) as string)).toEqual({
        version: 1,
        filter: "potion",
        sort: "kind",
      });
    });

    it("setSearch never persists", () => {
      const presentation = createBankPresentation(content);
      presentation.setSearch("sword");
      expect(localStorage.getItem(BANK_VIEW_KEY)).toBeNull();
      expect(presentation.state().search).toBe("sword");
    });

    it("clearSearch never persists and clears only search", () => {
      const presentation = createBankPresentation(content);
      presentation.setFilter("food");
      presentation.setSearch("meat");
      const beforeClear = localStorage.getItem(BANK_VIEW_KEY);
      presentation.clearSearch();
      expect(presentation.state()).toEqual({ filter: "food", sort: "name", search: "" });
      expect(localStorage.getItem(BANK_VIEW_KEY)).toBe(beforeClear);
    });

    it("toggleSelection never persists", () => {
      const presentation = createBankPresentation(content);
      presentation.toggleSelection("bronze-sword");
      expect(localStorage.getItem(BANK_VIEW_KEY)).toBeNull();
    });
  });

  describe("full() projection", () => {
    it("applies kind filter, then trimmed case-insensitive search, then sort — filter/search never expand the sorted set", () => {
      const stacks = stacksFor(["lucky-charm", "bronze-sword", "meat"]);
      const presentation = createBankPresentation(content);
      presentation.setFilter("equipment");
      presentation.setSearch("  SWORD  ");
      expect(presentation.full(stacks).stacks.map((s) => s.itemId)).toEqual(["bronze-sword"]);
    });

    it("sorts using the current SortKey", () => {
      const stacks = stacksFor(["meat", "bronze-sword", "lucky-charm"]);
      const presentation = createBankPresentation(content);
      presentation.setSort("value");
      // lucky-charm 100g, bronze-sword 20g, meat 3g
      expect(presentation.full(stacks).stacks.map((s) => s.itemId)).toEqual([
        "lucky-charm",
        "bronze-sword",
        "meat",
      ]);
    });

    it("resolves selected to null when the selected id is filtered out", () => {
      const stacks = stacksFor(["bronze-sword", "meat"]);
      const presentation = createBankPresentation(content);
      presentation.toggleSelection("meat");
      presentation.setFilter("equipment");
      expect(presentation.full(stacks).selected).toBeNull();
    });

    it("resolves selected to the matching stack when present", () => {
      const stacks = stacksFor(["bronze-sword", "meat"]);
      const presentation = createBankPresentation(content);
      presentation.toggleSelection("meat");
      expect(presentation.full(stacks).selected).toEqual({ itemId: "meat", qty: 1 });
    });

    it("never mutates the input array or its order", () => {
      const stacks = stacksFor(["lucky-charm", "bronze-sword", "meat"]);
      const original = stacks.map((s) => ({ ...s }));
      const presentation = createBankPresentation(content);
      presentation.setSort("value");
      presentation.full(stacks);
      expect(stacks).toEqual(original);
    });
  });

  describe("equipment() projection", () => {
    it("ignores the full Bank's kind filter and search, keeping only Equipment", () => {
      const stacks = stacksFor(["bronze-sword", "lucky-charm", "meat", "bar"]);
      const presentation = createBankPresentation(content);
      presentation.setFilter("food");
      presentation.setSearch("sword");
      expect(
        presentation
          .equipment(stacks)
          .stacks.map((s) => s.itemId)
          .sort(),
      ).toEqual(["bronze-sword", "lucky-charm"].sort());
    });

    it("shares the current SortKey with full()", () => {
      const stacks = stacksFor(["bronze-sword", "lucky-charm"]);
      const presentation = createBankPresentation(content);
      presentation.setSort("value");
      // lucky-charm 100g before bronze-sword 20g
      expect(presentation.equipment(stacks).stacks.map((s) => s.itemId)).toEqual([
        "lucky-charm",
        "bronze-sword",
      ]);
    });

    it("never mutates the input array or its order", () => {
      const stacks = stacksFor(["bronze-sword", "lucky-charm", "meat"]);
      const original = stacks.map((s) => ({ ...s }));
      const presentation = createBankPresentation(content);
      presentation.equipment(stacks);
      expect(stacks).toEqual(original);
    });
  });

  describe("shared-but-independently-resolved selection", () => {
    it("full()'s filter hiding the selection does not blank equipment()'s selection", () => {
      const stacks = stacksFor(["bronze-sword", "meat"]);
      const presentation = createBankPresentation(content);
      presentation.toggleSelection("bronze-sword");
      presentation.setFilter("food");
      expect(presentation.full(stacks).selected).toBeNull();
      expect(presentation.equipment(stacks).selected).toEqual({ itemId: "bronze-sword", qty: 1 });
    });

    it("re-clicking (toggling) the same selection turns it off in both projections", () => {
      const stacks = stacksFor(["bronze-sword"]);
      const presentation = createBankPresentation(content);
      presentation.toggleSelection("bronze-sword");
      expect(presentation.full(stacks).selected).not.toBeNull();
      presentation.toggleSelection("bronze-sword");
      expect(presentation.full(stacks).selected).toBeNull();
      expect(presentation.equipment(stacks).selected).toBeNull();
    });

    it("a selected stack absent from both inputs (sold/equipped) resolves to null in both without mutating input, and can reappear later", () => {
      const presentation = createBankPresentation(content);
      presentation.toggleSelection("bronze-sword");
      const emptyStacks: Snapshot["bank"]["items"] = [];
      expect(presentation.full(emptyStacks).selected).toBeNull();
      expect(presentation.equipment(emptyStacks).selected).toBeNull();

      const restocked = stacksFor(["bronze-sword"]);
      expect(presentation.full(restocked).selected).toEqual({ itemId: "bronze-sword", qty: 1 });
    });
  });

  describe("two-instance locality", () => {
    it("two instances do not share filter/search/selection state", () => {
      const a = createBankPresentation(content);
      const b = createBankPresentation(content);
      a.setFilter("food");
      a.setSearch("meat");
      a.toggleSelection("meat");
      expect(b.state()).toEqual({ filter: "all", sort: "name", search: "" });
      const stacks = stacksFor(["meat"]);
      expect(b.full(stacks).selected).toBeNull();
    });
  });
});
