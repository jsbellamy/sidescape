import { THEMES } from "../core/types";
import type { Snapshot, Theme } from "../core/types";
import type { ResolvedContent } from "../core/validate-content";
import { resolveActiveAreaId } from "./area-context";

/** `resolveTheme`'s return: the Theme to paint, plus (when it came from an actual Area) that
 * Area's id — callers use the id to remember "last-used" across idle stretches; Production's
 * `workshop` theme has no Area id (`workshop` is activity-resolved, not owned by any one Area). */
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
 * 1. Mid-Dungeon-run, or fighting/fishing in the open world: the shared `resolveActiveAreaId`
 *    (#236) resolver's host Area, in its own Dungeon → Monster → Fishing Spot order — see that
 *    module's doc for why Dungeon must be checked first.
 * 2. Production (a non-Area activity, #28): the shared `workshop` theme, no Area id.
 * 3. Idle (nothing selected): the last-used Area this session (`lastAreaId`, tracked by the
 *    caller — see app.ts), else the first unlocked Area, so the scene is never blank/flashing.
 */
export function resolveTheme(
  snap: Snapshot,
  content: ResolvedContent,
  lastAreaId: string | null,
): ResolvedTheme {
  const activeAreaId = resolveActiveAreaId(snap, content);
  const activeArea = activeAreaId ? content.areasById.get(activeAreaId) : undefined;
  if (activeArea) return { theme: activeArea.theme, areaId: activeArea.id };

  if (snap.production) {
    return { theme: "workshop", areaId: null };
  }

  // Idle: prefer the last-used Area (tracked by the caller across renders); an unrecognized id
  // (stale content, or never set) falls through to the first Area the Snapshot reports unlocked;
  // an empty/mismatched Content falls through once more to THEMES[0] so this never throws.
  const lastArea = lastAreaId ? content.areasById.get(lastAreaId) : undefined;
  if (lastArea) return { theme: lastArea.theme, areaId: lastArea.id };

  const firstUnlockedId = snap.areas.find((a) => a.unlocked)?.id;
  const firstUnlockedArea = firstUnlockedId ? content.areasById.get(firstUnlockedId) : undefined;
  if (firstUnlockedArea) return { theme: firstUnlockedArea.theme, areaId: firstUnlockedArea.id };

  const fallback = content.areas[0];
  return { theme: fallback?.theme ?? THEMES[0], areaId: fallback?.id ?? null };
}
