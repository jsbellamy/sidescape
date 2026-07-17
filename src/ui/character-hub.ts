/** The deep, mounted Character hub module (#326): owns the Character card shell, Gear Slot
 * chooser state, player controls, level summaries, Settings visibility, Character navigation
 * dispatch, UiScale collaboration callbacks, and listener lifecycle. Does NOT own Pets, the
 * Equipment Bank tray's presentation (#327), or Loadout Slot rendering (`createLoadoutSlotUi`). */

import { weaponCombatModeFor, type Engine } from "../core/engine";
import { ATTACK_TYPES, SKILL_NAMES } from "../core/types";
import type {
  AttackType,
  AutoEatThreshold,
  CombatMode,
  CombatStyle,
  GearSlot,
  Snapshot,
} from "../core/types";
import type { ResolvedContent } from "../core/validate-content";
import { slotSilhouette, tabIcon } from "./icons";
import { createItemPresentation } from "./item-presentation";
import type { ManagementDestination } from "./app";
import type { UiScale } from "./window-geometry";

/** Gear Slot render order for the Character panel; independent of `Snapshot.player.equipment`'s
 * key order (a plain object, not guaranteed stable across engines/serialization). */
const GEAR_SLOT_ORDER: GearSlot[] = ["weapon", "shield", "head", "body", "legs", "amulet", "ring"];

const ATTACK_TYPE_ABBR: Record<AttackType, string> = {
  stab: "st",
  slash: "sl",
  crush: "cr",
  ranged: "rn",
  magic: "mg",
};

const MELEE_STYLES: CombatStyle[] = ["accurate", "aggressive", "defensive"];
const RANGED_MAGIC_STYLES: CombatStyle[] = ["accurate", "rapid", "defensive"];

const STYLE_LABELS: Record<CombatStyle, string> = {
  accurate: "Accurate",
  aggressive: "Aggressive",
  defensive: "Defensive",
  rapid: "Rapid",
};

const AUTO_EAT_LABELS: Record<AutoEatThreshold, string> = {
  0: "Off",
  0.25: "25%",
  0.5: "50%",
  0.75: "75%",
};

const MANAGEMENT_DESTINATION_LABELS: Record<ManagementDestination, string> = {
  world: "World",
  bank: "Bank",
  workshop: "Workshop",
  activity: "Activity",
  skills: "Skills",
};

const CHARACTER_NAV_DESTINATIONS: ManagementDestination[] = [
  "world",
  "workshop",
  "activity",
  "skills",
];

export type CharacterCommands = Pick<
  Engine,
  "setCombatStyle" | "setAutoEatThreshold" | "setAutoSellDuplicates" | "equip" | "unequip"
>;

export interface CharacterHubUi {
  render(player: Snapshot["player"], bankItems: Snapshot["bank"]["items"]): void;
  dispose(): void;
}

export interface CharacterHubUiOptions {
  host: HTMLElement;
  content: ResolvedContent;
  commands: CharacterCommands;
  onChanged(): void;
  onDestinationRequested(destination: ManagementDestination): void;
  onScaleRequested(scale: UiScale): Promise<void> | void;
  getScaleState(): Promise<{
    selected: UiScale;
    options: readonly { value: UiScale; supported: boolean }[];
  }>;
}

function defVectorLabel(def: Record<AttackType, number>): string {
  return ATTACK_TYPES.map((t) => `${ATTACK_TYPE_ABBR[t]} ${def[t]}`).join(" · ");
}

function stylesForMode(mode: CombatMode): CombatStyle[] {
  return mode === "melee" ? MELEE_STYLES : RANGED_MAGIC_STYLES;
}

