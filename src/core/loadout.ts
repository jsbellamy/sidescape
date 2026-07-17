import type { ResolvedContent } from "./validate-content";
import type { AmmoDef, EngineEvent, FoodDef, ItemDef, PotionDef, SkillName } from "./types";
import type { State } from "./state";

export type LoadoutKind = "food" | "potion" | "quiver" | "rune";

/** Active Food Slot count (#61): tuning, not spec — a fixed-length loadout that replaced
 * free-form eat-from-Bank. Slot order (array index) is auto-eat's draining priority. */
const FOOD_SLOT_COUNT = 3;

interface LoadoutBankDeps {
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
}

export function createLoadoutSlots(deps: {
  state: State;
  resolved: ResolvedContent;
  emit: (event: EngineEvent) => void;
  maxHp: () => number;
  level: (skill: SkillName) => number;
  checkLevelReq: (def: { levelReq?: Partial<Record<SkillName, number>> }) => void;
  bank: LoadoutBankDeps;
}): {
  assignAt(kind: LoadoutKind, itemId: string, slotIndex?: number): void;
  clearAt(kind: LoadoutKind, slotIndex?: number): void;
  eatFromSlotAt(slotIndex: number, food: FoodDef): number;
  autoEat(): void;
} {
  const { state, resolved, emit, maxHp, level, checkLevelReq, bank } = deps;
  const { resolveItem, assertOwned, takeOwned, swapBackToBank, returnToBank } = bank;

  function requireFoodSlotIndex(slotIndex: number | undefined): number {
    if (slotIndex === undefined) {
      throw new Error("food loadout slot requires slotIndex");
    }
    if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= FOOD_SLOT_COUNT) {
      throw new Error(`invalid food slot index: ${slotIndex}`);
    }
    return slotIndex;
  }

  function rejectSlotIndexForSingularKind(kind: LoadoutKind, slotIndex: number | undefined): void {
    if (slotIndex !== undefined) {
      throw new Error(`${kind} loadout slot does not take slotIndex`);
    }
  }

  function foodAssignAt(slotIndex: number, itemId: string): void {
    const def = resolveItem(
      itemId,
      (d): d is FoodDef => d.kind === "food",
      `${itemId} is not Food`,
    );
    const elsewhere = state.foodSlots.findIndex((slot) => slot?.itemId === itemId);
    if (elsewhere !== -1 && elsewhere !== slotIndex) {
      throw new Error(`${def.name} is already assigned to a Food Slot`);
    }
    const owned = assertOwned(itemId, def);

    const current = state.foodSlots[slotIndex];
    let homeQty = owned;
    if (current && current.itemId === itemId) {
      homeQty += current.qty;
    } else {
      swapBackToBank(current);
    }

    state.bank.delete(itemId);
    state.foodSlots[slotIndex] = { itemId, qty: homeQty };
  }

  function foodClearAt(slotIndex: number): void {
    const slot = state.foodSlots[slotIndex];
    if (!slot) return;
    returnToBank(slot.itemId, slot.qty);
    state.foodSlots[slotIndex] = null;
  }

  function potionAssignAt(itemId: string): void {
    const { def, owned } = takeOwned(
      itemId,
      (d): d is PotionDef => d.kind === "potion",
      `${itemId} is not a Potion`,
    );

    const current = state.potionSlot;
    if (current && current.itemId === itemId) {
      state.bank.delete(itemId);
      state.potionSlot = { itemId, qty: current.qty + owned, charges: current.charges };
      return;
    }
    if (current && current.charges > 0) {
      const remaining = current.qty - 1;
      swapBackToBank(remaining > 0 ? { itemId: current.itemId, qty: remaining } : null);
    }

    state.bank.delete(itemId);
    state.potionSlot = { itemId, qty: owned, charges: def.charges };
  }

  function potionClearAt(): void {
    const current = state.potionSlot;
    if (!current) return;
    returnToBank(current.itemId, current.qty - 1);
    state.potionSlot = null;
  }

  function quiverAssignAt(arrowItemId: string): void {
    const { def, owned } = takeOwned(
      arrowItemId,
      (d): d is AmmoDef => d.kind === "ammo" && d.ammoType === "arrow",
      `${arrowItemId} is not an Arrow`,
    );
    checkLevelReq(def);

    const current = state.quiver;
    let homeQty = owned;
    if (current && current.itemId === arrowItemId) {
      homeQty += current.qty;
    } else {
      swapBackToBank(current);
    }

    state.bank.delete(arrowItemId);
    state.quiver = { itemId: arrowItemId, qty: homeQty };
  }

  function quiverClearAt(): void {
    const current = state.quiver;
    if (!current) return;
    returnToBank(current.itemId, current.qty);
    state.quiver = null;
  }

  function runeAssignAt(runeItemId: string): void {
    const { def, owned } = takeOwned(
      runeItemId,
      (d): d is AmmoDef => d.kind === "ammo" && d.ammoType === "rune",
      `${runeItemId} is not a Rune`,
    );
    const spell = resolved.spellsByRuneId.get(def.id);
    // Rune level gates live on the Spell, not AmmoDef.levelReq — do not add a second gate here.
    if (spell && level("magic") < spell.levelReq) {
      throw new Error(`magic level too low: need ${spell.levelReq}`);
    }

    const current = state.runeSlot;
    let homeQty = owned;
    if (current && current.itemId === runeItemId) {
      homeQty += current.qty;
    } else {
      swapBackToBank(current);
    }

    state.bank.delete(runeItemId);
    state.runeSlot = { itemId: runeItemId, qty: homeQty };
  }

  function runeClearAt(): void {
    const current = state.runeSlot;
    if (!current) return;
    returnToBank(current.itemId, current.qty);
    state.runeSlot = null;
  }

  /** Eats one unit of `food` out of Food Slot `slotIndex` (#61 — replaces the old eat-from-Bank
   * bridge), healing without overheal; returns HP restored. The slot stays assigned at qty 0
   * (empty != unassigned) rather than clearing to null. Caller guarantees the slot actually holds
   * `food` at qty > 0. */
  function eatFromSlotAt(slotIndex: number, food: FoodDef): number {
    const healed = Math.min(food.heals, maxHp() - state.hp);
    state.hp += healed;
    (state.foodSlots[slotIndex] as { itemId: string; qty: number }).qty -= 1;
    emit({ type: "food-eaten", itemId: food.id, healed });
    return healed;
  }

  /** Rewritten for Food Slots (#61): drains the lowest-index slot with qty > 0 until HP clears
   * the threshold or every slot runs dry — the old Content-order Bank scan is gone. Threshold
   * semantics (0 = off) unchanged. */
  function autoEat(): void {
    if (state.autoEatThreshold === 0) return;
    while (state.hp < maxHp() * state.autoEatThreshold) {
      const slotIndex = state.foodSlots.findIndex((slot) => slot && slot.qty > 0);
      if (slotIndex === -1) return;
      const slot = state.foodSlots[slotIndex] as { itemId: string; qty: number };
      const def = resolved.itemsById.get(slot.itemId);
      if (!def || def.kind !== "food") return; // guards against a corrupted slot; not reachable via commands
      eatFromSlotAt(slotIndex, def);
    }
  }

  return {
    assignAt(kind, itemId, slotIndex) {
      switch (kind) {
        case "food":
          foodAssignAt(requireFoodSlotIndex(slotIndex), itemId);
          return;
        case "potion":
          rejectSlotIndexForSingularKind(kind, slotIndex);
          potionAssignAt(itemId);
          return;
        case "quiver":
          rejectSlotIndexForSingularKind(kind, slotIndex);
          quiverAssignAt(itemId);
          return;
        case "rune":
          rejectSlotIndexForSingularKind(kind, slotIndex);
          runeAssignAt(itemId);
          return;
        default:
          throw new Error(`unknown loadout kind: ${kind satisfies never}`);
      }
    },
    clearAt(kind, slotIndex) {
      switch (kind) {
        case "food":
          foodClearAt(requireFoodSlotIndex(slotIndex));
          return;
        case "potion":
          rejectSlotIndexForSingularKind(kind, slotIndex);
          potionClearAt();
          return;
        case "quiver":
          rejectSlotIndexForSingularKind(kind, slotIndex);
          quiverClearAt();
          return;
        case "rune":
          rejectSlotIndexForSingularKind(kind, slotIndex);
          runeClearAt();
          return;
        default:
          throw new Error(`unknown loadout kind: ${kind satisfies never}`);
      }
    },
    eatFromSlotAt,
    autoEat,
  };
}
