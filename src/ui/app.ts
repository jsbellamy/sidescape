import type { Engine } from "../core/engine";
import type { SkillName, Snapshot } from "../core/types";
import type { ResolvedContent } from "../core/validate-content";
import {
  monsterSprite,
  monsterSpriteSize,
  playerSprite,
  playerSpriteSize,
  spriteEdgePx,
} from "./sprites";
import type { ProductionSkill } from "./production";
import { createBankUi } from "./bank-ui";
import type { BankUi } from "./bank-ui";
import { PRODUCTION_SKILLS, productionPanelMarkup, resolveProp } from "./production";
import { createLoadoutSlotUi } from "./loadout-slot";
import type { LoadoutSlotUi } from "./loadout-slot";
import { resolveTheme } from "./theme";
import { createWorldPageUi } from "./world-page";
import type { WorldPageUi } from "./world-page";
import { skillIcon, tabIcon } from "./icons";
import { createItemPresentation } from "./item-presentation";
import type { WorkspaceChrome } from "./workspace-chrome";
import { createCharacterHubUi } from "./character-hub";
import type { CharacterHubUi } from "./character-hub";
import { createSkillsPageUi } from "./skills-page";
import type { SkillsPageUi } from "./skills-page";
import type { UiScale } from "./window-geometry";

/** Damage-splat fade duration (#4); mirrors styles.css's `splat-fade` keyframes so the DOM node is
 * removed right as the CSS animation finishes. */
const SPLAT_FADE_MS = 700;
/** Level-up toast auto-dismiss delay (#4). */
const TOAST_DISMISS_MS = 2500;
/** Rare-Drop screen-flash duration (#4); mirrors styles.css's `rare-flash` keyframes. */
const FLASH_DURATION_MS = 400;
/** Combat-style Skills (#285) — the only Skills a floating xp-gained number renders for. Excludes
 * Hitpoints (pinned decision: exactly one floated number per hit, the style skill's 4*damage
 * grant; the ~1.33x damage Hitpoints trickle never floats) and non-combat Skills (fishing,
 * production, …). */
const COMBAT_STYLE_SKILLS: ReadonlySet<SkillName> = new Set([
  "attack",
  "strength",
  "defence",
  "ranged",
  "magic",
]);

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

/** The two Management Row cards (#206: replaces the three-card World/Character/Resources
 * workspace) — a fixed Character hub plus one shared Management card whose body swaps between
 * four destinations. */
// #222 — APPEND ONLY. This array's order is load-bearing (it backs the nav order and the
// ManagementDestination union); never insert earlier, only push a new destination onto the end.
export const MANAGEMENT_DESTINATIONS = ["world", "bank", "workshop", "activity", "skills"] as const;
export type ManagementDestination = (typeof MANAGEMENT_DESTINATIONS)[number];

/** Presentation-only, session-only workspace state (#206) — never persisted under any key (a
 * relaunch always starts with both cards closed) and never entering the Engine Snapshot/save.
 * `characterOpen` and `management` independently track the two Management Row cards; stale
 * `sidescape-ui-workspace-v2`/`sidescape-ui-panels` values that a pre-#206 build may have left in
 * localStorage are never read any more. */
interface WorkspaceState {
  characterOpen: boolean;
  management: ManagementDestination | null;
}

/** Handle returned by `mountApp` for driving re-renders after each Tick. */
export interface MountedApp {
  /** Re-renders the scene from the Engine's current Snapshot. Call after every `engine.tick()`. */
  render(): void;
  /** Tears down every mounted deep module's DOM listeners. Idempotent. */
  dispose(): void;
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
  let selectedProductionSkill: ProductionSkill = "smithing";
  const items = createItemPresentation(content);

  // Combat feedback (#4) — damage splats, level-up toast, rare-Drop flash. Purely presentational:
  // reacts to the Engine's own events, adding no new Engine state.
  let flashTimer: ReturnType<typeof setTimeout> | undefined;

