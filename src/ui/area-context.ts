import type { Snapshot } from "../core/types";
import type { ResolvedContent } from "../core/validate-content";

/**
 * Resolves the Area id hosting whatever activity (Dungeon/Monster/Fishing Spot) the Snapshot
 * currently has active (#236). This concentrates the "which Area hosts the currently active
 * activity?" traversal that `resolveTheme` (backdrop), `resolveSelectedArea` (World detail), and
 * the World rail's `current` accent each repeated independently — one shared, pure lookup, with
 * each caller keeping its own policy for what it does with the id.
 *
 * Returns only the Area id, never a Content `AreaDef`, Snapshot Area, Theme, or compound object:
 * callers need different shapes (backdrop needs the Content Area's Theme; World detail needs the
 * matching Snapshot Area; the rail needs only the id), so returning the id keeps those policies
 * separate while sharing the traversal itself.
 *
 * Resolution order (checked in this exact sequence, tolerant fallthrough on any unknown/mismatched
 * id rather than throwing):
 * 1. Dungeon: `content.dungeonsById.get(snap.dungeon.id)`'s `areaId`, if that Dungeon and Area both
 *    resolve through Content. Checked first because a Dungeon's later Waves/Boss are often
 *    Dungeon-only Monsters absent from every Area's `monsterIds` — the Monster branch alone
 *    couldn't resolve those, and `Snapshot.monster` names the current Wave/Boss during a run, so
 *    the Dungeon's own host is the authoritative source, not a fallback.
 * 2. Monster: the first Content Area (in `content.areas` order) whose `monsterIds` includes
 *    `snap.monster.id`.
 * 3. Fishing Spot: the first Content Area (in `content.areas` order) whose `fishingSpotIds`
 *    includes `snap.fishing.spotId`.
 * 4. `null` — nothing active, or every branch above fell through an unknown id. Production is
 *    deliberately never consulted here: it's a non-Area activity for backdrop purposes and each
 *    caller applies its own Production policy (e.g. `resolveTheme`'s shared `town` Theme).
 */
export function resolveActiveAreaId(
  snap: Pick<Snapshot, "dungeon" | "monster" | "fishing">,
  content: ResolvedContent,
): string | null {
  const dungeon = snap.dungeon;
  if (dungeon) {
    const dungeonDef = content.dungeonsById.get(dungeon.id);
    if (dungeonDef && content.areasById.has(dungeonDef.areaId)) {
      return dungeonDef.areaId;
    }
  }

  const monster = snap.monster;
  if (monster) {
    const area = content.areas.find((a) => a.monsterIds.includes(monster.id));
    if (area) return area.id;
  }

  const fishing = snap.fishing;
  if (fishing) {
    const area = content.areas.find((a) => (a.fishingSpotIds ?? []).includes(fishing.spotId));
    if (area) return area.id;
  }

  return null;
}
