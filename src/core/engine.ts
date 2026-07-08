import { attackRoll, defenceRoll, effectiveLevel, hitChance, maxHit } from "./combat";
import { levelForXp, xpForLevel } from "./xp";
import { validateContent } from "./validate-content";
import { AUTO_EAT_THRESHOLDS, SKILL_NAMES } from "./types";
import type {
  AreaDef,
  AutoEatThreshold,
  CurrencyDef,
  DropBand,
  DungeonDef,
  EquipmentDef,
  FishingSpotDef,
  FoodDef,
  ItemDef,
  MonsterDef,
  RecipeDef,
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
  smithing: { recipeId: string; craftCooldown: number } | null;
  inventory: Map<string, number>;
  bank: Map<string, number>;
  bankCapacity: number;
  equipment: Record<GearSlot, string | null>;
  respawnTicksLeft: number;
  playerCooldown: number;
  monsterCooldown: number;
  regenTicks: number;
  dungeonRun: { dungeonId: string; waveIndex: number } | null;
  completedDungeonIds: Set<string>;
}

type EventHandler<T extends EngineEvent["type"]> = (
  event: Extract<EngineEvent, { type: T }>,
) => void;

export interface Engine {
  tick(): void;
  selectMonster(monsterId: string): void;
  selectFishingSpot(spotId: string): void;
  enterDungeon(dungeonId: string): void;
  selectRecipe(recipeId: string): void;
  setCombatStyle(style: CombatStyle): void;
  setAutoEatThreshold(threshold: AutoEatThreshold): void;
  equip(itemId: string): void;
  eatFood(itemId: string): void;
  sell(itemId: string, qty?: number): void;
  deposit(itemId: string, qty?: number): void;
  withdraw(itemId: string, qty?: number): void;
  buyBankSlots(): void;
  snapshot(): Snapshot;
  on<T extends EngineEvent["type"]>(type: T, handler: EventHandler<T>): void;
}

const UNARMED_SPEED = 4;
const RESPAWN_TICKS = 8;
/** Ticks between passive HP regen while below max HP (ADR: not during Respawn). */
const REGEN_TICKS = 10;
const DEFAULT_AUTO_EAT_THRESHOLD: AutoEatThreshold = 0.5;

/** Bank Slot capacity: 1 slot = 1 item stack, regardless of stack quantity. */
const BANK_START_CAPACITY = 100;
/** Tuning default: how many Bank Slots one `buyBankSlots()` purchase grants. */
const BANK_SLOTS_PER_PURCHASE = 10;
const BANK_FIRST_PRICE = 1000;
const BANK_PRICE_STEP = 500;

/** The gold cost of the next `buyBankSlots()` purchase, always derived from current capacity
 * (never stored): 1000, 1500, 2000, … as capacity grows past BANK_START_CAPACITY. */
function nextBankSlotsPrice(capacity: number): number {
  return (
    BANK_FIRST_PRICE +
    BANK_PRICE_STEP * ((capacity - BANK_START_CAPACITY) / BANK_SLOTS_PER_PURCHASE)
  );
}

function isAutoEatThreshold(value: unknown): value is AutoEatThreshold {
  return (AUTO_EAT_THRESHOLDS as readonly unknown[]).includes(value);
}

const COMBAT_STYLES: readonly CombatStyle[] = ["accurate", "aggressive", "defensive"];

function isCombatStyle(value: unknown): value is CombatStyle {
  return (COMBAT_STYLES as readonly unknown[]).includes(value);
}

/** Ticks between player attacks for `weaponId`; unarmed (or an unresolvable/non-equipment id)
 * falls back to UNARMED_SPEED. Pure so it can size a resumed fight's cooldown during load,
 * before the Engine's closures (which call this with `state.equipment.weapon`) exist yet. */
function weaponSpeedFor(weaponId: string | null, content: Content): number {
  if (weaponId === null) return UNARMED_SPEED;
  const def = content.items.find((i) => i.id === weaponId);
  return def?.kind === "equipment" ? (def.attackSpeed ?? UNARMED_SPEED) : UNARMED_SPEED;
}

