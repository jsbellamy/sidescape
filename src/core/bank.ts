import type { ResolvedContent } from "./validate-content";
import type { Content, CurrencyDef, EngineEvent, EquipmentDef, ItemDef } from "./types";
import type { State } from "./state";

/** Loot Zone capacity (#60): max STACKS the zone holds, mirroring a Bank Slot's "1 stack, any
 * qty" rule. Tuning, not spec. */
export const LOOT_ZONE_CAPACITY = 10;

/** Bank Slot capacity: 1 slot = 1 item stack, regardless of stack quantity. */
export const BANK_START_CAPACITY = 100;
/** Tuning default: how many Bank Slots one `buyBankSlots()` purchase grants. */
const BANK_SLOTS_PER_PURCHASE = 10;
const BANK_FIRST_PRICE = 1000;
const BANK_PRICE_STEP = 500;

/** The gold cost of the next `buyBankSlots()` purchase, always derived from current capacity
 * (never stored): 1000, 1500, 2000, … as capacity grows past BANK_START_CAPACITY. */
function nextBankSlotsPrice(capacity: number): number {
  return (
    BANK_FIRST_PRICE +
    BANK_PRICE_STEP * ((capacity - BANK_START_CAPACITY) / BANK_SLOTS_PER_PURCHASE)
  );
}

/** Gold per unit if `def` can be sold; undefined for currency or anything without a value. */
function sellValue(def: ItemDef): number | undefined {
  return def.kind === "currency" ? undefined : def.value;
}

