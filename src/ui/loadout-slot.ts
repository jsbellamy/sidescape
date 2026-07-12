/** One shared **Loadout Slot** renderer + dispatcher (#183): Food Slots, the Potion Slot, the
 * Quiver, and the Rune Pouch (see CONTEXT.md's Loadout Slot entry) all render the identical
 * filled-tile / empty-`[+]` / chooser-filtered-from-Bank shape and dispatch clicks in the same
 * unassign → (eat) → assign → open-chooser order. `app.ts`'s four render functions and four click
 * listeners now each build a small per-kind config and hand it to `loadoutSlotMarkup` /
 * `createLoadoutSlotDispatcher` below, mirroring how `production.ts` (#181) unified the four
 * Production Skill panels into one descriptor-backed module. Pure string/function building blocks
 * — no DOM access, no Engine calls — so they're unit-testable without mounting `app.ts`. */

/** One chooser row: the Bank stack's Item id (the assign button's dataset value) and its already-
 * formatted label (e.g. "Trout ×5", built by app.ts's own `itemName`/qty formatting). */
export interface LoadoutSlotChooserItem {
  itemId: string;
  label: string;
}

/** Everything one Loadout Slot tile (filled or empty) needs to render. Every field is a fully
 * pre-built class name or `data-*` attribute string (or empty string, for the attribute that
 * doesn't apply to that kind) — the config is where the four kinds' differences live; the
 * markup shape itself is single-sourced in `loadoutSlotMarkup`. */
export interface LoadoutSlotTileConfig {
  /** Outer wrapper class, shared by filled/empty: `"food-slot"` or `"potion-slot-tile"`. */
  wrapperClass: string;
  /** Extra attribute on the wrapper identifying which slot this is, e.g. `data-slot="0"` (Food) or
   * `data-element="air"` (Rune Pouch); `""` for the singular Potion Slot/Quiver. */
  keyAttr: string;
  /** Fully-built inner markup for the filled state (the tile itself, already using app.ts's own
   * `tileMarkup`/icon helpers) — Food wraps it in a click-to-eat `<button>`, the others in a plain
   * `<div>`; Potion appends its charges badge. Built by the caller, not this module. */
  filledInner: string;
  /** Class on the filled state's ✕ button, e.g. `"food-slot-unassign"` or `"potion-slot-unassign"`. */
  unassignClass: string;
  /** The ✕ button's `data-*-unassign` attribute, with any value it carries. */
  unassignAttr: string;
  /** The ✕ button's tooltip: `"Unassign"` (Food/Potion) or `"Unload"` (Quiver/Rune Pouch). */
  unassignTitle: string;
  /** Class on the empty state's `[+]` button, e.g. `"food-slot-add"` or `"potion-slot-add"`. */
  addClass: string;
  /** The `[+]` button's `data-*-add` attribute, with any value it carries. */
  addAttr: string;
  /** Class on the chooser wrapper div, e.g. `"food-slot-chooser"` or `"potion-slot-chooser"`. */
  chooserClass: string;
  /** Whether this slot's chooser is currently open (presentation-only UI state owned by app.ts). */
  chooserOpen: boolean;
  /** The Bank stacks eligible for this slot, already filtered by kind (and Element, for the Rune
   * Pouch) by the caller. */
  chooserItems: LoadoutSlotChooserItem[];
  /** Builds one chooser button's `data-*` attribute(s) for a given Item id — Food's assign button
   * carries both the slot index and the item id (`data-assign="0" data-item="trout"`); the other
   * three kinds carry only the item id (`data-potion-assign="strength-potion"`). */
  assignAttr: (itemId: string) => string;
  /** Hint text shown instead of buttons when the chooser is open but `chooserItems` is empty, e.g.
   * `"No Food in Bank"` or `"No air Runes in Bank"`. */
  emptyHint: string;
}

/** The shared filled/empty/chooser tile shape (#183) — byte-for-byte what each of
 * `renderFoodSlots`/`renderPotionSlot`/`renderQuiver`/`renderRunePouch` built by hand before this
 * module unified them. `filled` selects which of the two states to render for this tile. */
export function loadoutSlotMarkup(config: LoadoutSlotTileConfig, filled: boolean): string {
  const keyAttr = config.keyAttr ? ` ${config.keyAttr}` : "";

  if (filled) {
    return `<div class="${config.wrapperClass} filled"${keyAttr}>
              ${config.filledInner}
              <button class="${config.unassignClass}" ${config.unassignAttr} title="${config.unassignTitle}">✕</button>
            </div>`;
  }

  const chooser = config.chooserOpen
    ? `<div class="${config.chooserClass}">
        ${
          config.chooserItems.length > 0
            ? config.chooserItems
                .map((item) => `<button ${config.assignAttr(item.itemId)}>${item.label}</button>`)
                .join("")
            : `<p class="hint">${config.emptyHint}</p>`
        }
      </div>`
    : "";

  return `<div class="${config.wrapperClass} empty"${keyAttr}>
            <button class="${config.addClass}" ${config.addAttr}>+</button>
            ${chooser}
          </div>`;
}

/** Which `data-*` attribute (as its `dataset` camelCase property name) carries each action for one
 * Loadout Slot kind. `assignItem` is set only for Food, whose assign button carries the item id in
 * a separate `data-item` attribute alongside `data-assign`'s slot index; the other three kinds
 * carry the item id directly in their own assign attribute. `eat` is set only for Food. */
export interface LoadoutSlotDatasetKeys {
  unassign: string;
  eat?: string;
  assign: string;
  assignItem?: string;
  add: string;
}

/** Per-kind callbacks the dispatcher invokes once it has decided which action fired. Each receives
 * the raw dataset string value(s) — parsing (e.g. `Number()` for Food's index) and the actual
 * Engine command call stay in app.ts, alongside the chooser-state/`render()` side effects, since
 * those differ per kind and are not part of the shared dispatch shape. */
export interface LoadoutSlotHandlers {
  onUnassign: (value: string) => void;
  onEat?: (value: string) => void;
  onAssign: (value: string, itemId: string) => void;
  onAdd: (value: string) => void;
}

/** One dispatcher factory (#183) for all four Loadout Slot click listeners, preserving each
 * kind's exact former dispatch order: unassign check, then (Food only) the click-to-eat check,
 * then the chooser-pick assign check, then the `[+]` open-chooser toggle. Returns a plain
 * `(event) => void` handler suitable for `el(...).addEventListener("click", ...)`. */
export function createLoadoutSlotDispatcher(
  keys: LoadoutSlotDatasetKeys,
  handlers: LoadoutSlotHandlers,
): (event: Event) => void {
  return (event: Event) => {
    const target = event.target as HTMLElement;

    const unassignValue = target.dataset[keys.unassign];
    if (unassignValue !== undefined) {
      handlers.onUnassign(unassignValue);
      return;
    }

    if (keys.eat !== undefined) {
      const eatValue = target.dataset[keys.eat];
      if (eatValue !== undefined) {
        handlers.onEat?.(eatValue);
        return;
      }
    }

    const assignValue = target.dataset[keys.assign];
    if (assignValue !== undefined) {
      const itemId = keys.assignItem !== undefined ? target.dataset[keys.assignItem] : assignValue;
      if (itemId !== undefined) {
        handlers.onAssign(assignValue, itemId);
        return;
      }
    }

    const addValue = target.dataset[keys.add];
    if (addValue !== undefined) {
      handlers.onAdd(addValue);
    }
  };
}
