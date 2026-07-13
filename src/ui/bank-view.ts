import type { Snapshot } from "../core/types";
import type { ResolvedContent } from "../core/validate-content";
import { sortStacks, SORT_KEYS } from "./sort";
import type { SortKey } from "./sort";

/**
 * The expanded Bank page's filter vocabulary (#207): one entry per bankable `ItemDef.kind`, plus
 * "all". Currency is deliberately absent — Gold is a player balance, never a Bank stack (see
 * CONTEXT.md's Gold entry), so it can never be the thing a Bank filter narrows down to.
 */
export const BANK_FILTERS = ["all", "equipment", "food", "material", "potion", "ammo"] as const;
export type BankFilter = (typeof BANK_FILTERS)[number];

/** The one piece of Bank-view state that *is* persisted locally (#207): filter and sort survive a
 * relaunch, bundled into one versioned object so a future field (e.g. a second filter axis) is one
 * more property, not a second parallel localStorage key. */
export interface StoredBankViewV1 {
  version: 1;
  filter: BankFilter;
  sort: SortKey;
}

export const BANK_VIEW_KEY = "sidescape-ui-bank-view-v1";

const DEFAULT_BANK_VIEW: StoredBankViewV1 = { version: 1, filter: "all", sort: "name" };

function isBankFilter(value: unknown): value is BankFilter {
  return (BANK_FILTERS as readonly unknown[]).includes(value);
}

function isSortKey(value: unknown): value is SortKey {
  return (SORT_KEYS as readonly unknown[]).includes(value);
}

/** Tolerant load (#207): malformed JSON, a missing file, an unknown filter/sort value, or a
 * localStorage access failure (private mode, disabled) all fall back to the default — never
 * throws. */
function loadBankView(): StoredBankViewV1 {
  try {
    const raw = localStorage.getItem(BANK_VIEW_KEY);
    if (!raw) return { ...DEFAULT_BANK_VIEW };
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return { ...DEFAULT_BANK_VIEW };
    const obj = parsed as Record<string, unknown>;
    return {
      version: 1,
      filter: isBankFilter(obj["filter"]) ? obj["filter"] : DEFAULT_BANK_VIEW.filter,
      sort: isSortKey(obj["sort"]) ? obj["sort"] : DEFAULT_BANK_VIEW.sort,
    };
  } catch {
    return { ...DEFAULT_BANK_VIEW };
  }
}

function saveBankView(view: StoredBankViewV1): void {
  try {
    localStorage.setItem(BANK_VIEW_KEY, JSON.stringify(view));
  } catch {
    // localStorage may be unavailable; the choice just won't persist.
  }
}

export interface BankPresentationState {
  readonly filter: BankFilter;
  readonly sort: SortKey;
  readonly search: string;
}

export interface PresentedBank {
  readonly stacks: Snapshot["bank"]["items"];
  readonly selected: Snapshot["bank"]["items"][number] | null;
}

/**
 * One deep, instance-local module owning the Bank's presentation state (#237): filter, sort,
 * search, and shared selection, plus the tolerant load / immediate-persist timing described on
 * `StoredBankViewV1`. Two DOM adapters in `app.ts` — the full Bank destination and the Character
 * hub's Equipment-only tray — call `full`/`equipment` against one shared instance rather than each
 * owning filter/sort/search/selection variables of their own.
 */
export interface BankPresentation {
  state(): BankPresentationState;
  setFilter(filter: BankFilter): void;
  setSort(sort: SortKey): void;
  setSearch(search: string): void;
  clearSearch(): void;
  toggleSelection(itemId: string): void;
  full(stacks: Snapshot["bank"]["items"]): PresentedBank;
  equipment(stacks: Snapshot["bank"]["items"]): PresentedBank;
}

/** Filter-then-search-then-sort, shared by `full`'s kind filter and `equipment`'s fixed
 * equipment-only filter — kept as one internal helper so the two projections' pipelines can never
 * drift apart on ordering (filter always precedes sort). */
function project(
  stacks: Snapshot["bank"]["items"],
  filter: BankFilter,
  search: string,
  sort: SortKey,
  selectedItemId: string | null,
  content: ResolvedContent,
): PresentedBank {
  const trimmed = search.trim().toLowerCase();
  const filtered = stacks.filter((s) => {
    const def = content.itemsById.get(s.itemId);
    if (filter !== "all" && def?.kind !== filter) return false;
    if (trimmed === "") return true;
    return (def?.name ?? s.itemId).toLowerCase().includes(trimmed);
  });
  const sorted = sortStacks(filtered, sort, content);
  const selected = sorted.find((s) => s.itemId === selectedItemId) ?? null;
  return { stacks: sorted, selected };
}

export function createBankPresentation(content: ResolvedContent): BankPresentation {
  const initial = loadBankView();
  let filter: BankFilter = initial.filter;
  let sort: SortKey = initial.sort;
  // Session-only: never persisted, never the Snapshot/save. Cleared by `clearSearch` whenever the
  // Bank Management destination closes (see app.ts's `syncWorkspace`).
  let search = "";
  // Shared internally by both projections, but each projection resolves *visibility* against its
  // own filtered/sorted list — one view's filter hiding the item must not blank the other view's
  // still-valid selection (#207's original `resolveSelection`, now internal to this module).
  let selectedItemId: string | null = null;

  function persist(): void {
    saveBankView({ version: 1, filter, sort });
  }

  return {
    state(): BankPresentationState {
      return { filter, sort, search };
    },
    setFilter(next: BankFilter): void {
      filter = next;
      persist();
    },
    setSort(next: SortKey): void {
      sort = next;
      persist();
    },
    setSearch(next: string): void {
      search = next;
    },
    clearSearch(): void {
      search = "";
    },
    toggleSelection(itemId: string): void {
      selectedItemId = selectedItemId === itemId ? null : itemId;
    },
    full(stacks: Snapshot["bank"]["items"]): PresentedBank {
      return project(stacks, filter, search, sort, selectedItemId, content);
    },
    equipment(stacks: Snapshot["bank"]["items"]): PresentedBank {
      return project(stacks, "equipment", "", sort, selectedItemId, content);
    },
  };
}