/** The no-save defaults: a level-1 player (Hitpoints 10, per ADR), full HP, nothing selected. */
function freshState(_content: Content): State {
  return {
    xp: { attack: 0, strength: 0, defence: 0, hitpoints: xpForLevel(10), fishing: 0, smithing: 0 },
    hp: 10,
    combatStyle: "aggressive",
    autoEatThreshold: DEFAULT_AUTO_EAT_THRESHOLD,
    selectedMonsterId: null,
    monsterHp: 0,
    selectedSpotId: null,
    catchCooldown: 0,
    smithing: null,
    inventory: new Map(),
    bank: new Map(),
    bankCapacity: BANK_START_CAPACITY,
    equipment: { weapon: null, shield: null, head: null, body: null, legs: null },
    respawnTicksLeft: 0,
    playerCooldown: 0,
    monsterCooldown: 0,
    regenTicks: 0,
    dungeonRun: null,
    completedDungeonIds: new Set(),
  };
}

/** Every Skill's xp coerced to a finite number >= 0; anything else (missing, NaN, negative,
 * non-numeric) falls back to the fresh default for that Skill. */
function loadXp(saved: Snapshot): Record<SkillName, number> {
  const xp = {} as Record<SkillName, number>;
  for (const skill of SKILL_NAMES) {
    const raw: unknown = saved.player?.skills?.[skill]?.xp;
    const fresh = skill === "hitpoints" ? xpForLevel(10) : 0;
    xp[skill] = typeof raw === "number" && Number.isFinite(raw) && raw >= 0 ? raw : fresh;
  }
  return xp;
}

/** hp coerced to a finite number and clamped to [1, maxHp]; a non-numeric/non-finite value
 * falls back to full HP before clamping. */
function loadHp(saved: Snapshot, maxHp: number): number {
  const raw: unknown = saved.player?.hp;
  const hp = typeof raw === "number" && Number.isFinite(raw) ? raw : maxHp;
  return Math.min(maxHp, Math.max(1, hp));
}

/** Per GearSlot, keeps the saved itemId only if it resolves to an EquipmentDef whose `slot`
 * matches that slot; otherwise the slot loads empty. Closes both dangling and wrong-slot refs. */
function loadEquipment(saved: Snapshot, content: Content): Record<GearSlot, string | null> {
  const equipment: Record<GearSlot, string | null> = {
    weapon: null,
    shield: null,
    head: null,
    body: null,
    legs: null,
  };
  const savedEquipment: Partial<Record<GearSlot, unknown>> | undefined = saved.player?.equipment;
  if (!savedEquipment) return equipment;
  for (const slot of Object.keys(equipment) as GearSlot[]) {
    const itemId = savedEquipment[slot];
    if (typeof itemId !== "string") continue;
    const def = content.items.find((i) => i.id === itemId);
    if (def?.kind === "equipment" && def.slot === slot) equipment[slot] = itemId;
  }
  return equipment;
}

/** Drops inventory entries whose itemId isn't in Content, or whose qty isn't a positive
 * integer; keeps the rest. */
function loadInventory(saved: Snapshot, content: Content): Map<string, number> {
  const itemIds = new Set(content.items.map((i) => i.id));
  const inventory = new Map<string, number>();
  for (const entry of saved.player?.inventory ?? []) {
    const itemId: unknown = entry?.itemId;
    const qty: unknown = entry?.qty;
    if (typeof itemId !== "string" || !itemIds.has(itemId)) continue;
    if (typeof qty !== "number" || !Number.isInteger(qty) || qty <= 0) continue;
    inventory.set(itemId, qty);
  }
  return inventory;
}

/** Drops Bank entries whose itemId isn't in Content, or whose qty isn't a positive integer;
 * keeps the rest. Mirrors loadInventory — the Bank is a second, separate item store. */
function loadBank(saved: Snapshot, content: Content): Map<string, number> {
  const itemIds = new Set(content.items.map((i) => i.id));
  const bank = new Map<string, number>();
  for (const entry of saved.bank?.items ?? []) {
    const itemId: unknown = entry?.itemId;
    const qty: unknown = entry?.qty;
    if (typeof itemId !== "string" || !itemIds.has(itemId)) continue;
    if (typeof qty !== "number" || !Number.isInteger(qty) || qty <= 0) continue;
    bank.set(itemId, qty);
  }
  return bank;
}

