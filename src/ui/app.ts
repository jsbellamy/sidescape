import { UNARMED_SPEED } from "../core/engine";
import type { Engine } from "../core/engine";
import { ATTACK_TYPES, ELEMENTS, SKILL_NAMES } from "../core/types";
import type {
  AmmoDef,
  AttackType,
  AutoEatThreshold,
  CombatStyle,
  Content,
  DropTableEntry,
  Element,
  EquipmentDef,
  FoodSlot,
  GearSlot,
  PotionDef,
  PotionSlot,
  SkillSnapshot,
  Snapshot,
  SpellDef,
} from "../core/types";
import { MAX_LEVEL, xpForLevel } from "../core/xp";
import { monsterSprite, playerSprite } from "./sprites";
import { loadSortKey, saveSortKey, sortStacks, SORT_KEYS } from "./sort";
import type { SortKey } from "./sort";
import {
  PRODUCTION_SKILLS,
  productionLabel,
  productionPanelMarkup,
  resolveProp,
} from "./production";
import { createLoadoutSlotDispatcher, loadoutSlotMarkup } from "./loadout-slot";
import type { LoadoutSlotChooserItem } from "./loadout-slot";
import { resolveTheme } from "./theme";
import { itemIcon } from "./icons";
import { formatQty } from "./format";
import type { WorkspaceChrome } from "./workspace-chrome";

/** Gear Slot render order for the Character panel; independent of `Snapshot.player.equipment`'s
 * key order (a plain object, not guaranteed stable across engines/serialization). `amulet`/`ring`
 * (#117, Crafting's jewelry line) are appended after `legs`, mirroring GearSlot's own append-only
 * order in core/types.ts. */
const GEAR_SLOT_ORDER: GearSlot[] = ["weapon", "shield", "head", "body", "legs", "amulet", "ring"];

/** Sort control labels, in `SORT_KEYS` order — "Kind | Value | Name". */
const SORT_LABELS: Record<SortKey, string> = { kind: "Kind", value: "Value", name: "Name" };

/** Damage-splat fade duration (#4); mirrors styles.css's `splat-fade` keyframes so the DOM node is
 * removed right as the CSS animation finishes. */
const SPLAT_FADE_MS = 700;
/** Level-up toast auto-dismiss delay (#4). */
const TOAST_DISMISS_MS = 2500;
/** Rare-Drop screen-flash duration (#4); mirrors styles.css's `rare-flash` keyframes. */
const FLASH_DURATION_MS = 400;

/** Abbreviated Attack Type labels for the compact defence-vector readout (#99) — terse to fit the
 * 320px Character panel budget. Rendered inside the shared hover panel/Bank detail strip since
 * #78's icon pass (item tiles carry only icon + qty; per-piece stats moved off the always-visible
 * row). */
const ATTACK_TYPE_ABBR: Record<AttackType, string> = {
  stab: "st",
  slash: "sl",
  crush: "cr",
  ranged: "rn",
  magic: "mg",
};

/** One compact line for a per-type defence vector, e.g. "st 8 · sl 10 · cr 6 · rn 4 · mg 2" (#99).
 * Shared by per-piece Gear Slot rows and the Character panel's totals row. */
function defVectorLabel(def: Record<AttackType, number>): string {
  return ATTACK_TYPES.map((t) => `${ATTACK_TYPE_ABBR[t]} ${def[t]}`).join(" · ");
}

/** Human-readable target label for a PotionDef (#118): "fishing-speed"/"production-speed" get a
 * spaced-out label, a combat SkillName is title-cased as-is. Shared by `itemDetailLines` (the
 * hover/detail-strip stat line) and the Potion Slot tile's charges readout. */
function potionTargetLabel(target: PotionDef["target"]): string {
  if (target === "fishing-speed") return "Fishing speed";
  if (target === "production-speed") return "Production speed";
  return target.charAt(0).toUpperCase() + target.slice(1);
}

/** "qualifying action" noun for a PotionDef's `charges` count (#118, mirrors PotionDef.charges's
 * own doc): a combat-Skill target counts attacks, "fishing-speed" counts catches,
 * "production-speed" counts crafts. */
function potionActionNoun(target: PotionDef["target"]): string {
  if (target === "fishing-speed") return "catches";
  if (target === "production-speed") return "crafts";
  return "attacks";
}

/** One stat line for a PotionDef: "+20% Strength for 50 attacks" (the owner's own worked example
 * shape) plus its sell value if any. Shared by `itemDetailLines` below. */
function potionDetailLines(def: PotionDef): string[] {
  const pct = Math.round(def.boostPct * 100);
  const lines = [
    `+${pct}% ${potionTargetLabel(def.target)} for ${def.charges} ${potionActionNoun(def.target)}`,
  ];
  if (def.value !== undefined) lines.push(`Worth ${def.value}g`);
  return lines;
}

/** One stat line for an AmmoDef (#119): an arrow shows its rangedStr bonus (folded into ranged
 * max hit alongside gear's strBonus — see engine.ts's playerAccuracyAndMaxHit), a rune shows its
 * Element, plus its sell value if any. Shared by `itemDetailLines` below, mirrors
 * `potionDetailLines`'s shape. */
function ammoDetailLines(def: AmmoDef): string[] {
  const lines =
    def.ammoType === "arrow" ? [`+${def.rangedStr ?? 0} ranged str`] : [`Element: ${def.element}`];
  if (def.value !== undefined) lines.push(`Worth ${def.value}g`);
  return lines;
}

/** A Monster's weak spot (Combat Depth #102): the lowest entry in its defence vector, ties broken
 * by ATTACK_TYPES order — UI-derived, not stored on MonsterDef (monster stats are static content,
 * matching the W2-4 pattern of never widening Snapshot for renderable-from-Content data). */
function weakSpot(def: Record<AttackType, number>): AttackType {
  return ATTACK_TYPES.reduce((weakest, t) => (def[t] < def[weakest] ? t : weakest));
}

/** One line per stat on `def`: the weapon's own attack type (weapon rows only), non-zero
 * atk/str bonuses, the compact defence vector (#99, always shown — it's the piece's whole
 * defensive contribution), and the weapon's own speed for weapon-slot items. */
function equipmentStatParts(def: EquipmentDef): string[] {
  const parts: string[] = [];
  if (def.slot === "weapon" && def.attackType) parts.push(def.attackType);
  if (def.atkBonus) parts.push(`+${def.atkBonus} atk`);
  if (def.strBonus) parts.push(`+${def.strBonus} str`);
  parts.push(defVectorLabel(def.def));
  if (def.slot === "weapon") parts.push(`spd ${def.attackSpeed ?? UNARMED_SPEED}t`);
  return parts;
}

/** Renders a per-kill chance as a short human-readable fraction (e.g. "1/24") when the chance
 * is (near enough) an exact reciprocal, falling back to a percentage otherwise (e.g. "30%"). */
function formatChance(chance: number): string {
  const inverse = 1 / chance;
  const rounded = Math.round(inverse);
  return Math.abs(inverse - rounded) < 0.01 ? `1/${rounded}` : `${Math.round(chance * 100)}%`;
}

/** Combat Style segmented control labels — Object.entries drives the buttons, so a future
 * widening of `CombatStyle` is a compile error here, not a silent gap. Issue #7 (Ranged/Magic)
 * deliberately did NOT widen this union: a weapon's Combat Mode (melee/ranged/magic) is a
 * separate concept that decides XP routing, while Combat Style (Accurate/Aggressive/Defensive)
 * stays the player's melee-only training selector — see CombatMode in core/types.ts. */
const STYLE_LABELS: Record<CombatStyle, string> = {
  accurate: "Accurate",
  aggressive: "Aggressive",
  defensive: "Defensive",
};

/** One row of the Spell picker (#101): name, a short Element tag, and — only while under-leveled
 * — the Magic level it needs. #78's icon pass restyles this later (issue's own UI note); today
 * it's a compact text row, mirroring the Combat Style selector it sits beside. */
function spellRowMarkup(spell: SpellDef, magicLevel: number, selectedId: string): string {
  const gated = magicLevel < spell.levelReq;
  return `<button data-spell="${spell.id}" class="spell-btn ${spell.id === selectedId ? "active" : ""}" ${gated ? "disabled" : ""}>
    <span class="spell-name">${spell.name}</span>
    <span class="spell-element">${spell.element}</span>
    ${gated ? `<span class="spell-req">Lvl ${spell.levelReq}</span>` : ""}
  </button>`;
}

/** Auto-eat threshold segmented control labels, keyed by the Engine's AutoEatThreshold union. */
const AUTO_EAT_LABELS: Record<AutoEatThreshold, string> = {
  0: "Off",
  0.25: "25%",
  0.5: "50%",
  0.75: "75%",
};

/** Fraction (0..1) of the way a Skill's XP is from its current level's threshold to the next
 * level's threshold. Skills at MAX_LEVEL have no next threshold, so the bar reads full. */
function skillProgress(skill: SkillSnapshot): number {
  if (skill.level >= MAX_LEVEL) return 1;
  const floor = xpForLevel(skill.level);
  const ceil = xpForLevel(skill.level + 1);
  return (skill.xp - floor) / (ceil - floor);
}