function characterNavMarkup(): string {
  const destinationButtons = CHARACTER_NAV_DESTINATIONS.map(
    (destination) =>
      `<button data-destination="${destination}" title="${MANAGEMENT_DESTINATION_LABELS[destination]}">
        <img class="tab-icon pixel" src="${tabIcon(destination)}" alt="" />
        <span>${MANAGEMENT_DESTINATION_LABELS[destination]}</span>
      </button>`,
  ).join("");
  return `<nav id="character-nav" class="card-nav">
      ${destinationButtons}
      <span id="autoeat-indicator" class="autoeat-indicator" title="Auto-eat threshold">🍖 …</span>
      <button data-nav="settings" title="Settings" aria-expanded="false">
        <span aria-hidden="true">⚙</span>
      </button>
    </nav>`;
}

function characterShellMarkup(): string {
  return `<header class="management-card-header">
      ${characterNavMarkup()}
    </header>
    <div id="settings-popover" class="settings-popover" hidden>
      <button id="mute-toggle" title="Mute sound" aria-pressed="false">🔊 Mute</button>
      <button id="export-save" title="Export save to clipboard">📤 Export</button>
      <button id="import-save" title="Import save from clipboard">📥 Import</button>
      <fieldset id="ui-scale-selector">
        <legend>UI scale</legend>
        <button data-ui-scale="1" title="Set UI scale to 100%">100%</button>
        <button data-ui-scale="1.5" title="Set UI scale to 150%">150%</button>
        <button data-ui-scale="2" title="Set UI scale to 200%">200%</button>
      </fieldset>
      <fieldset id="autoeat-selector">
        <legend>Auto-eat at</legend>
        <div id="autoeat-row" class="style-row">
          ${Object.entries(AUTO_EAT_LABELS)
            .map(([threshold, label]) => `<button data-threshold="${threshold}">${label}</button>`)
            .join("")}
        </div>
      </fieldset>
      <label id="autosell-duplicates-row" class="checkbox-row">
        <input type="checkbox" id="autosell-duplicates-toggle" />
        Auto-sell duplicate gear
      </label>
    </div>
    <div id="import-panel" hidden>
      <p>Paste a save below, then Apply. This overwrites your current save.</p>
      <textarea id="import-textarea" rows="4"></textarea>
      <p id="import-error" hidden></p>
      <div id="import-actions">
        <button id="import-apply">Apply</button>
        <button id="import-cancel">Cancel</button>
      </div>
    </div>
    <div class="card-fixed">
      <div id="character-slots" class="tile-grid gear-grid"></div>
      <p id="character-totals" class="totals-row"></p>
      <div id="loadout-row" class="loadout-row">
        <div id="character-food-slots" class="food-slots"></div>
        <div id="potion-slot" class="potion-slot"></div>
        <div id="quiver-slot" class="potion-slot"></div>
        <div id="rune-slot" class="potion-slot"></div>
      </div>
      <p id="casting-readout" class="totals-row"></p>
      <button id="character-levels-summary" data-destination="skills">
        Combat <span id="summary-combat-level"></span> · Total <span id="summary-total-level"></span> ›
      </button>
      <div id="style-row" class="style-row"></div>
    </div>
    <div class="card-scroll">
      <div id="character-bank-tray" class="tile-grid"></div>
      <div id="character-bank-detail" class="detail-strip" hidden></div>
    </div>
    <button id="expand-bank-btn" class="expand-bank-btn" data-destination="bank">Expand Bank</button>`;
}

