import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fixtureContent } from "../core/fixture-content";
import { resolveContent } from "../core/validate-content";
import {
  BANK_FILTERS,
  BANK_VIEW_KEY,
  filterBankStacks,
  loadBankView,
  resolveSelection,
  saveBankView,
  visibleBankStacks,
} from "./bank-view";
import type { Stack } from "./sort";

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
function stacksFor(itemIds: string[]): Stack[] {
  return itemIds.map((itemId) => ({ itemId, qty: 1 }));
}

describe("BANK_FILTERS", () => {
  it("covers every bankable ItemDef.kind plus 'all', excluding currency", () => {
    expect(BANK_FILTERS).toEqual(["all", "equipment", "food", "material", "potion", "ammo"]);
  });
});

describe("filterBankStacks", () => {
  const stacks = stacksFor(["bronze-sword", "meat", "bar", "strength-potion", "arrow"]);

  it("returns every stack unfiltered for 'all' with no search", () => {
    expect(filterBankStacks(stacks, "all", "", content).map((s) => s.itemId)).toEqual([
      "bronze-sword",
      "meat",
      "bar",
      "strength-potion",
      "arrow",
    ]);
  });

  it("filters by kind for every non-'all' BankFilter value", () => {
    expect(filterBankStacks(stacks, "equipment", "", content).map((s) => s.itemId)).toEqual([
      "bronze-sword",
    ]);
    expect(filterBankStacks(stacks, "food", "", content).map((s) => s.itemId)).toEqual(["meat"]);
    expect(filterBankStacks(stacks, "material", "", content).map((s) => s.itemId)).toEqual(["bar"]);
    expect(filterBankStacks(stacks, "potion", "", content).map((s) => s.itemId)).toEqual([
      "strength-potion",
    ]);
    expect(filterBankStacks(stacks, "ammo", "", content).map((s) => s.itemId)).toEqual(["arrow"]);
  });

  it("matches search case-insensitively", () => {
    expect(filterBankStacks(stacks, "all", "BRONZE", content).map((s) => s.itemId)).toEqual([
      "bronze-sword",
    ]);
    expect(filterBankStacks(stacks, "all", "bronze", content).map((s) => s.itemId)).toEqual([
      "bronze-sword",
    ]);
  });

  it("trims surrounding whitespace from the search term", () => {
    expect(filterBankStacks(stacks, "all", "  meat  ", content).map((s) => s.itemId)).toEqual([
      "meat",
    ]);
  });

  it("treats a search of only whitespace as empty (matches everything)", () => {
    expect(filterBankStacks(stacks, "all", "   ", content).map((s) => s.itemId)).toEqual([
      "bronze-sword",
      "meat",
      "bar",
      "strength-potion",
      "arrow",
    ]);
  });

  it("composes kind filter and search together (kind narrows first, search narrows further)", () => {
    // "sword" only matches bronze-sword by name; filtering to "food" first should exclude it
    // even though the name substring would otherwise match nothing in that kind either.
    expect(filterBankStacks(stacks, "food", "sword", content)).toEqual([]);
    expect(filterBankStacks(stacks, "equipment", "sword", content).map((s) => s.itemId)).toEqual([
      "bronze-sword",
    ]);
  });

  it("never mutates the input array", () => {
    const original = [...stacks];
    filterBankStacks(stacks, "equipment", "", content);
    expect(stacks).toEqual(original);
  });
});

