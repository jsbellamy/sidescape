/** The deep, mounted Loadout Slot UI module (#235): owns all four Loadout Slot kinds — the three
 * indexed Food Slots, the Potion Slot, the Quiver, and the Rune Slot (see CONTEXT.md's Loadout
 * Slot entry) — end to end. Where the pre-#235 shape split "shared markup shell" (this file) from
 * "everything that matters" (four render functions, four click listeners, chooser state, Item
 * filtering, Rune-level gating; all in app.ts), `createLoadoutSlotUi` now owns the whole thing:
 * chooser state and its at-most-one-open transition rules, Bank Item eligibility per kind, Rune
 * Spell-level gating, tile markup, one delegated DOM listener per root, and the exact Engine
 * command dispatch. `mountApp` constructs one instance after painting its own HTML shell and calls
 * one `render()` method going forward — see app.ts's own call site. */

import type { Engine } from "../core/engine";
import type { Snapshot } from "../core/types";
import type { ResolvedContent } from "../core/validate-content";
import { slotSilhouette, type LoadoutSlotKind } from "./icons";
import { createItemPresentation } from "./item-presentation";

/** The slice of `Snapshot["player"]` every Loadout Slot kind's render/gating logic reads —
 * `skills` for the Rune Slot's Magic-level gate, the rest for each kind's own filled/empty state. */
export type LoadoutSlotPlayer = Pick<
  Snapshot["player"],
  "foodSlots" | "potionSlot" | "quiver" | "runeSlot" | "skills"
>;

/** The exact Engine commands this module dispatches — nothing more, so a caller can hand in the
 * real Engine (a superset) without this module gaining access to unrelated commands. */
export type LoadoutSlotCommands = Pick<
  Engine,
  "assignLoadoutSlot" | "clearLoadoutSlot" | "eatFromSlot"
>;

export interface LoadoutSlotUi {
  /** Repaints all six tiles (3 Food + Potion + Quiver + Rune) from the latest Snapshot slice,
   * reflecting whichever chooser (if any) is currently open. Call on every app-level render, same
   * as any other Snapshot-driven paint — chooser state lives in this module's own closure, not the
   * Snapshot, so repeated calls with unchanged chooser state repaint identically. */
  render(player: LoadoutSlotPlayer, bankItems: Snapshot["bank"]["items"]): void;
}

export interface LoadoutSlotUiOptions {
  /** The element `#character-food-slots`/`#potion-slot`/`#quiver-slot`/`#rune-slot` are queried
   * from — `mountApp`'s own root, constructed after it has painted `root.innerHTML`. */
  root: HTMLElement;
  content: ResolvedContent;
  commands: LoadoutSlotCommands;
  /** Called exactly once per handled click (an unassign, an eat, an assign, or a chooser
   * open/close toggle) — never for an irrelevant click. `mountApp` wires this to its own top-level
   * `render()`, so a Loadout Slot action reaches the rest of the app the same way every other
   * Engine-command click does. */
  onChanged(): void;
}

/** Which Loadout Slot chooser (if any) is open — one discriminated value instead of four
 * independent booleans, which is what makes "at most one open at a time" a structural guarantee
 * rather than a rule four separate booleans have to be kept in sync by hand. */
type OpenLoadoutChooser =
  | { kind: "food"; slotIndex: number }
  | { kind: "potion" }
  | { kind: "quiver" }
  | { kind: "rune" }
  | null;

/** One Bank stack's already-formatted chooser row: the assign button's `data-*` item id and its
 * label, with an optional real `disabled` (the Rune Slot's Magic-level gate — the only kind that
 * ever sets it). */
interface ChooserRow {
  itemId: string;
  label: string;
  disabled?: boolean;
}

/** Everything one tile (filled or empty) needs — the shape the four kinds differ on; the markup
 * itself is single-sourced in `tileShellMarkup`. Kept private: #235 deletes the old exported
 * `LoadoutSlotTileConfig` along with every other shallow helper this module used to hand to
 * app.ts. */
interface TileShellConfig {
  wrapperClass: string;
  keyAttr: string;
  filledInner: string;
  unassignClass: string;
  unassignAttr: string;
  unassignTitle: string;
  addClass: string;
  addAttr: string;
  chooserClass: string;
  chooserOpen: boolean;
  chooserItems: ChooserRow[];
  assignAttr: (itemId: string) => string;
  emptyHint: string;
  /** Which Loadout Slot kind this tile is, so the empty state can render `slotSilhouette`'s
   * matching greyed placeholder (#286) — the 3 Food Slots all pass "food" and share one asset. */
  silhouetteKind: LoadoutSlotKind;
}