/**
 * One entry per RIGHT-panel tab. The tab strip, click handling, and show/hide logic below are
 * generic over this list — extending the tab mechanism (Bank #25, Character #26, Smithing #28,
 * Skills #62, Cooking #115, Crafting #116, Herblore #118, Vendor #119) means adding an entry here
 * plus a matching `[data-tab-panel]` section in the `#tab-panels` markup; no other code in this
 * file needs to change. Order here is display order in the tab strip (Skills, Character, Bank,
 * Vendor, Smithing, Cooking, Crafting, Herblore, Loot Feed).
 */
const TABS = [
  { id: "skills", label: "Skills" },
  { id: "character", label: "Character" },
  { id: "bank", label: "Bank" },
  { id: "vendor", label: "Vendor" },
  { id: "smithing", label: "Smithing" },
  { id: "cooking", label: "Cooking" },
  { id: "crafting", label: "Crafting" },
  { id: "herblore", label: "Herblore" },
  { id: "loot", label: "Loot Feed" },
] as const;
type TabId = (typeof TABS)[number]["id"];

/** Presentation-only panel/tab state (#62) — localStorage only, never the Snapshot/save (same
 * boundary as the sort choice, #26, and the SFX mute preference, #20). `tab: null` means the
 * RIGHT panel is closed; the LEFT (Areas) panel is independent of it. */
interface PanelState {
  left: boolean;
  tab: TabId | null;
}

const PANEL_STORAGE_KEY = "sidescape-ui-panels";
const CLOSED_PANELS: PanelState = { left: false, tab: null };

function isTabId(value: unknown): value is TabId {
  return TABS.some((t) => t.id === value);
}

/** The persisted panel state, or both panels closed if unset/malformed or localStorage is
 * unavailable (private mode, disabled) — the same fail-safe shape as `loadSortKey`. */
function loadPanelState(): PanelState {
  try {
    const raw = localStorage.getItem(PANEL_STORAGE_KEY);
    if (!raw) return CLOSED_PANELS;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return CLOSED_PANELS;
    const left = (parsed as { left?: unknown }).left === true;
    const tabRaw = (parsed as { tab?: unknown }).tab;
    return { left, tab: isTabId(tabRaw) ? tabRaw : null };
  } catch {
    return CLOSED_PANELS;
  }
}