  // Scene backdrop (#80): the most recently resolved Area id, remembered so idle stretches (e.g.
  // right after a Dungeon completes and ejects to idle) keep showing that Area's theme instead of
  // reverting to the first-unlocked one — see resolveTheme's own doc for the full priority order.
  // Presentation-only, in-memory (never the Snapshot/save), same boundary as bankPresentation's
  // own sort/filter state.
  let lastAreaId: string | null = null;

  /** Shows/hides the two Management Row cards and the Management card's four destination page
   * bodies, and mirrors workspace visibility onto the DOM (#206). DOM
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

    el<HTMLElement>("#menu-toggle").classList.toggle(
      "active",
      workspace.characterOpen || workspace.management !== null,
    );
    // Collapse the whole row when both cards are closed, so the transparent union has no phantom
    // CARD_GAP above/below the compact widget — the window is exactly compact-sized while closed.
    el<HTMLElement>("#management-row").hidden =
      !workspace.characterOpen && workspace.management === null;
  }

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
    bankUi.setDestinationOpen(workspace.management === "bank");

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

  /** "Back to Character / second-card close" (#206): always returns to Character alone, whether
   * triggered from the Management card's own Back control or (indirectly) from Escape. */
  function backToCharacter(): void {
    workspace.management = null;
    workspace.characterOpen = true;
    syncWorkspace();
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

  /** Appends a Skill-labelled `+N` XP row above the player's health bar. The lane is a normal
   * bottom-anchored column, so appending leaves newer gains nearest the bar while each row keeps
   * its own fade/removal timer. */
  function showXpGain(lane: HTMLElement, skill: SkillName, amount: number): void {
    const gain = document.createElement("span");
    gain.className = "xp-gain";
    gain.dataset["xpSkill"] = skill;

    const icon = document.createElement("img");
    icon.className = "xp-gain-icon pixel";
    icon.src = skillIcon(skill);
    icon.alt = "";

    const amountLabel = document.createElement("span");
    amountLabel.className = "xp-gain-amount";
    amountLabel.textContent = `+${Math.round(amount)}`;

    gain.append(icon, amountLabel);
    lane.appendChild(gain);
    setTimeout(() => gain.remove(), SPLAT_FADE_MS);
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
    const lines = items.detailLines(itemId);
    el<HTMLElement>("#item-tooltip").innerHTML =
      `<p class="tooltip-name">${items.name(itemId)}</p>` +
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

  /** Renders the scene's parallax backdrop (#80): resolves the current Theme via `resolveTheme`
   * (UI-only, ADR-0001 — the Engine has no notion of "theme") and stamps it onto `#backdrop`'s
   * `data-theme` attribute, which styles.css keys each layer's background off of; also resolves
   * and shows/hides the fixed activity-selected near-scene overlay (kept behind the independently
   * rendered player and transient foreground effects — see production.ts's `resolveProp`).
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
        // Size the box to this Monster's native canvas x grain (32-native → 64px, 48-native →
        // 96px, 64-native → 128px), so visual scale never changes the shared pixel grain.
        const nativeSize = monsterSpriteSize(monster.id);
        if (nativeSize)
          monsterImg.style.setProperty("--sprite-edge", `${spriteEdgePx(nativeSize)}px`);
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
          `<button class="loot-chip tile" data-item="${s.itemId}">${items.tileMarkup(s.itemId, s.qty)}</button>`,
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
      snap.production,
    );
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
    worldPageUi.render(snap);
    loadoutSlotUi.render(player, bank.items);
    renderCastingReadout(player.spell);
    skillsPageUi.render(player);
    characterHubUi.render(player, bank.items);
    renderLootStrip(snap.lootZone);
    bankUi.render(snap);
    renderWorkshopPage();
  }

  root.innerHTML = `
    <div id="flash-overlay"></div>
    <div id="item-tooltip" class="item-tooltip" hidden></div>
    <div id="management-row" class="management-row">
    <section id="card-character" hidden></section>
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
      <div id="world-page-host" data-management-page="world" class="world-page-body" hidden></div>
      <div id="bank-destination-host"></div>
      <div id="skills-page-host" data-management-page="skills" class="skills-page-body" hidden></div>
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
            <img id="player-sprite" class="sprite pixel" src="${playerSprite}" alt="Player" style="--sprite-edge: ${spriteEdgePx(playerSpriteSize)}px" />
            <div id="player-xp-lane" class="player-xp-lane" aria-hidden="true"></div>
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

  // The deep, mounted Character hub module (#326): owns the Character card shell, Gear Slot
  // chooser state, player controls, Settings visibility, Character navigation dispatch, and
  // listener lifecycle — see character-hub.ts's own doc comment. Constructed after the top-level
  // Cards-on-Glass hosts above have painted `#card-character`, before Loadout and Bank tray wiring.
  const characterHubUi: CharacterHubUi = createCharacterHubUi({
    host: el<HTMLElement>("#card-character"),
    content,
    commands: engine,
    onChanged: () => render(),
    onDestinationRequested: (destination) => {
      void openDestination(destination);
    },
    onScaleRequested: async (scale: UiScale) => {
      await windowChrome.setScale?.(scale);
    },
    getScaleState: async () => ({
      selected: windowChrome.getScale?.() ?? 1,
      options:
        (await windowChrome.getScaleOptions?.()) ??
        ([
          { value: 1, supported: true },
          { value: 1.5, supported: true },
          { value: 2, supported: true },
        ] as const),
    }),
  });

  const bankUi: BankUi = createBankUi({
    trayHost: el<HTMLElement>("#card-character"),
    destinationHost: el<HTMLElement>("#bank-destination-host"),
    content,
    commands: {
      sell: engine.sell.bind(engine),
      equip: engine.equip.bind(engine),
      buy: engine.buy.bind(engine),
      buyBankSlots: () => {
        engine.buyBankSlots();
        feedLine(`Bank expanded to ${engine.snapshot().bank.capacity} slots`);
      },
    },
    onChanged: () => render(),
  });

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
    onChanged: () => render(),
  });

  // The deep, mounted World Management destination (#325): owns session Area selection, World
  // rendering, and Monster/Fishing Spot/Dungeon dispatch inside `#world-page-host` — see
  // world-page.ts's own doc comment.
  const worldPageUi: WorldPageUi = createWorldPageUi({
    host: el<HTMLElement>("#world-page-host"),
    content,
    commands: engine,
    onChanged: () => render(),
  });

  // The deep, mounted Skills Management destination (#328): owns skill rows, XP/progress, total
  // level, and Pets summary/popover/roster inside `#skills-page-host` — see skills-page.ts.
  const skillsPageUi: SkillsPageUi = createSkillsPageUi({
    host: el<HTMLElement>("#skills-page-host"),
    content,
  });

  // One splat per resolved swing (#86) — the player's own attacks land on the Monster's side,
  // the Monster's land on the player's; fires during engine.tick() itself, not the following
  // render(), so the splat cadence exactly matches Engine-resolved attacks regardless of how
  // often render() happens to run.
  engine.on("attack", (e) => {
    showSplat(el(e.actor === "player" ? "#monster-splats" : "#player-splats"), e.damage);
  });
  // Skill-labelled combat XP above the player health bar (#308) — only for attack/strength/
  // defence/ranged/magic; never Hitpoints (one row per hit) or fishing/production XP. The lane
  // can be absent while markup is being changed in development, so this is intentionally a safe
  // query instead of `el()`, which assumes presence.
  engine.on("xp-gained", (e) => {
    if (!COMBAT_STYLE_SKILLS.has(e.skill)) return;
    const lane = root.querySelector<HTMLElement>("#player-xp-lane");
    if (!lane) return;
    showXpGain(lane, e.skill, e.amount);
  });
  engine.on("kill", (e) => feedLine(`Killed ${content.monstersById.get(e.monsterId)?.name}`));
  engine.on("drop", (e) => feedLine(`+${e.qty} ${items.name(e.itemId)}`, `drop-${e.band}`));
  engine.on("drop", (e) => {
    if (e.band === "rare") triggerRareFlash();
  });
  engine.on("levelup", (e) => feedLine(`⭐ ${e.skill} level ${e.level}!`, "levelup"));
  engine.on("levelup", (e) => showToast(`⭐ ${e.skill} level ${e.level}!`));
  engine.on("death", () => feedLine("💀 You died — respawning…", "death"));
  engine.on("food-eaten", (e) => feedLine(`🍖 Ate ${items.name(e.itemId)} (+${e.healed})`, "eat"));
  engine.on("item-sold", (e) => feedLine(`Sold ${items.name(e.itemId)} (+${e.gold}g)`, "sell"));
  engine.on("overflow-sold", (e) =>
    feedLine(`⚠ Bank full — sold ${items.name(e.itemId)} (+${e.gold}g)`, "overflow"),
  );
  engine.on("overflow-lost", (e) =>
    feedLine(`⚠ Bank full — ${items.name(e.itemId)} lost!`, "overflow"),
  );
  engine.on("duplicate-sold", (e) =>
    feedLine(`⚠ Auto-sold duplicate ${items.name(e.itemId)} (+${e.gold}g)`, "overflow"),
  );
  // Loot Zone (#60): a sweep (auto-loot on leaving combat, or the Loot all button) banks whatever
  // fits and leaves the rest in the zone — check the post-sweep Snapshot for leftovers right here,
  // rather than a per-render check, so the warning fires once per sweep instead of spamming every
  // Tick while the zone sits non-empty.
  engine.on("looted", (e) => {
    if (e.items.length <= 3) {
      for (const item of [...e.items].reverse()) {
        feedLine(`Banked ${item.qty} ${items.name(item.itemId)}`, "loot");
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
      feedLine(`-${item.qty} ${items.name(item.itemId)}`, "dungeon-failed");
    }
    feedLine("💀 Run failed — loot lost!", "dungeon-failed");
  });
  engine.on("fish-caught", (e) =>
    feedLine(`🎣 Caught ${items.name(e.itemId)} (+${e.qty})`, "catch"),
  );
  engine.on("item-crafted", (e) => feedLine(`🔨 Crafted ${items.name(e.itemId)}`, "craft"));
  engine.on("equipped", (e) => feedLine(`Equipped ${items.name(e.itemId)}`));
  engine.on("item-bought", (e) =>
    feedLine(`Bought ${e.qty} ${items.name(e.itemId)} (-${e.gold}g)`, "buy"),
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
      feedLine(`+${item.qty} ${items.name(item.itemId)}`, `drop-${item.band}`);
    }
    feedLine("📦 Chest opened!", "chest-header");
  });

  // Menu button (#206): always-visible in the compact widget, toggling Character alone open or
  // closing both cards — see `onMenuToggle`'s own doc comment above.
  el("#menu-toggle").addEventListener("click", onMenuToggle);

  // Management card's Back control (#206).
  el("#card-management").addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    if (target.closest("[data-management-back]")) {
      backToCharacter();
    }
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
  // by `loadoutSlotUi` (#235) — see loadout-slot.ts's own doc comment.

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

  render(); // includes worldPageUi.render(snap) (#325)
  // Both cards start closed (#206: workspace state is session-only, never restored across a
  // relaunch) and notifies WorkspaceChrome of zero open cards once up front, so the real Tauri
  // adapter (main.ts) sizes/positions the OS window to match on every mount, not just on the next
  // toggle.
  syncWorkspace();

  let disposed = false;

  return {
    render,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      characterHubUi.dispose();
      worldPageUi.dispose();
      bankUi.dispose();
      skillsPageUi.dispose();
    },
  };
}
