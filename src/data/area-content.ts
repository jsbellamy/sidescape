import type {
  AreaDef,
  Content,
  DungeonDef,
  FishingSpotDef,
  ItemDef,
  MonsterDef,
  PetDef,
  RecipeDef,
  SpellDef,
  VendorEntry,
} from "../core/types";

export interface HostedDungeonContent {
  dungeon: Omit<DungeonDef, "areaId">;
  /** Monster definitions used only by this Dungeon's Waves/Boss. */
  monsters?: readonly MonsterDef[];
}

export interface AreaContent {
  area: Omit<AreaDef, "monsterIds" | "fishingSpotIds">;
  /** Open-world Monsters selectable directly in this Area. */
  monsters: readonly MonsterDef[];
  fishingSpots?: readonly FishingSpotDef[];
  dungeons?: readonly HostedDungeonContent[];
}

export interface SharedContent {
  items: ItemDef[];
  recipes: RecipeDef[];
  spells: SpellDef[];
  vendor: VendorEntry[];
  pets: PetDef[];
}

/** Preserves pre-#321 global monster order when early Dungeons shipped after the next Area existed. */
function dungeonMonsterEmissionAfterAreaId(hostAreaId: string, dungeonId: string): string {
  if (dungeonId === "meadow-depths") return "darkroot-forest";
  if (dungeonId === "darkroot-hollow") return "old-sewers";
  return hostAreaId;
}

/** Flattens Area bundles plus shared collections into the global Content shape. */
export function composeContent(
  areaBundles: readonly AreaContent[],
  shared: SharedContent,
): Content {
  const areas: AreaDef[] = [];
  const monsters: MonsterDef[] = [];
  const fishingSpots: FishingSpotDef[] = [];
  const dungeons: DungeonDef[] = [];

  const pendingDungeonMonsters: { afterAreaId: string; monsters: MonsterDef[] }[] = [];

  for (const bundle of areaBundles) {
    const monsterIds = bundle.monsters.map((monster) => monster.id);
    const fishingSpotIds = bundle.fishingSpots?.map((spot) => spot.id);

    areas.push({
      ...bundle.area,
      monsterIds,
      ...(fishingSpotIds && fishingSpotIds.length > 0 ? { fishingSpotIds } : {}),
    });

    monsters.push(...bundle.monsters);

    if (bundle.fishingSpots) {
      fishingSpots.push(...bundle.fishingSpots);
    }

    if (bundle.dungeons) {
      for (const hosted of bundle.dungeons) {
        if (hosted.monsters && hosted.monsters.length > 0) {
          pendingDungeonMonsters.push({
            afterAreaId: dungeonMonsterEmissionAfterAreaId(bundle.area.id, hosted.dungeon.id),
            monsters: [...hosted.monsters],
          });
        }
        dungeons.push({
          ...hosted.dungeon,
          areaId: bundle.area.id,
        });
      }
    }

    const ready = pendingDungeonMonsters.filter(
      (pending) => pending.afterAreaId === bundle.area.id,
    );
    for (const pending of ready) {
      monsters.push(...pending.monsters);
    }
    pendingDungeonMonsters.splice(
      0,
      pendingDungeonMonsters.length,
      ...pendingDungeonMonsters.filter((pending) => pending.afterAreaId !== bundle.area.id),
    );
  }

  if (pendingDungeonMonsters.length > 0) {
    throw new Error(
      `composeContent: unresolved dungeon-only monsters for areas: ${pendingDungeonMonsters.map((p) => p.afterAreaId).join(", ")}`,
    );
  }

  return {
    areas,
    monsters,
    items: shared.items,
    fishingSpots,
    dungeons,
    recipes: shared.recipes,
    spells: shared.spells,
    vendor: shared.vendor,
    pets: shared.pets,
  };
}
