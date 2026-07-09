import { THEMES } from "../core/types";
import type { Content, Snapshot, Theme } from "../core/types";

/** `resolveTheme`'s return: the Theme to paint, plus (when it came from an actual Area) that
 * Area's id — callers use the id to remember "last-used" across idle stretches; Smithing's `town`
 * theme has no Area id (`town` is shared, not owned by any one Area). */
export interface ResolvedTheme {
  theme: Theme;
  areaId: string | null;
}

/**
 * Resolves which scene backdrop Theme to show right now (#80). Theme resolution is a UI-only
 * concern per ADR-0001 (the #20 Engine/Snapshot boundary — the Engine has no notion of "theme");
 * this is a pure function over the Snapshot and Content the UI already has, never the Engine
 * itself.
 *
 * Priority, matching the issue's owner-decided rules:
 * 1. Mid-Dungeon-run: the Dungeon's HOST Area's theme. Checked before the Monster branch because
 *    a Dungeon's later Waves (and its Boss) are often dungeon-only Monsters absent from every
 *    Area's `monsterIds` — the monster branch alone couldn't resolve those.
 * 2. Fighting/fishing in the open world: the Area holding that Monster/Fishing Spot.
 * 3. Smithing (a non-Area activity, #28): the shared `town` theme, no Area id.
 * 4. Idle (nothing selected): the last-used Area this session (`lastAreaId`, tracked by the
 *    caller — see app.ts), else the first unlocked Area, so the scene is never blank/flashing.
 */
export function resolveTheme(
  snap: Snapshot,
  content: Content,
  lastAreaId: string | null,
): ResolvedTheme {
  const dungeon = snap.dungeon;
  if (dungeon) {
    const dungeonDef = content.dungeons.find((d) => d.id === dungeon.id);
    const area = dungeonDef && content.areas.find((a) => a.id === dungeonDef.areaId);
    if (area) return { theme: area.theme, areaId: area.id };
  }

  const monster = snap.monster;
  if (monster) {
    const area = content.areas.find((a) => a.monsterIds.includes(monster.id));
    if (area) return { theme: area.theme, areaId: area.id };
  }

  const fishing = snap.fishing;
  if (fishing) {
    const area = content.areas.find((a) => (a.fishingSpotIds ?? []).includes(fishing.spotId));
    if (area) return { theme: area.theme, areaId: area.id };
  }

  if (snap.smithing) {
    return { theme: "town", areaId: null };
  }

  // Idle: prefer the last-used Area (tracked by the caller across renders); an unrecognized id
  // (stale content, or never set) falls through to the first Area the Snapshot reports unlocked;
  // an empty/mismatched Content falls through once more to THEMES[0] so this never throws.
  const lastArea = lastAreaId ? content.areas.find((a) => a.id === lastAreaId) : undefined;
  if (lastArea) return { theme: lastArea.theme, areaId: lastArea.id };

  const firstUnlockedId = snap.areas.find((a) => a.unlocked)?.id;
  const firstUnlockedArea = firstUnlockedId
    ? content.areas.find((a) => a.id === firstUnlockedId)
    : undefined;
  if (firstUnlockedArea) return { theme: firstUnlockedArea.theme, areaId: firstUnlockedArea.id };

  const fallback = content.areas[0];
  return { theme: fallback?.theme ?? THEMES[0], areaId: fallback?.id ?? null };
}