/** Bank capacity coerced to a finite number; a missing/non-numeric value falls back to
 * BANK_START_CAPACITY (a pre-feature save has no `bank` key at all). */
function loadBankCapacity(saved: Snapshot): number {
  const raw: unknown = saved.bank?.capacity;
  return typeof raw === "number" && Number.isFinite(raw) ? raw : BANK_START_CAPACITY;
}

/** Completed-dungeon ids: keeps only entries that are strings naming a real DungeonDef, dropping
 * anything else (unknown/renamed ids, stray non-strings) — mirrors loadInventory/loadBank's
 * filter-to-known-ids pattern. If the key is present (even as []), it is trusted as-is: this is
 * a post-#24 save that has already gone through migration once, so re-deriving from saved.areas
 * would be wrong (a player could have entered a still-locked Area's Dungeon and abandoned it,
 * which never sets areas[].unlocked but also must never re-migrate to "completed"). */
function loadCompletedDungeonIds(saved: Snapshot, content: Content): Set<string> {
  const dungeonIds = new Set(content.dungeons.map((d) => d.id));
  const raw: unknown = saved.player?.completedDungeonIds;
  if (Array.isArray(raw)) {
    return new Set(raw.filter((id): id is string => typeof id === "string" && dungeonIds.has(id)));
  }
  return migrateCompletedDungeonIdsFromAreaGates(saved, content);
}

/** Migration (#24): a save with no `completedDungeonIds` key predates Dungeon-boss gating —
 * either a pre-#23 save (Dungeons didn't exist yet) or a pre-#24 save (Areas were still gated by
 * combat level). Defaulting to an empty Set would re-lock every Area a player already earned, so
 * instead this derives completion from the old gate flags the save already persisted: Snapshot
 * doubles as save format, so `saved.areas[].unlocked` survives untouched from that old world.
 * Tolerant of unknown/missing/malformed area ids and a missing/malformed `areas` array. */
function migrateCompletedDungeonIdsFromAreaGates(saved: Snapshot, content: Content): Set<string> {
  const completed = new Set<string>();
  for (const savedArea of saved.areas ?? []) {
    if (savedArea?.unlocked !== true) continue;
    const areaId: unknown = savedArea?.id;
    if (typeof areaId !== "string") continue;
    const area = content.areas.find((a) => a.id === areaId);
    if (area?.unlockedByDungeonId) completed.add(area.unlockedByDungeonId);
  }
  return completed;
}

/** Whether `inventory` covers at least one craft of `recipe` (mirrors the Engine's own
 * canCraftRecipe, duplicated here because loadState runs before the Engine's closures exist). */
function canCraftFromInventory(recipe: RecipeDef, inventory: Map<string, number>): boolean {
  return recipe.inputs.every((input) => (inventory.get(input.itemId) ?? 0) >= input.qty);
}

/** Resolves a resumable Smithing activity: `blocked` is true when a Monster or Fishing Spot
 * already claimed the resume slot (mirrors the monster > fishing priority above; Smithing is
 * lowest priority since Content's construction order and Dungeon's all-or-nothing rule both
 * predate it). An unknown recipe id, an under-leveled recipe, or one short on inputs all resume
 * idle instead of throwing (tolerant load, same as an unknown monster/fishing spot id) — the
 * cooldown always re-arms to `craftTicks` on resume, per #28. */
function loadSmithing(
  saved: Snapshot,
  content: Content,
  inventory: Map<string, number>,
  smithingLevel: number,
  blocked: boolean,
): { recipeId: string; craftCooldown: number } | null {
  const recipeId: unknown = blocked ? undefined : saved.smithing?.recipeId;
  const recipe =
    typeof recipeId === "string" ? content.recipes.find((r) => r.id === recipeId) : undefined;
  if (!recipe) return null;
  if (smithingLevel < recipe.levelReq) return null;
  if (!canCraftFromInventory(recipe, inventory)) return null;
  return { recipeId: recipe.id, craftCooldown: recipe.craftTicks };
}

/** Tolerant validation of every saved field (ADR-0001 extended: loaded save data never throws,
 * unlike malformed Content or invalid COMMANDS). A corrupted or schema-drifted save still loads
 * and keeps the player's progress; a bad field falls back to default or is dropped, never bricks
 * the save. A clean Snapshot round-trips through this unchanged. */