export function createBank(deps: {
  state: State;
  content: Content;
  resolved: ResolvedContent;
  emit: (event: EngineEvent) => void;
  routeToHome: (itemId: string, qty: number) => boolean;
}): {
  resolveItem: <T extends ItemDef>(
    itemId: string,
    isKind: (def: ItemDef) => def is T,
    kindError: string,
  ) => T;
  assertOwned: (itemId: string, def: ItemDef) => number;
  takeOwned: <T extends ItemDef>(
    itemId: string,
    isKind: (def: ItemDef) => def is T,
    kindError: string,
  ) => { def: T; owned: number };
  swapBackToBank: (current: { itemId: string; qty: number } | null | undefined) => void;
  returnToBank: (itemId: string, qty: number) => void;
  addToBank: (itemId: string, qty: number) => void;
  addToLootZone: (itemId: string, qty: number) => void;
  creditCombatItem: (itemId: string, qty: number) => void;
  sweepLootZone: () => void;
  isDuplicateEquipment: (def: EquipmentDef) => boolean;
  sellDuplicate: (def: EquipmentDef, qty: number) => void;
  buy: (itemId: string, qty?: number) => void;
  sell: (itemId: string, qty?: number) => void;
  buyBankSlots: () => void;
  lootAll: () => void;
  nextBankSlotsPrice: (capacity: number) => number;
  hasRoomForNewStack: (
    store: Map<string, number>,
    capacity: number,
    itemId: string,
    pulled?: number,
  ) => boolean;
} {
  const { state, content, resolved, emit, routeToHome } = deps;

  const currencyDef: CurrencyDef = content.items.find(
    (i): i is CurrencyDef => i.kind === "currency",
  )!;

  /** The Bank Slot invariant, stated once (#88): a top-up of an existing stack always fits; a
   * brand-new stack needs a free slot. `pulled` (default 0) is how many stacks the caller is
   * about to remove from `store` in the same operation — equip/assignLoadoutSlot check the
   * swap-back AFTER pulling the incoming item's own stack, because pulling its last unit can
   * itself free the slot the swap needs. */
  function hasRoomForNewStack(
    store: Map<string, number>,
    capacity: number,
    itemId: string,
    pulled = 0,
  ): boolean {
    if (store.has(itemId)) return true;
    return store.size - pulled < capacity;
  }

  /** Resolves `itemId` to its ItemDef, throwing `kindError` unless it exists and `isKind`
   * accepts it — the resolve-and-assert-kind half of the Loadout Slot dance. Kept separate from
   * ownership (see `assertOwned`) so a per-kind check that must run BETWEEN the kind and
   * ownership checks (Food's "already assigned to a Food Slot") can still slot in between,
   * preserving each command's original error-precedence order exactly. */
  function resolveItem<T extends ItemDef>(
    itemId: string,
    isKind: (def: ItemDef) => def is T,
    kindError: string,
  ): T {
    const def = resolved.itemsById.get(itemId);
    if (!def || !isKind(def)) throw new Error(kindError);
    return def;
  }

  /** Asserts the player owns at least one of `itemId` (its ItemDef already resolved), returning
   * the owned quantity, or throws `you do not own ${def.name}` — the ownership half of the
   * Loadout Slot dance. */
  function assertOwned(itemId: string, def: ItemDef): number {
    const owned = state.bank.get(itemId) ?? 0;
    if (owned <= 0) throw new Error(`you do not own ${def.name}`);
    return owned;
  }

  /** The combined resolve/assert-kind/assert-ownership dance (#182) for the Loadout Slot commands
   * whose per-kind checks never need to run between the kind and ownership checks (Potion Slot).
   * Food Slot's own "already assigned" check DOES run between the two, so the food branch of
   * assignLoadoutSlot composes `resolveItem`/`assertOwned` directly instead of this. */
  function takeOwned<T extends ItemDef>(
    itemId: string,
    isKind: (def: ItemDef) => def is T,
    kindError: string,
  ): { def: T; owned: number } {
    const def = resolveItem(itemId, isKind, kindError);
    const owned = assertOwned(itemId, def);
    return { def, owned };
  }

  /** Returns a displaced Loadout Slot occupant's stock to the Bank on a SWAP (#182) — the exact
   * pull-then-check call that used to be copied at all four assign/load commands: the incoming
   * Item's own Bank stack is about to fully clear elsewhere in the same command (its ENTIRE stock
   * is about to move into the slot), which may itself free the Bank Slot this swap-back needs, so
   * room is tested with that freed slot already counted (pulled=1) BEFORE the swap-back lands.
   * No-op when there is nothing to return (`current` is null/undefined or already at qty 0).
   * Throws "bank is full". */
  function swapBackToBank(current: { itemId: string; qty: number } | null | undefined): void {
    if (!current || current.qty <= 0) return;
    if (!hasRoomForNewStack(state.bank, state.bankCapacity, current.itemId, 1)) {
      throw new Error("bank is full");
    }
    state.bank.set(current.itemId, (state.bank.get(current.itemId) ?? 0) + current.qty);
  }

  /** Returns a Loadout Slot's stock to the Bank on a plain unassign/unload (#182) — swapBackToBank's
   * sibling: no incoming Item is being pulled in the same command, so room is tested with nothing
   * yet freed (pulled=0). No-op when `qty` is <= 0. Throws "bank is full". */
  function returnToBank(itemId: string, qty: number): void {
    if (qty <= 0) return;
    if (!hasRoomForNewStack(state.bank, state.bankCapacity, itemId)) {
      throw new Error("bank is full");
    }
    state.bank.set(itemId, (state.bank.get(itemId) ?? 0) + qty);
  }

  /** Adds `qty` of `itemId` to the Bank (#59), or to its assigned Food Slot when slot-homed
   * (#61): a top-up of an existing stack always fits (the #25 rule). A brand-new stack needed
   * while the Bank is already at capacity is instead auto-sold (sellable) or discarded
   * (unsellable) — the universal "passive flows auto-sell on overflow; player commands throw"
   * rule. Slot-first routing costs Bank capacity nothing — the Slot IS that Food's home. Never
   * throws — this is only ever reached from a passive arrival (drop, Catch, craft output), never
   * a player command. */
  function addToBank(itemId: string, qty: number): void {
    if (routeToHome(itemId, qty)) return;
    if (!hasRoomForNewStack(state.bank, state.bankCapacity, itemId)) {
      const def = resolved.itemsById.get(itemId);
      const value = def ? sellValue(def) : undefined;
      if (value !== undefined) {
        const gold = value * qty;
        state.gold += gold;
        emit({ type: "overflow-sold", itemId, qty, gold });
      } else {
        emit({ type: "overflow-lost", itemId, qty });
      }
      return;
    }
    state.bank.set(itemId, (state.bank.get(itemId) ?? 0) + qty);
  }

  /** Adds `qty` of `itemId` to the Loot Zone (#60): a top-up of an existing zone stack always
   * fits, mirroring addToBank's rule. A brand-new stack needed while the zone already holds
   * LOOT_ZONE_CAPACITY stacks is instead auto-sold (sellable) or discarded (unsellable) — the
   * same universal overflow rule and events as a full Bank (#59). Never throws — reached only
   * from a combat arrival (kill Drop or Dungeon Chest item), never a player command. */
  function addToLootZone(itemId: string, qty: number): void {
    if (!hasRoomForNewStack(state.lootZone, LOOT_ZONE_CAPACITY, itemId)) {
      const def = resolved.itemsById.get(itemId);
      const value = def ? sellValue(def) : undefined;
      if (value !== undefined) {
        const gold = value * qty;
        state.gold += gold;
        emit({ type: "overflow-sold", itemId, qty, gold });
      } else {
        emit({ type: "overflow-lost", itemId, qty });
      }
      return;
    }
    state.lootZone.set(itemId, (state.lootZone.get(itemId) ?? 0) + qty);
  }

  /** Whether the player already owns `def` (#63): equipped in its own Gear Slot, holding a Bank
   * stack, or already sitting in the Loot Zone (an earlier Drop this session not yet swept).
   * Stackables never reach this check — creditCombatItem only calls it for EquipmentDefs. */
  function isDuplicateEquipment(def: EquipmentDef): boolean {
    return (
      state.equipment[def.slot] === def.id ||
      (state.bank.get(def.id) ?? 0) > 0 ||
      (state.lootZone.get(def.id) ?? 0) > 0
    );
  }

  /** Sells a duplicate Equipment arrival immediately (#63) instead of routing it to the Loot
   * Zone: credits `value * qty` to gold and emits duplicate-sold, or — if unsellable — discards
   * it with the existing overflow-lost event, the same "no value -> discarded" rule a full Loot
   * Zone/Bank already uses. */
  function sellDuplicate(def: EquipmentDef, qty: number): void {
    const value = sellValue(def);
    if (value !== undefined) {
      const gold = value * qty;
      state.gold += gold;
      emit({ type: "duplicate-sold", itemId: def.id, gold });
    } else {
      emit({ type: "overflow-lost", itemId: def.id, qty });
    }
  }

  /** Routes one passive arrival (drop or Chest entry) to its destination (#59, extended by
   * #60 and #63): the currency item credits `state.gold` directly, never touching the Bank or
   * the Loot Zone. An EquipmentDef the player already owns is instead auto-sold on the spot when
   * the toggle is ON (#63) — see isDuplicateEquipment/sellDuplicate. Everything else goes to the
   * Loot Zone via addToLootZone's top-up/overflow rules above — combat outputs buffer there
   * instead of landing straight in the Bank. */
  function creditCombatItem(itemId: string, qty: number): void {
    if (itemId === currencyDef.id) {
      state.gold += qty;
      return;
    }
    const def = resolved.itemsById.get(itemId);
    if (state.autoSellDuplicates && def?.kind === "equipment" && isDuplicateEquipment(def)) {
      sellDuplicate(def, qty);
      return;
    }
    addToLootZone(itemId, qty);
  }

  /** Moves every Loot Zone stack to its home (#60, extended by #61's Slot-as-home routing): a
   * Food assigned to a Slot lands there (no cap, never overflows); everything else goes to the
   * Bank, where a top-up of an existing stack always fits and a stack that would need a brand-new
   * Bank Slot while the Bank is already at capacity stays in the Loot Zone untouched — a sweep
   * never sells, unlike zone-full overflow above. Emits one `looted` event listing exactly the
   * stacks actually moved; emits nothing if none moved. Shared by every auto-loot trigger and the
   * on-demand lootAll() command — both idempotent by construction, since a second sweep simply
   * finds nothing left that fits. */
  function sweepLootZone(): void {
    const banked: { itemId: string; qty: number }[] = [];
    for (const [itemId, qty] of [...state.lootZone]) {
      if (routeToHome(itemId, qty)) {
        state.lootZone.delete(itemId);
        banked.push({ itemId, qty });
        continue;
      }
      if (!hasRoomForNewStack(state.bank, state.bankCapacity, itemId)) continue; // stays in the zone
      state.bank.set(itemId, (state.bank.get(itemId) ?? 0) + qty);
      state.lootZone.delete(itemId);
      banked.push({ itemId, qty });
    }
    if (banked.length > 0) emit({ type: "looted", items: banked });
  }

  function buy(itemId: string, qty = 1): void {
    if (!Number.isInteger(qty) || qty < 1) throw new Error(`invalid buy quantity: ${qty}`);
    const entry = content.vendor.find((v) => v.itemId === itemId);
    if (!entry) throw new Error(`${itemId} is not sold by the vendor`);
    const cost = entry.price * qty;
    if (state.gold < cost) throw new Error(`not enough gold: need ${cost}`);
    const slotHomed = routeToHome(itemId, qty);
    if (!slotHomed && !hasRoomForNewStack(state.bank, state.bankCapacity, itemId)) {
      throw new Error("bank is full");
    }

    state.gold -= cost;
    if (!slotHomed) {
      state.bank.set(itemId, (state.bank.get(itemId) ?? 0) + qty);
    }
    emit({ type: "item-bought", itemId, qty, gold: cost });
  }

  function sell(itemId: string, qty = 1): void {
    if (!Number.isInteger(qty) || qty < 1) throw new Error(`invalid sell quantity: ${qty}`);
    const def = resolved.itemsById.get(itemId);
    if (!def) throw new Error(`unknown item: ${itemId}`);
    const value = sellValue(def);
    if (value === undefined) throw new Error(`${def.name} cannot be sold`);
    const owned = state.bank.get(itemId) ?? 0;
    if (owned < qty) throw new Error(`you do not own ${qty} ${def.name}`);

    const remaining = owned - qty;
    if (remaining > 0) state.bank.set(itemId, remaining);
    else state.bank.delete(itemId);
    const gold = value * qty;
    state.gold += gold;
    emit({ type: "item-sold", itemId, qty, gold });
  }

  function buyBankSlots(): void {
    const price = nextBankSlotsPrice(state.bankCapacity);
    if (state.gold < price) throw new Error(`not enough gold: need ${price}`);

    state.gold -= price;
    state.bankCapacity += BANK_SLOTS_PER_PURCHASE;
  }

  function lootAll(): void {
    sweepLootZone();
  }

  return {
    resolveItem,
    assertOwned,
    takeOwned,
    swapBackToBank,
    returnToBank,
    addToBank,
    addToLootZone,
    creditCombatItem,
    sweepLootZone,
    isDuplicateEquipment,
    sellDuplicate,
    buy,
    sell,
    buyBankSlots,
    lootAll,
    nextBankSlotsPrice,
    hasRoomForNewStack,
  };
}