/** The shared filled/empty/chooser tile shape, byte-for-byte what the pre-#235 exported
 * `loadoutSlotMarkup` produced — preserves every existing selector/class/data-attribute contract
 * CSS and the e2e loadout-row spec depend on. */
function tileShellMarkup(config: TileShellConfig, filled: boolean): string {
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
                .map(
                  (item) =>
                    `<button ${config.assignAttr(item.itemId)} ${item.disabled ? "disabled" : ""}>${item.label}</button>`,
                )
                .join("")
            : `<p class="hint">${config.emptyHint}</p>`
        }
      </div>`
    : "";

  return `<div class="${config.wrapperClass} empty"${keyAttr}>
            <button class="${config.addClass}" ${config.addAttr}>
              <img class="icon pixel slot-silhouette" src="${slotSilhouette(config.silhouetteKind)}" alt="" aria-hidden="true" />
              <span class="slot-add-mark" aria-hidden="true">+</span>
            </button>
            ${chooser}
          </div>`;
}

export function createLoadoutSlotUi(options: LoadoutSlotUiOptions): LoadoutSlotUi {
  const { root, content, commands, onChanged } = options;
  const items = createItemPresentation(content);

  // Session-only chooser state, private to this mounted instance (#235's "two instances never
  // share state" requirement) — never part of the Snapshot/save, mirroring the pre-#235 booleans'
  // own boundary.
  let openChooser: OpenLoadoutChooser = null;

  function el<T extends HTMLElement>(selector: string): T {
    return root.querySelector(selector) as T;
  }

  function foodSlotsMarkup(
    foodSlots: LoadoutSlotPlayer["foodSlots"],
    bankItems: Snapshot["bank"]["items"],
  ): string {
    const foodStacks = bankItems.filter((s) => content.itemsById.get(s.itemId)?.kind === "food");
    const chooserItems: ChooserRow[] = foodStacks.map((s) => ({
      itemId: s.itemId,
      label: `${items.name(s.itemId)} ×${s.qty}`,
    }));

    return foodSlots
      .map((slot, i) =>
        tileShellMarkup(
          {
            wrapperClass: "food-slot",
            keyAttr: `data-slot="${i}"`,
            filledInner: slot
              ? `<button class="food-slot-eat tile" data-eat="${i}" data-item="${slot.itemId}">
                   ${items.tileMarkup(slot.itemId, slot.qty)}
                 </button>`
              : "",
            unassignClass: "food-slot-unassign",
            unassignAttr: `data-unassign="${i}"`,
            unassignTitle: "Unassign",
            addClass: "food-slot-add",
            addAttr: `data-add="${i}"`,
            chooserClass: "food-slot-chooser",
            chooserOpen: openChooser?.kind === "food" && openChooser.slotIndex === i,
            chooserItems,
            assignAttr: (itemId) => `data-assign="${i}" data-item="${itemId}"`,
            emptyHint: "No Food in Bank",
            silhouetteKind: "food",
          },
          slot !== null,
        ),
      )
      .join("");
  }

  function renderFoodSlots(
    foodSlots: LoadoutSlotPlayer["foodSlots"],
    bankItems: Snapshot["bank"]["items"],
  ): void {
    el("#character-food-slots").innerHTML = foodSlotsMarkup(foodSlots, bankItems);
  }

  function renderPotionSlot(
    potionSlot: LoadoutSlotPlayer["potionSlot"],
    bankItems: Snapshot["bank"]["items"],
  ): void {
    const potionStacks = bankItems.filter(
      (s) => content.itemsById.get(s.itemId)?.kind === "potion",
    );
    const chooserItems: ChooserRow[] = potionStacks.map((s) => ({
      itemId: s.itemId,
      label: `${items.name(s.itemId)} ×${s.qty}`,
    }));
    const filledInner = potionSlot
      ? (() => {
          const def = content.itemsById.get(potionSlot.itemId);
          const maxCharges = def?.kind === "potion" ? def.charges : potionSlot.charges;
          return `<div class="tile" data-item="${potionSlot.itemId}">${items.tileMarkup(potionSlot.itemId, potionSlot.qty)}</div>
                  <span class="potion-slot-charges">${potionSlot.charges}/${maxCharges}</span>`;
        })()
      : "";

    el("#potion-slot").innerHTML = tileShellMarkup(
      {
        wrapperClass: "potion-slot-tile",
        keyAttr: "",
        filledInner,
        unassignClass: "potion-slot-unassign",
        unassignAttr: "data-potion-unassign",
        unassignTitle: "Unassign",
        addClass: "potion-slot-add",
        addAttr: "data-potion-add",
        chooserClass: "potion-slot-chooser",
        chooserOpen: openChooser?.kind === "potion",
        chooserItems,
        assignAttr: (itemId) => `data-potion-assign="${itemId}"`,
        emptyHint: "No Potions in Bank",
        silhouetteKind: "potion",
      },
      potionSlot !== null,
    );
  }

  function renderQuiver(
    quiver: LoadoutSlotPlayer["quiver"],
    bankItems: Snapshot["bank"]["items"],
  ): void {
    const arrowStacks = bankItems.filter((s) => {
      const def = content.itemsById.get(s.itemId);
      return def?.kind === "ammo" && def.ammoType === "arrow";
    });
    const chooserItems: ChooserRow[] = arrowStacks.map((s) => ({
      itemId: s.itemId,
      label: `${items.name(s.itemId)} ×${s.qty}`,
    }));
    const filledInner = quiver
      ? `<div class="tile" data-item="${quiver.itemId}">${items.tileMarkup(quiver.itemId, quiver.qty)}</div>`
      : "";

    el("#quiver-slot").innerHTML = tileShellMarkup(
      {
        wrapperClass: "potion-slot-tile",
        keyAttr: "",
        filledInner,
        unassignClass: "potion-slot-unassign",
        unassignAttr: "data-quiver-unassign",
        unassignTitle: "Unload",
        addClass: "potion-slot-add",
        addAttr: "data-quiver-add",
        chooserClass: "potion-slot-chooser",
        chooserOpen: openChooser?.kind === "quiver",
        chooserItems,
        assignAttr: (itemId) => `data-quiver-assign="${itemId}"`,
        emptyHint: "No Arrows in Bank",
        silhouetteKind: "quiver",
      },
      quiver !== null,
    );
  }

  function renderRuneSlot(
    runeSlot: LoadoutSlotPlayer["runeSlot"],
    bankItems: Snapshot["bank"]["items"],
    magicLevel: number,
  ): void {
    const runeStacks = bankItems.filter((s) => {
      const def = content.itemsById.get(s.itemId);
      return def?.kind === "ammo" && def.ammoType === "rune";
    });
    const chooserItems: ChooserRow[] = runeStacks.map((s) => {
      const spell = content.spells.find((sp) => sp.runeId === s.itemId);
      const gated = spell !== undefined && magicLevel < spell.levelReq;
      return {
        itemId: s.itemId,
        label: `${items.name(s.itemId)} ×${s.qty}${gated ? ` <span class="rune-req">Lv ${spell.levelReq}</span>` : ""}`,
        disabled: gated,
      };
    });
    const filledInner = runeSlot
      ? `<div class="tile" data-item="${runeSlot.itemId}">${items.tileMarkup(runeSlot.itemId, runeSlot.qty)}</div>`
      : "";

    el("#rune-slot").innerHTML = tileShellMarkup(
      {
        wrapperClass: "potion-slot-tile",
        keyAttr: "",
        filledInner,
        unassignClass: "potion-slot-unassign",
        unassignAttr: "data-rune-unassign",
        unassignTitle: "Unload",
        addClass: "potion-slot-add",
        addAttr: "data-rune-add",
        chooserClass: "potion-slot-chooser",
        chooserOpen: openChooser?.kind === "rune",
        chooserItems,
        assignAttr: (itemId) => `data-rune-assign="${itemId}"`,
        emptyHint: "No Runes in Bank",
        silhouetteKind: "rune",
      },
      runeSlot !== null,
    );
  }

  function render(player: LoadoutSlotPlayer, bankItems: Snapshot["bank"]["items"]): void {
    renderFoodSlots(player.foodSlots, bankItems);
    renderPotionSlot(player.potionSlot, bankItems);
    renderQuiver(player.quiver, bankItems);
    renderRuneSlot(player.runeSlot, bankItems, player.skills.magic.level);
  }

  // Food Slot bar: dispatch order is load-bearing — unassign (✕) is checked before the slot-level
  // eat, so unassigning never also eats; a chooser pick is checked before the [+] toggle so
  // picking a Food both assigns it and doesn't re-toggle the chooser.
  el("#character-food-slots").addEventListener("click", (event) => {
    const target = event.target as HTMLElement;

    const unassignValue = target.dataset["unassign"];
    if (unassignValue !== undefined) {
      commands.clearLoadoutSlot("food", Number(unassignValue));
      openChooser = null;
      onChanged();
      return;
    }

    const eatValue = target.dataset["eat"];
    if (eatValue !== undefined) {
      commands.eatFromSlot(Number(eatValue));
      onChanged();
      return;
    }

    const assignValue = target.dataset["assign"];
    if (assignValue !== undefined) {
      const itemId = target.dataset["item"];
      if (itemId !== undefined) {
        commands.assignLoadoutSlot("food", itemId, Number(assignValue));
        openChooser = null;
        onChanged();
        return;
      }
    }

    const addValue = target.dataset["add"];
    if (addValue !== undefined) {
      const slotIndex = Number(addValue);
      const alreadyOpen = openChooser?.kind === "food" && openChooser.slotIndex === slotIndex;
      openChooser = alreadyOpen ? null : { kind: "food", slotIndex }; // re-click dismisses
      onChanged();
    }
  });

  // Potion Slot tile: dispatch order mirrors the Food Slot bar above — unassign (✕) is checked
  // before a chooser pick, which is checked before the [+] toggle.
  el("#potion-slot").addEventListener("click", (event) => {
    const target = event.target as HTMLElement;

    if (target.dataset["potionUnassign"] !== undefined) {
      commands.clearLoadoutSlot("potion"); // logs nothing; no feed line for unassign (mirrors Food Slot)
      openChooser = null;
      onChanged();
      return;
    }

    const itemId = target.dataset["potionAssign"];
    if (itemId !== undefined) {
      commands.assignLoadoutSlot("potion", itemId);
      openChooser = null;
      onChanged();
      return;
    }

    if (target.dataset["potionAdd"] !== undefined) {
      const alreadyOpen = openChooser?.kind === "potion";
      openChooser = alreadyOpen ? null : { kind: "potion" }; // re-click dismisses
      onChanged();
    }
  });

  // Quiver tile: dispatch order mirrors the Potion Slot above — unassign (✕) before a chooser
  // pick, before the [+] toggle.
  el("#quiver-slot").addEventListener("click", (event) => {
    const target = event.target as HTMLElement;

    if (target.dataset["quiverUnassign"] !== undefined) {
      commands.clearLoadoutSlot("quiver"); // logs nothing; no feed line for unload (mirrors Food/Potion Slot)
      openChooser = null;
      onChanged();
      return;
    }

    const itemId = target.dataset["quiverAssign"];
    if (itemId !== undefined) {
      commands.assignLoadoutSlot("quiver", itemId);
      openChooser = null;
      onChanged();
      return;
    }

    if (target.dataset["quiverAdd"] !== undefined) {
      const alreadyOpen = openChooser?.kind === "quiver";
      openChooser = alreadyOpen ? null : { kind: "quiver" }; // re-click dismisses
      onChanged();
    }
  });

  // Rune Slot tile: dispatch order mirrors the Quiver above — unassign (✕) before a chooser pick,
  // before the [+] toggle. A gated (disabled) chooser row never fires click at all, so
  // `assignLoadoutSlot`'s own "magic level too low" throw is a backstop, never the primary gate.
  el("#rune-slot").addEventListener("click", (event) => {
    const target = event.target as HTMLElement;

    if (target.dataset["runeUnassign"] !== undefined) {
      commands.clearLoadoutSlot("rune"); // logs nothing; no feed line for unload (mirrors Quiver)
      openChooser = null;
      onChanged();
      return;
    }

    const itemId = target.dataset["runeAssign"];
    if (itemId !== undefined) {
      commands.assignLoadoutSlot("rune", itemId);
      openChooser = null;
      onChanged();
      return;
    }

    if (target.dataset["runeAdd"] !== undefined) {
      const alreadyOpen = openChooser?.kind === "rune";
      openChooser = alreadyOpen ? null : { kind: "rune" }; // re-click dismisses
      onChanged();
    }
  });

  return { render };
}
