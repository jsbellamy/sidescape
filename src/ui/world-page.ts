/** The deep, mounted World Management destination (#325): owns the World host's shell, session Area
 * selection, World-specific resolution policy, Area rail/detail rendering, click dispatch, and
 * listener lifecycle. `mountApp` paints only `#world-page-host` and constructs one instance via
 * `createWorldPageUi`. */

import type { Engine } from "../core/engine";
import type { DropTableEntry, Snapshot } from "../core/types";
import type { ResolvedContent } from "../core/validate-content";
import { resolveActiveAreaId } from "./area-context";
import { createItemPresentation } from "./item-presentation";

export type WorldPageCommands = Pick<
  Engine,
  "selectMonster" | "selectFishingSpot" | "enterDungeon"
>;

export interface WorldPageUi {
  render(snap: Snapshot): void;
  dispose(): void;
}

export interface WorldPageUiOptions {
  host: HTMLElement;
  content: ResolvedContent;
  commands: WorldPageCommands;
  onChanged(): void;
}

/** Renders a per-kill chance as a short human-readable fraction (e.g. "1/24") when the chance
 * is (near enough) an exact reciprocal, falling back to a percentage otherwise (e.g. "30%"). */
function formatChance(chance: number): string {
  const inverse = 1 / chance;
  const rounded = Math.round(inverse);
  return Math.abs(inverse - rounded) < 0.01 ? `1/${rounded}` : `${Math.round(chance * 100)}%`;
}

export function createWorldPageUi(options: WorldPageUiOptions): WorldPageUi {
  const { host, content, commands, onChanged } = options;
  const items = createItemPresentation(content);

  // World page's own selected-Area progression rail (#208): which Area's Monsters/Fishing
  // Spots/Dungeon show in the selected-detail section. Session-only presentation state — selecting
  // a rail row never starts/cancels an activity and never touches the Snapshot/save.
  let selectedAreaId: string | null = null;

  host.innerHTML = `
    <!-- The World destination (#208) owns its own fixed shell — the progression rail never
         scrolls, only the selected-Area detail does, so the rail stays put while a long detail
         (e.g. many Monsters) scrolls under it. See styles.css's .world-page-body. -->
    <div class="world-page-body">
      <div id="area-rail" class="area-rail" role="tablist"></div>
      <div id="area-detail" class="area-detail card-scroll"></div>
    </div>`;

  function el<T extends HTMLElement>(selector: string): T {
    return host.querySelector(selector) as T;
  }

  /** One tooltip line per Drop Table entry: item name, quantity, band, and human-readable chance. */
  function dropEntryLine(entry: DropTableEntry): string {
    const chanceLabel =
      entry.band === "guaranteed" ? "always" : `${entry.band} ${formatChance(entry.chance)}`;
    return `${items.name(entry.itemId)} ×${entry.qty} — ${chanceLabel}`;
  }

  /** `title` tooltip text previewing a Monster's full Drop Table. */
  function dropTableTooltip(monsterId: string): string {
    const def = content.monstersById.get(monsterId);
    return def ? def.dropTable.map(dropEntryLine).join("\n") : "";
  }

  /** "🔒 Clear <dungeon name>" for a locked Area's picker label, read straight from the
   * Snapshot's derived `gatedBy` (#24/#87: Engine keeps gate rules internal, UI never walks
   * raw Content for them). */
  function lockClearLabel(area: Snapshot["areas"][number]): string {
    return `🔒 Clear ${area.gatedBy?.name ?? "?"}`;
  }

  /**
   * Resolves which Snapshot Area's detail the World page's progression rail shows selected right
   * now (#208) — a pure function over the Snapshot (plus the session-only `selectedAreaId`
   * closed-over state). Priority:
   * 1. `selectedAreaId`, if it still names a Snapshot Area (stale/never-set falls through);
   * 2. the shared `resolveActiveAreaId` (#236) resolver's host Area id, if it names a Snapshot
   *    Area;
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
        const bar =
          active && snap.fishing
            ? `<div class="action-progress" aria-label="Catch progress"><div class="fill" style="width:${snap.fishing.progress * 100}%"></div></div>`
            : "";
        return `<span class="fishing-spot-item"><button data-spot="${id}" class="${active ? "active" : ""}" ${unlocked ? "" : "disabled"}>🎣 ${def?.name ?? id}</button>${bar}</span>`;
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

  function onAreaDetailClick(event: Event): void {
    const target = event.target as HTMLElement;
    const monsterId = target.dataset["monster"];
    if (monsterId) {
      commands.selectMonster(monsterId);
      onChanged();
      return;
    }
    const spotId = target.dataset["spot"];
    if (spotId) {
      commands.selectFishingSpot(spotId);
      onChanged();
      return;
    }
    const dungeonId = target.dataset["dungeon"];
    if (dungeonId) {
      commands.enterDungeon(dungeonId);
      onChanged();
    }
  }

  function onAreaRailClick(event: Event): void {
    const row = (event.target as HTMLElement).closest<HTMLElement>("[data-area-select]");
    if (!row) return;
    selectedAreaId = row.dataset["areaSelect"] ?? null;
    onChanged();
  }

  const areaDetail = el("#area-detail");
  const areaRail = el("#area-rail");
  areaDetail.addEventListener("click", onAreaDetailClick);
  areaRail.addEventListener("click", onAreaRailClick);

  let disposed = false;

  return {
    render(snap: Snapshot): void {
      const selectedArea = resolveSelectedArea(snap);
      const activeAreaId = resolveActiveAreaId(snap, content);
      renderAreaRail(snap, selectedArea?.id, activeAreaId);
      renderAreaDetail(snap, selectedArea);
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      areaDetail.removeEventListener("click", onAreaDetailClick);
      areaRail.removeEventListener("click", onAreaRailClick);
    },
  };
}
