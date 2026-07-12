import type { ResolvedContent } from "../core/validate-content";
import { sortStacks, SORT_KEYS } from "./sort";
import type { SortKey, Stack } from "./sort";

/**
 * The expanded Bank page's filter vocabulary (#207): one entry per bankable `ItemDef.kind`, plus
 * "all". Currency is deliberately absent — Gold is a player balance, never a Bank stack (see
 * CONTEXT.md's Gold entry), so it can never be the thing a Bank filter narrows down to.
 */
export const BANK_FILTERS = ["all", "equipment", "food", "material", "potion", "ammo"] as const;
export type BankFilter = (typeof BANK_FILTERS)[number];

/** Which of the Management card's "bank" destination sub-pages is showing — purely
 * presentational and session-only (never persisted, never the Snapshot/save), same boundary as
 * search text and the selected Bank item below. */
export type BankMode = "bank" | "vendor";

/** The one piece of Bank-view state that *is* persisted locally (#207): filter and sort survive a
 * relaunch, the same boundary `sort.ts`'s own `SORT_STORAGE_KEY` already used for sort alone.
 * Bundled into one versioned object so a future field (e.g. a second filter axis) is one more
 * property, not a second parallel localStorage key. */
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
 * throws. Mirrors `sort.ts`'s own `loadSortKey` tolerance, one level deeper (two fields instead of
 * one). */
export function loadBankView(): StoredBankViewV1 {
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

export function saveBankView(view: StoredBankViewV1): void {
  try {
    localStorage.setItem(BANK_VIEW_KEY, JSON.stringify(view));
  } catch {
    // localStorage may be unavailable; the choice just won't persist.
  }
}

/**
 * The expanded Bank page's exact filtering order (#207): kind filter, then a case-insensitive
 * trimmed substring match on `ItemDef.name`. Sorting is a separate step (`visibleBankStacks`
 * below) so this stays independently testable — filter-before-sort is load-bearing (sorting never
 * changes which stacks are present, only their order).
 */
export function filterBankStacks<T extends Stack>(
  stacks: T[],
  filter: BankFilter,
  search: string,
  content: ResolvedContent,
): T[] {
  const trimmed = search.trim().toLowerCase();
  return stacks.filter((s) => {
    const def = content.itemsById.get(s.itemId);
    if (filter !== "all" && def?.kind !== filter) return false;
    if (trimmed === "") return true;
    return (def?.name ?? s.itemId).toLowerCase().includes(trimmed);
  });
}

/** `filterBankStacks` followed by `sortStacks` — the full "start with snapshot.bank.items ->
 * filter by kind -> filter by search -> sort" pipeline, minus the final "drop selectedBankItem if
 * it no longer appears" step (that step is view-local, see `resolveSelection` below: the full Bank
 * page and Character's Equipment tray each apply their own filter, so each must resolve selection
 * visibility against its own list rather than a single shared computation). */
export function visibleBankStacks<T extends Stack>(
  stacks: T[],
  filter: BankFilter,
  search: string,
  sort: SortKey,
  content: ResolvedContent,
): T[] {
  return sortStacks(filterBankStacks(stacks, filter, search, content), sort, content);
}

/**
 * Resolves whether `selected` should drive a detail strip against `visibleStacks` (#207's "drop
 * selectedBankItem if it no longer appears" step) — returns `selected` unchanged when present,
 * `null` otherwise. Deliberately a pure, non-mutating lookup rather than a variable reset: the full
 * Bank page and Character's Equipment tray share one `selectedBankItem`, but each filters
 * differently (the tray is always Equipment-only, regardless of the Bank page's own active
 * filter), so one view's filter hiding the item must not erase the other view's still-valid
 * selection. Each caller resolves visibility for its own render only.
 */
export function resolveSelection<T extends Stack>(
  selected: string | null,
  visibleStacks: T[],
): string | null {
  return selected !== null && visibleStacks.some((s) => s.itemId === selected) ? selected : null;
}
