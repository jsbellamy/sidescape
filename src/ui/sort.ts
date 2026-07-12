import type { ItemDef } from "../core/types";
import type { ResolvedContent } from "../core/validate-content";

/**
 * Presentation-only sort choice for the Inventory and Bank lists (#26). Kept out of the
 * Snapshot/save on purpose — same boundary as the SFX mute preference (#20): simulation
 * state lives in the save, presentation choices live in localStorage.
 */
export type SortKey = "kind" | "value" | "name";

/** Drives the Kind | Value | Name control row, in display order. */
export const SORT_KEYS: readonly SortKey[] = ["kind", "value", "name"];

export interface Stack {
  itemId: string;
  qty: number;
}

const SORT_STORAGE_KEY = "sidescape-ui-sort";

/** equipment -> food -> potion -> ammo -> material -> currency, covering every current
 * `ItemDef.kind` (#207 — the expanded Bank's filter set mirrors this same list minus currency,
 * which never occupies a Bank Slot). Any kind not listed sorts last. */
const KIND_ORDER: Record<string, number> = {
  equipment: 0,
  food: 1,
  potion: 2,
  ammo: 3,
  material: 4,
  currency: 5,
};

function itemDef(itemId: string, content: ResolvedContent): ItemDef | undefined {
  return content.itemsById.get(itemId);
}

function itemName(itemId: string, content: ResolvedContent): string {
  return itemDef(itemId, content)?.name ?? itemId;
}

/** `def.value ?? 0`; currency has no `value` field at all, so it sorts as 0. */
function itemValue(itemId: string, content: ResolvedContent): number {
  const def = itemDef(itemId, content);
  return def && def.kind !== "currency" ? (def.value ?? 0) : 0;
}

function kindRank(itemId: string, content: ResolvedContent): number {
  const kind = itemDef(itemId, content)?.kind;
  return kind !== undefined
    ? (KIND_ORDER[kind] ?? Number.MAX_SAFE_INTEGER)
    : Number.MAX_SAFE_INTEGER;
}

/**
 * Comparator factory shared by the Inventory and Bank lists, so both sort identically off one
 * module. Every key breaks ties by name for a stable order: kind ties by name; value (descending)
 * ties by name; name is already name. Callers sort by itemId/qty stacks only — never row position,
 * so click handlers keep dispatching by data attribute regardless of sort order.
 */
export function compareStacks(
  key: SortKey,
  content: ResolvedContent,
): (a: Stack, b: Stack) => number {
  return (a, b) => {
    const nameCompare = itemName(a.itemId, content).localeCompare(itemName(b.itemId, content));
    switch (key) {
      case "kind":
        return kindRank(a.itemId, content) - kindRank(b.itemId, content) || nameCompare;
      case "value":
        return itemValue(b.itemId, content) - itemValue(a.itemId, content) || nameCompare;
      case "name":
      default:
        return nameCompare;
    }
  };
}

/** Sorts a copy of `stacks` (never mutates the input) by `key` using `compareStacks`. */
export function sortStacks<T extends Stack>(
  stacks: T[],
  key: SortKey,
  content: ResolvedContent,
): T[] {
  return [...stacks].sort(compareStacks(key, content));
}

function isSortKey(value: unknown): value is SortKey {
  return (SORT_KEYS as readonly unknown[]).includes(value);
}

/** The persisted sort choice, or "name" (a sensible default) if unset or localStorage is
 * unavailable (private mode, disabled). */
export function loadSortKey(): SortKey {
  try {
    const raw = localStorage.getItem(SORT_STORAGE_KEY);
    return isSortKey(raw) ? raw : "name";
  } catch {
    return "name";
  }
}

export function saveSortKey(key: SortKey): void {
  try {
    localStorage.setItem(SORT_STORAGE_KEY, key);
  } catch {
    // localStorage may be unavailable; the choice just won't persist.
  }
}