function loadState(saved: Snapshot, content: Content): State {
  const xp = loadXp(saved);
  const maxHp = levelForXp(xp.hitpoints);
  const equipment = loadEquipment(saved, content);
  const inventory = loadInventory(saved, content);

  // Mid-run Dungeon state is NEVER persisted: a reload is an abandon. A save captured mid-run
  // ignores BOTH saved.dungeon and saved.monster — the naive path (spawnMonster(saved.monster.id))
  // would turn a dungeon-only boss into an infinitely farmable open-world Monster.
  const dungeonActive = saved.dungeon != null;

  // Activity resume: an unknown saved monster/fishing id resumes idle instead of throwing.
  const monsterId: unknown = dungeonActive ? undefined : saved.monster?.id;
  const monster =
    typeof monsterId === "string" ? content.monsters.find((m) => m.id === monsterId) : undefined;
  const spotId: unknown = !monster ? saved.fishing?.spotId : undefined;
  const spot =
    typeof spotId === "string" ? content.fishingSpots.find((s) => s.id === spotId) : undefined;
  const savedMonsterHp: unknown = saved.monster?.hp;
  const smithing = loadSmithing(
    saved,
    content,
    inventory,
    levelForXp(xp.smithing),
    dungeonActive || monster !== undefined || spot !== undefined,
  );

  return {
    xp,
    hp: loadHp(saved, maxHp),
    combatStyle: isCombatStyle(saved.player?.combatStyle) ? saved.player.combatStyle : "aggressive",
    autoEatThreshold: isAutoEatThreshold(saved.player?.autoEatThreshold)
      ? saved.player.autoEatThreshold
      : DEFAULT_AUTO_EAT_THRESHOLD,
    selectedMonsterId: monster?.id ?? null,
    monsterHp: monster
      ? typeof savedMonsterHp === "number" && Number.isFinite(savedMonsterHp)
        ? savedMonsterHp
        : monster.hp
      : 0,
    selectedSpotId: spot?.id ?? null,
    catchCooldown: spot ? spot.catchTicks : 0,
    smithing,
    inventory,
    bank: loadBank(saved, content),
    bankCapacity: loadBankCapacity(saved),
    equipment,
    respawnTicksLeft: 0,
    playerCooldown: monster ? weaponSpeedFor(equipment.weapon, content) : 0,
    monsterCooldown: monster ? monster.attackSpeed : 0,
    regenTicks: 0,
    dungeonRun: null,
    completedDungeonIds: loadCompletedDungeonIds(saved, content),
  };
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

  // Loads are tolerant (ADR-0001, extended to a full field-by-field sweep by loadState): a
  // corrupted or schema-drifted save still loads and keeps the player's progress.
  const state: State = saved ? loadState(saved, content) : freshState(content);

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

  function dungeonDef(id: string): DungeonDef {
    const def = content.dungeons.find((d) => d.id === id);
    if (!def) throw new Error(`unknown dungeon: ${id}`);
    return def;
  }

  function recipeDef(id: string): RecipeDef {
    const def = content.recipes.find((r) => r.id === id);
    if (!def) throw new Error(`unknown recipe: ${id}`);
    return def;
  }

  /** Whether the carried inventory covers at least one craft of `recipe`. */
  function canCraftRecipe(recipe: RecipeDef): boolean {
    return recipe.inputs.every((input) => (state.inventory.get(input.itemId) ?? 0) >= input.qty);
  }

  /** An Area with no gating Dungeon is unlocked from the start; a gated Area unlocks the instant
   * its `unlockedByDungeonId` appears in `completedDungeonIds` — combat level gates nothing here
   * (#24: Dungeon-boss gating replaced combat-level Area gating). */
  function areaUnlocked(area: AreaDef): boolean {
    return !area.unlockedByDungeonId || state.completedDungeonIds.has(area.unlockedByDungeonId);
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
    return weaponSpeedFor(state.equipment.weapon, content);
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

  /** Rolls every Chest entry independently (multi-roll, unlike a Drop Table's per-kill roll):
   * adds each landed item straight to the inventory and returns it for chest-opened. No per-item
   * `drop` events fire — Chest contents are reported only via chest-opened (mirrors fishing's
   * single fish-caught event instead of per-item drops). */
  function rollChest(dungeon: DungeonDef): { itemId: string; qty: number; band: DropBand }[] {
    const items: { itemId: string; qty: number; band: DropBand }[] = [];
    for (const entry of dungeon.chest) {
      if (entry.chance < 1 && rng.next() >= entry.chance) continue;
      state.inventory.set(entry.itemId, (state.inventory.get(entry.itemId) ?? 0) + entry.qty);
      items.push({ itemId: entry.itemId, qty: entry.qty, band: entry.band });
    }
    return items;
  }

  /** Called from playerAttack's kill branch when a Dungeon run is active: advances to the next
   * Wave, or — on the Boss (the last Wave) — rolls the Chest, marks the Dungeon completed, and
   * ejects the player to idle (dungeonRun and selectedMonsterId both null). */
  function handleDungeonKill(run: { dungeonId: string; waveIndex: number }): void {
    const dungeon = dungeonDef(run.dungeonId);
    const clearedWave = run.waveIndex + 1; // 1-based cleared count
    if (clearedWave < dungeon.waves.length) {
      state.dungeonRun = { dungeonId: run.dungeonId, waveIndex: clearedWave };
      emit({
        type: "wave-cleared",
        dungeonId: dungeon.id,
        wave: clearedWave,
        totalWaves: dungeon.waves.length,
      });
      spawnMonster(dungeon.waves[clearedWave] as string);
      return;
    }
    // Boss killed: the Chest is on top of the boss's own Drop Table (already rolled by the caller).
    const items = rollChest(dungeon);
    state.completedDungeonIds.add(dungeon.id);
    state.dungeonRun = null;
    state.selectedMonsterId = null;
    state.monsterHp = 0;
    emit({ type: "dungeon-completed", dungeonId: dungeon.id });
    emit({ type: "chest-opened", dungeonId: dungeon.id, items });
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
      rollDrops(monster); // wave Monsters still roll their normal Drop Table; the Chest is on top
      if (state.dungeonRun) {
        handleDungeonKill(state.dungeonRun);
      } else {
        spawnMonster(monster.id);
      }
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
    const dungeonRunDef = state.dungeonRun ? dungeonDef(state.dungeonRun.dungeonId) : undefined;
    const smithingRecipeDef = state.smithing ? recipeDef(state.smithing.recipeId) : undefined;
    return {
      player: {
        hp: state.hp,
        maxHp: maxHp(),
        combatLevel: combatLevel(),
        combatStyle: state.combatStyle,
        autoEatThreshold: state.autoEatThreshold,
        skills,
        equipment: { ...state.equipment },
        bonuses: {
          atkBonus: gearBonus("atkBonus"),
          strBonus: gearBonus("strBonus"),
          defBonus: gearBonus("defBonus"),
          attackSpeed: weaponSpeed(),
        },
        inventory: [...state.inventory].map(([itemId, qty]) => ({ itemId, qty })),
        respawning: state.respawnTicksLeft > 0,
        completedDungeonIds: [...state.completedDungeonIds],
      },
      monster: monsterDef
        ? { id: monsterDef.id, name: monsterDef.name, hp: state.monsterHp, maxHp: monsterDef.hp }
        : null,
      fishing: spotDef ? { spotId: spotDef.id, name: spotDef.name } : null,
      dungeon:
        state.dungeonRun && dungeonRunDef
          ? {
              id: dungeonRunDef.id,
              name: dungeonRunDef.name,
              wave: state.dungeonRun.waveIndex + 1,
              totalWaves: dungeonRunDef.waves.length,
            }
          : null,
      smithing:
        state.smithing && smithingRecipeDef
          ? { recipeId: smithingRecipeDef.id, name: smithingRecipeDef.name }
          : null,
      bank: {
        items: [...state.bank].map(([itemId, qty]) => ({ itemId, qty })),
        capacity: state.bankCapacity,
        nextSlotsPrice: nextBankSlotsPrice(state.bankCapacity),
      },
      areas: content.areas.map((area) => {
        const unlocked = areaUnlocked(area);
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

  /** Decrements the craft cooldown; at completion consumes `recipe.inputs` (never lost to an
   * earlier interruption — see selectRecipe/the other select* commands, which only ever swap
   * `state.smithing` wholesale, never mid-craft), adds the output Item, grants Smithing XP, and
   * emits item-crafted. Auto-repeats (re-arms the cooldown) while inputs still cover another
   * craft; otherwise clears Smithing back to idle with no extra event — the Snapshot shows it. */
  function smithingTick(): void {
    const smithing = state.smithing as { recipeId: string; craftCooldown: number };
    const recipe = recipeDef(smithing.recipeId);
    smithing.craftCooldown -= 1;
    if (smithing.craftCooldown > 0) return;

    for (const input of recipe.inputs) {
      const owned = state.inventory.get(input.itemId) ?? 0;
      const remaining = owned - input.qty;
      if (remaining > 0) state.inventory.set(input.itemId, remaining);
      else state.inventory.delete(input.itemId);
    }
    state.inventory.set(recipe.outputItemId, (state.inventory.get(recipe.outputItemId) ?? 0) + 1);
    grantXp("smithing", recipe.xp);
    emit({ type: "item-crafted", recipeId: recipe.id, itemId: recipe.outputItemId });

    if (canCraftRecipe(recipe)) {
      smithing.craftCooldown = recipe.craftTicks;
    } else {
      state.smithing = null;
    }
  }

  function tick(): void {
    regen();

    if (state.selectedSpotId !== null) {
      fishingTick();
      return;
    }

    if (state.smithing !== null) {
      smithingTick();
      return;
    }

    // Respawn is checked ahead of the "nothing selected" guard below: a Dungeon death clears
    // selectedMonsterId (see the death branch at the bottom of this function) so Respawn can
    // still count down to completion with no Monster selected — it just completes to idle
    // instead of auto-resuming. The spawn on completion is guarded accordingly.
    if (state.respawnTicksLeft > 0) {
      state.respawnTicksLeft -= 1;
      if (state.respawnTicksLeft === 0) {
        state.hp = maxHp();
        if (state.selectedMonsterId !== null) spawnMonster(state.selectedMonsterId);
      }
      return;
    }

    if (state.selectedMonsterId === null) return;

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
      // Death ejects the player from a Dungeon run (all-or-nothing): clear dungeonRun AND
      // selectedMonsterId now, before Respawn starts, so Respawn completes to idle instead of
      // auto-resuming on the dungeon-only boss/wave Monster. Re-entry always restarts at wave 1.
      if (state.dungeonRun) {
        state.dungeonRun = null;
        state.selectedMonsterId = null;
      }
      emit({ type: "death" });
    }
  }

  // Activity resume (monster/fishing selection, cooldowns, monster HP) is already folded into
  // loadState/freshState above — nothing left to do here.

  return {
    tick,
    snapshot,
    selectMonster(monsterId) {
      monsterDef(monsterId); // throws on unknown id
      const area = content.areas.find((a) => a.monsterIds.includes(monsterId));
      if (area && !areaUnlocked(area)) {
        const dungeon = dungeonDef(area.unlockedByDungeonId as string);
        throw new Error(`${area.name} is locked — defeat ${dungeon.name}`);
      }
      state.selectedSpotId = null; // at most one of Monster / Fishing Spot / Dungeon / Smithing
      state.respawnTicksLeft = 0;
      state.hp = Math.max(state.hp, 1);
      state.dungeonRun = null; // leaving mid-run abandons it (all-or-nothing)
      state.smithing = null;
      spawnMonster(monsterId);
    },
    selectFishingSpot(spotId) {
      const spot = fishingSpotDef(spotId); // throws on unknown id
      const area = content.areas.find((a) => a.fishingSpotIds?.includes(spotId));
      if (area && !areaUnlocked(area)) {
        const dungeon = dungeonDef(area.unlockedByDungeonId as string);
        throw new Error(`${area.name} is locked — defeat ${dungeon.name}`);
      }
      if (level("fishing") < spot.levelReq) {
        throw new Error(`${spot.name} requires Fishing level ${spot.levelReq}`);
      }
      state.selectedMonsterId = null; // at most one of Monster / Fishing Spot / Dungeon / Smithing
      state.respawnTicksLeft = 0;
      state.hp = Math.max(state.hp, 1);
      state.dungeonRun = null; // leaving mid-run abandons it (all-or-nothing)
      state.smithing = null;
      state.selectedSpotId = spotId;
      state.catchCooldown = spot.catchTicks;
    },
    enterDungeon(dungeonId) {
      const dungeon = dungeonDef(dungeonId); // throws on unknown id
      const area = content.areas.find((a) => a.id === dungeon.areaId);
      if (area && !areaUnlocked(area)) {
        const gatingDungeon = dungeonDef(area.unlockedByDungeonId as string);
        throw new Error(`${area.name} is locked — defeat ${gatingDungeon.name}`);
      }
      state.selectedSpotId = null; // clears any Fishing Spot
      state.respawnTicksLeft = 0; // clears Respawn
      state.hp = Math.max(state.hp, 1); // mirrors selectMonster's respawn-cancel semantics
      state.smithing = null; // clears any Smithing activity
      state.dungeonRun = { dungeonId, waveIndex: 0 };
      spawnMonster(dungeon.waves[0] as string);
    },
    selectRecipe(recipeId) {
      const recipe = recipeDef(recipeId); // throws on unknown id
      if (level("smithing") < recipe.levelReq) {
        throw new Error(`${recipe.name} requires Smithing level ${recipe.levelReq}`);
      }
      if (!canCraftRecipe(recipe)) {
        throw new Error(`insufficient materials for ${recipe.name}`);
      }
      state.selectedMonsterId = null; // at most one of Monster / Fishing Spot / Dungeon / Smithing
      state.selectedSpotId = null;
      state.dungeonRun = null; // leaving mid-run abandons it (all-or-nothing)
      state.respawnTicksLeft = 0;
      state.hp = Math.max(state.hp, 1);
      state.smithing = { recipeId: recipe.id, craftCooldown: recipe.craftTicks };
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
      emit({ type: "equipped", itemId });
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
    deposit(itemId, qty = 1) {
      if (!Number.isInteger(qty) || qty < 1) throw new Error(`invalid deposit quantity: ${qty}`);
      const def = content.items.find((i) => i.id === itemId);
      if (!def) throw new Error(`unknown item: ${itemId}`);
      const owned = state.inventory.get(itemId) ?? 0;
      if (owned < qty) throw new Error(`you do not own ${qty} ${def.name}`);
      // Only a brand-new stack consumes a Bank Slot; topping up an existing one always fits.
      const isNewStack = !state.bank.has(itemId);
      if (isNewStack && state.bank.size >= state.bankCapacity) {
        throw new Error("bank is full");
      }

      const remaining = owned - qty;
      if (remaining > 0) state.inventory.set(itemId, remaining);
      else state.inventory.delete(itemId);
      state.bank.set(itemId, (state.bank.get(itemId) ?? 0) + qty);
    },
    withdraw(itemId, qty = 1) {
      if (!Number.isInteger(qty) || qty < 1) throw new Error(`invalid withdraw quantity: ${qty}`);
      const def = content.items.find((i) => i.id === itemId);
      if (!def) throw new Error(`unknown item: ${itemId}`);
      const banked = state.bank.get(itemId) ?? 0;
      if (banked < qty) throw new Error(`bank does not hold ${qty} ${def.name}`);

      // Carried inventory stays unlimited in v1: withdraw is never capacity-checked.
      const remaining = banked - qty;
      if (remaining > 0) state.bank.set(itemId, remaining);
      else state.bank.delete(itemId);
      state.inventory.set(itemId, (state.inventory.get(itemId) ?? 0) + qty);
    },
    buyBankSlots() {
      // Purchases spend carried gold only (currencyDef, never a hard-coded id); gold itself
      // is bankable as an ordinary stack, so the Bank's own gold is not spendable here.
      const price = nextBankSlotsPrice(state.bankCapacity);
      const carried = state.inventory.get(currencyDef.id) ?? 0;
      if (carried < price) throw new Error(`not enough gold: need ${price}`);

      const remaining = carried - price;
      if (remaining > 0) state.inventory.set(currencyDef.id, remaining);
      else state.inventory.delete(currencyDef.id);
      state.bankCapacity += BANK_SLOTS_PER_PURCHASE;
    },
    on(type, handler) {
      const list = handlers.get(type) ?? [];
      list.push(handler as (event: EngineEvent) => void);
      handlers.set(type, list);
    },
  };
}