export function createCharacterHubUi(options: CharacterHubUiOptions): CharacterHubUi {
  const {
    host,
    content,
    commands,
    onChanged,
    onDestinationRequested,
    onScaleRequested,
    getScaleState,
  } = options;
  const items = createItemPresentation(content);

  let openSettings = false;
  let openGearChooserSlot: GearSlot | null = null;
  let disposed = false;

  host.classList.add("management-card");
  host.hidden = true;
  host.innerHTML = characterShellMarkup();

  function el<T extends HTMLElement>(selector: string): T {
    return host.querySelector(selector) as T;
  }

  async function syncScaleSelector(): Promise<void> {
    const { selected, options: scaleOptions } = await getScaleState();
    host.querySelectorAll<HTMLButtonElement>("[data-ui-scale]").forEach((button) => {
      const value = Number(button.dataset["uiScale"]) as UiScale;
      const supported = scaleOptions.find((option) => option.value === value)?.supported !== false;
      button.disabled = !supported;
      button.title = supported
        ? `Set UI scale to ${value * 100}%`
        : `${value * 100}% unavailable: monitor cannot fit the full workspace`;
      button.setAttribute("aria-pressed", String(value === selected));
    });
  }

  function syncSettingsVisibility(): void {
    el<HTMLElement>("#settings-popover").hidden = !openSettings;
    host
      .querySelector<HTMLButtonElement>('[data-nav="settings"]')
      ?.setAttribute("aria-expanded", String(openSettings));
  }

  function closeGearChooser(): void {
    if (openGearChooserSlot === null) return;
    openGearChooserSlot = null;
    onChanged();
  }

  function renderCharacter(player: Snapshot["player"], bankItems: Snapshot["bank"]["items"]): void {
    const mode = weaponCombatModeFor(player.equipment.weapon, content);
    const styleRow = el("#style-row");
    const legalStyles = stylesForMode(mode);
    styleRow.innerHTML = legalStyles
      .map((style) => `<button data-style="${style}">${STYLE_LABELS[style]}</button>`)
      .join("");
    styleRow.querySelectorAll<HTMLButtonElement>("button").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset["style"] === player.combatStyle);
    });

    host.querySelectorAll<HTMLButtonElement>("#autoeat-row button").forEach((btn) => {
      btn.classList.toggle("active", Number(btn.dataset["threshold"]) === player.autoEatThreshold);
    });

    el("#autoeat-indicator").textContent = `🍖 ${AUTO_EAT_LABELS[player.autoEatThreshold]}`;
    el<HTMLInputElement>("#autosell-duplicates-toggle").checked = player.autoSellDuplicates;

    el("#character-slots").innerHTML = GEAR_SLOT_ORDER.map((slot) => {
      const itemId = player.equipment[slot];
      if (itemId) {
        return `<div class="tile filled" data-slot="${slot}" data-item="${itemId}">
          ${items.iconMarkup(itemId)}
          <button class="gear-slot-unassign" data-gear-unassign="${slot}" title="Unequip">✕</button>
        </div>`;
      }
      const stacks = bankItems.filter((s) => {
        const def = content.itemsById.get(s.itemId);
        return def?.kind === "equipment" && def.slot === slot;
      });
      const chooser =
        openGearChooserSlot === slot
          ? `<div class="food-slot-chooser gear-slot-chooser">
              ${
                stacks.length > 0
                  ? stacks
                      .map(
                        (s) =>
                          `<button data-gear-assign="${s.itemId}">${items.name(s.itemId)} ×${s.qty}</button>`,
                      )
                      .join("")
                  : `<p class="hint">No ${slot} Equipment in Bank</p>`
              }
            </div>`
          : "";
      return `<div class="tile tile-empty" data-slot="${slot}">
                <button class="gear-slot-add" data-gear-add="${slot}" aria-label="Equip ${slot}">
                  <span class="tile-empty-mark" aria-label="${slot} (empty)">
                    <img class="icon pixel slot-silhouette" src="${slotSilhouette(slot)}" alt="" aria-hidden="true" />
                  </span>
                </button>
                ${chooser}
              </div>`;
    }).join("");

    const b = player.bonuses;
    el("#character-totals").textContent =
      `+${b.atkBonus} atk +${b.strBonus} str ${defVectorLabel(b.def)} spd ${b.attackSpeed}t`;

    el("#summary-combat-level").textContent = String(player.combatLevel);
    const totalLevel = SKILL_NAMES.reduce((sum, skill) => sum + player.skills[skill].level, 0);
    el("#summary-total-level").textContent = String(totalLevel);

    syncSettingsVisibility();
  }

  const onHostClick = async (event: Event): Promise<void> => {
    const target = event.target as HTMLElement;
    const scaleValue = target.closest<HTMLButtonElement>("[data-ui-scale]")?.dataset["uiScale"];
    if (scaleValue) {
      await onScaleRequested(Number(scaleValue) as UiScale);
      await syncScaleSelector();
      return;
    }
    const destinationBtn = target.closest<HTMLElement>("[data-destination]");
    if (destinationBtn) {
      onDestinationRequested(destinationBtn.dataset["destination"] as ManagementDestination);
      return;
    }
    const navBtn = target.closest<HTMLElement>("[data-nav]");
    if (navBtn?.dataset["nav"] === "settings") {
      openSettings = !openSettings;
      syncSettingsVisibility();
    }
  };

  const onGearSlotsClick = (event: Event): void => {
    const target = event.target as HTMLElement;
    const unassignBtn = target.closest<HTMLElement>("[data-gear-unassign]");
    if (unassignBtn) {
      commands.unequip(unassignBtn.dataset["gearUnassign"] as GearSlot);
      openGearChooserSlot = null;
      onChanged();
      return;
    }
    const assignBtn = target.closest<HTMLElement>("[data-gear-assign]");
    if (assignBtn) {
      commands.equip(assignBtn.dataset["gearAssign"] as string);
      openGearChooserSlot = null;
      onChanged();
      return;
    }
    const addBtn = target.closest<HTMLElement>("[data-gear-add]");
    if (addBtn) {
      const slot = addBtn.dataset["gearAdd"] as GearSlot;
      openGearChooserSlot = openGearChooserSlot === slot ? null : slot;
      onChanged();
    }
  };

  const onGearSlotsContextMenu = (event: MouseEvent): void => {
    const tile = (event.target as HTMLElement).closest<HTMLElement>("[data-slot]");
    const slot = tile?.dataset["slot"] as GearSlot | undefined;
    if (!slot || !tile?.dataset["item"]) return;
    event.preventDefault();
    commands.unequip(slot);
    openGearChooserSlot = null;
    onChanged();
  };

  const onStyleRowClick = (event: Event): void => {
    const style = (event.target as HTMLElement).dataset["style"] as CombatStyle | undefined;
    if (style) {
      commands.setCombatStyle(style);
      onChanged();
    }
  };

  const onAutoEatRowClick = (event: Event): void => {
    const raw = (event.target as HTMLElement).dataset["threshold"];
    if (raw !== undefined) {
      commands.setAutoEatThreshold(Number(raw) as AutoEatThreshold);
      onChanged();
    }
  };

  const onAutoSellChange = (event: Event): void => {
    commands.setAutoSellDuplicates((event.target as HTMLInputElement).checked);
    onChanged();
  };

  const onDocumentClick = (event: Event): void => {
    const target = event.target as HTMLElement;
    if (target.closest(".gear-slot-chooser") || target.closest("[data-gear-add]")) return;
    closeGearChooser();
  };

  const onWindowBlur = (): void => {
    closeGearChooser();
  };

  host.addEventListener("click", onHostClick);
  el("#character-slots").addEventListener("click", onGearSlotsClick);
  el("#character-slots").addEventListener("contextmenu", onGearSlotsContextMenu);
  el("#style-row").addEventListener("click", onStyleRowClick);
  el("#autoeat-row").addEventListener("click", onAutoEatRowClick);
  el<HTMLInputElement>("#autosell-duplicates-toggle").addEventListener("change", onAutoSellChange);
  document.addEventListener("click", onDocumentClick);
  window.addEventListener("blur", onWindowBlur);

  void syncScaleSelector();

  return {
    render(player, bankItems) {
      renderCharacter(player, bankItems);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      host.removeEventListener("click", onHostClick);
      el("#character-slots").removeEventListener("click", onGearSlotsClick);
      el("#character-slots").removeEventListener("contextmenu", onGearSlotsContextMenu);
      el("#style-row").removeEventListener("click", onStyleRowClick);
      el("#autoeat-row").removeEventListener("click", onAutoEatRowClick);
      el<HTMLInputElement>("#autosell-duplicates-toggle").removeEventListener(
        "change",
        onAutoSellChange,
      );
      document.removeEventListener("click", onDocumentClick);
      window.removeEventListener("blur", onWindowBlur);
    },
  };
}
