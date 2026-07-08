import { attackRoll, defenceRoll, effectiveLevel, hitChance, maxHit } from "./combat";
import { levelForXp, xpForLevel } from "./xp";
import { validateContent } from "./validate-content";
import { AUTO_EAT_THRESHOLDS, SKILL_NAMES } from "./types";
import type {
  AutoEatThreshold,
  CurrencyDef,
  EquipmentDef,
  FishingSpotDef,
  FoodDef,
  ItemDef,
  MonsterDef,
  CombatStyle,
  Content,
  EngineEvent,
  GearSlot,
  Rng,
  SkillName,
  Snapshot,
} from "./types";

interface State {
  xp: Record<SkillName, number>;
  hp: number;
  combatStyle: CombatStyle;
  autoEatThreshold: AutoEatThreshold;
  selectedMonsterId: string | null;
  monsterHp: number;
  selectedSpotId: string | null;
  catchCooldown: number;
  inventory: Map<string, number>;
  equipment: Record<GearSlot, string | null>;
  respawnTicksLeft: number;
  playerCooldown: number;
  monsterCooldown: number;
  regenTicks: number;
}

type EventHandler<T extends EngineEvent["type"]> = (
  event: Extract<EngineEvent, { type: T }>,
) => void;

export interface Engine {
  tick(): void;
  selectMonster(monsterId: string): void;
  selectFishingSpot(spotId: string): void;
  setCombatStyle(style: CombatStyle): void;
  setAutoEatThreshold(threshold: AutoEatThreshold): void;
  equip(itemId: string): void;
  eatFood(itemId: string): void;
  sell(itemId: string, qty?: number): void;
  snapshot(): Snapshot;
  on<T extends EngineEvent["type"]>(type: T, handler: EventHandler<T>): void;
}

const UNARMED_SPEED = 4;
const RESPAWN_TICKS = 8;
/** Ticks between passive HP regen while below max HP (ADR: not during Respawn). */
const REGEN_TICKS = 10;
const DEFAULT_AUTO_EAT_THRESHOLD: AutoEatThreshold = 0.5;

function isAutoEatThreshold(value: unknown): value is AutoEatThreshold {
  return (AUTO_EAT_THRESHOLDS as readonly unknown[]).includes(value);
}