describe("visibleBankStacks (filter-before-sort ordering)", () => {
  it("filters by kind, then by search, then sorts the filtered copy — never the other order", () => {
    // Sorting by value descending would put lucky-charm (100g) before bronze-sword (20g) if sort
    // ran before the equipment filter/search; the filtered set here is search-narrowed to "sword"
    // so lucky-charm must be gone entirely, not just re-ordered.
    const stacks = stacksFor(["lucky-charm", "bronze-sword", "meat"]);
    const result = visibleBankStacks(stacks, "equipment", "sword", "value", content);
    expect(result.map((s) => s.itemId)).toEqual(["bronze-sword"]);
  });

  it("sorts the filtered result by the given SortKey", () => {
    const stacks = stacksFor(["meat", "bronze-sword", "lucky-charm"]);
    const byValue = visibleBankStacks(stacks, "all", "", "value", content);
    // lucky-charm 100g, bronze-sword 20g, meat 3g
    expect(byValue.map((s) => s.itemId)).toEqual(["lucky-charm", "bronze-sword", "meat"]);
  });

  it("never mutates the input array", () => {
    const stacks = stacksFor(["lucky-charm", "bronze-sword", "meat"]);
    const original = [...stacks];
    visibleBankStacks(stacks, "all", "", "value", content);
    expect(stacks).toEqual(original);
  });
});

describe("resolveSelection", () => {
  const stacks = stacksFor(["bronze-sword", "meat"]);

  it("returns the selected id unchanged when it is present in the visible stacks", () => {
    expect(resolveSelection("bronze-sword", stacks)).toBe("bronze-sword");
  });

  it("returns null when the selected id is absent from the visible stacks", () => {
    expect(resolveSelection("lucky-charm", stacks)).toBeNull();
  });

  it("returns null for a null selection", () => {
    expect(resolveSelection(null, stacks)).toBeNull();
  });

  it("is a pure lookup — it never mutates its inputs", () => {
    const original = [...stacks];
    resolveSelection("lucky-charm", stacks);
    expect(stacks).toEqual(original);
  });
});

describe("loadBankView / saveBankView persistence", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", stubLocalStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("defaults to { version: 1, filter: 'all', sort: 'name' } when nothing is persisted", () => {
    expect(loadBankView()).toEqual({ version: 1, filter: "all", sort: "name" });
  });

  it("round-trips a saved filter and sort", () => {
    saveBankView({ version: 1, filter: "food", sort: "value" });
    expect(loadBankView()).toEqual({ version: 1, filter: "food", sort: "value" });
  });

  it("stores under its own key, separate from the game save and the old standalone sort key", () => {
    saveBankView({ version: 1, filter: "potion", sort: "kind" });
    expect(localStorage.getItem(BANK_VIEW_KEY)).toBe(
      JSON.stringify({ version: 1, filter: "potion", sort: "kind" }),
    );
    expect(localStorage.getItem("sidescape-save-v1")).toBeNull();
  });

  it("falls back to the default for malformed JSON", () => {
    localStorage.setItem(BANK_VIEW_KEY, "{not json");
    expect(loadBankView()).toEqual({ version: 1, filter: "all", sort: "name" });
  });

  it("falls back to the default for a JSON value that isn't an object", () => {
    localStorage.setItem(BANK_VIEW_KEY, "42");
    expect(loadBankView()).toEqual({ version: 1, filter: "all", sort: "name" });
  });

  it("tolerates an unknown filter or sort value, defaulting only the bad field", () => {
    localStorage.setItem(
      BANK_VIEW_KEY,
      JSON.stringify({ version: 1, filter: "not-a-filter", sort: "value" }),
    );
    expect(loadBankView()).toEqual({ version: 1, filter: "all", sort: "value" });

    localStorage.setItem(
      BANK_VIEW_KEY,
      JSON.stringify({ version: 1, filter: "food", sort: "not-a-sort" }),
    );
    expect(loadBankView()).toEqual({ version: 1, filter: "food", sort: "name" });
  });

  it("tolerates missing fields entirely", () => {
    localStorage.setItem(BANK_VIEW_KEY, JSON.stringify({ version: 1 }));
    expect(loadBankView()).toEqual({ version: 1, filter: "all", sort: "name" });
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
    expect(() => loadBankView()).not.toThrow();
    expect(loadBankView()).toEqual({ version: 1, filter: "all", sort: "name" });
    expect(() => saveBankView({ version: 1, filter: "food", sort: "name" })).not.toThrow();
  });
});
