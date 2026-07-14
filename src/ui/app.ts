import { UNARMED_SPEED } from "../core/engine";
import type { Engine } from "../core/engine";
import { ATTACK_TYPES, SKILL_NAMES } from "../core/types";
import type {
  AmmoDef,
  AttackType,
  AutoEatThreshold,
  CombatStyle,
  DropTableEntry,
  EquipmentDef,
  GearSlot,
  PotionDef,
  SkillName,
  SkillSnapshot,
  Snapshot,
} from "../core/types";
import type { ResolvedContent } from "../core/validate-content";
import { MAX_LEVEL, xpForLevel } from "../core/xp";
import { monsterSprite, playerSprite } from "./sprites";
import { SORT_KEYS } from "./sort";
import type { SortKey } from "./sort";
import { BANK_FILTERS, createBankPresentation } from "./bank-view";
import type { BankFilter } from "./bank-view";
import { PRODUCTION_SKILLS, productionPanelMarkup, resolveProp } from "./production";
import type { ProductionSkill } from "./production";
import { createLoadoutSlotUi } from "./loadout-slot";
import type { LoadoutSlotUi } from "./loadout-slot";
import { resolveTheme } from "./theme";
import { resolveActiveAreaId } from "./area-context";
import { itemIcon, skillIcon, tabIcon } from "./icons";
import { formatQty } from "./format";
import type { WorkspaceChrome } from "./workspace-chrome";

/** Gear Slot render order for the Character panel; independent of `Snapshot.player.equipment`'s
 * key order (a plain object, not guaranteed stable across engines/serialization). `amulet`/`ring`
 * (#117, Crafting's jewelry line) are appended after `legs`, mirroring GearSlot's own append-only
 * order in core/types.ts. */
const GEAR_SLOT_ORDER: GearSlot[] = ["weapon", "shield", "head", "body", "legs", "amulet", "ring"];

/** Bank filter button labels, in `BANK_FILTERS` order (#207) — "Gear"/"Materials" rather than
 * "Equipment"/"Material" keep every one of the six always-visible buttons short enough to fit a
 * 300px card three-per-row with no horizontal scrolling (see styles.css's `.bank-filter-row`). */
const BANK_FILTER_LABELS: Record<BankFilter, string> = {
  all: "All",
  equipment: "Gear",
  food: "Food",
  material: "Materials",
  potion: "Potions",
  ammo: "Ammo",
};

/** The expanded Bank's sort `<select>` options, in the issue's own Name/Kind/Value order (#207) —
 * deliberately not `SORT_KEYS`' own kind/value/name order, which drove the old three-button
 * `#sort-row` this replaces. */
const BANK_SORT_OPTIONS: readonly { key: SortKey; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "kind", label: "Kind" },
  { key: "value", label: "Value" },
];

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

/** Auto-eat threshold segmented control labels, keyed by the Engine's AutoEatThreshold union. */
const AUTO_EAT_LABELS: Record<AutoEatThreshold, string> = {
  0: "Off",
  0.25: "25%",
  0.5: "50%",
  0.75: "75%",
};

/** Workshop's four always-visible Production Skill button labels (#209) — plain title-case,
 * distinct from `productionLabel`'s own scene-label form (e.g. "🔨 Smithing", used by
 * `renderScene`): the Workshop header names the Skill itself, not the activity. */
const PRODUCTION_SKILL_LABELS: Record<ProductionSkill, string> = {
  smithing: "Smithing",
  cooking: "Cooking",
  crafting: "Crafting",
  herblore: "Herblore",
};

/** Mirrors core/engine.ts's own internal `LOOT_ZONE_CAPACITY` (CONTEXT.md's Loot Zone: "the small
 * buffer (10 stacks)"). Unlike the Bank's own dynamic capacity (`Snapshot.bank.capacity`), the Loot
 * Zone's capacity never changes, so the Activity page's header can safely know this literal
 * without a new Snapshot field or Engine/data change (#209 is a UI-only issue). */
const LOOT_ZONE_DISPLAY_CAPACITY = 10;

/** Fraction (0..1) of the way a Skill's XP is from its current level's threshold to the next
 * level's threshold. Skills at MAX_LEVEL have no next threshold, so the bar reads full. */
function skillProgress(skill: SkillSnapshot): number {
  if (skill.level >= MAX_LEVEL) return 1;
  const floor = xpForLevel(skill.level);
  const ceil = xpForLevel(skill.level + 1);
  return (skill.xp - floor) / (ceil - floor);
}

/** The two Management Row cards (#206: replaces the three-card World/Character/Resources
 * workspace) — a fixed Character hub plus one shared Management card whose body swaps between
 * four destinations. */
// #222 — APPEND ONLY. This array's order is load-bearing (it backs the nav order and the
// ManagementDestination union); never insert earlier, only push a new destination onto the end.
export const MANAGEMENT_DESTINATIONS = ["world", "bank", "workshop", "activity", "skills"] as const;
export type ManagementDestination = (typeof MANAGEMENT_DESTINATIONS)[number];

/** Which of the Management card's "bank" destination sub-pages is showing — purely
 * presentational and session-only (never persisted, never the Snapshot/save), same boundary as
 * Bank search text and selection (owned by `BankPresentation`, see bank-view.ts). */
type BankMode = "bank" | "vendor";

/** Display labels for the Management card's own title and for the Character hub's destination
 * nav buttons (a subset — see `CHARACTER_NAV_DESTINATIONS` below). */
const MANAGEMENT_DESTINATION_LABELS: Record<ManagementDestination, string> = {
  world: "World",
  bank: "Bank",
  workshop: "Workshop",
  activity: "Activity",
  skills: "Skills",
};

/** The Character hub's own destination nav buttons, in display order (#206 "header: Character |
 * World | Workshop | Activity | Settings", widened by #222 to add Skills last) — `bank` is
 * deliberately excluded from the nav strip; it's reached only via the embedded Equipment Bank
 * tray's own "Expand Bank" button, which dispatches the same destination-click path as these
 * buttons. */
const CHARACTER_NAV_DESTINATIONS: ManagementDestination[] = [
  "world",
  "workshop",
  "activity",
  "skills",
];

/** Presentation-only, session-only workspace state (#206) — never persisted under any key (a
 * relaunch always starts with both cards closed) and never entering the Engine Snapshot/save.
 * `characterOpen` and `management` independently track the two Management Row cards; stale
 * `sidescape-ui-workspace-v2`/`sidescape-ui-panels` values that a pre-#206 build may have left in
 * localStorage are never read any more. */
interface WorkspaceState {
  characterOpen: boolean;
  management: ManagementDestination | null;
}

/** The Character hub's own header nav (#206: "header: Character | World | Workshop | Activity |
 * Settings") — a static "Character" title (the hub's own label; there is no click behavior for
 * it, unlike the other four) plus one `data-destination` button per
 * `CHARACTER_NAV_DESTINATIONS` and a trailing `data-nav="settings"` popover toggle. Delegated
 * click handling on `#card-character` resolves buttons via `closest`, so nested `<img>`/`<span>`
 * clicks work the same as a direct button click. */