function savePanelState(state: PanelState): void {
  try {
    localStorage.setItem(PANEL_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage may be unavailable; the choice just won't persist.
  }
}

/** Handle returned by `mountApp` for driving re-renders after each Tick. */
export interface MountedApp {
  /** Re-renders the scene from the Engine's current Snapshot. Call after every `engine.tick()`. */
  render(): void;
}

/**
 * Mounts the entire SideScape interface into `root`, driven by `engine`.
 * Adds no timers of its own (ADR-0001): the caller pumps `engine.tick()` and
 * calls the returned `render()` to reflect the new Snapshot.
 */
export function mountApp(
  engine: Engine,
  root: HTMLElement,
  content: Content,
  windowChrome: WorkspaceChrome,
): MountedApp {
  // Presentation-only side panel state (#62): LEFT (Areas) is independent of the RIGHT tab strip,
  // where `rightTab: null` means the right panel is closed. Restored from localStorage below.
  // Cards deliberately never restore open after relaunch.  The old key is read only to preserve
  // its internal tab selection for a future workspace navigator, never its open flags.
  const restoredPanels = loadPanelState();
  let leftOpen = false;
  let rightTab: TabId | null = null;
  // Presentation-only, persisted in localStorage (#26) — never part of the Snapshot/save.
  let sortKey: SortKey = loadSortKey();
  // Which empty Food Slot (if any) currently has its Bank-Food chooser open (#61) — purely
  // presentational UI state, never part of the Snapshot/save. Re-clicking the same slot's [+], or
  // picking a Food from the chooser, closes it (set back to null).
  let openFoodChooserSlot: number | null = null;
  // Whether the (singular) Potion Slot's Bank-Potion chooser is open (#118) — same presentational
  // shape as `openFoodChooserSlot`, but a plain boolean since there's only ever one Potion Slot.
  // Re-clicking [+], or picking a Potion from the chooser, closes it.
  let openPotionChooser = false;
  // Whether the (singular) Quiver's Bank-Arrow chooser is open (#119) — same presentational shape
  // as `openPotionChooser` (a single active arrow stack, mirroring the single active potion).
  let openQuiverChooser = false;
  // Which Rune Pouch Element slot (if any) currently has its Bank-Rune chooser open (#119) — same
  // presentational shape as `openFoodChooserSlot`, but keyed by Element (air/water/earth/fire)
  // instead of an array index, since the pouch holds one slot per Element rather than N generic
  // slots.
  let openRunePouchChooserElement: Element | null = null;
  // Which Bank tile (if any) is selected, driving the detail strip below the grid (#78) — purely
  // presentational UI state, never part of the Snapshot/save. Re-clicking the same tile deselects
  // it (closing the strip), mirroring the tab-strip's own re-click-to-close behavior.
  let selectedBankItem: string | null = null;

  // Combat feedback (#4) — damage splats, level-up toast, rare-Drop flash. Purely presentational:
  // reacts to the Engine's own events, adding no new Engine state.
  let flashTimer: ReturnType<typeof setTimeout> | undefined;

  // Scene backdrop (#80): the most recently resolved Area id, remembered so idle stretches (e.g.
  // right after a Dungeon completes and ejects to idle) keep showing that Area's theme instead of
  // reverting to the first-unlocked one — see resolveTheme's own doc for the full priority order.
  // Presentation-only, in-memory (never the Snapshot/save), same boundary as sortKey/panelState.
  let lastAreaId: string | null = null;

  /** Shows the LEFT (Areas) panel and the RIGHT panel's active tab (if any), hiding the rest;
   * highlights the matching tab button and the left arrow. Does not itself notify WorkspaceChrome or
   * persist — callers that change `leftOpen`/`rightTab` do that via `syncPanels` below. */
  function renderTabs(): void {
    el<HTMLElement>("#left-panel").hidden = !leftOpen;
    el<HTMLButtonElement>("#left-arrow").classList.toggle("active", leftOpen);

    root.querySelectorAll<HTMLButtonElement>("#tab-row button").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset["tab"] === rightTab);
    });
    root.querySelectorAll<HTMLElement>("[data-tab-panel]").forEach((panel) => {
      panel.hidden = panel.dataset["tabPanel"] !== rightTab;
    });
    el<HTMLElement>("#right-panel").hidden = rightTab === null;
    // Collapse the whole row when no card is open, so the transparent union has no phantom CARD_GAP
    // above/below the compact widget — the window is exactly compact-sized while closed.
    el<HTMLElement>("#management-row").hidden = !leftOpen && rightTab === null;
  }

  /** Re-renders panel visibility, notifies `WorkspaceChrome` of the new open-card *count* (the
   * seam main.ts's real Tauri adapter resizes/anchors the transparent window from, and that #136
   * extends from two cards to three), and persists the choice to localStorage (#62) — never the
   * Snapshot/save. Called after every LEFT/RIGHT panel change, including the initial
   * restore-from-localStorage on mount, so the window matches on every mount, not just the next
   * toggle. */
  function syncPanels(): void {
    renderTabs();
    const count = Number(leftOpen) + Number(rightTab !== null);
    windowChrome.setCardCount(count);
    // Retain only tab preference; legacy open flags must not survive a relaunch.
    // Legacy key remains writable for a smooth upgrade, but its open flags are ignored at boot.
    savePanelState({ left: leftOpen, tab: rightTab ?? restoredPanels.tab });
  }

  function itemName(itemId: string): string {
    return content.items.find((i) => i.id === itemId)?.name ?? itemId;
  }

  /** Gold per unit if `itemId` can be sold from the Bank; undefined otherwise. */
  function sellPrice(itemId: string): number | undefined {
    const def = content.items.find((i) => i.id === itemId);
    return def && def.kind !== "currency" ? def.value : undefined;
  }

  /** One compact line per stat-worthy fact about an item — equipment's own `equipmentStatParts`
   * joined onto a single line (#99's defence-vector readout lives here now: #78 moved per-piece
   * stats off the always-visible slot row and into this shared hover-panel/detail-strip
   * treatment); Food's heal amount plus its sell value if any; a sellable Material's value;
   * nothing extra for currency (its name alone is enough). Shared by the Bank detail strip and
   * the `#item-tooltip` hover panel so the two never drift apart. */
  function itemDetailLines(itemId: string): string[] {
    const def = content.items.find((i) => i.id === itemId);
    if (!def) return [];
    switch (def.kind) {
      case "equipment":
        return [equipmentStatParts(def).join(" ")];
      case "food": {
        const lines = [`Heals ${def.heals}`];
        if (def.value !== undefined) lines.push(`Worth ${def.value}g`);
        return lines;
      }
      case "material":
        return def.value !== undefined ? [`Worth ${def.value}g`] : [];
      case "currency":
        return [];
      case "potion":
        return potionDetailLines(def);
      case "ammo":
        return ammoDetailLines(def);
    }
  }

  /** `<img>` for `itemId`'s icon (#78) — resolved through `icons.ts`'s no-fallback registry, same
   * discipline as `itemName`/`sellPrice` above: every Content item has a real icon key, so there's
   * no placeholder branch here. */
  function iconMarkup(itemId: string): string {
    const def = content.items.find((i) => i.id === itemId);
    const src = def ? itemIcon(def.icon) : "";
    return `<img class="icon pixel" src="${src}" alt="${itemName(itemId)}" />`;
  }

  /** Icon + a corner quantity badge (`formatQty`) — the standard Bank/Food-Slot/Loot tile body.
   * Character Gear Slot tiles use `iconMarkup` alone (a worn piece is always qty 1, so a badge
   * would just be noise). */
  function tileMarkup(itemId: string, qty: number): string {
    return `${iconMarkup(itemId)}<span class="tile-qty">×${formatQty(qty)}</span>`;
  }

  /** One tooltip line per Drop Table entry: item name, quantity, band, and human-readable chance. */
  function dropEntryLine(entry: DropTableEntry): string {
    const chanceLabel =
      entry.band === "guaranteed" ? "always" : `${entry.band} ${formatChance(entry.chance)}`;
    return `${itemName(entry.itemId)} ×${entry.qty} — ${chanceLabel}`;
  }

  /** `title` tooltip text previewing a Monster's full Drop Table. */
  function dropTableTooltip(monsterId: string): string {
    const def = content.monsters.find((m) => m.id === monsterId);
    return def ? def.dropTable.map(dropEntryLine).join("\n") : "";
  }

  function el<T extends HTMLElement>(selector: string): T {
    return root.querySelector(selector) as T;
  }

  /** Appends a line to the Loot Feed panel AND mirrors it onto the main column's `#ticker` (the
   * amendment's "heartbeat" — one line, same band/class styling, never a replacement for the
   * full feed panel). Both are driven from this single call site so they can never drift apart. */
  function feedLine(text: string, cls = ""): void {
    const li = document.createElement("li");
    li.textContent = text;
    if (cls) li.className = cls;
    const feed = el<HTMLUListElement>("#feed");
    feed.prepend(li);
    while (feed.children.length > 40) feed.lastChild?.remove();

    const ticker = el<HTMLElement>("#ticker");
    ticker.textContent = text;
    ticker.className = cls;
  }

  /** Appends a damage splat (a red hit for `amount > 0`, a blue "0" miss otherwise) to `layer`,
   * removing it after SPLAT_FADE_MS — long enough for styles.css's `splat-fade` animation to play.
   * Each splat owns its own timer so overlapping splats (both combatants landing an attack the
   * same Tick) fade independently.
   *
   * Anti-overlap (#77): each splat gets a small random x/y jitter set inline, biased toward the
   * upper half of the sprite (styles.css's `.splat` fallback `top: 38%`) rather than dead-centre
   * over the face, so two splats fired on the same Tick don't fully coincide. */
  function showSplat(layer: HTMLElement, amount: number): void {
    const splat = document.createElement("span");
    splat.className = amount > 0 ? "splat splat-hit" : "splat splat-miss";
    splat.textContent = String(amount);
    const jitterX = Math.random() * 24 - 12; // ±12px
    const jitterY = Math.random() * 14 - 7; // ±7px, still biased upper-half by the 38% base
    splat.style.left = `calc(50% + ${jitterX.toFixed(1)}px)`;
    splat.style.top = `calc(38% + ${jitterY.toFixed(1)}px)`;
    layer.appendChild(splat);
    setTimeout(() => splat.remove(), SPLAT_FADE_MS);
  }

  /** Appends a toast to #toast-container, auto-dismissing after TOAST_DISMISS_MS; each toast owns
   * its own timer so multiple same-Tick toasts (e.g. a kill's damage XP and its trickle of
   * Hitpoints XP both crossing a level boundary, or a level-up landing the same Tick an out-of-
   * ammo warning fires, #119) stack and dismiss independently. Generic over the text — shared by
   * the level-up toast and the out-of-ammo warning toast. */
  function showToast(text: string): void {
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = text;
    el<HTMLElement>("#toast-container").appendChild(toast);
    setTimeout(() => toast.remove(), TOAST_DISMISS_MS);
  }

  /** Briefly flashes the whole scene on a rare Drop; re-triggers the CSS animation (via a forced
   * reflow) if a second rare Drop lands before the previous flash finished. */
  function triggerRareFlash(): void {
    const overlay = el<HTMLElement>("#flash-overlay");
    overlay.classList.remove("flash-rare");
    void overlay.offsetWidth; // force reflow so re-adding the class restarts the animation
    overlay.classList.add("flash-rare");
    if (flashTimer) clearTimeout(flashTimer);
    flashTimer = setTimeout(() => overlay.classList.remove("flash-rare"), FLASH_DURATION_MS);
  }

  /** Fills the shared `#item-tooltip` hover panel (#78) with `itemId`'s name plus
   * `itemDetailLines` — the same lines the Bank detail strip shows, so a Character/Food/Loot tile
   * (which has no detail strip of its own) still surfaces #99's defence-vector readout and every
   * other per-item stat purely through hover. */
  function fillTooltip(itemId: string): void {
    const lines = itemDetailLines(itemId);
    el<HTMLElement>("#item-tooltip").innerHTML =
      `<p class="tooltip-name">${itemName(itemId)}</p>` +
      lines.map((line) => `<p class="tooltip-stat">${line}</p>`).join("");
  }

  /** Positions `#item-tooltip` (a `position: fixed` element, so viewport coordinates apply
   * directly) just below-right of `anchor`, clamped inside the viewport (#78: "clamp it inside
   * the window bounds") rather than letting it spill off the always-on-top window's edge. Falls
   * back to the app's own base 320×640 design size when `window.innerWidth/Height` or the
   * tooltip's own measured size aren't available (e.g. a layout-less test environment) so the
   * clamp math stays sane rather than silently no-op-ing. */
  function positionTooltip(anchor: HTMLElement): void {
    const tip = el<HTMLElement>("#item-tooltip");
    const anchorRect = anchor.getBoundingClientRect();
    const viewportW = window.innerWidth || 320;
    const viewportH = window.innerHeight || 640;
    const tipW = tip.offsetWidth || 150;
    const tipH = tip.offsetHeight || 50;
    const margin = 8;

    const left = Math.min(Math.max(0, anchorRect.left + margin), Math.max(0, viewportW - tipW));
    const top = Math.min(Math.max(0, anchorRect.bottom + margin), Math.max(0, viewportH - tipH));
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
  }

  /** Renders the 3-slot Active Food Slot bar (#61), near the player HP bar: a filled slot shows
   * name/qty (click = eatFromSlot) plus a small ✕ (click = unassignFoodSlot); an empty slot shows
   * a `[+]` that opens a chooser listing the Bank's Food stacks (click one = assignFoodSlot).
   * `openFoodChooserSlot` is presentation-only UI state (never part of the Snapshot), so this
   * reads it directly from the enclosing closure rather than taking it as a parameter. */
  function renderFoodSlots(
    foodSlots: FoodSlot[],
    bankItems: { itemId: string; qty: number }[],
  ): void {
    const foodStacks = bankItems.filter(
      (s) => content.items.find((i) => i.id === s.itemId)?.kind === "food",
    );
    const chooserItems: LoadoutSlotChooserItem[] = foodStacks.map((s) => ({
      itemId: s.itemId,
      label: `${itemName(s.itemId)} ×${s.qty}`,
    }));

    el("#food-slots").innerHTML = foodSlots
      .map((slot, i) =>
        loadoutSlotMarkup(
          {
            wrapperClass: "food-slot",
            keyAttr: `data-slot="${i}"`,
            filledInner: slot
              ? `<button class="food-slot-eat tile" data-eat="${i}" data-item="${slot.itemId}">
                   ${tileMarkup(slot.itemId, slot.qty)}
                 </button>`
              : "",
            unassignClass: "food-slot-unassign",
            unassignAttr: `data-unassign="${i}"`,
            unassignTitle: "Unassign",
            addClass: "food-slot-add",
            addAttr: `data-add="${i}"`,
            chooserClass: "food-slot-chooser",
            chooserOpen: openFoodChooserSlot === i,
            chooserItems,
            assignAttr: (itemId) => `data-assign="${i}" data-item="${itemId}"`,
            emptyHint: "No Food in Bank",
          },
          slot !== null,
        ),
      )
      .join("");
  }

  /** Renders the single Potion Slot tile on the Character tab panel (#118): mirrors
   * renderFoodSlots' filled/empty/chooser shape, but singular — there is only ever one active
   * potion (owner decision: "the player can only have 1 active potion at a time"). A filled slot
   * shows the icon + qty badge plus a `charges/max` readout and a ✕ (click = unassignPotionSlot,
   * consuming the open potion); an empty slot shows a `[+]` that opens a chooser listing the
   * Bank's Potion stacks (click one = assignPotionSlot). There is no click-to-drink — a potion's
   * buff applies passively while assigned, unlike Food's click-to-eat. */
  function renderPotionSlot(
    potionSlot: PotionSlot,
    bankItems: { itemId: string; qty: number }[],
  ): void {
    const potionStacks = bankItems.filter(
      (s) => content.items.find((i) => i.id === s.itemId)?.kind === "potion",
    );
    const chooserItems: LoadoutSlotChooserItem[] = potionStacks.map((s) => ({
      itemId: s.itemId,
      label: `${itemName(s.itemId)} ×${s.qty}`,
    }));
    const filledInner = potionSlot
      ? (() => {
          const def = content.items.find((i) => i.id === potionSlot.itemId);
          const maxCharges = def?.kind === "potion" ? def.charges : potionSlot.charges;
          return `<div class="tile" data-item="${potionSlot.itemId}">${tileMarkup(potionSlot.itemId, potionSlot.qty)}</div>
                  <span class="potion-slot-charges">${potionSlot.charges}/${maxCharges}</span>`;
        })()
      : "";

    el("#potion-slot").innerHTML = loadoutSlotMarkup(
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
        chooserOpen: openPotionChooser,
        chooserItems,
        assignAttr: (itemId) => `data-potion-assign="${itemId}"`,
        emptyHint: "No Potions in Bank",
      },
      potionSlot !== null,
    );
  }

  /** Renders the Quiver tile on the Character tab panel (#119): the single active arrow stack,
   * mirroring renderPotionSlot's filled/empty/chooser shape exactly (singular, like the Potion
   * Slot — one arrow type at a time) minus the charges readout, which the Quiver has no equivalent
   * of. A filled tile shows the icon + qty badge plus a ✕ (click = unloadQuiver); an empty tile
   * shows a `[+]` that opens a chooser listing the Bank's arrow stacks (click one = loadQuiver). */
  function renderQuiver(
    quiver: Snapshot["player"]["quiver"],
    bankItems: { itemId: string; qty: number }[],
  ): void {
    const arrowStacks = bankItems.filter((s) => {
      const def = content.items.find((i) => i.id === s.itemId);
      return def?.kind === "ammo" && def.ammoType === "arrow";
    });
    const chooserItems: LoadoutSlotChooserItem[] = arrowStacks.map((s) => ({
      itemId: s.itemId,
      label: `${itemName(s.itemId)} ×${s.qty}`,
    }));
    const filledInner = quiver
      ? `<div class="tile" data-item="${quiver.itemId}">${tileMarkup(quiver.itemId, quiver.qty)}</div>`
      : "";

    el("#quiver-slot").innerHTML = loadoutSlotMarkup(
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
        chooserOpen: openQuiverChooser,
        chooserItems,
        assignAttr: (itemId) => `data-quiver-assign="${itemId}"`,
        emptyHint: "No Arrows in Bank",
      },
      quiver !== null,
    );
  }

  /** Renders the Rune Pouch panel on the Character tab panel (#119): one slot per Element, in
   * `ELEMENTS` order (air/water/earth/fire) — never an inline literal, mirroring `renderXpRow`'s
   * own "iterate the canonical order" discipline. Unlike the Quiver (singular) or Food Slots
   * (N generic slots), each slot here is keyed by its own Element: a filled slot shows that
   * Element's loaded rune (icon + qty badge, ✕ to unload); an empty slot shows a `[+]` that opens
   * a chooser listing ONLY that Element's rune stacks in the Bank (there is normally one rune item
   * per Element, but the chooser filters by Element rather than assuming it, staying correct if
   * that ever changes). Reuses the Food Slot bar's own flex-row/tile/chooser CSS shape (#61) — a
   * 4-wide row instead of 3, otherwise identical. */
  function renderRunePouch(
    runePouch: Snapshot["player"]["runePouch"],
    bankItems: { itemId: string; qty: number }[],
  ): void {
    el("#rune-pouch").innerHTML = ELEMENTS.map((element) => {
      const loaded = runePouch.find((s) => {
        const def = content.items.find((i) => i.id === s.itemId);
        return def?.kind === "ammo" && def.ammoType === "rune" && def.element === element;
      });
      const runeStacks = bankItems.filter((s) => {
        const def = content.items.find((i) => i.id === s.itemId);
        return def?.kind === "ammo" && def.ammoType === "rune" && def.element === element;
      });
      const chooserItems: LoadoutSlotChooserItem[] = runeStacks.map((s) => ({
        itemId: s.itemId,
        label: `${itemName(s.itemId)} ×${s.qty}`,
      }));
      const filledInner = loaded
        ? `<div class="tile" data-item="${loaded.itemId}">${tileMarkup(loaded.itemId, loaded.qty)}</div>`
        : "";

      return loadoutSlotMarkup(
        {
          wrapperClass: "food-slot",
          keyAttr: `data-element="${element}"`,
          filledInner,
          unassignClass: "food-slot-unassign",
          unassignAttr: `data-rune-unassign="${loaded?.itemId ?? ""}"`,
          unassignTitle: "Unload",
          addClass: "food-slot-add",
          addAttr: `data-rune-add="${element}"`,
          chooserClass: "food-slot-chooser",
          chooserOpen: openRunePouchChooserElement === element,
          chooserItems,
          assignAttr: (itemId) => `data-rune-assign="${itemId}"`,
          emptyHint: `No ${element} Runes in Bank`,
        },
        loaded !== undefined,
      );
    }).join("");
  }

  /** Renders the Pets tab panel's collection grid (#120): one tile per `content.pets` entry, in
   * Content order — never filtered down, so the roster itself previews what's collectible. An
   * owned pet's tile renders normally; an unobtained one is dimmed via `.tile-unowned` (CSS
   * greyscale/opacity) rather than hidden — "owned lit, unobtained greyed" is the issue's own
   * instruction. No qty badge (`tileMarkup`'s corner badge) since pets aren't stackable Items,
   * just `iconMarkup`'s bare `<img>`, mirroring a Character Gear Slot tile. */
  function renderPets(ownedPets: string[]): void {
    const owned = new Set(ownedPets);
    el("#pets-grid").innerHTML = content.pets
      .map((pet) => {
        const isOwned = owned.has(pet.id);
        return `<div class="tile${isOwned ? "" : " tile-unowned"}" data-pet="${pet.id}" title="${pet.name}">
                  <img class="icon pixel" src="${itemIcon(pet.icon)}" alt="${pet.name}" />
                </div>`;
      })
      .join("");
  }

  /** Renders the Vendor tab panel's fixed-price buy list (#119): mirrors a Production Skill panel's
   * (production.ts) own name/level-row/action-button shape (reusing its `.recipe-name`/`.craft-btn`
   * CSS classes rather than inventing a parallel set), substituting the gold price for a level requirement and a
   * "Buy" command for "Craft". Each row also shows how many the player already owns in the Bank.
   * The Buy button disables while short on gold; `buy` itself still throws on a full Bank (#119's
   * "player commands throw" rule), surfaced via the item-bought/error path same as any other
   * command. */
  function renderVendor(bank: Snapshot["bank"], gold: number): void {
    const owned = (itemId: string) => bank.items.find((s) => s.itemId === itemId)?.qty ?? 0;
    el("#vendor-list").innerHTML = content.vendor
      .map((entry) => {
        const disabled = gold < entry.price;
        return `<li data-vendor-row="${entry.itemId}">
                  <p class="recipe-name">${itemName(entry.itemId)} <span class="recipe-level">${entry.price}g</span></p>
                  <p class="recipe-inputs">Owned: ${owned(entry.itemId)}</p>
                  <button class="craft-btn" data-vendor-buy="${entry.itemId}" ${disabled ? "disabled" : ""}>Buy</button>
                </li>`;
      })
      .join("");
  }

  /** Renders the scene's parallax backdrop (#80): resolves the current Theme via `resolveTheme`
   * (UI-only, ADR-0001 — the Engine has no notion of "theme") and stamps it onto `#backdrop`'s
   * `data-theme` attribute, which styles.css keys each layer's background off of; also resolves
   * and shows/hides the activity's foreground prop (Smithing's anvil, this wave — see
   * production.ts's `resolveProp`).
   * Updates `lastAreaId` whenever an Area-following activity resolves one, so later idle stretches
   * keep showing the most recently visited Area rather than flashing back to the first-unlocked. */
  function renderBackdrop(snap: Snapshot): void {
    const resolved = resolveTheme(snap, content, lastAreaId);
    if (resolved.areaId) lastAreaId = resolved.areaId;
    el<HTMLElement>("#backdrop").dataset["theme"] = resolved.theme;

    const prop = resolveProp(snap);
    const propEl = el<HTMLElement>("#activity-prop");
    propEl.hidden = prop === null;
    propEl.className = prop ? `prop-${prop}` : "";
  }

  /** Renders the main column's "scene": the current Dungeon banner (if any), the player HP bar,
   * the gold counter in the chrome row directly above it, and whichever of Monster / Fishing Spot
   * / production Recipe is active (or the "pick a monster" placeholder). Decomposed from the old
   * monolithic `render()` (#39) — DOM output is unchanged. */
  function renderScene(
    dungeon: Snapshot["dungeon"],
    player: Snapshot["player"],
    monster: Snapshot["monster"],
    fishing: Snapshot["fishing"],
    production: Snapshot["production"],
  ): void {
    const dungeonHeader = el<HTMLElement>("#dungeon-header");
    if (dungeon) {
      dungeonHeader.textContent = `⚔ ${dungeon.name} — Wave ${dungeon.wave}/${dungeon.totalWaves}`;
      dungeonHeader.hidden = false;
    } else {
      dungeonHeader.textContent = "";
      dungeonHeader.hidden = true;
    }

    el("#player-hp-fill").style.width = `${(player.hp / player.maxHp) * 100}%`;
    el("#player-hp-text").textContent = player.respawning
      ? "Respawning…"
      : `HP ${player.hp}/${player.maxHp}`;

    const monsterImg = el<HTMLImageElement>("#monster-sprite");
    const monsterBar = el<HTMLElement>("#monster-bar");
    const monsterStats = el<HTMLElement>("#monster-stats");
    if (production) {
      // Scene label is descriptor-backed (#181, production.ts) — see productionLabel.
      el("#monster-name").textContent = `${productionLabel(production.skill)}: ${production.name}`;
      monsterImg.hidden = true;
      monsterBar.hidden = true;
      monsterStats.hidden = true;
      monsterStats.textContent = "";
    } else if (fishing) {
      el("#monster-name").textContent = `🎣 Fishing at ${fishing.name}`;
      monsterImg.hidden = true;
      monsterBar.hidden = true;
      monsterStats.hidden = true;
      monsterStats.textContent = "";
    } else if (monster) {
      monsterBar.hidden = false;
      el("#monster-name").textContent = monster.name;
      el("#monster-hp-fill").style.width = `${(monster.hp / monster.maxHp) * 100}%`;
      el("#monster-hp-text").textContent = `${monster.hp}/${monster.maxHp}`;

      const def = content.monsters.find((m) => m.id === monster.id);
      if (def) {
        const attackTypeLabel = def.attackType.charAt(0).toUpperCase() + def.attackType.slice(1);
        const weakSuffix = ` · Weak: ${weakSpot(def.def)}${def.weakElement ? ` · Weak: ${def.weakElement}` : ""}`;
        monsterStats.textContent = `${attackTypeLabel} · Atk ${def.attackLevel} · Def ${def.defenceLevel} · Max hit ${def.maxHit} · Speed ${def.attackSpeed}t${weakSuffix}`;
        monsterStats.hidden = false;
      } else {
        monsterStats.textContent = "";
        monsterStats.hidden = true;
      }

      const sprite = monsterSprite(monster.id);
      if (sprite) {
        monsterImg.src = sprite;
        monsterImg.alt = monster.name;
        monsterImg.hidden = false;
      } else {
        monsterImg.hidden = true;
      }
    } else {
      monsterBar.hidden = false;
      el("#monster-name").textContent = "Pick a monster ↓";
      el("#monster-hp-fill").style.width = "0%";
      el("#monster-hp-text").textContent = "";
      monsterImg.hidden = true;
      monsterStats.hidden = true;
      monsterStats.textContent = "";
    }

    el("#gold").textContent = `🪙 ${player.gold}`;
  }

  /** Renders the Skills tab panel's xp-row: one entry per Skill, in `SKILL_NAMES` order (#36) —
   * never an inline literal, so a future Skill addition needs no change here. */
  function renderXpRow(skills: Snapshot["player"]["skills"]): void {
    el("#xp-row").innerHTML = SKILL_NAMES.map((skill) => {
      const s = skills[skill];
      const pct = Math.floor(skillProgress(s) * 100);
      return `<div class="skill" data-skill="${skill}" title="${skill}: ${Math.floor(s.xp)} xp">
             <span class="skill-abbr">${skill.slice(0, 3).toUpperCase()}</span>
             <span class="skill-level">${s.level}</span>
             <div class="skill-bar"><div class="skill-bar-fill" style="width: ${pct}%"></div></div>
           </div>`;
    }).join("");
  }

  /** Renders the Character tab panel: worn Gear Slots as icon tiles, derived stat totals, the
   * Combat Style and auto-eat threshold segmented controls' active states, and the
   * auto-sell-duplicates checkbox. A filled slot's own stats (#99's defence-vector readout
   * included) no longer sit on the always-visible row (#78) — they're one hover away on
   * `#item-tooltip`, same as every other item tile; `#character-totals` (the aggregate) stays put
   * since it's the one number that's always worth showing without a hover. */
  function renderCharacter(player: Snapshot["player"]): void {
    root.querySelectorAll<HTMLButtonElement>("#style-row button").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset["style"] === player.combatStyle);
    });

    // Spell picker (#101): one row per known spell (content.spells, not just castable ones),
    // level-gated ones disabled with their req shown, the resolved selection highlighted.
    el("#spell-row").innerHTML = content.spells
      .map((spell) => spellRowMarkup(spell, player.skills.magic.level, player.spell?.id ?? ""))
      .join("");

    root.querySelectorAll<HTMLButtonElement>("#autoeat-row button").forEach((btn) => {
      btn.classList.toggle("active", Number(btn.dataset["threshold"]) === player.autoEatThreshold);
    });

    el<HTMLInputElement>("#autosell-duplicates-toggle").checked = player.autoSellDuplicates;

    el("#character-slots").innerHTML = GEAR_SLOT_ORDER.map((slot) => {
      const itemId = player.equipment[slot];
      if (!itemId) {
        return `<div class="tile tile-empty" data-slot="${slot}">
                  <span class="tile-empty-mark" aria-label="${slot} (empty)">—</span>
                </div>`;
      }
      return `<div class="tile" data-slot="${slot}" data-item="${itemId}">${iconMarkup(itemId)}</div>`;
    }).join("");

    const b = player.bonuses;
    el("#character-totals").textContent =
      `+${b.atkBonus} atk +${b.strBonus} str ${defVectorLabel(b.def)} spd ${b.attackSpeed}t`;
  }

  /** Renders the main column's Loot Zone strip: hidden while empty, otherwise one icon+qty tile
   * per stack. */
  function renderLootStrip(lootZone: Snapshot["lootZone"]): void {
    const lootStrip = el<HTMLElement>("#loot-strip");
    lootStrip.hidden = lootZone.length === 0;
    el("#loot-strip-items").innerHTML = lootZone
      .map(
        (s) =>
          `<li class="loot-chip tile" data-item="${s.itemId}">${tileMarkup(s.itemId, s.qty)}</li>`,
      )
      .join("");
  }

  /** Renders the Bank tab panel: the sort-row's active toggle, the capacity header + buy-slots
   * button, and the sorted stack grid (#78: `<button class="tile">`s carrying only icon + qty
   * badge — the click-to-select detail strip below shows the name/stats/Equip/Sell buttons that
   * used to sit inline on each row). `gold` (rather than the whole player) is all the buy-slots
   * button's disabled check needs. */
  function renderBank(bank: Snapshot["bank"], gold: number): void {
    root.querySelectorAll<HTMLButtonElement>("#sort-row button").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset["sort"] === sortKey);
    });

    const used = bank.items.length;
    el("#bank-header").textContent = `Bank ${used}/${bank.capacity}`;
    const buySlotsBtn = el<HTMLButtonElement>("#buy-slots-btn");
    buySlotsBtn.textContent = `Buy +10 slots (${bank.nextSlotsPrice}g)`;
    buySlotsBtn.disabled = gold < bank.nextSlotsPrice;

    const stacks = sortStacks(bank.items, sortKey, content);
    // A selected Bank tile can vanish from under the detail strip (its last unit sold/equipped,
    // or a re-sort/filter that no longer surfaces it) — drop a selection that no longer resolves
    // to a stack so the detail strip hides itself instead of showing stale Equip/Sell buttons.
    if (selectedBankItem && !stacks.some((s) => s.itemId === selectedBankItem)) {
      selectedBankItem = null;
    }

    el("#bank").innerHTML = stacks
      .map(
        (s) =>
          `<button class="tile" data-item="${s.itemId}" aria-pressed="${s.itemId === selectedBankItem}">
             ${tileMarkup(s.itemId, s.qty)}
           </button>`,
      )
      .join("");

    renderBankDetail(stacks);
  }

  /** Renders the Bank's detail strip (#78): hidden while nothing is selected, otherwise the
   * selected stack's name/qty, `itemDetailLines` stats, and its Equip/Sell buttons — the same
   * `data-equip`/`data-sell` attributes the old inline row buttons carried, so command wiring
   * (#59's dispatch-order rule included) is unchanged, just relocated. */
  function renderBankDetail(stacks: { itemId: string; qty: number }[]): void {
    const detail = el<HTMLElement>("#bank-detail");
    const stack = selectedBankItem ? stacks.find((s) => s.itemId === selectedBankItem) : undefined;
    if (!stack) {
      detail.hidden = true;
      detail.innerHTML = "";
      return;
    }

    const def = content.items.find((i) => i.id === stack.itemId);
    const price = sellPrice(stack.itemId);
    const sellBtn =
      price !== undefined
        ? `<button class="sell-btn" data-sell="${stack.itemId}">Sell ${price}g</button>`
        : "";
    const equipBtn =
      def?.kind === "equipment"
        ? `<button class="equip-btn" data-equip="${stack.itemId}">Equip</button>`
        : "";

    detail.hidden = false;
    detail.innerHTML = `<p class="detail-name">${itemName(stack.itemId)} ×${formatQty(stack.qty)}</p>
      ${itemDetailLines(stack.itemId)
        .map((line) => `<p class="detail-stat">${line}</p>`)
        .join("")}
      <div class="detail-actions">${equipBtn}${sellBtn}</div>`;
  }

  /** Dispatcher (#39): reads the latest Snapshot, then renders each Production Skill's panel in
   * turn (#181: descriptor-driven, see production.ts — one loop replaces the four former
   * per-skill panel-rendering functions this module used to define). */
  function render(): void {
    const snap = engine.snapshot();
    const { player, monster, fishing, dungeon, production, bank } = snap;

    renderBackdrop(snap);
    renderScene(dungeon, player, monster, fishing, production);
    renderFoodSlots(player.foodSlots, bank.items);
    renderPotionSlot(player.potionSlot, bank.items);
    renderQuiver(player.quiver, bank.items);
    renderRunePouch(player.runePouch, bank.items);
    renderXpRow(player.skills);
    renderCharacter(player);
    renderPets(player.ownedPets);
    renderLootStrip(snap.lootZone);
    renderBank(bank, player.gold);
    renderVendor(bank, player.gold);
    for (const descriptor of PRODUCTION_SKILLS) {
      el(`#${descriptor.panelId}`).innerHTML = productionPanelMarkup(
        descriptor,
        content,
        bank.items,
        player.skills[descriptor.skill].level,
      );
    }
  }

  function buildPicker(): void {
    const snap = engine.snapshot();
    el("#picker").innerHTML = snap.areas
      .map((area) => {
        const monsterButtons = area.monsterIds
          .map((id) => {
            const def = content.monsters.find((m) => m.id === id);
            return `<button data-monster="${id}" ${area.unlocked ? "" : "disabled"} title="${dropTableTooltip(id)}">${def?.name ?? id}</button>`;
          })
          .join("");
        const spotButtons = area.fishingSpots
          .map(({ id, unlocked }) => {
            const def = content.fishingSpots.find((s) => s.id === id);
            return `<button data-spot="${id}" ${unlocked ? "" : "disabled"}>🎣 ${def?.name ?? id}</button>`;
          })
          .join("");
        const dungeonButtons = content.dungeons
          .filter((d) => d.areaId === area.id)
          .map(
            (d) =>
              `<button data-dungeon="${d.id}" ${area.unlocked ? "" : "disabled"}>⚔ ${d.name}</button>`,
          )
          .join("");
        return `
          <p class="area-name">${area.name}${area.unlocked ? "" : ` ${lockClearLabel(area)}`}</p>
          <div class="monster-buttons">${monsterButtons}</div>
          ${spotButtons ? `<div class="monster-buttons fishing-buttons">${spotButtons}</div>` : ""}
          ${dungeonButtons ? `<div class="monster-buttons dungeon-buttons">${dungeonButtons}</div>` : ""}`;
      })
      .join("");
  }

  /** "🔒 Clear <dungeon name>" for a locked Area's picker label, read straight from the
   * Snapshot's derived `gatedBy` (#24/#87: Engine keeps gate rules internal, UI never walks
   * raw Content for them). */
  function lockClearLabel(area: Snapshot["areas"][number]): string {
    return `🔒 Clear ${area.gatedBy?.name ?? "?"}`;
  }

  root.innerHTML = `
    <div id="flash-overlay"></div>
    <div id="item-tooltip" class="item-tooltip" hidden></div>
    <div id="management-row" class="management-row">
    <section id="left-panel" class="side-panel management-card" hidden>
      <header class="management-card-header" data-tauri-drag-region><p class="panel-title" data-tauri-drag-region>Areas</p><button class="card-close" data-close-left title="Close Areas">✕</button></header>
      <section id="picker"></section>
    </section>
    <section id="right-panel" class="side-panel management-card" hidden>
      <header class="management-card-header" data-tauri-drag-region><p class="panel-title" data-tauri-drag-region>Management</p><button class="card-close" data-close-right title="Close panel">✕</button></header>
      <div id="tab-panels">
    <div data-right-panels></div>
      </div>
    </section>
    </div>
    <section id="compact-widget">
    <header id="titlebar" data-tauri-drag-region>
      <span data-tauri-drag-region>SideScape</span>
      <div id="titlebar-controls">
        <button id="export-save" title="Export save to clipboard">📤</button>
        <button id="import-save" title="Import save from clipboard">📥</button>
        <button id="mute-toggle" title="Mute sound" aria-pressed="false">🔊</button>
        <button id="close-btn" title="Quit">✕</button>
      </div>
    </header>
    <div id="import-panel" hidden>
      <p>Paste a save below, then Apply. This overwrites your current save.</p>
      <textarea id="import-textarea" rows="4"></textarea>
      <p id="import-error" hidden></p>
      <div id="import-actions">
        <button id="import-apply">Apply</button>
        <button id="import-cancel">Cancel</button>
      </div>
    </div>
    <div id="main-column">
      <div id="chrome-row">
        <button id="left-arrow" data-toggle-left title="Areas">◂</button>
        <span id="gold"></span>
      </div>
      <section id="scene">
        <div id="backdrop" aria-hidden="true">
          <div class="layer-sky"></div>
          <div class="layer-mid"></div>
          <div class="layer-near"></div>
          <div class="backdrop-overlay"></div>
          <div id="activity-prop" hidden></div>
        </div>
        <div id="toast-container"></div>
        <div id="sprite-row">
          <div id="monster-sprite-wrap" class="sprite-wrap">
            <img id="monster-sprite" class="sprite pixel" alt="" hidden />
            <div id="monster-splats" class="splat-layer"></div>
          </div>
          <div id="player-sprite-wrap" class="sprite-wrap">
            <img id="player-sprite" class="sprite pixel" src="${playerSprite}" alt="Player" />
            <div id="player-splats" class="splat-layer"></div>
          </div>
        </div>
        <p id="dungeon-header" hidden></p>
        <p id="monster-name"></p>
        <p id="monster-stats" hidden></p>
        <div id="monster-bar" class="bar monster"><div id="monster-hp-fill" class="fill"></div><span id="monster-hp-text" class="bar-text"></span></div>
        <div class="bar player"><div id="player-hp-fill" class="fill"></div><span id="player-hp-text" class="bar-text"></span></div>
        <div id="food-slots" class="food-slots"></div>
      </section>
      <p id="ticker"></p>
      <section id="loot-strip" hidden>
        <ul id="loot-strip-items"></ul>
        <button id="loot-all-btn" data-loot-all>Loot all</button>
      </section>
      <div id="tab-row" class="tab-row">
        ${TABS.map((tab) => `<button data-tab="${tab.id}">${tab.label}</button>`).join("")}
      </div>
    </div>
    </section>
    <template id="right-panel-template"><div id="tab-panels">
        <div data-tab-panel="skills" class="tab-panel">
          <p class="panel-title">Skills</p>
          <section id="xp-row"></section>
        </div>
        <div data-tab-panel="character" class="tab-panel">
          <p class="panel-title">Character</p>
          <div id="character-slots" class="tile-grid"></div>
          <p id="character-totals" class="totals-row"></p>
          <p class="panel-subtitle">Potion</p>
          <div id="potion-slot" class="potion-slot"></div>
          <p class="panel-subtitle">Quiver</p>
          <div id="quiver-slot" class="potion-slot"></div>
          <p class="panel-subtitle">Rune Pouch</p>
          <div id="rune-pouch" class="food-slots"></div>
          <p class="panel-subtitle">Pets</p>
          <div id="pets-grid" class="tile-grid"></div>
          <div id="style-row" class="style-row">
            ${Object.entries(STYLE_LABELS)
              .map(([style, label]) => `<button data-style="${style}">${label}</button>`)
              .join("")}
          </div>
          <p class="panel-subtitle">Spells</p>
          <div id="spell-row" class="spell-row"></div>
          <div id="autoeat-row" class="style-row">
            ${Object.entries(AUTO_EAT_LABELS)
              .map(
                ([threshold, label]) => `<button data-threshold="${threshold}">${label}</button>`,
              )
              .join("")}
          </div>
          <label id="autosell-duplicates-row" class="checkbox-row">
            <input type="checkbox" id="autosell-duplicates-toggle" />
            Auto-sell duplicate gear
          </label>
        </div>
        <div data-tab-panel="bank" class="tab-panel">
          <p class="panel-title">
            <span id="bank-header"></span>
            <button id="buy-slots-btn" data-buy-slots></button>
          </p>
          <div id="sort-row" class="style-row">
            ${SORT_KEYS.map((key) => `<button data-sort="${key}">${SORT_LABELS[key]}</button>`).join("")}
          </div>
          <div id="bank" class="tile-grid"></div>
          <div id="bank-detail" class="detail-strip" hidden></div>
        </div>
        <div data-tab-panel="vendor" class="tab-panel">
          <p class="panel-title">Vendor</p>
          <ul id="vendor-list"></ul>
        </div>
        <div data-tab-panel="smithing" class="tab-panel">
          <p class="panel-title">Smithing</p>
          <ul id="smithing-recipes"></ul>
        </div>
        <div data-tab-panel="cooking" class="tab-panel">
          <p class="panel-title">Cooking</p>
          <ul id="cooking-recipes"></ul>
        </div>
        <div data-tab-panel="crafting" class="tab-panel">
          <p class="panel-title">Crafting</p>
          <ul id="crafting-recipes"></ul>
        </div>
        <div data-tab-panel="herblore" class="tab-panel">
          <p class="panel-title">Herblore</p>
          <ul id="herblore-recipes"></ul>
        </div>
        <div data-tab-panel="loot" class="tab-panel">
          <ul id="feed"></ul>
      </div></template>
    </div>`;
  const rightTemplate = root.querySelector<HTMLTemplateElement>("#right-panel-template");
  const rightCard = root.querySelector<HTMLElement>("#right-panel");
  if (!rightTemplate || !rightCard) throw new Error("management card template missing");
  rightCard.append(rightTemplate.content.cloneNode(true));
  rightTemplate.remove();

  // One splat per resolved swing (#86) — the player's own attacks land on the Monster's side,
  // the Monster's land on the player's; fires during engine.tick() itself, not the following
  // render(), so the splat cadence exactly matches Engine-resolved attacks regardless of how
  // often render() happens to run.
  engine.on("attack", (e) => {
    showSplat(el(e.actor === "player" ? "#monster-splats" : "#player-splats"), e.damage);
  });
  engine.on("kill", (e) =>
    feedLine(`Killed ${content.monsters.find((m) => m.id === e.monsterId)?.name}`),
  );
  engine.on("drop", (e) => feedLine(`+${e.qty} ${itemName(e.itemId)}`, `drop-${e.band}`));
  engine.on("drop", (e) => {
    if (e.band === "rare") triggerRareFlash();
  });
  engine.on("levelup", (e) => feedLine(`⭐ ${e.skill} level ${e.level}!`, "levelup"));
  engine.on("levelup", (e) => showToast(`⭐ ${e.skill} level ${e.level}!`));
  engine.on("death", () => feedLine("💀 You died — respawning…", "death"));
  engine.on("food-eaten", (e) => feedLine(`🍖 Ate ${itemName(e.itemId)} (+${e.healed})`, "eat"));
  engine.on("item-sold", (e) => feedLine(`Sold ${itemName(e.itemId)} (+${e.gold}g)`, "sell"));
  engine.on("overflow-sold", (e) =>
    feedLine(`⚠ Bank full — sold ${itemName(e.itemId)} (+${e.gold}g)`, "overflow"),
  );
  engine.on("overflow-lost", (e) =>
    feedLine(`⚠ Bank full — ${itemName(e.itemId)} lost!`, "overflow"),
  );
  engine.on("duplicate-sold", (e) =>
    feedLine(`⚠ Auto-sold duplicate ${itemName(e.itemId)} (+${e.gold}g)`, "overflow"),
  );
  // Loot Zone (#60): a sweep (auto-loot on leaving combat, or the Loot all button) banks whatever
  // fits and leaves the rest in the zone — check the post-sweep Snapshot for leftovers right here,
  // rather than a per-render check, so the warning fires once per sweep instead of spamming every
  // Tick while the zone sits non-empty.
  engine.on("looted", (e) => {
    if (e.items.length <= 3) {
      for (const item of [...e.items].reverse()) {
        feedLine(`Banked ${item.qty} ${itemName(item.itemId)}`, "loot");
      }
    } else {
      feedLine(`Banked ${e.items.length} stacks of loot`, "loot");
    }
    if (engine.snapshot().lootZone.length > 0) {
      feedLine("⚠ Bank full — loot left behind", "overflow");
    }
  });
  engine.on("dungeon-failed", (e) => {
    for (const item of [...e.lostItems].reverse()) {
      feedLine(`-${item.qty} ${itemName(item.itemId)}`, "dungeon-failed");
    }
    feedLine("💀 Run failed — loot lost!", "dungeon-failed");
  });
  engine.on("fish-caught", (e) => feedLine(`🎣 Caught ${itemName(e.itemId)} (+${e.qty})`, "catch"));
  engine.on("item-crafted", (e) => feedLine(`🔨 Crafted ${itemName(e.itemId)}`, "craft"));
  engine.on("equipped", (e) => feedLine(`Equipped ${itemName(e.itemId)}`));
  engine.on("item-bought", (e) =>
    feedLine(`Bought ${e.qty} ${itemName(e.itemId)} (-${e.gold}g)`, "buy"),
  );
  // Out-of-ammo (#119): a toast (the acceptance criterion's own required surface) plus a feed
  // line, mirroring the overflow-sold/overflow-lost/duplicate-sold warnings' "⚠" + "overflow"
  // class treatment — this is the same "player needs to notice" severity.
  engine.on("out-of-ammo", (e) => {
    const text = e.need === "arrow" ? "🏹 Out of arrows!" : `🔮 Out of ${e.element} runes!`;
    showToast(text);
    feedLine(`⚠ ${text}`, "overflow");
  });
  // Pet drop (#120): a never-before-owned pet — celebratory, reusing the rare-Drop band's own
  // screen-flash + toast + feed-line treatment (the issue's own "reuse the rare-drop band/flash
  // presentation" instruction), rather than inventing a parallel severity.
  engine.on("pet-dropped", (e) => {
    const name = content.pets.find((p) => p.id === e.petId)?.name ?? e.petId;
    const text = `🐾 New pet: ${name}!`;
    feedLine(text, "pet-dropped");
    showToast(text);
    triggerRareFlash();
  });
  engine.on("wave-cleared", (e) => feedLine(`Wave ${e.wave}/${e.totalWaves} cleared`));
  engine.on("dungeon-completed", (e) => {
    const def = content.dungeons.find((d) => d.id === e.dungeonId);
    feedLine(`🏰 ${def?.name ?? e.dungeonId} cleared!`, "dungeon-completed");
  });
  engine.on("chest-opened", (e) => {
    // feedLine prepends, so the newest call ends up on top: insert items in reverse, then the
    // header last, so the visual (top-to-bottom) order reads header followed by items in order.
    for (const item of [...e.items].reverse()) {
      feedLine(`+${item.qty} ${itemName(item.itemId)}`, `drop-${item.band}`);
    }
    feedLine("📦 Chest opened!", "chest-header");
  });
  engine.on("levelup", () => buildPicker()); // Fishing-Spot levelReq gates are level-driven
  engine.on("dungeon-completed", () => buildPicker()); // Area gates flip on Dungeon completion

  el("#style-row").addEventListener("click", (event) => {
    const style = (event.target as HTMLElement).dataset["style"] as CombatStyle | undefined;
    if (style) {
      engine.setCombatStyle(style);
      render();
    }
  });

  // Spell picker (#101): a disabled (under-leveled) button never fires click, so no extra guard
  // is needed here — mirrors #style-row's own pattern above.
  el("#spell-row").addEventListener("click", (event) => {
    const spellId = (event.target as HTMLElement).closest<HTMLElement>("[data-spell]")?.dataset[
      "spell"
    ];
    if (spellId) {
      engine.selectSpell(spellId);
      render();
    }
  });

  el("#autoeat-row").addEventListener("click", (event) => {
    const raw = (event.target as HTMLElement).dataset["threshold"];
    if (raw !== undefined) {
      engine.setAutoEatThreshold(Number(raw) as AutoEatThreshold);
      render();
    }
  });

  el<HTMLInputElement>("#autosell-duplicates-toggle").addEventListener("change", (event) => {
    engine.setAutoSellDuplicates((event.target as HTMLInputElement).checked);
    render();
  });

  el("#sort-row").addEventListener("click", (event) => {
    const key = (event.target as HTMLElement).dataset["sort"] as SortKey | undefined;
    if (key) {
      sortKey = key;
      saveSortKey(key);
      render();
    }
  });

  // Right tab strip (#62): clicking an inactive tab opens the RIGHT panel showing it (switching
  // away from whichever other tab was open, if any); clicking the already-active tab closes the
  // panel. At most one RIGHT tab is ever open, mirroring the pre-#62 "one active tab" behavior.
  el("#tab-row").addEventListener("click", (event) => {
    const tab = (event.target as HTMLElement).dataset["tab"] as TabId | undefined;
    if (tab) {
      rightTab = rightTab === tab ? null : tab;
      syncPanels();
    }
  });

  // Left arrow (#62): toggles the Areas panel independently of the RIGHT tab strip — both sides
  // may be open at once.
  el("#left-arrow").addEventListener("click", () => {
    leftOpen = !leftOpen;
    syncPanels();
  });

  el("#management-row").addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    if (target.closest("[data-close-left]")) {
      leftOpen = false;
      syncPanels();
    }
    if (target.closest("[data-close-right]")) {
      rightTab = null;
      syncPanels();
    }
  });
  document.body.addEventListener("click", (event) => {
    if (event.target === document.body) {
      leftOpen = false;
      rightTab = null;
      syncPanels();
    }
  });

  el("#picker").addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const monsterId = target.dataset["monster"];
    if (monsterId) {
      engine.selectMonster(monsterId);
      render();
      return;
    }
    const spotId = target.dataset["spot"];
    if (spotId) {
      engine.selectFishingSpot(spotId);
      render();
      return;
    }
    const dungeonId = target.dataset["dungeon"];
    if (dungeonId) {
      engine.enterDungeon(dungeonId);
      render();
    }
  });

  // Bank grid (#78): clicking a tile selects it (re-clicking the already-selected tile
  // deselects), driving the detail strip below — the grid itself never calls the Engine.
  el("#bank").addEventListener("click", (event) => {
    const tile = (event.target as HTMLElement).closest<HTMLElement>(".tile[data-item]");
    if (!tile) return;
    const itemId = tile.dataset["item"];
    if (!itemId) return;
    selectedBankItem = selectedBankItem === itemId ? null : itemId;
    render();
  });

  // Bank detail strip (#78): the Equip/Sell buttons that used to sit inline on each Bank row now
  // live here instead, carrying the same data-equip/data-sell attributes.
  // Click-handler order is load-bearing (#59, mirrors #25's deposit-before-sell-before-equip
  // rule): the Sell button fires before Equip. Bank rows no longer eat (#61 moved eating to the
  // Food Slot bar) — a Food row's only actions left are Equip (never applicable) and Sell.
  el("#bank-detail").addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const sellId = target.dataset["sell"];
    if (sellId) {
      engine.sell(sellId, 1); // logs its own feed line via the item-sold listener above
      render();
      return;
    }

    const equipId = target.dataset["equip"];
    if (equipId) {
      engine.equip(equipId); // logs its own feed line via the equipped listener above
      render();
    }
  });

  // Shared item-tooltip hover panel (#78): delegated on `root` itself so it covers every
  // Bank/Character/Food-Slot/Loot tile (anything carrying `data-item`) with one listener, rather
  // than per-panel wiring that could drift. `mouseover`/`mouseout` (not `mouseenter`/`mouseleave`,
  // which don't bubble) so delegation from `root` works at all; the `relatedTarget` check on
  // `mouseout` keeps the tooltip open while the pointer moves between a tile's own child elements
  // (e.g. its `<img>` and the qty badge `<span>`) instead of flickering.
  root.addEventListener("mouseover", (event) => {
    const tile = (event.target as HTMLElement).closest<HTMLElement>("[data-item]");
    if (!tile) return;
    const itemId = tile.dataset["item"];
    if (!itemId) return;
    fillTooltip(itemId);
    positionTooltip(tile);
    el<HTMLElement>("#item-tooltip").hidden = false;
  });

  root.addEventListener("mouseout", (event) => {
    const tile = (event.target as HTMLElement).closest<HTMLElement>("[data-item]");
    if (!tile) return;
    const related = (event as MouseEvent).relatedTarget as Node | null;
    if (related && tile.contains(related)) return;
    el<HTMLElement>("#item-tooltip").hidden = true;
  });

  // Food Slot bar (#61): dispatch order is load-bearing — unassign (✕) is checked before the
  // slot-level eat, so unassigning never also eats; a chooser pick is checked before the [+]
  // toggle so picking a Food both assigns it and doesn't re-toggle the chooser. One shared
  // dispatcher factory (#183) drives all four Loadout Slot listeners below — see loadout-slot.ts.
  el("#food-slots").addEventListener(
    "click",
    createLoadoutSlotDispatcher(
      { unassign: "unassign", eat: "eat", assign: "assign", assignItem: "item", add: "add" },
      {
        onUnassign: (index) => {
          engine.unassignFoodSlot(Number(index)); // logs nothing; no feed line for unassign
          render();
        },
        onEat: (index) => {
          engine.eatFromSlot(Number(index)); // logs its own feed line via the food-eaten listener
          render();
        },
        onAssign: (index, itemId) => {
          engine.assignFoodSlot(Number(index), itemId);
          openFoodChooserSlot = null;
          render();
        },
        onAdd: (index) => {
          const i = Number(index);
          openFoodChooserSlot = openFoodChooserSlot === i ? null : i; // re-click dismisses
          render();
        },
      },
    ),
  );

  // Potion Slot tile (#118): dispatch order mirrors the Food Slot bar above — unassign (✕) is
  // checked before a chooser pick, which is checked before the [+] toggle.
  el("#potion-slot").addEventListener(
    "click",
    createLoadoutSlotDispatcher(
      { unassign: "potionUnassign", assign: "potionAssign", add: "potionAdd" },
      {
        onUnassign: () => {
          engine.unassignPotionSlot(); // logs nothing; no feed line for unassign (mirrors Food Slot)
          render();
        },
        onAssign: (_value, itemId) => {
          engine.assignPotionSlot(itemId);
          openPotionChooser = false;
          render();
        },
        onAdd: () => {
          openPotionChooser = !openPotionChooser; // re-click dismisses
          render();
        },
      },
    ),
  );

  // Quiver tile (#119): dispatch order mirrors the Potion Slot above — unassign (✕) before a
  // chooser pick, before the [+] toggle.
  el("#quiver-slot").addEventListener(
    "click",
    createLoadoutSlotDispatcher(
      { unassign: "quiverUnassign", assign: "quiverAssign", add: "quiverAdd" },
      {
        onUnassign: () => {
          engine.unloadQuiver(); // logs nothing; no feed line for unload (mirrors Food/Potion Slot)
          render();
        },
        onAssign: (_value, itemId) => {
          engine.loadQuiver(itemId);
          openQuiverChooser = false;
          render();
        },
        onAdd: () => {
          openQuiverChooser = !openQuiverChooser; // re-click dismisses
          render();
        },
      },
    ),
  );

  // Rune Pouch panel (#119): dispatch order mirrors the Food Slot bar — unassign (✕) before a
  // chooser pick, before the [+] toggle; `data-rune-add` carries the Element rather than an index.
  el("#rune-pouch").addEventListener(
    "click",
    createLoadoutSlotDispatcher(
      { unassign: "runeUnassign", assign: "runeAssign", add: "runeAdd" },
      {
        onUnassign: (itemId) => {
          engine.unloadRunePouch(itemId); // logs nothing; no feed line for unload
          render();
        },
        onAssign: (_value, itemId) => {
          engine.loadRunePouch(itemId);
          openRunePouchChooserElement = null;
          render();
        },
        onAdd: (value) => {
          const addElement = value as Element;
          // re-click dismisses
          openRunePouchChooserElement =
            openRunePouchChooserElement === addElement ? null : addElement;
          render();
        },
      },
    ),
  );

  // Vendor tab panel (#119): a fixed-price Buy control per row, mirroring the Smithing/Cooking/
  // Crafting/Herblore recipe lists' single Craft-button dispatch shape.
  el("#vendor-list").addEventListener("click", (event) => {
    const itemId = (event.target as HTMLElement).dataset["vendorBuy"];
    if (!itemId) return;
    engine.buy(itemId, 1); // logs its own feed line via the item-bought subscription below
    render();
  });

  el("#loot-all-btn").addEventListener("click", () => {
    const before = engine.snapshot().lootZone.length;
    engine.lootAll(); // logs its own feed line via the looted subscription above, if anything moved
    const after = engine.snapshot().lootZone.length;
    render();
    // If something moved, the looted listener above already logged the leftover check itself; this
    // covers the otherwise-silent case where the sweep moved nothing at all (no looted event fires).
    if (after > 0 && after === before) {
      feedLine("⚠ Bank full — loot left behind", "overflow");
    }
  });

  el("#buy-slots-btn").addEventListener("click", () => {
    engine.buyBankSlots();
    feedLine(`Bank expanded to ${engine.snapshot().bank.capacity} slots`);
    render();
  });

  // One identical Craft-click handler per Production Skill panel (#181: descriptor-driven, see
  // production.ts — replaces the four former per-skill listeners).
  for (const descriptor of PRODUCTION_SKILLS) {
    el(`#${descriptor.panelId}`).addEventListener("click", (event) => {
      const recipeId = (event.target as HTMLElement).dataset["recipe"];
      if (!recipeId) return;
      engine.selectRecipe(recipeId); // logs its own feed line via the item-crafted subscription
      render();
    });
  }

  buildPicker();
  render();
  // Applies the panel state restored from localStorage above (or the closed-both default on a
  // fresh install) and notifies WorkspaceChrome once up front, so the real Tauri adapter (main.ts)
  // sizes/positions the OS window to match on every mount, not just on the next toggle.
  syncPanels();

  return { render };
}