export function createEngine(content: Content, rng: Rng, saved?: Snapshot): Engine {
  // Fail loud on malformed Content (ADR-0001 extended to construction): every
  // violation is collected and reported together, not just the first.
  const violations = validateContent(content);
  if (violations.length > 0) {
    throw new Error(`Invalid Content:\n${violations.map((v) => `  - ${v}`).join("\n")}`);
  }

  // Located once here, never by a hard-coded id: whichever Item Content declares as currency.
  // Non-null: validateContent guarantees exactly one currency item.
  const currencyDef: CurrencyDef = content.items.find(
    (i): i is CurrencyDef => i.kind === "currency",
  )!;

  // Loads are tolerant (ADR-0001): an unrecognised or missing saved threshold falls back silently.
  const loadedThreshold = saved?.player.autoEatThreshold ?? DEFAULT_AUTO_EAT_THRESHOLD;

  const state: State = {
    xp: saved
      ? {
          attack: saved.player.skills.attack.xp,
          strength: saved.player.skills.strength.xp,
          defence: saved.player.skills.defence.xp,
          hitpoints: saved.player.skills.hitpoints.xp,
          // Old saves lack the key entirely: pre-feature players start Fishing at 1/0 XP.
          fishing: saved.player.skills.fishing?.xp ?? 0,
        }
      : { attack: 0, strength: 0, defence: 0, hitpoints: xpForLevel(10), fishing: 0 },
    hp: saved ? saved.player.hp : 10,
    combatStyle: saved?.player.combatStyle ?? "aggressive",
    autoEatThreshold: isAutoEatThreshold(loadedThreshold)
      ? loadedThreshold
      : DEFAULT_AUTO_EAT_THRESHOLD,
    selectedMonsterId: null,
    monsterHp: 0,
    selectedSpotId: null,
    catchCooldown: 0,
    inventory: new Map(saved?.player.inventory.map((s) => [s.itemId, s.qty])),
    equipment: saved
      ? { ...saved.player.equipment }
      : { weapon: null, shield: null, head: null, body: null, legs: null },
    respawnTicksLeft: 0,
    playerCooldown: 0,
    monsterCooldown: 0,
    regenTicks: 0,
  };

  const handlers = new Map<string, ((event: EngineEvent) => void)[]>();

  function emit(event: EngineEvent): void {
    for (const handler of handlers.get(event.type) ?? []) handler(event);
  }

  function level(skill: SkillName): number {
    return levelForXp(state.xp[skill]);
  }

  function monsterDef(id: string): MonsterDef {
    const def = content.monsters.find((m) => m.id === id);
    if (!def) throw new Error(`unknown monster: ${id}`);
    return def;
  }

  function fishingSpotDef(id: string): FishingSpotDef {
    const def = content.fishingSpots.find((s) => s.id === id);
    if (!def) throw new Error(`unknown fishing spot: ${id}`);
    return def;
  }

  function equippedDefs(): EquipmentDef[] {
    const defs: EquipmentDef[] = [];
    for (const itemId of Object.values(state.equipment)) {
      if (itemId === null) continue;
      const def = content.items.find((i) => i.id === itemId);
      if (def?.kind === "equipment") defs.push(def);
    }
    return defs;
  }

  function gearBonus(kind: "atkBonus" | "strBonus" | "defBonus"): number {
    return equippedDefs().reduce((sum, def) => sum + def[kind], 0);
  }

  /** Gold per unit if `def` can be sold; undefined for currency or anything without a value. */
  function sellValue(def: ItemDef): number | undefined {
    return def.kind === "currency" ? undefined : def.value;
  }

  function weaponSpeed(): number {
    const weaponId = state.equipment.weapon;
    if (weaponId === null) return UNARMED_SPEED;
    const def = content.items.find((i) => i.id === weaponId);
    return def?.kind === "equipment" ? (def.attackSpeed ?? UNARMED_SPEED) : UNARMED_SPEED;
  }

  function rollDamage(chance: number, max: number): number {
    if (rng.next() >= chance) return 0; // miss
    return Math.floor(rng.next() * (max + 1));
  }

  function rollDrops(monster: MonsterDef): void {
    for (const entry of monster.dropTable) {
      if (entry.chance < 1 && rng.next() >= entry.chance) continue;
      state.inventory.set(entry.itemId, (state.inventory.get(entry.itemId) ?? 0) + entry.qty);
      emit({ type: "drop", itemId: entry.itemId, qty: entry.qty, band: entry.band });
    }
  }

  function spawnMonster(id: string): void {
    state.selectedMonsterId = id;
    state.monsterHp = monsterDef(id).hp;
    state.playerCooldown = weaponSpeed();
    state.monsterCooldown = monsterDef(id).attackSpeed;
  }

  const STYLE_SKILL: Record<CombatStyle, SkillName> = {
    accurate: "attack",
    aggressive: "strength",
    defensive: "defence",
  };

  function grantXp(skill: SkillName, amount: number): void {
    const before = level(skill);
    state.xp[skill] += amount;
    const after = level(skill);
    if (after > before) emit({ type: "levelup", skill, level: after });
  }

  function awardCombatXp(damage: number): void {
    if (damage <= 0) return;
    grantXp(STYLE_SKILL[state.combatStyle], 4 * damage);
    grantXp("hitpoints", (4 / 3) * damage);
  }

  function playerAttack(monster: MonsterDef): void {
    const atkRoll = attackRoll(
      effectiveLevel(level("attack"), "attack", state.combatStyle),
      gearBonus("atkBonus"),
    );
    const defRoll = defenceRoll(monster.defenceLevel + 8, 0);
    const max = maxHit(
      effectiveLevel(level("strength"), "strength", state.combatStyle),
      gearBonus("strBonus"),
    );
    const damage = Math.min(rollDamage(hitChance(atkRoll, defRoll), max), state.monsterHp);
    state.monsterHp -= damage;
    awardCombatXp(damage);
    if (state.monsterHp <= 0) {
      emit({ type: "kill", monsterId: monster.id });
      rollDrops(monster);
      spawnMonster(monster.id);
    }
  }

  function combatLevel(): number {
    return Math.floor(
      (level("attack") + level("strength") + level("defence") + level("hitpoints")) / 4,
    );
  }

  function maxHp(): number {
    return level("hitpoints");
  }

  function snapshot(): Snapshot {
    const skills = {} as Snapshot["player"]["skills"];
    for (const skill of SKILL_NAMES) {
      skills[skill] = { level: level(skill), xp: state.xp[skill] };
    }
    const monsterDef = content.monsters.find((m) => m.id === state.selectedMonsterId);
    const spotDef = content.fishingSpots.find((s) => s.id === state.selectedSpotId);
    return {
      player: {
        hp: state.hp,
        maxHp: maxHp(),
        combatLevel: combatLevel(),
        combatStyle: state.combatStyle,
        autoEatThreshold: state.autoEatThreshold,
        skills,
        equipment: { ...state.equipment },
        inventory: [...state.inventory].map(([itemId, qty]) => ({ itemId, qty })),
        respawning: state.respawnTicksLeft > 0,
      },
      monster: monsterDef
        ? { id: monsterDef.id, name: monsterDef.name, hp: state.monsterHp, maxHp: monsterDef.hp }
        : null,
      fishing: spotDef ? { spotId: spotDef.id, name: spotDef.name } : null,
      areas: content.areas.map((area) => {
        const unlocked = combatLevel() >= area.combatLevelReq;
        return {
          id: area.id,
          name: area.name,
          unlocked,
          monsterIds: [...area.monsterIds],
          fishingSpots: (area.fishingSpotIds ?? []).map((id) => {
            const spot = fishingSpotDef(id);
            return { id: spot.id, unlocked: unlocked && level("fishing") >= spot.levelReq };
          }),
        };
      }),
    };
  }

  function monsterAttack(monster: MonsterDef): void {
    const atkRoll = attackRoll(monster.attackLevel + 8, 0);
    const defRoll = defenceRoll(
      effectiveLevel(level("defence"), "defence", state.combatStyle),
      gearBonus("defBonus"),
    );
    const damage = rollDamage(hitChance(atkRoll, defRoll), monster.maxHit);
    state.hp = Math.max(0, state.hp - damage);
  }

  /** Eats one unit of `food`, healing without overheal; returns HP restored. */
  function eat(food: FoodDef): number {
    const healed = Math.min(food.heals, maxHp() - state.hp);
    state.hp += healed;
    const remaining = (state.inventory.get(food.id) ?? 0) - 1;
    if (remaining > 0) state.inventory.set(food.id, remaining);
    else state.inventory.delete(food.id);
    emit({ type: "food-eaten", itemId: food.id, healed });
    return healed;
  }

  function autoEat(): void {
    if (state.autoEatThreshold === 0) return;
    while (state.hp < maxHp() * state.autoEatThreshold) {
      const food = content.items.find(
        (item) => item.kind === "food" && (state.inventory.get(item.id) ?? 0) > 0,
      );
      if (!food || food.kind !== "food") return;
      eat(food);
    }
  }

  /** Passive regen: 1 HP per REGEN_TICKS while below max HP; paused during Respawn. */
  function regen(): void {
    if (state.respawnTicksLeft > 0) return;
    if (state.hp >= maxHp()) {
      state.regenTicks = 0;
      return;
    }
    state.regenTicks += 1;
    if (state.regenTicks >= REGEN_TICKS) {
      state.regenTicks = 0;
      state.hp = Math.min(maxHp(), state.hp + 1);
    }
  }

  /** Rolls one Catch attempt when the cooldown elapses; success grants XP, the Item, and an event. */
  function fishingTick(): void {
    const spot = fishingSpotDef(state.selectedSpotId as string);
    state.catchCooldown -= 1;
    if (state.catchCooldown > 0) return;
    state.catchCooldown = spot.catchTicks;
    if (rng.next() < spot.catchChance) {
      state.inventory.set(spot.itemId, (state.inventory.get(spot.itemId) ?? 0) + 1);
      grantXp("fishing", spot.xp);
      emit({ type: "fish-caught", spotId: spot.id, itemId: spot.itemId, qty: 1 });
    }
  }

  function tick(): void {
    regen();

    if (state.selectedSpotId !== null) {
      fishingTick();
      return;
    }

    if (state.selectedMonsterId === null) return;

    if (state.respawnTicksLeft > 0) {
      state.respawnTicksLeft -= 1;
      if (state.respawnTicksLeft === 0) {
        state.hp = maxHp();
        spawnMonster(state.selectedMonsterId);
      }
      return;
    }

    const monster = monsterDef(state.selectedMonsterId);
    state.playerCooldown -= 1;
    if (state.playerCooldown <= 0) {
      state.playerCooldown = weaponSpeed();
      playerAttack(monster);
    }
    state.monsterCooldown -= 1;
    if (state.monsterCooldown <= 0) {
      state.monsterCooldown = monster.attackSpeed;
      monsterAttack(monster);
    }
    autoEat();
    if (state.hp <= 0) {
      state.respawnTicksLeft = RESPAWN_TICKS;
      emit({ type: "death" });
    }
  }

  if (saved?.monster) {
    spawnMonster(saved.monster.id);
    state.monsterHp = saved.monster.hp;
  } else if (saved?.fishing) {
    // Cooldown isn't part of the Snapshot: re-arm to catchTicks, like monster cooldowns do.
    const spot = fishingSpotDef(saved.fishing.spotId);
    state.selectedSpotId = spot.id;
    state.catchCooldown = spot.catchTicks;
  }

  return {
    tick,
    snapshot,
    selectMonster(monsterId) {
      monsterDef(monsterId); // throws on unknown id
      const area = content.areas.find((a) => a.monsterIds.includes(monsterId));
      if (area && combatLevel() < area.combatLevelReq) {
        throw new Error(`${area.name} requires combat level ${area.combatLevelReq}`);
      }
      state.selectedSpotId = null; // at most one of Monster / Fishing Spot selected
      state.respawnTicksLeft = 0;
      state.hp = Math.max(state.hp, 1);
      spawnMonster(monsterId);
    },
    selectFishingSpot(spotId) {
      const spot = fishingSpotDef(spotId); // throws on unknown id
      const area = content.areas.find((a) => a.fishingSpotIds?.includes(spotId));
      if (area && combatLevel() < area.combatLevelReq) {
        throw new Error(`${area.name} requires combat level ${area.combatLevelReq}`);
      }
      if (level("fishing") < spot.levelReq) {
        throw new Error(`${spot.name} requires Fishing level ${spot.levelReq}`);
      }
      state.selectedMonsterId = null; // at most one of Monster / Fishing Spot selected
      state.respawnTicksLeft = 0;
      state.hp = Math.max(state.hp, 1);
      state.selectedSpotId = spotId;
      state.catchCooldown = spot.catchTicks;
    },
    setCombatStyle(style) {
      state.combatStyle = style;
    },
    setAutoEatThreshold(threshold) {
      if (!isAutoEatThreshold(threshold)) {
        throw new Error(`invalid auto-eat threshold: ${threshold}`);
      }
      state.autoEatThreshold = threshold;
    },
    equip(itemId) {
      const def = content.items.find((i) => i.id === itemId);
      if (!def) throw new Error(`unknown item: ${itemId}`);
      if (def.kind !== "equipment") throw new Error(`${def.name} cannot be equipped`);
      const owned = state.inventory.get(itemId) ?? 0;
      if (owned <= 0) throw new Error(`you do not own ${def.name}`);

      if (owned > 1) state.inventory.set(itemId, owned - 1);
      else state.inventory.delete(itemId);
      const previous = state.equipment[def.slot];
      if (previous !== null) {
        state.inventory.set(previous, (state.inventory.get(previous) ?? 0) + 1);
      }
      state.equipment[def.slot] = itemId;
    },
    eatFood(itemId) {
      const def = content.items.find((i) => i.id === itemId);
      if (!def) throw new Error(`unknown item: ${itemId}`);
      if (def.kind !== "food") throw new Error(`${def.name} is not Food`);
      const owned = state.inventory.get(itemId) ?? 0;
      if (owned <= 0) throw new Error(`you do not own ${def.name}`);
      eat(def);
    },
    sell(itemId, qty = 1) {
      // currencyDef is guaranteed present by validateContent (exactly one currency item).
      if (!Number.isInteger(qty) || qty < 1) throw new Error(`invalid sell quantity: ${qty}`);
      const def = content.items.find((i) => i.id === itemId);
      if (!def) throw new Error(`unknown item: ${itemId}`);
      const value = sellValue(def);
      if (value === undefined) throw new Error(`${def.name} cannot be sold`);
      const owned = state.inventory.get(itemId) ?? 0;
      if (owned < qty) throw new Error(`you do not own ${qty} ${def.name}`);

      const remaining = owned - qty;
      if (remaining > 0) state.inventory.set(itemId, remaining);
      else state.inventory.delete(itemId);
      const gold = value * qty;
      state.inventory.set(currencyDef.id, (state.inventory.get(currencyDef.id) ?? 0) + gold);
      emit({ type: "item-sold", itemId, qty, gold });
    },
    on(type, handler) {
      const list = handlers.get(type) ?? [];
      list.push(handler as (event: EngineEvent) => void);
      handlers.set(type, list);
    },
  };
}