function characterNavMarkup(): string {
  const destinationButtons = CHARACTER_NAV_DESTINATIONS.map(
    (destination) =>
      `<button data-destination="${destination}" title="${MANAGEMENT_DESTINATION_LABELS[destination]}">
        <img class="tab-icon pixel" src="${tabIcon(destination)}" alt="" />
        <span>${MANAGEMENT_DESTINATION_LABELS[destination]}</span>
      </button>`,
  ).join("");
  // #223: the auto-eat threshold buttons moved into the Settings popover, but the threshold
  // itself silently keeps the player alive — it must stay legible without opening that popover.
  // This compact indicator's text is filled in by renderCharacter (mirrors #summary-combat-level).
  return `<nav id="character-nav" class="card-nav">
      ${destinationButtons}
      <span id="autoeat-indicator" class="autoeat-indicator" title="Auto-eat threshold">🍖 …</span>
      <button data-nav="settings" title="Settings" aria-expanded="false">
        <span aria-hidden="true">⚙</span>
      </button>
    </nav>`;
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
  content: ResolvedContent,
  windowChrome: WorkspaceChrome,
): MountedApp {
  // Presentation-only, session-only workspace state (#206): both cards always start closed —
  // never persisted, never restored across a relaunch, never part of the Snapshot/save (see
  // WorkspaceState's own doc comment above).
  const workspace: WorkspaceState = { characterOpen: false, management: null };
  // Which Bank|Vendor page is showing inside the Management card's "bank" destination (#206) —
  // purely presentational, session-only, independent of `workspace.management` itself so the
  // choice survives switching away to another destination and back.
  let managementBankPage: BankMode = "bank";
  // Which Production Skill the Workshop destination's four-button selector shows (#209) — purely
  // presentational, session-only, independent of `workspace.management`, mirroring
  // `managementBankPage`'s own shape. Defaults to Smithing; `openDestination` resyncs it to
  // `snapshot.production.skill` whenever Workshop opens while one of the four Production Skills is
  // actively crafting, but otherwise leaves a prior manual pick alone (see `openDestination`'s own
  // doc comment).
  let selectedProductionSkill: ProductionSkill = "smithing";
  // Whether the Character hub's Settings popover (Mute, Export, Import) is open (#206) — purely
  // presentational UI state, an anchored popover that never changes card height.
  let openSettings = false;
  async function syncScaleSelector(): Promise<void> {
    const selected = windowChrome.getScale?.() ?? 1;
    const options = await windowChrome.getScaleOptions?.();
    root.querySelectorAll<HTMLButtonElement>("[data-ui-scale]").forEach((button) => {
      const value = Number(button.dataset["uiScale"]);
      const supported = options?.find((option) => option.value === value)?.supported !== false;
      button.disabled = !supported;
      button.title = supported
        ? `Set UI scale to ${value * 100}%`
        : `${value * 100}% unavailable: monitor cannot fit the full workspace`;
      button.setAttribute("aria-pressed", String(value === selected));
    });
  }
  // Whether the Character hub's Pets summary popover (the full owned/total roster grid) is open
  // (#206) — same presentational shape as `openSettings`.
  let openPetsPopover = false;
  // Which empty Gear Slot (if any) currently has its Bank-Equipment chooser open (#206: Gear Slots
  // become clickable slot tiles, mirroring the Loadout Slot choosers below) — purely
  // presentational, closes on a re-click of the same slot's `[+]` or on picking an Equipment item.
  let openGearChooserSlot: GearSlot | null = null;
  // Owns the expanded Bank page's filter/sort/search and the shared-but-independently-resolved
  // selection between it and the Character hub's Equipment-only tray (#237) — one deep,
  // instance-local module (bank-view.ts) replacing the four separate variables this mount used to
  // hold directly, plus the tolerant load and immediate-persist timing of
  // `sidescape-ui-bank-view-v1`. Both render paths below are DOM adapters over this one instance.
  const bankPresentation = createBankPresentation(content);

  // Combat feedback (#4) — damage splats, level-up toast, rare-Drop flash. Purely presentational:
  // reacts to the Engine's own events, adding no new Engine state.
  let flashTimer: ReturnType<typeof setTimeout> | undefined;

  // Scene backdrop (#80): the most recently resolved Area id, remembered so idle stretches (e.g.
  // right after a Dungeon completes and ejects to idle) keep showing that Area's theme instead of
  // reverting to the first-unlocked one — see resolveTheme's own doc for the full priority order.
  // Presentation-only, in-memory (never the Snapshot/save), same boundary as bankPresentation's
  // own sort/filter state.
  let lastAreaId: string | null = null;

  // World page's own selected-Area progression rail (#208): which Area's Monsters/Fishing
  // Spots/Dungeon show in the selected-detail section. Session-only presentation state, like
  // `lastAreaId` above — selecting a rail row never starts/cancels an activity and never touches
  // the Snapshot/save. See `resolveSelectedArea`'s own doc for the priority order.
  let selectedAreaId: string | null = null;

  /** Shows/hides the two Management Row cards and the Management card's four destination page
   * bodies, and mirrors the Bank|Vendor toggle and Settings/Pets popovers onto the DOM (#206). DOM
   * order is always Character -> Management, stable regardless of which is open — only `hidden`
   * changes. Does not itself notify WorkspaceChrome — callers that change `workspace` do that via
   * `syncWorkspace` below. */
  function renderWorkspace(): void {
    el<HTMLElement>("#card-character").hidden = !workspace.characterOpen;
    el<HTMLElement>("#card-management").hidden = workspace.management === null;

    root.querySelectorAll<HTMLElement>("[data-management-page]").forEach((page) => {
      page.hidden = page.dataset["managementPage"] !== workspace.management;
    });
    // #219 deleted the Management card's own `#management-title` chrome (de-chromed header, no
    // background/border/title text) — the destination pages carry their own "where am I" cue
    // instead (e.g. `#bank-header`, `#workshop-skill-name`, the World rail's Area names, and
    // Activity's own "Recent Activity" heading), so there is nothing left to set here.
    root
      .querySelectorAll<HTMLButtonElement>("#character-nav button[data-destination]")
      .forEach((btn) => {
        btn.classList.toggle("active", btn.dataset["destination"] === workspace.management);
      });

    root.querySelectorAll<HTMLElement>("[data-bank-page]").forEach((page) => {
      page.hidden = page.dataset["bankPage"] !== managementBankPage;
    });
    root
      .querySelectorAll<HTMLButtonElement>("#bank-vendor-toggle button[data-bankpage]")
      .forEach((btn) => {
        btn.classList.toggle("active", btn.dataset["bankpage"] === managementBankPage);
      });

    el<HTMLElement>("#settings-popover").hidden = !openSettings;
    root
      .querySelector<HTMLButtonElement>('[data-nav="settings"]')
      ?.setAttribute("aria-expanded", String(openSettings));
    el<HTMLElement>("#pets-popover").hidden = !openPetsPopover;
    root
      .querySelector<HTMLButtonElement>('[data-nav="pets"]')
      ?.setAttribute("aria-expanded", String(openPetsPopover));

    el<HTMLElement>("#menu-toggle").classList.toggle(
      "active",
      workspace.characterOpen || workspace.management !== null,
    );
    // Collapse the whole row when both cards are closed, so the transparent union has no phantom
    // CARD_GAP above/below the compact widget — the window is exactly compact-sized while closed.
    el<HTMLElement>("#management-row").hidden =
      !workspace.characterOpen && workspace.management === null;
  }

  // Tracks `workspace.management`'s previous value across `syncWorkspace` calls, purely to detect
  // the "bank" destination closing (#207: "search clears whenever the Bank Management destination
  // closes") — covers every path away from Bank (Back, Escape, the transparent-glass close, and
  // switching straight to another destination), since all of them funnel through this one function.
  let previousManagement: ManagementDestination | null = null;
  // Invalidates an older geometry-transition completion when a newer workspace action wins the race. This
  // complements the desired-state comparison below: two transitions can target the same state at
  // different moments, but only the newest one may reveal the staged Management Row.
  let workspaceSyncRevision = 0;

  /** The single synchronization path (#206, ordering fixed by #242): notifies `WorkspaceChrome`
   * of the new open-card *count* exactly once — `(characterOpen ? 1 : 0) + (management ? 1 : 0)`
   * — the seam main.ts's real Tauri adapter resizes/anchors the transparent window from, and
   * re-renders card/page visibility at the right time relative to that native completion.
   * Workspace state is session-only (never persisted, never the Engine Snapshot/save); every
   * workspace change goes through this one function: the menu toggle, destination clicks,
   * Back/second-card-close, transparent-glass close, Escape, and the initial boot sync (called
   * once up front with both cards closed).
   *
   * #242: a card-count change must not expose an intermediate WebView composition while native
   * window geometry catches up. Openings are staged until the target viewport settles. The Tauri
   * adapter also stages contractions behind its native snapshot cover; browser adapters contract
   * immediately because they have no native compositor boundary. Same-count swaps stay immediate.
   * A revision plus a snapshot of `desired` prevents an older completion from revealing state
   * after a rapid re-entrant click has already moved on. */
  function syncWorkspace(): void {
    const revision = ++workspaceSyncRevision;
    if (previousManagement === "bank" && workspace.management !== "bank") {
      bankPresentation.clearSearch(); // #207: search is session-only and resets whenever Bank's page closes
      const searchInput = root.querySelector<HTMLInputElement>("#bank-search");
      if (searchInput) searchInput.value = ""; // the DOM value isn't otherwise re-synced per-render
    }
    previousManagement = workspace.management;

    const desired: WorkspaceState = { ...workspace };
    const desiredCount = (desired.characterOpen ? 1 : 0) + (desired.management ? 1 : 0);
    const paintedCount =
      (el<HTMLElement>("#card-character").hidden ? 0 : 1) +
      (el<HTMLElement>("#card-management").hidden ? 0 : 1);
    const expanding = desiredCount > paintedCount;
    const contracting = desiredCount < paintedCount;
    const stagesContraction = contracting && windowChrome.stagesCardCountContractions === true;
    const stagesGeometryChange = expanding || stagesContraction;
    const needsNativePresentationCover = paintedCount > 0 && stagesGeometryChange;

    // Leave the old composition painted for every geometry change. The native adapter snapshots
    // it before hiding the real NSWindow; rendering a contraction first exposes a mostly-
    // transparent expanded WKWebView as black/stale regions on macOS. Same-count swaps have no
    // native geometry handoff and remain immediate.
    if (!stagesGeometryChange) renderWorkspace();

    const completion = windowChrome.setCardCount(desiredCount); // exactly one request per action

    if (stagesGeometryChange) {
      void completion.then(() => {
        const stillDesired =
          revision === workspaceSyncRevision &&
          workspace.characterOpen === desired.characterOpen &&
          workspace.management === desired.management;
        if (!stillDesired) return;
        // WorkspaceChrome completion includes the webview's target viewport plus one full layout
        // frame. The incoming card therefore first paints in its final row slot.
        renderWorkspace();
        // The macOS adapter may be holding a frozen copy of the old one-card workspace above the
        // resized WKWebView. Retire it only after this final two-card DOM has had time to paint.
        if (needsNativePresentationCover) void windowChrome.present?.();
      });
    }
  }

  /** "menu click" (#206): if either card is visible, closes both; otherwise opens Character alone.
   * Wired to `#menu-toggle` (always visible in the compact widget) and to the transparent-glass
   * click, which always closes (see `closeWorkspace` below) rather than toggling. */
  function onMenuToggle(): void {
    if (workspace.characterOpen || workspace.management !== null) {
      closeWorkspace();
    } else {
      workspace.characterOpen = true;
      syncWorkspace();
    }
  }

  /** Closes both cards unconditionally — the transparent-glass click and the menu button's
   * "already open" branch both resolve here (#206). */
  function closeWorkspace(): void {
    workspace.characterOpen = false;
    workspace.management = null;
    syncWorkspace();
  }

  /** Closes the empty Gear Slot Equipment chooser (#235) — idempotent: a no-op, including no
   * rerender, whenever no Gear Slot chooser is open. `.gear-slot-chooser` is not a Loadout Slot
   * (see CONTEXT.md), so it stays owned here rather than folding into `loadoutSlotUi`. Wired below
   * to an outside click anywhere in the document and to the window losing focus. */
  function closeGearChooser(): void {
    if (openGearChooserSlot === null) return;
    openGearChooserSlot = null;
    render();
  }

  /** "destination click" (#206): opens `destination` in the Management card, alongside Character
   * when the monitor has room for two cards, replacing Character outright at capacity 1. Wired to
   * the Character hub's own World/Workshop/Activity nav buttons and its Bank tray's "Expand Bank"
   * button (which dispatches the "bank" destination).
   *
   * #209: opening "workshop" specifically also resyncs `selectedProductionSkill` to
   * `snapshot.production.skill` when that's one of the four PRODUCTION_SKILLS (the player is
   * actively crafting something) — otherwise the prior session selection is left alone, so
   * navigating away mid-inspection and back doesn't silently reset the picked tab back to
   * Smithing.
   *
   * #242: re-clicking the currently active Management destination is a toggle-close, not a
   * no-op replace-with-itself — it closes Management and leaves Character open, exactly like the
   * Management card's own Back control. This applies to every launcher routed through
   * `data-destination` (World, Workshop, Activity, Skills, the Character levels summary, and
   * Expand Bank), so the branch sits at the very top, before Workshop's active-production resync
   * and before `getCapacity()` — neither should run for a click that is actually closing. */
  async function openDestination(destination: ManagementDestination): Promise<void> {
    if (workspace.management === destination) {
      backToCharacter();
      return;
    }
    if (destination === "workshop") {
      const activeSkill = engine.snapshot().production?.skill;
      const activeDescriptor = PRODUCTION_SKILLS.find((d) => d.skill === activeSkill);
      if (activeDescriptor) {
        selectedProductionSkill = activeDescriptor.skill;
        renderWorkshopPage(); // reflect the resynced selection immediately, not on the next Tick
      }
    }
    const capacity = await windowChrome.getCapacity();
    if (capacity >= 2) {
      workspace.characterOpen = true;
      workspace.management = destination;
    } else {
      workspace.characterOpen = false;
      workspace.management = destination;
    }
    syncWorkspace();
  }

  /** "Back to Character / second-card close" (#206): always returns to Character alone, whether
   * triggered from the Management card's own Back control or (indirectly) from Escape. */
  function backToCharacter(): void {
    workspace.management = null;
    workspace.characterOpen = true;
    syncWorkspace();
  }

  /** Escape (#206): closes the Management card back to Character first, then closes Character —
   * one step per press, no-op once both are already closed. */
  function onEscape(): void {
    if (workspace.management !== null) {
      backToCharacter();
    } else if (workspace.characterOpen) {
      workspace.characterOpen = false;
      syncWorkspace();
    }
  }

  function itemName(itemId: string): string {
    return content.itemsById.get(itemId)?.name ?? itemId;
  }

  /** Gold per unit if `itemId` can be sold from the Bank; undefined otherwise. */
  function sellPrice(itemId: string): number | undefined {
    const def = content.itemsById.get(itemId);
    return def && def.kind !== "currency" ? def.value : undefined;
  }

  /** One compact line per stat-worthy fact about an item — equipment's own `equipmentStatParts`
   * joined onto a single line (#99's defence-vector readout lives here now: #78 moved per-piece
   * stats off the always-visible slot row and into this shared hover-panel/detail-strip
   * treatment); Food's heal amount plus its sell value if any; a sellable Material's value;
   * nothing extra for currency (its name alone is enough). Shared by the Bank detail strip and
   * the `#item-tooltip` hover panel so the two never drift apart. */
  function itemDetailLines(itemId: string): string[] {
    const def = content.itemsById.get(itemId);
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
    const def = content.itemsById.get(itemId);
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
    const def = content.monstersById.get(monsterId);
    return def ? def.dropTable.map(dropEntryLine).join("\n") : "";
  }

  function el<T extends HTMLElement>(selector: string): T {
    return root.querySelector(selector) as T;
  }

  /** Appends a line to the Activity card's Loot Feed.
   * amendment's "heartbeat" — one line, same band/class styling, never a replacement for the
   * full feed panel). Both are driven from this single call site so they can never drift apart. */
  function feedLine(text: string, cls = ""): void {
    const li = document.createElement("li");
    li.textContent = text;
    if (cls) li.className = cls;
    const feed = el<HTMLUListElement>("#feed");
    feed.prepend(li);
    while (feed.children.length > 40) feed.lastChild?.remove();
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

  /** Renders the "Casting: …" readout (#221) driven by `snapshot().player.spell` — the Spell the
   * loaded rune casts, derived, never independently selected (replaces the deleted `#spell-row`
   * picker). Shows a "No rune loaded" empty state when the Rune Slot is empty rather than a stale
   * Spell name. */
  function renderCastingReadout(spell: Snapshot["player"]["spell"]): void {
    el("#casting-readout").textContent = spell
      ? `Casting: ${spell.name}`
      : "Casting: No rune loaded";
  }

  /** Renders the Skills page's Pets summary (#206: "compact owned/total summary whose popover
   * reveals the roster"; moved off the Character card onto the Skills destination by #222, same
   * ids/`data-nav="pets"` hook) — a compact `<owned>/<total>` count always visible, plus the full
   * collection grid inside `#pets-popover` (one tile per `content.pets` entry, in Content order —
   * never filtered down, so the roster itself previews what's collectible). An owned pet's tile
   * renders normally; an unobtained one is dimmed via `.tile-unowned` (CSS greyscale/opacity)
   * rather than hidden — "owned lit, unobtained greyed" is the issue's own instruction (#120). No
   * qty badge (`tileMarkup`'s corner badge) since pets aren't stackable Items, just
   * `iconMarkup`'s bare `<img>`, mirroring a Character Gear Slot tile. */
  function renderPets(ownedPets: string[]): void {
    const owned = new Set(ownedPets);
    el("#pets-summary-count").textContent = `${owned.size}/${content.pets.length}`;
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

  /** Renders the compact live stage. Persistent labels and numeric readouts live in cards. */
  function renderScene(
    dungeon: Snapshot["dungeon"],
    player: Snapshot["player"],
    monster: Snapshot["monster"],
    fishing: Snapshot["fishing"],
    production: Snapshot["production"],
  ): void {
    void dungeon;
    el("#player-hp-fill").style.width = `${(player.hp / player.maxHp) * 100}%`;
    const combat = monster !== null;
    el<HTMLElement>("#player-bar").hidden = !combat;
    const foodQty = player.foodSlots.reduce((sum, slot) => sum + (slot?.qty ?? 0), 0);
    el<HTMLElement>("#no-food-warning").hidden = !combat || foodQty > 0;

    const monsterImg = el<HTMLImageElement>("#monster-sprite");
    const monsterBar = el<HTMLElement>("#monster-bar");
    if (production) {
      monsterImg.hidden = true;
      monsterBar.hidden = true;
    } else if (fishing) {
      monsterImg.hidden = true;
      monsterBar.hidden = true;
    } else if (monster) {
      monsterBar.hidden = false;
      el("#monster-hp-fill").style.width = `${(monster.hp / monster.maxHp) * 100}%`;

      const sprite = monsterSprite(monster.id);
      if (sprite) {
        monsterImg.src = sprite;
        monsterImg.alt = monster.name;
        monsterImg.hidden = false;
      } else {
        monsterImg.hidden = true;
      }
    } else {
      monsterBar.hidden = true;
      el("#monster-hp-fill").style.width = "0%";
      monsterImg.hidden = true;
    }
  }

  /** Tooltip text for one Skill cell in the icon grid (#135): capitalized name, level, floored xp,
   * and percent-to-next-level — MAX once a Skill hits `MAX_LEVEL`, since there is no next
   * threshold (mirrors `skillProgress`'s own MAX_LEVEL special case). */
  function skillTooltip(skill: SkillName, s: SkillSnapshot): string {
    const label = skill[0]?.toUpperCase() + skill.slice(1);
    const xp = Math.floor(s.xp);
    if (s.level >= MAX_LEVEL) return `${label}: level ${s.level} · ${xp} xp · MAX`;
    const pct = Math.floor(skillProgress(s) * 100);
    return `${label}: level ${s.level} · ${xp} xp · ${pct}% to ${s.level + 1}`;
  }

  /** XP-remaining-to-next-level label for one Skill row (#222) — floored to a whole number, "MAX"
   * once a Skill hits `MAX_LEVEL` (mirrors `skillTooltip`'s own MAX_LEVEL special case, since
   * there's no next threshold to count down to). */
  function xpToNextLabel(s: SkillSnapshot): string {
    if (s.level >= MAX_LEVEL) return "MAX";
    const remaining = Math.max(0, Math.ceil(xpForLevel(s.level + 1) - s.xp));
    return `${remaining} xp to next`;
  }

  /** Renders the Skills destination's own page (#222, replacing the Character card's cramped
   * 12-tile `#xp-row` icon grid): one row per Skill, in `SKILL_NAMES` order (#36) — never an
   * inline literal, so a future Skill addition needs no change here — each with its icon at the
   * shared `.tile .icon` chassis's 34px (issue #168's invariant, adopted rather than re-derived),
   * name, level, XP bar, and XP-to-next, plus a trailing Total footer row (sum of all Skill
   * levels). Kept `.skill`/`.skill-total`/`.skill-level`/`.skill-icon` class names from the old
   * `#xp-row` cells so the existing per-Skill styling/selectors carry over unchanged. */
  function renderSkillsPage(skills: Snapshot["player"]["skills"]): void {
    const rows = SKILL_NAMES.map((skill) => {
      const s = skills[skill];
      const pct = Math.floor(skillProgress(s) * 100);
      const label = skill[0]?.toUpperCase() + skill.slice(1);
      return `<li class="skill" data-skill="${skill}" title="${skillTooltip(skill, s)}">
             <img class="skill-icon pixel" src="${skillIcon(skill)}" alt="" />
             <div class="skill-info">
               <p class="skill-name">${label} <span class="skill-level">${s.level}</span></p>
               <div class="skill-bar"><div class="skill-bar-fill" style="width: ${pct}%"></div></div>
               <p class="skill-xp-next">${xpToNextLabel(s)}</p>
             </div>
           </li>`;
    });
    const total = SKILL_NAMES.reduce((sum, skill) => sum + skills[skill].level, 0);
    rows.push(`<li class="skill skill-total" title="Total level">
             <span class="skill-total-label">Total</span>
             <span class="skill-level">${total}</span>
           </li>`);
    el("#skills-list").innerHTML = rows.join("");
  }

  /** Renders the Character tab panel: worn Gear Slots as icon tiles, derived stat totals, the
   * Combat Style and auto-eat threshold segmented controls' active states, and the
   * auto-sell-duplicates checkbox. A filled slot's own stats (#99's defence-vector readout
   * included) no longer sit on the always-visible row (#78) — they're one hover away on
   * `#item-tooltip`, same as every other item tile; `#character-totals` (the aggregate) stays put
   * since it's the one number that's always worth showing without a hover. */
  function renderCharacter(player: Snapshot["player"], bankItems: Snapshot["bank"]["items"]): void {
    root.querySelectorAll<HTMLButtonElement>("#style-row button").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset["style"] === player.combatStyle);
    });

    root.querySelectorAll<HTMLButtonElement>("#autoeat-row button").forEach((btn) => {
      btn.classList.toggle("active", Number(btn.dataset["threshold"]) === player.autoEatThreshold);
    });

    // #223: `#autoeat-row` itself now lives inside the (usually closed) Settings popover — this
    // compact header indicator is what stays legible on every render.
    el("#autoeat-indicator").textContent = `🍖 ${AUTO_EAT_LABELS[player.autoEatThreshold]}`;

    el<HTMLInputElement>("#autosell-duplicates-toggle").checked = player.autoSellDuplicates;

    // Gear Slot tiles (#206): a filled slot stays a plain hover-only tile (its stats surface via
    // the shared #item-tooltip hover panel, same as before); an empty slot becomes a clickable
    // slot tile whose `[+]` opens an anchored chooser of the Bank's Equipment stacks for that slot
    // — mirroring the Loadout Slot choosers below, filtered by `slot` instead of item kind alone.
    el("#character-slots").innerHTML = GEAR_SLOT_ORDER.map((slot) => {
      const itemId = player.equipment[slot];
      if (itemId) {
        return `<div class="tile" data-slot="${slot}" data-item="${itemId}">${iconMarkup(itemId)}</div>`;
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
                          `<button data-gear-assign="${s.itemId}">${itemName(s.itemId)} ×${s.qty}</button>`,
                      )
                      .join("")
                  : `<p class="hint">No ${slot} Equipment in Bank</p>`
              }
            </div>`
          : "";
      return `<div class="tile tile-empty" data-slot="${slot}">
                <button class="gear-slot-add" data-gear-add="${slot}" aria-label="Equip ${slot}">
                  <span class="tile-empty-mark" aria-label="${slot} (empty)">—</span>
                </button>
                ${chooser}
              </div>`;
    }).join("");

    const b = player.bonuses;
    el("#character-totals").textContent =
      `+${b.atkBonus} atk +${b.strBonus} str ${defVectorLabel(b.def)} spd ${b.attackSpeed}t`;

    // #222: the Character card's one-line Skills summary — Combat level plus Total level (the
    // same sum `renderSkillsPage`'s own Total footer row computes), updated on every render so it
    // stays in lockstep with the Skills page on the same Tick.
    el("#summary-combat-level").textContent = String(player.combatLevel);
    const totalLevel = SKILL_NAMES.reduce((sum, skill) => sum + player.skills[skill].level, 0);
    el("#summary-total-level").textContent = String(totalLevel);
  }

  /** One `.detail-strip` body — name/qty, `itemDetailLines` stats, Equip/Sell actions — shared by
   * the full Bank page (`renderBankDetail`) and the Character hub's embedded Equipment-only Bank
   * tray (`renderEquipmentTray`, #206) so the two detail strips can never drift apart. */
  function bankDetailMarkup(stack: { itemId: string; qty: number }): string {
    const def = content.itemsById.get(stack.itemId);
    const price = sellPrice(stack.itemId);
    const sellBtn =
      price !== undefined
        ? `<button class="sell-btn" data-sell="${stack.itemId}">Sell ${price}g</button>`
        : "";
    const equipBtn =
      def?.kind === "equipment"
        ? `<button class="equip-btn" data-equip="${stack.itemId}">Equip</button>`
        : "";
    return `<p class="detail-name">${itemName(stack.itemId)} ×${formatQty(stack.qty)}</p>
      ${itemDetailLines(stack.itemId)
        .map((line) => `<p class="detail-stat">${line}</p>`)
        .join("")}
      <div class="detail-actions">${equipBtn}${sellBtn}</div>`;
  }

  /** Renders the compact widget's live Loot Zone strip (#220): one chip per `snap.lootZone` stack
   * below `#scene`, filling the height wave 1/6 (#219) reclaimed by deleting `#titlebar`. It is
   * the sole Loot Zone interface (#243) — the Activity destination carries no Loot Zone markup of
   * its own. `#compact-widget` carries a deep Tauri drag region (#219), so every chip here MUST be
   * a `<button>` — a `<li>`/`<div>` is a drag surface under that region and would silently lose
   * its own click (see app.test.ts's natively-clickable guard). `#loot-strip-items` scrolls
   * horizontally rather than wrapping (a second row would re-open the
   * dead area this issue exists to close), so the `n/CAPACITY` count keeps a full zone legible
   * without scrolling. The strip keeps a fixed height regardless of content — an empty zone
   * disables `Loot all` rather than hiding the strip, so nothing jumps on every sweep. */
  function renderLootStrip(lootZone: Snapshot["lootZone"]): void {
    el("#loot-strip-count").textContent = `${lootZone.length}/${LOOT_ZONE_DISPLAY_CAPACITY}`;
    el("#loot-strip-items").innerHTML = lootZone
      .map(
        (s) =>
          `<button class="loot-chip tile" data-item="${s.itemId}">${tileMarkup(s.itemId, s.qty)}</button>`,
      )
      .join("");
    el<HTMLButtonElement>("#loot-strip-all-btn").disabled = lootZone.length === 0;
  }

  /** Renders the Workshop destination page (#209): the four always-visible Production Skill
   * buttons' active state, the selected Skill's own name/Level header, and its recipe body
   * (`productionPanelMarkup`, unchanged gating/owned-count/command behavior) — one scrollable
   * recipe list at a time (`#workshop-recipes`) rather than four permanently-stacked lists. Called
   * every Tick from `render()` regardless of whether the Workshop destination is open, so its
   * content never stales (#206's "hidden bodies keep rendering" rule). */
  function renderWorkshopPage(): void {
    const snap = engine.snapshot();
    root.querySelectorAll<HTMLButtonElement>("#workshop-skill-row button").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset["productionSkill"] === selectedProductionSkill);
    });
    const descriptor = PRODUCTION_SKILLS.find((d) => d.skill === selectedProductionSkill);
    if (!descriptor) return; // unreachable: selectedProductionSkill is always one of the four
    const level = snap.player.skills[selectedProductionSkill].level;
    el("#workshop-skill-name").textContent = PRODUCTION_SKILL_LABELS[selectedProductionSkill];
    el("#workshop-skill-level").textContent = `Lvl ${level}`;
    el("#workshop-recipes").innerHTML = productionPanelMarkup(
      descriptor,
      content,
      snap.bank.items,
      level,
    );
  }

  /** Renders the expanded Bank destination page (#207, deepened #237): the six filter buttons' +
   * sort select's active state, the capacity/Gold header, the buy-slots button, and the
   * filtered/searched/sorted stack grid (#78: `<button class="tile">`s carrying only icon + qty
   * badge — the click-to-select detail strip below shows the name/stats/Equip/Sell buttons that
   * used to sit inline on each row). The filter -> search -> sort pipeline and selection
   * visibility are entirely owned by `bankPresentation.full` (bank-view.ts); this is just the DOM
   * adapter. `gold` (rather than the whole player) is all the Gold readout and buy-slots button's
   * disabled check need. */
  function renderBank(bank: Snapshot["bank"], gold: number): void {
    const state = bankPresentation.state();
    root.querySelectorAll<HTMLButtonElement>("#bank-filter-row button").forEach((btn) => {
      const active = btn.dataset["bankFilter"] === state.filter;
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-pressed", String(active));
    });
    el<HTMLSelectElement>("#bank-sort-select").value = state.sort;

    const used = bank.items.length;
    el("#bank-header").textContent = `Bank ${used}/${bank.capacity}`;
    el("#bank-gold").textContent = `🪙 ${gold}`;
    const buySlotsBtn = el<HTMLButtonElement>("#buy-slots-btn");
    buySlotsBtn.textContent = `Buy +10 slots (${bank.nextSlotsPrice}g)`;
    buySlotsBtn.disabled = gold < bank.nextSlotsPrice;

    const presented = bankPresentation.full(bank.items);

    el("#bank").innerHTML = presented.stacks
      .map(
        (s) =>
          `<button class="tile" data-item="${s.itemId}" aria-pressed="${s.itemId === presented.selected?.itemId}">
             ${tileMarkup(s.itemId, s.qty)}
           </button>`,
      )
      .join("");

    renderBankDetail(presented.selected);
  }

  /** Renders the Bank page's detail strip (#78): hidden while nothing is selected, otherwise
   * `bankDetailMarkup`'s shared name/stats/Equip/Sell body. `selected` is `renderBank`'s own
   * `PresentedBank.selected` (#237), not necessarily identical to `renderEquipmentTray`'s. */
  function renderBankDetail(selected: { itemId: string; qty: number } | null): void {
    const detail = el<HTMLElement>("#bank-detail");
    if (!selected) {
      detail.hidden = true;
      detail.innerHTML = "";
      return;
    }
    detail.hidden = false;
    detail.innerHTML = bankDetailMarkup(selected);
  }

  /** Renders the Character hub's embedded Equipment-only Bank tray (#206, filter behavior updated
   * #207, deepened #237) — `snapshot.bank.items` always filtered to `kind === "equipment"`
   * regardless of the full Bank page's own active filter, with no search of its own, sorted by the
   * same `SortKey` choice the full Bank page uses. It is the same Bank, never an Inventory or a
   * second store: this is a filtered view over the identical `bank.items`, and it shares selection
   * with the full Bank page via `bankPresentation` (#207) — selecting a tile in either view drives
   * both views' detail strips via `bankDetailMarkup`. This tray is the Character hub's only
   * scrollport. */
  function renderEquipmentTray(bank: Snapshot["bank"], gold: number): void {
    void gold; // kept for symmetry with renderBank; the tray has no buy-slots control of its own
    const presented = bankPresentation.equipment(bank.items);

    el("#character-bank-tray").innerHTML = presented.stacks
      .map(
        (s) =>
          `<button class="tile" data-item="${s.itemId}" aria-pressed="${s.itemId === presented.selected?.itemId}">
             ${tileMarkup(s.itemId, s.qty)}
           </button>`,
      )
      .join("");

    const detail = el<HTMLElement>("#character-bank-detail");
    if (!presented.selected) {
      detail.hidden = true;
      detail.innerHTML = "";
      return;
    }
    detail.hidden = false;
    detail.innerHTML = bankDetailMarkup(presented.selected);
  }

  /** Dispatcher (#39): reads the latest Snapshot, then renders each Production Skill's panel in
   * turn (#181: descriptor-driven, see production.ts — one loop replaces the four former
   * per-skill panel-rendering functions this module used to define). Hidden Management-card
   * destination pages and the Character hub keep rendering unconditionally every Tick (#206 "hidden
   * bodies continue rendering every Tick so gameplay-derived content never stales") — nothing here
   * branches on `workspace`. */
  function render(): void {
    const snap = engine.snapshot();
    const { player, monster, fishing, dungeon, production, bank } = snap;

    renderBackdrop(snap);
    renderScene(dungeon, player, monster, fishing, production);
    renderWorldPage();
    loadoutSlotUi.render(player, bank.items);
    renderCastingReadout(player.spell);
    renderSkillsPage(player.skills);
    renderCharacter(player, bank.items);
    renderPets(player.ownedPets);
    renderLootStrip(snap.lootZone);
    renderBank(bank, player.gold);
    renderEquipmentTray(bank, player.gold);
    renderVendor(bank, player.gold);
    renderWorkshopPage();
  }

  /**
   * Resolves which Snapshot Area's detail the World page's progression rail shows selected right
   * now (#208) — a pure function over the Snapshot (plus the session-only `selectedAreaId`
   * closed-over state), mirroring `resolveTheme`'s own shape and rationale. Priority, matching the
   * issue's owner-decided rules:
   * 1. `selectedAreaId`, if it still names a Snapshot Area (stale/never-set falls through);
   * 2. the shared `resolveActiveAreaId` (#236) resolver's host Area id, if it names a Snapshot
   *    Area — see that module's doc for its own Dungeon → Monster → Fishing Spot order and why
   *    Dungeon must be checked first;
   * 3. the first Snapshot Area reporting `unlocked`;
   * 4. the first Snapshot Area outright (undefined only if `snap.areas` is itself empty).
   */
  function resolveSelectedArea(snap: Snapshot): Snapshot["areas"][number] | undefined {
    const selected = snap.areas.find((a) => a.id === selectedAreaId);
    if (selected) return selected;

    const activeAreaId = resolveActiveAreaId(snap, content);
    const activeArea = activeAreaId ? snap.areas.find((a) => a.id === activeAreaId) : undefined;
    if (activeArea) return activeArea;

    return snap.areas.find((a) => a.unlocked) ?? snap.areas[0];
  }

  /** Renders the World page's progression rail (#208): one row per Snapshot Area, in Snapshot
   * order — all Areas stay visible and selectable (including locked ones, for inspection),
   * regardless of which one is currently selected. */
  function renderAreaRail(
    snap: Snapshot,
    selectedId: string | undefined,
    activeId: string | null,
  ): void {
    el("#area-rail").innerHTML = snap.areas
      .map((area) => {
        const classes = ["area-rail-item"];
        if (!area.unlocked) classes.push("locked");
        if (area.id === selectedId) classes.push("selected");
        if (area.id === activeId) classes.push("current");
        return `<button type="button" class="${classes.join(" ")}" data-area-select="${area.id}" aria-pressed="${area.id === selectedId}">
          <span class="area-rail-name">${area.name}</span>
          ${area.unlocked ? "" : `<span class="area-rail-lock" aria-hidden="true">🔒</span>`}
        </button>`;
      })
      .join("");
  }

  /** Renders the selected Area's own detail section (#208: name/gate state, Monsters, Fishing
   * Spots, Dungeon) — the Monster/Fishing Spot/Dungeon markup and its `disabled`/tooltip rules are
   * unchanged from the pre-#208 flat picker, just scoped to one Area instead of every Area at
   * once. The currently active Monster/Fishing Spot/Dungeon (Snapshot-driven, independent of which
   * Area is selected) gets the `active` accent class. */
  function renderAreaDetail(snap: Snapshot, area: Snapshot["areas"][number] | undefined): void {
    if (!area) {
      el("#area-detail").innerHTML = "";
      return;
    }
    const inDungeon = snap.dungeon !== null;
    const monsterButtons = area.monsterIds
      .map((id) => {
        const def = content.monstersById.get(id);
        const active = !inDungeon && snap.monster?.id === id;
        return `<button data-monster="${id}" class="${active ? "active" : ""}" ${area.unlocked ? "" : "disabled"} title="${dropTableTooltip(id)}">${def?.name ?? id}</button>`;
      })
      .join("");
    const spotButtons = area.fishingSpots
      .map(({ id, unlocked }) => {
        const def = content.fishingSpotsById.get(id);
        const active = snap.fishing?.spotId === id;
        return `<button data-spot="${id}" class="${active ? "active" : ""}" ${unlocked ? "" : "disabled"}>🎣 ${def?.name ?? id}</button>`;
      })
      .join("");
    const dungeonButtons = content.dungeons
      .filter((d) => d.areaId === area.id)
      .map((d) => {
        const active = snap.dungeon?.id === d.id;
        return `<button data-dungeon="${d.id}" class="${active ? "active" : ""}" ${area.unlocked ? "" : "disabled"}>⚔ ${d.name}</button>`;
      })
      .join("");
    el("#area-detail").innerHTML = `
      <p class="area-name">${area.name}${area.unlocked ? "" : ` ${lockClearLabel(area)}`}</p>
      <div class="monster-buttons">${monsterButtons}</div>
      ${spotButtons ? `<div class="monster-buttons fishing-buttons">${spotButtons}</div>` : ""}
      ${dungeonButtons ? `<div class="monster-buttons dungeon-buttons">${dungeonButtons}</div>` : ""}`;
  }

  /** Rebuilds the World page (#208's progression rail + selected-Area detail) from the current
   * Snapshot — replaces the old flat `buildPicker`. Called from `render()` every tick (so live
   * Snapshot changes like Dungeon Wave advances keep the active highlight in sync) and eagerly
   * from the levelup/dungeon-completed listeners below (mirroring `buildPicker`'s own two trigger
   * sites), so a gate flip is reflected even when no other render() call follows in the same
   * frame. */
  function renderWorldPage(): void {
    const snap = engine.snapshot();
    const selectedArea = resolveSelectedArea(snap);
    const activeAreaId = resolveActiveAreaId(snap, content);
    renderAreaRail(snap, selectedArea?.id, activeAreaId);
    renderAreaDetail(snap, selectedArea);
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
    <section id="card-character" class="management-card" hidden>
      <header class="management-card-header">
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
        <!-- #223: relocated from the Character card body — set-once preferences, not per-fight
             controls. Markup shape/ids/handlers unchanged; only the container moved. -->
        <fieldset id="autoeat-selector">
          <legend>Auto-eat at</legend>
          <div id="autoeat-row" class="style-row">
            ${Object.entries(AUTO_EAT_LABELS)
              .map(
                ([threshold, label]) => `<button data-threshold="${threshold}">${label}</button>`,
              )
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
        <!-- #224: one unified Loadout row — food x3, potion, quiver, rune all on the same 40px
             tile chassis #168 established for the gear grid (.tile-grid's own 40px track),
             replacing the pre-#224 four stacked rows (.food-slots flex:1-stretched food tiles
             rendering ~94px, plus three separate 44px singular tiles). The four render functions
             below still target their own id so each keeps painting only its own slice, but
             .food-slots/.potion-slot are now display:contents pass-throughs (see styles.css) so
             all six tiles sit on #loadout-row's single flex line, not four nested boxes. -->
        <div id="loadout-row" class="loadout-row">
          <div id="character-food-slots" class="food-slots"></div>
          <div id="potion-slot" class="potion-slot"></div>
          <div id="quiver-slot" class="potion-slot"></div>
          <div id="rune-slot" class="potion-slot"></div>
        </div>
        <p id="casting-readout" class="totals-row"></p>
        <!-- #222: the 12-tile Skills icon grid (formerly #xp-row) moved to its own Management
             destination — this is now a one-line clickable summary reusing the existing
             data-destination nav dispatch (#card-character's delegated handler above), so no
             new routing code. -->
        <button id="character-levels-summary" data-destination="skills">
          Combat <span id="summary-combat-level"></span> · Total <span id="summary-total-level"></span> ›
        </button>
        <div id="style-row" class="style-row">
          ${Object.entries(STYLE_LABELS)
            .map(([style, label]) => `<button data-style="${style}">${label}</button>`)
            .join("")}
        </div>
      </div>
      <div class="card-scroll">
        <div id="character-bank-tray" class="tile-grid"></div>
        <div id="character-bank-detail" class="detail-strip" hidden></div>
      </div>
      <button id="expand-bank-btn" class="expand-bank-btn" data-destination="bank">Expand Bank</button>
    </section>
    <section id="card-management" class="management-card" hidden>
      <header class="management-card-header">
        <button class="card-close" data-management-back title="Back to Character">←</button>
      </header>
      <!-- The Workshop destination (#209) owns its own fixed shell, mirroring World/Bank below:
           the four always-visible Production Skill buttons and the selected Skill's own
           name/Level header never scroll — only the recipe body (#workshop-recipes) does. One
           shared scrollable list for whichever Skill is selected, replacing the four
           permanently-stacked lists this destination used to render at once. See styles.css's
           .workshop-page-body. -->
      <div data-management-page="workshop" class="workshop-page-body" hidden>
        <div class="card-fixed">
          <div id="workshop-skill-row" class="workshop-skill-row" role="tablist">
            ${PRODUCTION_SKILLS.map(
              (d) =>
                `<button data-production-skill="${d.skill}" role="tab" title="${PRODUCTION_SKILL_LABELS[d.skill]}">
                  <img class="tab-icon pixel" src="${tabIcon(d.skill)}" alt="" />
                  <span>${PRODUCTION_SKILL_LABELS[d.skill]}</span>
                </button>`,
            ).join("")}
          </div>
          <p class="panel-title">
            <span id="workshop-skill-name"></span>
            <span id="workshop-skill-level"></span>
          </p>
        </div>
        <ul id="workshop-recipes" class="card-scroll"></ul>
      </div>
      <!-- The Activity destination (#243) is now a single full-height Recent Activity feed
           scrollport — the Loot Zone strip in the Compact Widget (#loot-strip) is the sole Loot
           Zone interface, so Activity no longer owns any Loot Zone markup of its own. #feed is
           still the one target every Engine event feeds via feedLine(), so one Engine event still
           yields exactly one feed entry, even while Activity is hidden. See styles.css's
           .activity-page-body. -->
      <div data-management-page="activity" class="activity-page-body" hidden>
        <div class="card-fixed">
          <p class="panel-title">Recent Activity</p>
        </div>
        <ul id="feed" class="card-scroll"></ul>
      </div>
      <!-- The World destination (#208) owns its own fixed shell — the progression rail never
           scrolls, only the selected-Area detail does, so the rail stays put while a long detail
           (e.g. many Monsters) scrolls under it. See styles.css's .world-page-body. -->
      <div data-management-page="world" class="world-page-body" hidden>
        <div id="area-rail" class="area-rail" role="tablist"></div>
        <div id="area-detail" class="area-detail card-scroll"></div>
      </div>
      <!-- The expanded Bank/Vendor destination (#207) owns its own fixed shell too
           (search/filters/sort/detail/buy-slots never scroll, only the tile grid and the Vendor
           list do) — see styles.css's .bank-page-body. -->
      <div data-management-page="bank" class="bank-page-body" hidden>
        <div class="card-fixed">
          <div id="bank-vendor-toggle" class="style-row">
            <button data-bankpage="bank">Bank</button>
            <button data-bankpage="vendor">Vendor</button>
          </div>
          <div data-bank-page="bank">
            <p class="panel-title">
              <span id="bank-header"></span>
              <span id="bank-gold"></span>
            </p>
            <div class="bank-search-row">
              <input
                id="bank-search"
                type="search"
                placeholder="Search"
                aria-label="Search Bank"
                title="Search Bank"
              />
            </div>
            <div id="bank-filter-row" class="bank-filter-row">
              ${BANK_FILTERS.map(
                (filter) =>
                  `<button data-bank-filter="${filter}" aria-pressed="false">${BANK_FILTER_LABELS[filter]}</button>`,
              ).join("")}
            </div>
            <label class="bank-sort-row">
              Sort
              <select id="bank-sort-select" aria-label="Sort Bank" title="Sort Bank">
                ${BANK_SORT_OPTIONS.map(
                  (opt) => `<option value="${opt.key}">${opt.label}</option>`,
                ).join("")}
              </select>
            </label>
          </div>
        </div>
        <div data-bank-page="bank" class="card-scroll">
          <div id="bank" class="tile-grid"></div>
        </div>
        <div data-bank-page="bank" class="card-fixed">
          <div id="bank-detail" class="detail-strip" hidden></div>
          <button id="buy-slots-btn" data-buy-slots class="buy-slots-btn"></button>
        </div>
        <div data-bank-page="vendor" class="card-scroll" hidden>
          <p class="panel-title">Vendor</p>
          <ul id="vendor-list"></ul>
        </div>
      </div>
      <!-- The Skills destination (#222): decrowds the Character card by giving the 11
           SKILL_NAMES their own roomy one-row-per-Skill list plus the pets collection strip,
           both formerly crammed onto the Character card. Own fixed shell mirroring
           World/Bank/Workshop/Activity above — only the Skill list scrolls, the pets strip stays
           put. See styles.css's .skills-page-body. -->
      <div data-management-page="skills" class="skills-page-body" hidden>
        <ul id="skills-list" class="card-scroll"></ul>
        <div class="card-fixed">
          <div id="pets-summary" class="pets-summary">
            <button data-nav="pets" title="Pets" aria-expanded="false">
              <span aria-hidden="true">🐾</span>
              <span id="pets-summary-count"></span>
            </button>
            <div id="pets-popover" class="pets-popover" hidden>
              <div id="pets-grid" class="tile-grid"></div>
            </div>
          </div>
        </div>
      </div>
    </section>
    </div>
    <section id="compact-widget" data-tauri-drag-region="deep">
    <div id="main-column">
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
            <div id="monster-bar" class="sprite-hp" hidden aria-label="Monster health"><div id="monster-hp-fill" class="fill"></div></div>
            <div id="monster-splats" class="splat-layer"></div>
          </div>
          <div id="player-sprite-wrap" class="sprite-wrap">
            <img id="player-sprite" class="sprite pixel" src="${playerSprite}" alt="Player" />
            <div id="player-bar" class="sprite-hp" hidden aria-label="Player health"><div id="player-hp-fill" class="fill"></div></div>
            <div id="player-splats" class="splat-layer"></div>
          </div>
        </div>
        <div id="no-food-warning" role="status" title="No active Food" hidden>No active Food</div>
        <div id="widget-controls">
          <button id="menu-toggle" data-menu title="Menu" aria-label="Menu">
            <img class="tab-icon pixel" src="${tabIcon("character")}" alt="" />
          </button>
          <button id="close-btn" title="Close SideScape" aria-label="Close SideScape">✕</button>
        </div>
      </section>
      <div id="loot-strip">
        <span id="loot-strip-count"></span>
        <ul id="loot-strip-items"></ul>
        <button id="loot-strip-all-btn" data-loot-all>Loot all</button>
      </div>
    </div>
    </section>`;

  // The deep, mounted Loadout Slot UI module (#235): owns all four Loadout Slot kinds' chooser
  // state, Item eligibility, Rune-level gating, tile markup, DOM listeners, and Engine command
  // dispatch — see loadout-slot.ts's own doc comment. Constructed after `root.innerHTML` above has
  // painted the four stable roots it queries (`#character-food-slots`/`#potion-slot`/
  // `#quiver-slot`/`#rune-slot`). `onChanged` is this module's own top-level `render()` (hoisted,
  // declared below), so a Loadout Slot action reaches the rest of the app exactly like any other
  // Engine-command click.
  const loadoutSlotUi: LoadoutSlotUi = createLoadoutSlotUi({
    root,
    content,
    commands: engine,
    tileMarkup,
    onChanged: () => render(),
  });

  void syncScaleSelector();

  // One splat per resolved swing (#86) — the player's own attacks land on the Monster's side,
  // the Monster's land on the player's; fires during engine.tick() itself, not the following
  // render(), so the splat cadence exactly matches Engine-resolved attacks regardless of how
  // often render() happens to run.
  engine.on("attack", (e) => {
    showSplat(el(e.actor === "player" ? "#monster-splats" : "#player-splats"), e.damage);
  });
  engine.on("kill", (e) => feedLine(`Killed ${content.monstersById.get(e.monsterId)?.name}`));
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
    // #221: `element` is only set for a DEPLETED (but still loaded) Rune Slot; a truly empty slot
    // has no Spell at all, so it falls back to a Spell-agnostic message rather than "undefined".
    const text =
      e.need === "arrow"
        ? "🏹 Out of arrows!"
        : e.element
          ? `🔮 Out of ${e.element} runes!`
          : "🔮 No rune loaded!";
    showToast(text);
    feedLine(`⚠ ${text}`, "overflow");
  });
  // Pet drop (#120): a never-before-owned pet — celebratory, reusing the rare-Drop band's own
  // screen-flash + toast + feed-line treatment (the issue's own "reuse the rare-drop band/flash
  // presentation" instruction), rather than inventing a parallel severity.
  engine.on("pet-dropped", (e) => {
    const name = content.petsById.get(e.petId)?.name ?? e.petId;
    const text = `🐾 New pet: ${name}!`;
    feedLine(text, "pet-dropped");
    showToast(text);
    triggerRareFlash();
  });
  engine.on("wave-cleared", (e) => feedLine(`Wave ${e.wave}/${e.totalWaves} cleared`));
  engine.on("dungeon-completed", (e) => {
    const def = content.dungeonsById.get(e.dungeonId);
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
  engine.on("levelup", () => renderWorldPage()); // Fishing-Spot levelReq gates are level-driven
  engine.on("dungeon-completed", () => renderWorldPage()); // Area gates flip on Dungeon completion

  // Character section headers (#134): one delegated listener on the whole tab-panel rather than one
  // per header, mirroring #management-row's own closest()-based delegation below. A click anywhere
  // that isn't a `button[data-section]` (e.g. inside a section body) is a no-op.
  el("#style-row").addEventListener("click", (event) => {
    const style = (event.target as HTMLElement).dataset["style"] as CombatStyle | undefined;
    if (style) {
      engine.setCombatStyle(style);
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

  // Bank filter buttons (#207): six always-visible kind filters plus "all"; re-clicking the active
  // filter is a no-op (unlike Bank tile selection, there's no "unfiltered by re-click" gesture —
  // "all" is itself the reachable no-filter state).
  el("#bank-filter-row").addEventListener("click", (event) => {
    const filter = (event.target as HTMLElement).closest<HTMLElement>("[data-bank-filter]")
      ?.dataset["bankFilter"];
    if (!filter || !(BANK_FILTERS as readonly string[]).includes(filter)) return;
    bankPresentation.setFilter(filter as BankFilter);
    render();
  });

  // Bank search (#207): session-only, filters as you type; cleared on its own whenever the Bank
  // Management destination closes (see `syncWorkspace`'s `previousManagement` tracking).
  el<HTMLInputElement>("#bank-search").addEventListener("input", (event) => {
    bankPresentation.setSearch((event.target as HTMLInputElement).value);
    render();
  });

  // Bank sort select (#207): replaces the old Kind|Value|Name button row (`#sort-row`) with a
  // single `<select>`, per the issue's own "sort select: Name, Kind, Value" shell description.
  el<HTMLSelectElement>("#bank-sort-select").addEventListener("change", (event) => {
    const value = (event.target as HTMLSelectElement).value;
    if (!(SORT_KEYS as readonly string[]).includes(value)) return;
    bankPresentation.setSort(value as SortKey);
    render();
  });

  // Menu button (#206): always-visible in the compact widget, toggling Character alone open or
  // closing both cards — see `onMenuToggle`'s own doc comment above.
  el("#menu-toggle").addEventListener("click", onMenuToggle);

  // Management card's Back control (#206) and Skills page's Pets popover toggle (#222: pets moved
  // off the Character card onto the Skills destination, so its `data-nav="pets"` hook now lives
  // inside `#card-management` — same toggle shape as the Character hub's own Settings popover
  // below).
  el("#card-management").addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    if (target.closest("[data-management-back]")) {
      backToCharacter();
      return;
    }
    const navBtn = target.closest<HTMLElement>("[data-nav]");
    if (navBtn?.dataset["nav"] === "pets") {
      openPetsPopover = !openPetsPopover;
      renderWorkspace();
    }
  });

  // Character hub's own header nav / Expand Bank / Settings popover (#206), delegated on
  // the whole card so nested `<img>`/`<span>` clicks resolve via `closest`. Checked in a stable
  // order: a destination click (World/Workshop/Activity/Skills nav buttons, the Skills summary
  // line, or the Bank tray's "Expand Bank" button — all carry `data-destination`) before the
  // Settings popover toggle.
  el("#card-character").addEventListener("click", async (event) => {
    const target = event.target as HTMLElement;
    const scaleValue = target.closest<HTMLButtonElement>("[data-ui-scale]")?.dataset["uiScale"];
    if (scaleValue) {
      await windowChrome.setScale?.(Number(scaleValue) as 1 | 1.5 | 2);
      await syncScaleSelector();
      return;
    }
    const destinationBtn = target.closest<HTMLElement>("[data-destination]");
    if (destinationBtn) {
      void openDestination(destinationBtn.dataset["destination"] as ManagementDestination);
      return;
    }
    const navBtn = target.closest<HTMLElement>("[data-nav]");
    if (!navBtn) return;
    const nav = navBtn.dataset["nav"];
    if (nav === "settings") {
      openSettings = !openSettings;
      renderWorkspace();
    }
  });

  // Gear Slot tiles (#206): an empty slot's `[+]` opens/closes its Bank-Equipment chooser; picking
  // a chooser entry equips it directly (mirrors the Loadout Slot dispatch order — assign check
  // before the add/toggle check).
  el("#character-slots").addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const assignBtn = target.closest<HTMLElement>("[data-gear-assign]");
    if (assignBtn) {
      engine.equip(assignBtn.dataset["gearAssign"] as string); // logs its own feed line via "equipped"
      openGearChooserSlot = null;
      render();
      return;
    }
    const addBtn = target.closest<HTMLElement>("[data-gear-add]");
    if (addBtn) {
      const slot = addBtn.dataset["gearAdd"] as GearSlot;
      openGearChooserSlot = openGearChooserSlot === slot ? null : slot; // re-click dismisses
      render();
    }
  });

  // Gear Slot chooser dismissal (#235): closes on a click anywhere in the SideScape document
  // outside the active `.gear-slot-chooser` and outside its matching `[data-gear-add]` toggle, or
  // on the window losing focus (the user clicked another app or the desktop). Both a toggle click
  // (open/re-click-close, handled above) and a chooser selection click (`[data-gear-assign]`,
  // inside `.gear-slot-chooser`) bubble up to this same document listener on the SAME click that
  // opened or resolved the chooser — the two `closest` checks below skip those so this handler
  // never fights the #character-slots handler's own toggle/selection outcome for that click.
  // `closeGearChooser`'s own `openGearChooserSlot === null` guard makes every other call a no-op.
  document.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    if (target.closest(".gear-slot-chooser") || target.closest("[data-gear-add]")) return;
    closeGearChooser();
  });
  window.addEventListener("blur", () => closeGearChooser());

  // Bank|Vendor compact toggle inside the Management card's "bank" destination (#206) — purely
  // presentational; doesn't change which destination is open, so a plain visibility sync is
  // enough (no full render() needed).
  el("#bank-vendor-toggle").addEventListener("click", (event) => {
    const page = (event.target as HTMLElement).closest<HTMLElement>("[data-bankpage]")?.dataset[
      "bankpage"
    ];
    if (page !== "bank" && page !== "vendor") return;
    managementBankPage = page;
    renderWorkspace();
  });

  // Transparent-glass click (#206): clicking the bare union background (document.body itself, not
  // any card inside it) always closes both cards.
  document.body.addEventListener("click", (event) => {
    if (event.target === document.body) closeWorkspace();
  });

  // Escape (#206): closes the Management card back to Character first, then closes Character —
  // see `onEscape`'s own doc comment above.
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") onEscape();
  });

  // World page's selected-Area detail (#208, formerly #picker): dispatches the existing
  // Monster/Fishing Spot/Dungeon commands, unchanged from the pre-#208 flat picker. A locked
  // Area's buttons carry `disabled`, so they never fire a click here — no extra guard needed
  // (mirrors the Spell picker's own disabled-button reasoning above).
  el("#area-detail").addEventListener("click", (event) => {
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

  // World page's progression rail (#208): selecting a row is session-only presentation state
  // (`selectedAreaId`) — it never calls the Engine, unlike the detail buttons above. A locked
  // Area's row stays selectable (inspection is allowed; only its activity controls are
  // `disabled`), so there's no locked-guard here either.
  el("#area-rail").addEventListener("click", (event) => {
    const row = (event.target as HTMLElement).closest<HTMLElement>("[data-area-select]");
    if (!row) return;
    selectedAreaId = row.dataset["areaSelect"] ?? null;
    render();
  });

  // Bank grid (#78): clicking a tile selects it (re-clicking the already-selected tile
  // deselects), driving the detail strip below — the grid itself never calls the Engine.
  el("#bank").addEventListener("click", (event) => {
    const tile = (event.target as HTMLElement).closest<HTMLElement>(".tile[data-item]");
    if (!tile) return;
    const itemId = tile.dataset["item"];
    if (!itemId) return;
    bankPresentation.toggleSelection(itemId);
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

  // Character hub's embedded Equipment-only Bank tray (#206): mirrors the full Bank grid's own
  // select/deselect-tile behavior above, over the same shared `bankPresentation` selection (#207,
  // #237) — selecting an Equipment tile here also drives the full Bank page's own detail strip,
  // and vice versa.
  el("#character-bank-tray").addEventListener("click", (event) => {
    const tile = (event.target as HTMLElement).closest<HTMLElement>(".tile[data-item]");
    if (!tile) return;
    const itemId = tile.dataset["item"];
    if (!itemId) return;
    bankPresentation.toggleSelection(itemId);
    render();
  });

  // Character hub's embedded tray detail strip (#206): mirrors the full Bank detail strip's own
  // sell-before-equip dispatch order above.
  el("#character-bank-detail").addEventListener("click", (event) => {
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

  // The four Loadout Slot listeners (Food bar, Potion, Quiver, Rune Slot) are now owned entirely
  // by `loadoutSlotUi` (#235) — constructed above, right after `root.innerHTML` painted its four
  // stable roots. See loadout-slot.ts's own doc comment for the shared dispatch order and state.

  // Vendor tab panel (#119): a fixed-price Buy control per row, mirroring the Smithing/Cooking/
  // Crafting/Herblore recipe lists' single Craft-button dispatch shape.
  el("#vendor-list").addEventListener("click", (event) => {
    const itemId = (event.target as HTMLElement).dataset["vendorBuy"];
    if (!itemId) return;
    engine.buy(itemId, 1); // logs its own feed line via the item-bought subscription below
    render();
  });

  // Loot All (#206, wired into the compact widget's own Loot Strip by #220): the compact widget's
  // Loot Strip button is the sole Loot Zone UI (#243), so this is the only handler and the only
  // element it is wired to.
  function handleLootAll(): void {
    const before = engine.snapshot().lootZone.length;
    engine.lootAll(); // logs its own feed line via the looted subscription above, if anything moved
    const after = engine.snapshot().lootZone.length;
    render();
    // If something moved, the looted listener above already logged the leftover check itself; this
    // covers the otherwise-silent case where the sweep moved nothing at all (no looted event fires).
    if (after > 0 && after === before) {
      feedLine("⚠ Bank full — loot left behind", "overflow");
    }
  }
  el("#loot-strip-all-btn").addEventListener("click", handleLootAll);

  el("#buy-slots-btn").addEventListener("click", () => {
    engine.buyBankSlots();
    feedLine(`Bank expanded to ${engine.snapshot().bank.capacity} slots`);
    render();
  });

  // Workshop's four-button Production Skill selector (#209): clicking a button is session-only
  // presentation state (mirrors the World rail's `selectedAreaId` and the Bank/Vendor toggle's
  // `managementBankPage`) — it never calls the Engine, just swaps which Skill's recipe body shows.
  el("#workshop-skill-row").addEventListener("click", (event) => {
    const skill = (event.target as HTMLElement).closest<HTMLElement>("[data-production-skill]")
      ?.dataset["productionSkill"] as ProductionSkill | undefined;
    if (!skill) return;
    selectedProductionSkill = skill;
    render();
  });

  // Workshop's single recipe list (#209: replaces the four former per-skill listeners this used
  // to need — one descriptor-driven list at a time instead of four permanently-stacked ones).
  el("#workshop-recipes").addEventListener("click", (event) => {
    const recipeId = (event.target as HTMLElement).dataset["recipe"];
    if (!recipeId) return;
    engine.selectRecipe(recipeId); // logs its own feed line via the item-crafted subscription
    render();
  });

  render(); // includes renderWorldPage() (#208)
  // Both cards start closed (#206: workspace state is session-only, never restored across a
  // relaunch) and notifies WorkspaceChrome of zero open cards once up front, so the real Tauri
  // adapter (main.ts) sizes/positions the OS window to match on every mount, not just on the next
  // toggle.
  syncWorkspace();

  return { render };
}
