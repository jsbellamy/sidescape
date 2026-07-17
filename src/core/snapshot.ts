import { weakSpot } from "./combat";
import { ATTACK_TYPES, SKILL_NAMES } from "./types";
import type {
  AreaDef,
  AttackType,
  Content,
  DungeonDef,
  FishingSpotDef,
  RecipeDef,
  SkillName,
  Snapshot,
  SpellDef,
} from "./types";
import type { ResolvedContent } from "./validate-content";
import type { State } from "./state";

function combatLevel(level: (skill: SkillName) => number): number {
  const base = level("defence") + level("hitpoints");
  const top = Math.max(
    level("attack") + level("strength"),
    2 * level("ranged"),
    2 * level("magic"),
  );
  return Math.floor((base + top) / 4);
}

function maxHp(level: (skill: SkillName) => number): number {
  return level("hitpoints");
}

export interface SnapshotDeps {
  level: (skill: SkillName) => number;
  currentSpell: () => SpellDef | null;
  gearBonus: (kind: "atkBonus" | "strBonus" | "rangedStr" | "magicDamage") => number;
  gearDef: (type: AttackType) => number;
  weaponSpeed: () => number;
  weaponAttackTypeFor: (weaponId: string | null, content: ResolvedContent) => AttackType;
  areaUnlocked: (area: AreaDef) => boolean;
  dungeonDef: (id: string) => DungeonDef;
  fishingSpotDef: (id: string) => FishingSpotDef;
  recipeDef: (id: string) => RecipeDef;
  nextBankSlotsPrice: (capacity: number) => number;
}

export function buildSnapshot(
  state: State,
  content: Content,
  resolved: ResolvedContent,
  now: () => number,
  deps: SnapshotDeps,
): Snapshot {
  const skills = {} as Snapshot["player"]["skills"];
  for (const skill of SKILL_NAMES) {
    skills[skill] = { level: deps.level(skill), xp: state.xp[skill] };
  }
  // The Snapshot's monster/fishing/dungeon/production sibling fields (a save format that must
  // stay byte-identical, #29) are all derived here from the one state.activity value — dungeon
  // stays populated with the current wave's Monster too, so the existing HP-bar rendering keeps
  // working untouched.
  const fight =
    state.activity?.kind === "combat" || state.activity?.kind === "dungeon"
      ? state.activity
      : undefined;
  const dungeonRun = state.activity?.kind === "dungeon" ? state.activity : undefined;
  const fishingSpotActivity = state.activity?.kind === "fishing" ? state.activity : undefined;
  const productionActivity = state.activity?.kind === "production" ? state.activity : undefined;
  const monsterDef = fight ? resolved.monstersById.get(fight.monsterId) : undefined;
  const spotDef = fishingSpotActivity
    ? resolved.fishingSpotsById.get(fishingSpotActivity.spotId)
    : undefined;
  const dungeonRunDef = dungeonRun ? deps.dungeonDef(dungeonRun.dungeonId) : undefined;
  const productionRecipeDef = productionActivity
    ? deps.recipeDef(productionActivity.recipeId)
    : undefined;
  return {
    savedAt: now(),
    player: {
      hp: state.hp,
      maxHp: maxHp(deps.level),
      combatLevel: combatLevel(deps.level),
      combatStyle: state.combatStyle,
      spell: (() => {
        const spell = deps.currentSpell();
        return spell ? { id: spell.id, name: spell.name, element: spell.element } : null;
      })(),
      autoEatThreshold: state.autoEatThreshold,
      autoSellDuplicates: state.autoSellDuplicates,
      foodSlots: state.foodSlots.map((slot) => (slot ? { ...slot } : null)),
      potionSlot: state.potionSlot ? { ...state.potionSlot } : null,
      quiver: state.quiver ? { ...state.quiver } : null,
      runeSlot: state.runeSlot ? { ...state.runeSlot } : null,
      skills,
      equipment: { ...state.equipment },
      bonuses: {
        attackType: deps.weaponAttackTypeFor(state.equipment.weapon, resolved),
        atkBonus: deps.gearBonus("atkBonus"),
        strBonus: deps.gearBonus("strBonus"),
        def: Object.fromEntries(ATTACK_TYPES.map((t) => [t, deps.gearDef(t)])) as Record<
          AttackType,
          number
        >,
        attackSpeed: deps.weaponSpeed(),
      },
      gold: state.gold,
      respawning: state.respawnTicksLeft > 0,
      completedDungeonIds: [...state.completedDungeonIds],
      ownedPets: [...state.ownedPets],
    },
    // The six combat fields below are ALWAYS derived fresh from monsterDef here — never copied
    // from a saved Snapshot (#184) — so a tampered/stale saved monster can never leak through.
    monster:
      monsterDef && fight
        ? {
            id: monsterDef.id,
            name: monsterDef.name,
            hp: fight.monsterHp,
            maxHp: monsterDef.hp,
            attackType: monsterDef.attackType,
            weakSpot: weakSpot(monsterDef.def),
            attackLevel: monsterDef.attackLevel,
            defenceLevel: monsterDef.defenceLevel,
            maxHit: monsterDef.maxHit,
            attackSpeed: monsterDef.attackSpeed,
            ...(monsterDef.weakElement !== undefined
              ? { weakElement: monsterDef.weakElement }
              : {}),
          }
        : null,
    fishing:
      spotDef && fishingSpotActivity
        ? {
            spotId: spotDef.id,
            name: spotDef.name,
            // #284: elapsed fraction of the current catch-attempt cycle, 0..1. cooldownTotal is
            // always >= 1 (Math.max(1, ...) at every re-arm site), so this never divides by zero.
            progress:
              (fishingSpotActivity.cooldownTotal - fishingSpotActivity.catchCooldown) /
              fishingSpotActivity.cooldownTotal,
          }
        : null,
    dungeon:
      dungeonRun && dungeonRunDef
        ? {
            id: dungeonRunDef.id,
            name: dungeonRunDef.name,
            wave: dungeonRun.waveIndex + 1,
            totalWaves: dungeonRunDef.waves.length,
          }
        : null,
    production:
      productionActivity && productionRecipeDef
        ? {
            recipeId: productionRecipeDef.id,
            name: productionRecipeDef.name,
            skill: productionRecipeDef.skill,
            // #284: elapsed fraction of the current craft cycle, 0..1 — mirrors fishing's
            // progress derivation above. cooldownTotal is always >= 1, so never divide-by-zero.
            progress:
              (productionActivity.cooldownTotal - productionActivity.craftCooldown) /
              productionActivity.cooldownTotal,
          }
        : null,
    bank: {
      items: [...state.bank].map(([itemId, qty]) => ({ itemId, qty })),
      capacity: state.bankCapacity,
      nextSlotsPrice: deps.nextBankSlotsPrice(state.bankCapacity),
    },
    lootZone: [...state.lootZone].map(([itemId, qty]) => ({ itemId, qty })),
    areas: content.areas.map((area) => {
      const unlocked = deps.areaUnlocked(area);
      return {
        id: area.id,
        name: area.name,
        unlocked,
        gatedBy: unlocked
          ? null
          : (() => {
              const d = deps.dungeonDef(area.unlockedByDungeonId as string);
              return { dungeonId: d.id, name: d.name };
            })(),
        monsterIds: [...area.monsterIds],
        fishingSpots: (area.fishingSpotIds ?? []).map((id) => {
          const spot = deps.fishingSpotDef(id);
          return { id: spot.id, unlocked: unlocked && deps.level("fishing") >= spot.levelReq };
        }),
      };
    }),
  };
}
