import { attackRoll, defenceRoll, effectiveLevel, hitChance, maxHit, weakSpot } from "./combat";
import { levelForXp, xpForLevel } from "./xp";
import { resolveContent } from "./validate-content";
import type { ResolvedContent } from "./validate-content";
import { ATTACK_TYPES, AUTO_EAT_THRESHOLDS, SKILL_NAMES } from "./types";
import type {
  AmmoDef,
  AreaDef,
  AttackType,
  AutoEatThreshold,
  CombatMode,
  CurrencyDef,
  DropBand,
  DungeonDef,
  EquipmentDef,
  FishingSpotDef,
  FoodDef,
  FoodSlot,
  ItemDef,
  MonsterDef,
  PetDef,
  PotionDef,
  PotionSlot,
  RecipeDef,
  SpellDef,
  CombatStyle,
  Content,
  EngineEvent,
  GearSlot,
  Rng,
  SkillName,
  Snapshot,
} from "./types";

/** The Monster-fighting sub-state shared by "combat" and "dungeon" activities: which Monster is
 * up, its remaining HP, and both combatants' attack cooldowns. */
interface MonsterFight {
  monsterId: string;
  monsterHp: number;
  playerCooldown: number;
  monsterCooldown: number;
}

interface CombatActivity extends MonsterFight {
  kind: "combat";
}

/** Sibling to CombatActivity: a Dungeon run is always mid-fight (waves and the boss are Monsters),
 * so it carries the same MonsterFight fields plus which run/Wave it's on. */
interface DungeonActivity extends MonsterFight {
  kind: "dungeon";
  dungeonId: string;
  /** 0-based index into DungeonDef.waves of the Monster currently up. */
  waveIndex: number;
}

interface FishingActivity {
  kind: "fishing";
  spotId: string;
  catchCooldown: number;
  /** The exact value `catchCooldown` was last armed to (#284) — set at every arm/re-arm site in
   * lockstep with `catchCooldown` itself, so `snapshot()` can derive `progress` as
   * `(cooldownTotal - catchCooldown) / cooldownTotal`. Internal only, never persisted — a resumed
   * activity always re-arms both fields together (see loadState), so there is no save-compat
   * concern and no stale-total risk. */
  cooldownTotal: number;
}

/** A Recipe in progress (#113: generalised from the old Smithing-only SmithingActivity — the
 * recipe itself carries `skill` now, so the activity needs no skill field of its own). */
interface ProductionActivity {
  kind: "production";
  recipeId: string;
  craftCooldown: number;
  /** Mirrors FishingActivity.cooldownTotal (#284): the exact value `craftCooldown` was last armed
   * to, kept in lockstep at every arm/re-arm site. Internal only, never persisted. */
  cooldownTotal: number;
}

/** The Engine's single "what is the player doing right now" value (#29): at most one of
 * Monster / Fishing Spot / Dungeon run / Recipe is ever active, enforced structurally by this
 * being one field rather than by hand in every select command. Every command that starts an
 * activity assigns this wholesale, which is what makes the exclusivity automatic — there is no
 * per-command "clear the other three" bookkeeping left to forget. */
type Activity = CombatActivity | DungeonActivity | FishingActivity | ProductionActivity | null;

interface State {
  xp: Record<SkillName, number>;
  hp: number;
  combatStyle: CombatStyle;
  autoEatThreshold: AutoEatThreshold;
  /** Toggles auto-sell of duplicate Equipment (#63) — see creditCombatItem/isDuplicateEquipment. */
  autoSellDuplicates: boolean;
  /** The Active Food Slot loadout (#61), fixed length FOOD_SLOT_COUNT; see FoodSlot's own doc
   * (types.ts) for the home/routing/priority rules. */
  foodSlots: FoodSlot[];
  /** The active-potion loadout slot (#118) — see PotionSlot's own doc (types.ts) for the
   * shape/qualifying-action rules. */
  potionSlot: PotionSlot;
  /** The Quiver (#119) — see Snapshot.player.quiver's own doc (types.ts) for the shape/home
   * rules. `null` = empty; a depleted stack stays loaded at qty 0 (empty != unloaded, mirrors a
   * Food Slot). */
  quiver: { itemId: string; qty: number } | null;
  /** The Rune Slot (#221) — see Snapshot.player.runeSlot's own doc (types.ts) for the shape/home
   * rules. `null` = empty; a depleted stack stays loaded at qty 0 (empty != unloaded, mirrors the
   * Quiver above exactly). The loaded rune's itemId determines the currently castable Spell — see
   * `currentSpell`. */
  runeSlot: { itemId: string; qty: number } | null;
  /** Whether an empty-Quiver out-of-ammo event has already fired for the CURRENT depletion
   * (#119) — reset to false the moment the Quiver holds qty > 0 again, so the next depletion
   * fires its own event instead of staying silently suppressed forever. Never persisted — a fresh
   * load always starts un-warned, same as respawnTicksLeft/regenTicks below. */
  quiverOutWarned: boolean;
  /** Whether an empty/depleted-Rune-Slot out-of-ammo event has already fired for the CURRENT
   * depletion (#221) — mirrors quiverOutWarned's shape exactly, now singular since there is only
   * one Rune Slot. Never persisted. */
  runeOutWarned: boolean;
  activity: Activity;
  /** The player's currency balance (#59) — gold stopped being an item stack; the Bank below is
   * the sole store for every other Item. */
  gold: number;
  bank: Map<string, number>;
  bankCapacity: number;
  /** The Loot Zone (#60): combat Drops land here first, capped at LOOT_ZONE_CAPACITY stacks; a
   * sibling store to `bank`, swept into it on leaving combat or via lootAll(). */
  lootZone: Map<string, number>;
  equipment: Record<GearSlot, string | null>;
  respawnTicksLeft: number;
  regenTicks: number;
  completedDungeonIds: Set<string>;
  /** Owned Pet ids (#120) — mirrors completedDungeonIds' Set shape; see Snapshot.player.ownedPets'
   * own doc for the append-only/serialisation rules. */
  ownedPets: Set<string>;
}

type EventHandler<T extends EngineEvent["type"]> = (
  event: Extract<EngineEvent, { type: T }>,
) => void;

export type LoadoutKind = "food" | "potion" | "quiver" | "rune";

export interface Engine {
  tick(): void;
  selectMonster(monsterId: string): void;
  selectFishingSpot(spotId: string): void;
  enterDungeon(dungeonId: string): void;
  selectRecipe(recipeId: string): void;
  setCombatStyle(style: CombatStyle): void;
  setAutoEatThreshold(threshold: AutoEatThreshold): void;
  /** Toggles auto-sell of duplicate Equipment (#63, default ON) — see creditCombatItem/
   * isDuplicateEquipment for the rule. Throws on a non-boolean value. */
  setAutoSellDuplicates(on: boolean): void;
  equip(itemId: string): void;
  /** Assigns `itemId` to the named Loadout Slot kind. `slotIndex` picks WHICH Food Slot
   * (0..FOOD_SLOT_COUNT-1) and is REQUIRED for kind "food"; for the singular kinds
   * (potion/quiver/rune) it must be omitted. Per ADR-0001 invalid commands throw loudly:
   * missing/out-of-range food index throws, a provided index on a singular kind throws.
   * All per-kind rules are preserved verbatim from the commands this replaces. */
  assignLoadoutSlot(kind: LoadoutKind, itemId: string, slotIndex?: number): void;
  /** Clears the named slot back to null, returning its stock to the Bank — same throw
   * and no-op rules as the unassign/unload commands this replaces. Same slotIndex rule
   * as assignLoadoutSlot (required for "food", forbidden otherwise). */
  clearLoadoutSlot(kind: LoadoutKind, slotIndex?: number): void;
  /** Eats one unit from Food Slot `slotIndex` (no-overheal, same math as the old `eatFood`).
   * Throws on an out-of-range index, or a `null`/qty-0 slot. */
  eatFromSlot(slotIndex: number): void;
  /** Buys `qty` (default 1) of `itemId` from `content.vendor`'s fixed price list (#119): cost is
   * `price * qty`; throws `` `not enough gold: need ${cost}` `` if short (mirrors `buyBankSlots`)
   * and "bank is full" if a brand-new Bank stack is needed at capacity (a player command, never
   * auto-sold — same rule as `equip`). Emits item-bought. Throws on an itemId the vendor doesn't
   * sell, or an invalid qty. */
  buy(itemId: string, qty?: number): void;
  sell(itemId: string, qty?: number): void;
  buyBankSlots(): void;
  /** Sweeps the Loot Zone into the Bank on demand (#60) — the same sweep auto-loot runs on
   * leaving combat. Idempotent and never throws: the Loot Zone may legally sit un-banked
   * forever, and a stack that can't fit a full Bank simply stays put for next time. */
  lootAll(): void;
  snapshot(): Snapshot;
  on<T extends EngineEvent["type"]>(type: T, handler: EventHandler<T>): void;
}

/** Ticks between player attacks with the weapon slot empty; the single owner of this fact —
 * app.ts imports it for the Character panel, and validateContent (#90) requires every weapon to
 * declare its own attackSpeed, so this is never a silent default for content. */
export const UNARMED_SPEED = 4;
const RESPAWN_TICKS = 8;
/** Ticks between passive HP regen while below max HP (ADR: not during Respawn). */
const REGEN_TICKS = 10;
const DEFAULT_AUTO_EAT_THRESHOLD: AutoEatThreshold = 0.5;
/** Auto-sell-duplicate-Equipment toggle (#63): default ON. */
const DEFAULT_AUTO_SELL_DUPLICATES = true;

/** Active Food Slot count (#61): tuning, not spec — a fixed-length loadout that replaced
 * free-form eat-from-Bank. Slot order (array index) is auto-eat's draining priority. */
const FOOD_SLOT_COUNT = 3;

/** Loot Zone capacity (#60): max STACKS the zone holds, mirroring a Bank Slot's "1 stack, any
 * qty" rule. Tuning, not spec. */
export const LOOT_ZONE_CAPACITY = 10;

/** Element weakness damage multiplier (Combat Depth wave 3/4, #101) — the ONE damage-side
 * modifier in the otherwise accuracy-only Hybrid combat model: a spell whose element matches
 * `monster.weakElement` deals this much more damage. Tuning default, not spec. */
const ELEMENT_WEAKNESS_MULT = 1.5;

/** Pets (#120): tiny per-qualifying-action chance to roll that action's pet (see `rollPetDrop`;
 * an already-owned pet is skipped, never re-rolled). Boss pets use a higher constant: a boss kill
 * is itself a far rarer event than an ordinary kill/Catch/craft, so its own pet needs a higher
 * per-kill chance to land at a comparable real-world rate. Both are tuning, not spec — tests force
 * or deny a roll deterministically via the injected `Rng` seam instead of grinding for real
 * (#234). */
const PET_DROP_CHANCE = 1 / 2000;
const BOSS_PET_DROP_CHANCE = 1 / 300;

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

/** Tolerant load of `player.autoSellDuplicates` (#63): anything but an actual boolean — including
 * a missing key entirely, e.g. a pre-#63 save — falls back to the default (true). */
function loadAutoSellDuplicates(saved: Snapshot): boolean {
  const raw: unknown = saved.player?.autoSellDuplicates;
  return typeof raw === "boolean" ? raw : DEFAULT_AUTO_SELL_DUPLICATES;
}

const COMBAT_STYLES: readonly CombatStyle[] = ["accurate", "aggressive", "defensive", "rapid"];

function isCombatStyle(value: unknown): value is CombatStyle {
  return (COMBAT_STYLES as readonly unknown[]).includes(value);
}

function isStyleLegalForMode(style: CombatStyle, mode: CombatMode): boolean {
  if (mode === "melee") return style !== "rapid";
  return style !== "aggressive";
}

/** Aggressive ↔ Rapid when the equipped weapon's Combat Mode changes (#339). */
function remapCombatStyle(style: CombatStyle, newMode: CombatMode): CombatStyle {
  if (newMode === "melee") {
    return style === "rapid" ? "aggressive" : style;
  }
  return style === "aggressive" ? "rapid" : style;
}

function styleAdjustedWeaponSpeed(
  weaponId: string | null,
  style: CombatStyle,
  mode: CombatMode,
  content: ResolvedContent,
): number {
  let speed = weaponSpeedFor(weaponId, content);
  if (style === "rapid" && (mode === "ranged" || mode === "magic")) {
    speed = Math.max(1, speed - 1);
  }
  return speed;
}

/** Ticks between player attacks for `weaponId`; unarmed (or an unresolvable/non-equipment id)
 * falls back to UNARMED_SPEED. Pure so it can size a resumed fight's cooldown during load,
 * before the Engine's closures (which call this with `state.equipment.weapon`) exist yet. */
function weaponSpeedFor(weaponId: string | null, content: ResolvedContent): number {
  if (weaponId === null) return UNARMED_SPEED;
  const def = content.itemsById.get(weaponId);
  return def?.kind === "equipment" ? (def.attackSpeed ?? UNARMED_SPEED) : UNARMED_SPEED;
}

/** Attack Type for `weaponId` (#99); unarmed or an unresolvable/non-equipment id both fall back to
 * "crush" — the OSRS unarmed-punch type — mirroring weaponSpeedFor's fallback pattern above,
 * including being pure for the same load-before-closures reason. A resolvable weapon always
 * carries `attackType` (validateContent requires it), but the `?? "crush"` guards content that
 * hasn't been validated yet. */
function weaponAttackTypeFor(weaponId: string | null, content: ResolvedContent): AttackType {
  if (weaponId === null) return "crush";
  const def = content.itemsById.get(weaponId);
  return def?.kind === "equipment" ? (def.attackType ?? "crush") : "crush";
}

/** Combat Mode for `weaponId` (#7) — since #99 derived from the weapon's Attack Type rather than
 * a stored field: stab/slash/crush all train melee, ranged trains ranged, magic trains magic. One
 * source of truth (weaponAttackTypeFor above); this function only maps that type to its Combat
 * Mode family. */
export function weaponCombatModeFor(weaponId: string | null, content: ResolvedContent): CombatMode {
  const type = weaponAttackTypeFor(weaponId, content);
  if (type === "ranged") return "ranged";
  if (type === "magic") return "magic";
  return "melee";
}

/** The no-save defaults: a level-1 player (Hitpoints 10, per ADR), full HP, nothing selected. */
function freshState(_content: Content): State {
  return {
    xp: {
      attack: 0,
      strength: 0,
      defence: 0,
      hitpoints: xpForLevel(10),
      fishing: 0,
      smithing: 0,
      ranged: 0,
      magic: 0,
      cooking: 0,
      crafting: 0,
      herblore: 0,
    },
    hp: 10,
    combatStyle: "aggressive",
    autoEatThreshold: DEFAULT_AUTO_EAT_THRESHOLD,
    autoSellDuplicates: DEFAULT_AUTO_SELL_DUPLICATES,
    foodSlots: Array.from({ length: FOOD_SLOT_COUNT }, () => null),
    potionSlot: null,
    quiver: null,
    runeSlot: null,
    quiverOutWarned: false,
    runeOutWarned: false,
    activity: null,
    gold: 0,
    bank: new Map(),
    bankCapacity: BANK_START_CAPACITY,
    lootZone: new Map(),
    equipment: {
      weapon: null,
      shield: null,
      head: null,
      body: null,
      legs: null,
      amulet: null,
      ring: null,
    },
    respawnTicksLeft: 0,
    regenTicks: 0,
    completedDungeonIds: new Set(),
    ownedPets: new Set(),
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
 * matches that slot; otherwise the slot loads empty. Closes both dangling and wrong-slot refs.
 * Tolerant of a pre-#117 save whose `player.equipment` has no amulet/ring keys at all: they
 * simply fall through to this literal's own `null` defaults, same as any other missing key. */
function loadEquipment(saved: Snapshot, content: ResolvedContent): Record<GearSlot, string | null> {
  const equipment: Record<GearSlot, string | null> = {
    weapon: null,
    shield: null,
    head: null,
    body: null,
    legs: null,
    amulet: null,
    ring: null,
  };
  const savedEquipment: Partial<Record<GearSlot, unknown>> | undefined = saved.player?.equipment;
  if (!savedEquipment) return equipment;
  for (const slot of Object.keys(equipment) as GearSlot[]) {
    const itemId = savedEquipment[slot];
    if (typeof itemId !== "string") continue;
    const def = content.itemsById.get(itemId);
    if (def?.kind === "equipment" && def.slot === slot) equipment[slot] = itemId;
  }
  return equipment;
}

/** Tolerant load of `player.foodSlots` (#61): missing entirely -> FOOD_SLOT_COUNT nulls; an array
 * of the wrong length is normalized (extra entries dropped, short ones padded with null); an
 * entry whose itemId is unknown or not a FoodDef loads as null — old saves' Food (already
 * migrated to the Bank by #59's inventory removal) simply starts unassigned; qty is coerced to a
 * finite non-negative integer, falling back to 0 (a slot may legitimately sit at qty 0 while
 * still assigned — empty != unassigned, see FoodSlot's doc). */
function loadFoodSlots(saved: Snapshot, content: ResolvedContent): FoodSlot[] {
  const raw: unknown = saved.player?.foodSlots;
  const entries = Array.isArray(raw) ? raw : [];
  const slots: FoodSlot[] = [];
  for (let i = 0; i < FOOD_SLOT_COUNT; i++) {
    const entry = entries[i] as { itemId?: unknown; qty?: unknown } | null | undefined;
    const itemId: unknown = entry?.itemId;
    const def = typeof itemId === "string" ? content.itemsById.get(itemId) : undefined;
    if (!entry || def?.kind !== "food") {
      slots.push(null);
      continue;
    }
    const qty: unknown = entry.qty;
    const validQty = typeof qty === "number" && Number.isInteger(qty) && qty >= 0 ? qty : 0;
    slots.push({ itemId: def.id, qty: validQty });
  }
  return slots;
}

/** Tolerant load of `player.potionSlot` (#118): missing/pre-#118 -> null (a save-shape slice,
 * same tolerance as `foodSlots`/`spell` before it). An itemId that doesn't resolve to a PotionDef
 * -> null. qty/charges are coerced to finite positive integers; unlike a Food Slot, a Potion Slot
 * is NEVER assigned-but-empty (see PotionSlot's own doc), so a non-positive qty OR charges both
 * collapse the whole slot to null rather than loading a partially-valid one. */
function loadPotionSlot(saved: Snapshot, content: ResolvedContent): PotionSlot {
  const raw = saved.player?.potionSlot as
    { itemId?: unknown; qty?: unknown; charges?: unknown } | null | undefined;
  if (!raw) return null;
  const itemId: unknown = raw.itemId;
  const def = typeof itemId === "string" ? content.itemsById.get(itemId) : undefined;
  if (def?.kind !== "potion") return null;
  if (!isPositiveIntQty(raw.qty) || !isPositiveIntQty(raw.charges)) return null;
  return { itemId: def.id, qty: raw.qty, charges: raw.charges };
}

/** True for a finite positive integer — the shared qty validity check every loadState migration
 * helper below applies before trusting a saved stack's quantity. */
function isPositiveIntQty(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

/** True for a finite non-negative integer — the Quiver/Rune Pouch equivalent of isPositiveIntQty
 * above: unlike a Bank/Loot-Zone stack (which never persists at qty 0 — see loadBank), the Quiver
 * and each Rune Pouch stack legitimately sit at qty 0 while still loaded (empty != unloaded,
 * mirrors loadFoodSlots' own qty>=0 tolerance). */
function isNonNegativeIntQty(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/** Tolerant load of `player.quiver` (#119): missing/pre-#119 -> null (a save-shape slice, same
 * tolerance as `potionSlot`/`spell` before it). An itemId that doesn't resolve to an
 * `ammoType: "arrow"` AmmoDef -> null (dropped/renamed content, or a corrupted save). qty is
 * coerced to a finite non-negative integer, falling back to 0 (a depleted Quiver legitimately
 * sits at qty 0 while still loaded — see isNonNegativeIntQty above). */
function loadSavedQuiver(
  saved: Snapshot,
  content: ResolvedContent,
): { itemId: string; qty: number } | null {
  const raw = saved.player?.quiver as { itemId?: unknown; qty?: unknown } | null | undefined;
  if (!raw) return null;
  const itemId: unknown = raw.itemId;
  const def = typeof itemId === "string" ? content.itemsById.get(itemId) : undefined;
  if (def?.kind !== "ammo" || def.ammoType !== "arrow") return null;
  const qty = isNonNegativeIntQty(raw.qty) ? raw.qty : 0;
  return { itemId: def.id, qty };
}

/** Tolerant load of `player.runeSlot` (#221): missing/pre-#221 -> null (a save-shape slice, same
 * tolerance as `quiver`/`potionSlot` before it — see `loadLegacyRuneStacks` below for the pre-#221
 * `runePouch` migration path, which banks the old stacks instead of guessing which one matches the
 * dropped `spellId`). An itemId that doesn't resolve to an `ammoType: "rune"` AmmoDef -> null
 * (dropped/renamed content, or a corrupted save). qty is coerced to a finite non-negative integer,
 * falling back to 0 (a depleted Rune Slot legitimately sits at qty 0 while still loaded — mirrors
 * loadSavedQuiver's own tolerance exactly). */
function loadSavedRuneSlot(
  saved: Snapshot,
  content: ResolvedContent,
): { itemId: string; qty: number } | null {
  const raw = saved.player?.runeSlot as { itemId?: unknown; qty?: unknown } | null | undefined;
  if (!raw) return null;
  const itemId: unknown = raw.itemId;
  const def = typeof itemId === "string" ? content.itemsById.get(itemId) : undefined;
  if (def?.kind !== "ammo" || def.ammoType !== "rune") return null;
  const qty = isNonNegativeIntQty(raw.qty) ? raw.qty : 0;
  return { itemId: def.id, qty };
}

/** Migration (#221): every valid pre-#221 `player.runePouch` stack, to be folded into the Bank via
 * `addToBank` once the Engine's Bank machinery exists (see createEngine) — never returned directly
 * as a loaded Rune Slot. Owner decision, verbatim: "bank everything, start empty" — unambiguous
 * over guessing which of up to four stacks matches the dropped `spellId`, and cannot silently
 * switch which Spell the player ends up casting. An itemId that doesn't resolve to an
 * `ammoType: "rune"` AmmoDef, or a non-positive qty, is dropped silently (mirrors loadBank's own
 * tolerant-drop rule); duplicate itemIds (a corrupted save) sum their quantities. */
function loadLegacyRuneStacks(
  saved: Snapshot,
  content: ResolvedContent,
): { itemId: string; qty: number }[] {
  // Pre-#221 saves carried `player.runePouch`; Snapshot no longer has that field (mirrors
  // loadLegacyInventory's own narrow cast for pre-#59 `player.inventory` above), so it's read
  // back only here, through a narrow cast, at this migration boundary.
  const legacy = saved as unknown as { player?: { runePouch?: unknown } };
  const raw: unknown = legacy.player?.runePouch;
  if (!Array.isArray(raw)) return [];
  const stacks = new Map<string, number>();
  for (const entry of raw as { itemId?: unknown; qty?: unknown }[]) {
    const itemId: unknown = entry?.itemId;
    const def = typeof itemId === "string" ? content.itemsById.get(itemId) : undefined;
    if (def?.kind !== "ammo" || def.ammoType !== "rune") continue;
    if (!isPositiveIntQty(entry?.qty)) continue;
    stacks.set(def.id, (stacks.get(def.id) ?? 0) + entry.qty);
  }
  return [...stacks.entries()].map(([itemId, qty]) => ({ itemId, qty }));
}

/** Pre-#59 saves persisted a carried `player.inventory` stack array (including a currency
 * stack); Snapshot no longer has that field, so it's read back only here, through a narrow cast,
 * at the loadGold/loadBank migration boundary. A current-format save simply has no such array. */
function loadLegacyInventory(saved: Snapshot): { itemId: unknown; qty: unknown }[] {
  const legacy = saved as unknown as {
    player?: { inventory?: { itemId?: unknown; qty?: unknown }[] };
  };
  return (legacy.player?.inventory ?? []).map((entry) => ({
    itemId: entry?.itemId,
    qty: entry?.qty,
  }));
}

/** Migration (#59): `player.gold` folds in the old currency stack from `player.inventory` (a
 * pre-#59 save) plus any currency stack that had been deposited into `bank.items` — both
 * pre-#59 shapes, since currency now never reaches the Bank. A missing/invalid `player.gold`
 * defaults to 0 before those are added, so a fresh field-less save still loads at 0 gold. */
function loadGold(saved: Snapshot, currencyId: string): number {
  const raw: unknown = saved.player?.gold;
  let gold = typeof raw === "number" && Number.isFinite(raw) && raw >= 0 ? raw : 0;
  for (const entry of loadLegacyInventory(saved)) {
    if (entry.itemId === currencyId && isPositiveIntQty(entry.qty)) gold += entry.qty;
  }
  for (const entry of saved.bank?.items ?? []) {
    if (entry?.itemId === currencyId && isPositiveIntQty(entry?.qty)) gold += entry.qty;
  }
  return gold;
}

/** Drops Bank entries whose itemId isn't in Content, isn't the currency item (folded into gold
 * by loadGold instead, see above), or whose qty isn't a positive integer; keeps the rest, summed
 * across sources. Migration (#59): every pre-#59 `player.inventory` stack other than currency
 * merges in here too, on top of whatever `bank.items` already held — capacity is NOT enforced on
 * load (it only gates NEW incoming stacks at runtime), so a merge may leave the Bank over
 * capacity; that's fine and self-resolving as the player sells/uses items down. */
function loadBank(saved: Snapshot, content: Content, currencyId: string): Map<string, number> {
  const itemIds = new Set(content.items.map((i) => i.id));
  const bank = new Map<string, number>();
  const addStack = (itemId: unknown, qty: unknown): void => {
    if (typeof itemId !== "string" || itemId === currencyId || !itemIds.has(itemId)) return;
    if (!isPositiveIntQty(qty)) return;
    bank.set(itemId, (bank.get(itemId) ?? 0) + qty);
  };
  for (const entry of saved.bank?.items ?? []) addStack(entry?.itemId, entry?.qty);
  for (const entry of loadLegacyInventory(saved)) addStack(entry.itemId, entry.qty);
  return bank;
}

/** Drops Loot Zone entries whose itemId isn't in Content, is the currency item (currency never
 * enters the zone — a defensively-tolerated corruption, not a real path), or whose qty isn't a
 * positive integer; keeps the rest, summed across duplicate entries. Mirrors loadBank's tolerant
 * shape; unlike loadBank, capacity (LOOT_ZONE_CAPACITY stacks) is NOT enforced on load either —
 * same rationale, it only gates NEW incoming stacks at runtime. A missing field defaults to []. */
function loadLootZone(saved: Snapshot, content: Content, currencyId: string): Map<string, number> {
  const itemIds = new Set(content.items.map((i) => i.id));
  const zone = new Map<string, number>();
  for (const entry of saved.lootZone ?? []) {
    const itemId: unknown = entry?.itemId;
    const qty: unknown = entry?.qty;
    if (typeof itemId !== "string" || itemId === currencyId || !itemIds.has(itemId)) continue;
    if (!isPositiveIntQty(qty)) continue;
    zone.set(itemId, (zone.get(itemId) ?? 0) + qty);
  }
  return zone;
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
function loadCompletedDungeonIds(saved: Snapshot, content: ResolvedContent): Set<string> {
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
function migrateCompletedDungeonIdsFromAreaGates(
  saved: Snapshot,
  content: ResolvedContent,
): Set<string> {
  const completed = new Set<string>();
  for (const savedArea of saved.areas ?? []) {
    if (savedArea?.unlocked !== true) continue;
    const areaId: unknown = savedArea?.id;
    if (typeof areaId !== "string") continue;
    const area = content.areasById.get(areaId);
    if (area?.unlockedByDungeonId) completed.add(area.unlockedByDungeonId);
  }
  return completed;
}

/** Owned Pet ids (#120): keeps only entries that are strings naming a real PetDef, dropping
 * anything else (unknown/renamed ids, stray non-strings) — mirrors loadCompletedDungeonIds' own
 * filter-to-known-ids pattern. Unlike completedDungeonIds, there is no pre-#120 migration to
 * reconstruct: missing/non-array simply means "no pets yet" -> an empty Set (a fresh save-shape
 * slice, same tolerance as potionSlot/quiver before it). */
function loadOwnedPets(saved: Snapshot, content: ResolvedContent): Set<string> {
  const petIds = new Set(content.pets.map((p) => p.id));
  const raw: unknown = saved.player?.ownedPets;
  if (!Array.isArray(raw)) return new Set();
  return new Set(raw.filter((id): id is string => typeof id === "string" && petIds.has(id)));
}

/** Whether `bank` covers at least one craft of `recipe` (mirrors the Engine's own
 * canCraftRecipe, duplicated here because loadState runs before the Engine's closures exist). */
function canCraftFromBank(recipe: RecipeDef, bank: Map<string, number>): boolean {
  return recipe.inputs.every((input) => (bank.get(input.itemId) ?? 0) >= input.qty);
}

/** Resolves a resumable production activity (#113: generalised from the old Smithing-only
 * loadSmithing): `blocked` is true when a Monster or Fishing Spot already claimed the resume
 * slot (mirrors the monster > fishing priority above; production is lowest priority since
 * Content's construction order and Dungeon's all-or-nothing rule both predate it). Reads
 * `saved.production ?? saved.smithing` (tolerant back-compat: a pre-#113 save only ever wrote
 * `smithing`) and gates on `level(recipe.skill)`, not a hardcoded Smithing. An unknown recipe id,
 * an under-leveled recipe, or one short on inputs all resume idle instead of throwing (tolerant
 * load, same as an unknown monster/fishing spot id) — the cooldown always re-arms to
 * `craftTicks` on resume, per #28. */
function loadProduction(
  saved: Snapshot,
  content: ResolvedContent,
  bank: Map<string, number>,
  xp: Record<SkillName, number>,
  blocked: boolean,
): ProductionActivity | null {
  // Pre-#113 saves only ever wrote `smithing` (no `production` key) — Snapshot's type no longer
  // declares that field, so it's read through an explicit legacy-shape cast, same discipline as
  // the rest of loadState's tolerant-of-anything save parsing.
  const legacySmithing = (saved as { smithing?: { recipeId?: unknown } }).smithing;
  const recipeId: unknown = blocked
    ? undefined
    : (saved.production?.recipeId ?? legacySmithing?.recipeId);
  const recipe = typeof recipeId === "string" ? content.recipesById.get(recipeId) : undefined;
  if (!recipe) return null;
  if (levelForXp(xp[recipe.skill]) < recipe.levelReq) return null;
  if (!canCraftFromBank(recipe, bank)) return null;
  return {
    kind: "production",
    recipeId: recipe.id,
    craftCooldown: recipe.craftTicks,
    cooldownTotal: recipe.craftTicks,
  };
}

/** Tolerant validation of every saved field (ADR-0001 extended: loaded save data never throws,
 * unlike malformed Content or invalid COMMANDS). A corrupted or schema-drifted save still loads
 * and keeps the player's progress; a bad field falls back to default or is dropped, never bricks
 * the save. A clean Snapshot round-trips through this unchanged. */
function loadState(saved: Snapshot, content: ResolvedContent): State {
  // Non-null: validateContent (run before loadState, see createEngine) guarantees exactly one.
  const currencyId = content.items.find((i) => i.kind === "currency")!.id;
  const xp = loadXp(saved);
  const maxHp = levelForXp(xp.hitpoints);
  const equipment = loadEquipment(saved, content);
  const bank = loadBank(saved, content, currencyId);
  const gold = loadGold(saved, currencyId);

  // Two-handed weapons occupy the shield hand (#340): old saves may have bow+shield both set.
  // Reconcile immediately after equipment/bank restore, before combat-mode/style derivation.
  // Tolerant load may temporarily exceed bankCapacity — capacity is enforced at command time only.
  const weaponId = equipment.weapon;
  const weaponDef = weaponId ? content.itemsById.get(weaponId) : undefined;
  if (
    weaponDef?.kind === "equipment" &&
    weaponDef.twoHanded === true &&
    equipment.shield !== null
  ) {
    const shieldId = equipment.shield;
    bank.set(shieldId, (bank.get(shieldId) ?? 0) + 1);
    equipment.shield = null;
  }

  const combatMode = weaponCombatModeFor(equipment.weapon, content);
  let combatStyle: CombatStyle = isCombatStyle(saved.player?.combatStyle)
    ? saved.player.combatStyle
    : "aggressive";
  combatStyle = remapCombatStyle(combatStyle, combatMode);

  // Mid-run Dungeon state is NEVER persisted: a reload is an abandon. A save captured mid-run
  // ignores BOTH saved.dungeon and saved.monster — the naive path (spawnMonster(saved.monster.id))
  // would turn a dungeon-only boss into an infinitely farmable open-world Monster.
  const dungeonActive = saved.dungeon != null;

  // Activity resume: an unknown saved monster/fishing id resumes idle instead of throwing.
  const monsterId: unknown = dungeonActive ? undefined : saved.monster?.id;
  const monster = typeof monsterId === "string" ? content.monstersById.get(monsterId) : undefined;
  const spotId: unknown = !monster ? saved.fishing?.spotId : undefined;
  const spot = typeof spotId === "string" ? content.fishingSpotsById.get(spotId) : undefined;
  const savedMonsterHp: unknown = saved.monster?.hp;
  const production = loadProduction(
    saved,
    content,
    bank,
    xp,
    dungeonActive || monster !== undefined || spot !== undefined,
  );

  // Priority mirrors the resolution above: a resumed Monster wins over a resumed Fishing Spot,
  // which wins over a resumed production Recipe; a Dungeon run never resumes (see the comment
  // above). By construction at most one of monster/spot/production is set, so this is a plain
  // cascade, not another hand-maintained mutual-exclusion check.
  let activity: Activity = null;
  if (monster) {
    activity = {
      kind: "combat",
      monsterId: monster.id,
      monsterHp:
        typeof savedMonsterHp === "number" && Number.isFinite(savedMonsterHp)
          ? savedMonsterHp
          : monster.hp,
      playerCooldown: styleAdjustedWeaponSpeed(equipment.weapon, combatStyle, combatMode, content),
      monsterCooldown: monster.attackSpeed,
    };
  } else if (spot) {
    activity = {
      kind: "fishing",
      spotId: spot.id,
      catchCooldown: spot.catchTicks,
      cooldownTotal: spot.catchTicks,
    };
  } else if (production) {
    activity = production;
  }

  return {
    xp,
    hp: loadHp(saved, maxHp),
    combatStyle,
    autoEatThreshold: isAutoEatThreshold(saved.player?.autoEatThreshold)
      ? saved.player.autoEatThreshold
      : DEFAULT_AUTO_EAT_THRESHOLD,
    autoSellDuplicates: loadAutoSellDuplicates(saved),
    foodSlots: loadFoodSlots(saved, content),
    potionSlot: loadPotionSlot(saved, content),
    quiver: loadSavedQuiver(saved, content),
    runeSlot: loadSavedRuneSlot(saved, content),
    quiverOutWarned: false,
    runeOutWarned: false,
    activity,
    gold,
    bank,
    bankCapacity: loadBankCapacity(saved),
    lootZone: loadLootZone(saved, content, currencyId),
    equipment,
    respawnTicksLeft: 0,
    regenTicks: 0,
    completedDungeonIds: loadCompletedDungeonIds(saved, content),
    ownedPets: loadOwnedPets(saved, content),
  };
}

/**
 * Modifier-aggregation layer (#114): the single place that collects percentage boosts from every
 * active source — the active potion (#118), every owned pet (#120, unconditional — no slot, no
 * charges), later gear upgrades (#67) — and folds them into effective Skill levels and action
 * speeds before combat math and tick cadence ever see them. `pct` is a fraction (0.2 == +20%).
 */
type ModifierTarget = SkillName | "fishing-speed" | "production-speed";
interface ModifierSource {
  target: ModifierTarget;
  pct: number;
}

/**
 * `content`/`rng` as before; `saved` resumes a Snapshot (tolerant field-by-field load, see
 * loadState); `now` (#69) is the clock `snapshot()` stamps `savedAt` from on every call — defaults
 * to `Date.now`, mirroring `rng`'s injected-randomness precedent, so tests can pin `savedAt` to a
 * literal value instead of racing the real clock.
 */
export function createEngine(
  content: Content,
  rng: Rng,
  saved?: Snapshot,
  now: () => number = Date.now,
): Engine {
  // Fail loud on malformed Content (ADR-0001 extended to construction): resolveContent runs
  // validateContent and throws the same aggregate message on violations, then builds the by-id
  // maps every lookup below reads from instead of re-scanning a Content array (#185).
  const resolved: ResolvedContent = resolveContent(content);

  // Located once here, never by a hard-coded id: whichever Item Content declares as currency.
  // Non-null: validateContent guarantees exactly one currency item.
  const currencyDef: CurrencyDef = content.items.find(
    (i): i is CurrencyDef => i.kind === "currency",
  )!;

  // Loads are tolerant (ADR-0001, extended to a full field-by-field sweep by loadState): a
  // corrupted or schema-drifted save still loads and keeps the player's progress.
  const state: State = saved ? loadState(saved, resolved) : freshState(content);

  const handlers = new Map<string, ((event: EngineEvent) => void)[]>();

  function emit(event: EngineEvent): void {
    for (const handler of handlers.get(event.type) ?? []) handler(event);
  }

  // Rune Slot migration (#221): a pre-#221 `player.runePouch` may hold up to four valid stacks
  // that `loadState` deliberately did NOT turn into a loaded `state.runeSlot` (owner decision:
  // "bank everything, start empty" — see loadLegacyRuneStacks' own doc). Each stack is folded into
  // the Bank here, once `addToBank`/`emit` exist (it auto-sells on overflow rather than throwing,
  // so a full Bank can never make an old save unloadable) — `state.bank`/`state.gold` are already
  // final by the time any command or the first `snapshot()` runs. No listener has subscribed yet
  // at construction time, so an `overflow-sold`/`overflow-lost` fired here is unobservable via
  // events; the resulting Bank/gold state is the durable evidence instead.
  if (saved) {
    for (const { itemId, qty } of loadLegacyRuneStacks(saved, resolved)) {
      addToBank(itemId, qty);
    }
  }

  function level(skill: SkillName): number {
    return levelForXp(state.xp[skill]);
  }

  function monsterDef(id: string): MonsterDef {
    const def = resolved.monstersById.get(id);
    if (!def) throw new Error(`unknown monster: ${id}`);
    return def;
  }

  function fishingSpotDef(id: string): FishingSpotDef {
    const def = resolved.fishingSpotsById.get(id);
    if (!def) throw new Error(`unknown fishing spot: ${id}`);
    return def;
  }

  function dungeonDef(id: string): DungeonDef {
    const def = resolved.dungeonsById.get(id);
    if (!def) throw new Error(`unknown dungeon: ${id}`);
    return def;
  }

  function recipeDef(id: string): RecipeDef {
    const def = resolved.recipesById.get(id);
    if (!def) throw new Error(`unknown recipe: ${id}`);
    return def;
  }

  /** The Spell the loaded rune casts, or null when the Rune Slot is empty (#221). Replaces
   * `resolvedSpell()` and its "fall back to the lowest-levelReq spell" behaviour: with no rune
   * loaded there is no Spell at all, and `checkAmmo` blocks the swing before this is ever asked to
   * produce a max hit for a null Spell. Looked up via `spellsByRuneId` (validateContent guarantees
   * every rune resolves to exactly one Spell), keyed off the loaded stack's itemId regardless of
   * its qty — a depleted (qty 0) stack still resolves to its Spell, which is what lets the
   * "Casting: …" readout and the out-of-ammo event's `element` stay populated while depleted. */
  function currentSpell(): SpellDef | null {
    if (!state.runeSlot) return null;
    return resolved.spellsByRuneId.get(state.runeSlot.itemId) ?? null;
  }

  /** Whether the Bank covers at least one craft of `recipe`. */
  function canCraftRecipe(recipe: RecipeDef): boolean {
    return recipe.inputs.every((input) => (state.bank.get(input.itemId) ?? 0) >= input.qty);
  }

  /** An Area with no gating Dungeon is unlocked from the start; a gated Area unlocks the instant
   * its `unlockedByDungeonId` appears in `completedDungeonIds` — combat level gates nothing here
   * (#24: Dungeon-boss gating replaced combat-level Area gating). */
  function areaUnlocked(area: AreaDef): boolean {
    return !area.unlockedByDungeonId || state.completedDungeonIds.has(area.unlockedByDungeonId);
  }

  /** Throws the canonical locked-Area error if `area` is gated and its Dungeon is uncleared. */
  function assertAreaUnlocked(area: AreaDef | undefined): void {
    if (area && !areaUnlocked(area)) {
      const dungeon = dungeonDef(area.unlockedByDungeonId as string);
      throw new Error(`${area.name} is locked — defeat ${dungeon.name}`);
    }
  }

  function equippedDefs(): EquipmentDef[] {
    const defs: EquipmentDef[] = [];
    for (const itemId of Object.values(state.equipment)) {
      if (itemId === null) continue;
      const def = resolved.itemsById.get(itemId);
      if (def?.kind === "equipment") defs.push(def);
    }
    return defs;
  }

  /** atkBonus/strBonus/rangedStr/magicDamage, summed across equipped Gear Slots (#99: only the
   * weapon carries atk/str/ranged/magic fields now — armour dropped them — so in practice this
   * reads the equipped weapon alone; kept as a sum over `equippedDefs()` rather than a direct
   * weapon lookup so it stays correct if that ever changes). */
  function gearBonus(kind: "atkBonus" | "strBonus" | "rangedStr" | "magicDamage"): number {
    return equippedDefs().reduce((sum, def) => sum + (def[kind] ?? 0), 0);
  }

  /** Defence bonus for one Attack Type, summed across every equipped Gear Slot (#99) — the
   * per-type analogue of the old scalar defBonus sum. */
  function gearDef(type: AttackType): number {
    return equippedDefs().reduce((sum, def) => sum + def.def[type], 0);
  }

  /** Gold per unit if `def` can be sold; undefined for currency or anything without a value. */
  function sellValue(def: ItemDef): number | undefined {
    return def.kind === "currency" ? undefined : def.value;
  }

  function weaponSpeed(): number {
    const mode = weaponCombatModeFor(state.equipment.weapon, resolved);
    return styleAdjustedWeaponSpeed(state.equipment.weapon, state.combatStyle, mode, resolved);
  }

  /** Every currently-active modifier source (#114): every owned pet (#120 — unconditional, no
   * slot/charges, so a fully-collected roster folds in every one of them every call) PLUS this
   * instance's own real potion source (#118 — the active Potion Slot, when `charges > 0`).
   * Instance-local by construction (#234): reads only THIS Engine's `state.ownedPets` and
   * `state.potionSlot`, so two Engines never observe each other's sources. Only one potion is ever
   * active (the single Potion Slot), so at most one potion source is ever folded in here — no
   * same-type stacking; pets have no such limit (that's the point — see PetDef's own doc). */
  function activeModifierSources(): ModifierSource[] {
    const sources: ModifierSource[] = [];
    for (const petId of state.ownedPets) {
      const pet = resolved.petsById.get(petId);
      if (pet) sources.push({ target: pet.target, pct: pet.boostPct });
    }
    const slot = state.potionSlot;
    if (slot && slot.charges > 0) {
      const def = resolved.itemsById.get(slot.itemId);
      if (def?.kind === "potion") sources.push({ target: def.target, pct: def.boostPct });
    }
    return sources;
  }

  /** Aggregate level multiplier for a Skill: 1 + Σ(source boost fractions targeting it). Applied in
   * `playerAccuracyAndMaxHit` to every combat effective level (magic max hit excepted — it's
   * spell-driven, not Strength-derived). */
  function skillLevelMultiplier(skill: SkillName): number {
    let bonus = 0;
    for (const src of activeModifierSources()) if (src.target === skill) bonus += src.pct;
    return 1 + bonus;
  }

  /** Aggregate speed multiplier for an action kind (fishing catch, production craft): the factor
   * an action's tick cost is DIVIDED by when its cooldown re-arms (a faster action = larger
   * multiplier). 1 = no sources, so `Math.round(baseTicks / 1)` is the pre-#114 cadence unchanged. */
  function actionSpeedMultiplier(kind: "fishing" | "production"): number {
    const target: ModifierTarget = kind === "fishing" ? "fishing-speed" : "production-speed";
    let bonus = 0;
    for (const src of activeModifierSources()) if (src.target === target) bonus += src.pct;
    return 1 + bonus;
  }

  /** Pet roll (#120): the shared "roll every candidate pet at `chance`" step behind every
   * qualifying action (a kill, a Catch, a craft completion) — `candidates` is already filtered by
   * the caller to the pets whose `source` matches THIS action (a plain "combat"/"fishing"/
   * "production" pet, or a `{ boss }` pet whose id matches the just-killed Monster). An
   * already-owned pet is skipped entirely rather than rolled-and-ignored (the owner's "unique,
   * never re-rolls" rule), so a fully-collected roster costs nothing per action beyond the array
   * scan. */
  function rollPetDrop(candidates: PetDef[], chance: number): void {
    for (const pet of candidates) {
      if (state.ownedPets.has(pet.id)) continue;
      if (rng.next() < chance) {
        state.ownedPets.add(pet.id);
        emit({ type: "pet-dropped", petId: pet.id });
      }
    }
  }

  /** Decrements the active potion's remaining charges by 1 IF `matchesTarget` accepts its
   * `PotionDef.target` — the shared "qualifying action" rule (#118): `playerAttack` passes a
   * predicate matching any combat-Skill target, `fishingTick`/`productionTick` each pass one
   * matching their own speed target only, so a potion whose target doesn't match the current
   * activity simply doesn't drain (a Strength potion doesn't tick down while fishing). At 0
   * charges with `qty > 1`: auto-continue — consume one, reopen with fresh charges, buff stays
   * unbroken. At 0 charges with `qty === 1`: the slot clears to null, buff ends. No-op when the
   * slot is empty or holds an unresolvable itemId. */
  function decrementPotionCharge(matchesTarget: (target: ModifierTarget) => boolean): void {
    const slot = state.potionSlot;
    if (!slot) return;
    const def = resolved.itemsById.get(slot.itemId);
    if (def?.kind !== "potion" || !matchesTarget(def.target)) return;
    slot.charges -= 1;
    if (slot.charges > 0) return;
    slot.qty -= 1;
    if (slot.qty > 0) {
      slot.charges = def.charges;
    } else {
      state.potionSlot = null;
    }
  }

  function rollDamage(chance: number, max: number): { hit: boolean; damage: number } {
    if (rng.next() >= chance) return { hit: false, damage: 0 }; // miss
    return { hit: true, damage: Math.floor(rng.next() * (max + 1)) };
  }

  /** The Bank Slot invariant, stated once (#88): a top-up of an existing stack always fits; a
   * brand-new stack needs a free slot. `pulled` (default 0) is how many stacks the caller is
   * about to remove from `store` in the same operation — equip/assignLoadoutSlot check the
   * swap-back AFTER pulling the incoming item's own stack, because pulling its last unit can
   * itself free the slot the swap needs. */
  function hasRoomForNewStack(
    store: Map<string, number>,
    capacity: number,
    itemId: string,
    pulled = 0,
  ): boolean {
    if (store.has(itemId)) return true;
    return store.size - pulled < capacity;
  }

  // --- Loadout Slot seam (#182): the resolve-item/assert-kind/assert-ownership/pull-then-check
  // swap dance shared by assignLoadoutSlot/clearLoadoutSlot below.
  // Per-kind specifics (Food's slot bounds and "already assigned" check, Potion's charge
  // top-up/waste rules, the Rune Slot's levelReq gate) stay in their own private assign/clear
  // branches; only the dance's shared pieces live here.

  /** Resolves `itemId` to its ItemDef, throwing `kindError` unless it exists and `isKind`
   * accepts it — the resolve-and-assert-kind half of the Loadout Slot dance. Kept separate from
   * ownership (see `assertOwned`) so a per-kind check that must run BETWEEN the kind and
   * ownership checks (Food's "already assigned to a Food Slot") can still slot in between,
   * preserving each command's original error-precedence order exactly. */
  function resolveItem<T extends ItemDef>(
    itemId: string,
    isKind: (def: ItemDef) => def is T,
    kindError: string,
  ): T {
    const def = resolved.itemsById.get(itemId);
    if (!def || !isKind(def)) throw new Error(kindError);
    return def;
  }

  /** Asserts the player owns at least one of `itemId` (its ItemDef already resolved), returning
   * the owned quantity, or throws `you do not own ${def.name}` — the ownership half of the
   * Loadout Slot dance. */
  function assertOwned(itemId: string, def: ItemDef): number {
    const owned = state.bank.get(itemId) ?? 0;
    if (owned <= 0) throw new Error(`you do not own ${def.name}`);
    return owned;
  }

  /** The combined resolve/assert-kind/assert-ownership dance (#182) for the Loadout Slot commands
   * whose per-kind checks never need to run between the kind and ownership checks (Potion Slot).
   * Food Slot's own "already assigned" check DOES run between the two, so the food branch of
   * assignLoadoutSlot composes `resolveItem`/`assertOwned` directly instead of this. */
  function takeOwned<T extends ItemDef>(
    itemId: string,
    isKind: (def: ItemDef) => def is T,
    kindError: string,
  ): { def: T; owned: number } {
    const def = resolveItem(itemId, isKind, kindError);
    const owned = assertOwned(itemId, def);
    return { def, owned };
  }

  /** Returns a displaced Loadout Slot occupant's stock to the Bank on a SWAP (#182) — the exact
   * pull-then-check call that used to be copied at all four assign/load commands: the incoming
   * Item's own Bank stack is about to fully clear elsewhere in the same command (its ENTIRE stock
   * is about to move into the slot), which may itself free the Bank Slot this swap-back needs, so
   * room is tested with that freed slot already counted (pulled=1) BEFORE the swap-back lands.
   * No-op when there is nothing to return (`current` is null/undefined or already at qty 0).
   * Throws "bank is full". */
  function swapBackToBank(current: { itemId: string; qty: number } | null | undefined): void {
    if (!current || current.qty <= 0) return;
    if (!hasRoomForNewStack(state.bank, state.bankCapacity, current.itemId, 1)) {
      throw new Error("bank is full");
    }
    state.bank.set(current.itemId, (state.bank.get(current.itemId) ?? 0) + current.qty);
  }

  /** Returns a Loadout Slot's stock to the Bank on a plain unassign/unload (#182) — swapBackToBank's
   * sibling: no incoming Item is being pulled in the same command, so room is tested with nothing
   * yet freed (pulled=0). No-op when `qty` is <= 0. Throws "bank is full". */
  function returnToBank(itemId: string, qty: number): void {
    if (qty <= 0) return;
    if (!hasRoomForNewStack(state.bank, state.bankCapacity, itemId)) {
      throw new Error("bank is full");
    }
    state.bank.set(itemId, (state.bank.get(itemId) ?? 0) + qty);
  }

  /** Adds `qty` of `itemId` to the Bank (#59): a top-up of an existing stack always fits (the
   * #25 rule). A brand-new stack needed while the Bank is already at capacity is instead
   * auto-sold (sellable) or discarded (unsellable) — the universal "passive flows auto-sell on
   * overflow; player commands throw" rule. Never throws — this is only ever reached from a
   * passive arrival (drop, Catch, craft output), never a player command. */
  function addToBank(itemId: string, qty: number): void {
    if (!hasRoomForNewStack(state.bank, state.bankCapacity, itemId)) {
      const def = resolved.itemsById.get(itemId);
      const value = def ? sellValue(def) : undefined;
      if (value !== undefined) {
        const gold = value * qty;
        state.gold += gold;
        emit({ type: "overflow-sold", itemId, qty, gold });
      } else {
        emit({ type: "overflow-lost", itemId, qty });
      }
      return;
    }
    state.bank.set(itemId, (state.bank.get(itemId) ?? 0) + qty);
  }

  /** Adds `qty` of `itemId` to the Loot Zone (#60): a top-up of an existing zone stack always
   * fits, mirroring addToBank's rule. A brand-new stack needed while the zone already holds
   * LOOT_ZONE_CAPACITY stacks is instead auto-sold (sellable) or discarded (unsellable) — the
   * same universal overflow rule and events as a full Bank (#59). Never throws — reached only
   * from a combat arrival (kill Drop or Dungeon Chest item), never a player command. */
  function addToLootZone(itemId: string, qty: number): void {
    if (!hasRoomForNewStack(state.lootZone, LOOT_ZONE_CAPACITY, itemId)) {
      const def = resolved.itemsById.get(itemId);
      const value = def ? sellValue(def) : undefined;
      if (value !== undefined) {
        const gold = value * qty;
        state.gold += gold;
        emit({ type: "overflow-sold", itemId, qty, gold });
      } else {
        emit({ type: "overflow-lost", itemId, qty });
      }
      return;
    }
    state.lootZone.set(itemId, (state.lootZone.get(itemId) ?? 0) + qty);
  }

  /** Whether the player already owns `def` (#63): equipped in its own Gear Slot, holding a Bank
   * stack, or already sitting in the Loot Zone (an earlier Drop this session not yet swept).
   * Stackables never reach this check — creditCombatItem only calls it for EquipmentDefs. */
  function isDuplicateEquipment(def: EquipmentDef): boolean {
    return (
      state.equipment[def.slot] === def.id ||
      (state.bank.get(def.id) ?? 0) > 0 ||
      (state.lootZone.get(def.id) ?? 0) > 0
    );
  }

  /** Sells a duplicate Equipment arrival immediately (#63) instead of routing it to the Loot
   * Zone: credits `value * qty` to gold and emits duplicate-sold, or — if unsellable — discards
   * it with the existing overflow-lost event, the same "no value -> discarded" rule a full Loot
   * Zone/Bank already uses. */
  function sellDuplicate(def: EquipmentDef, qty: number): void {
    const value = sellValue(def);
    if (value !== undefined) {
      const gold = value * qty;
      state.gold += gold;
      emit({ type: "duplicate-sold", itemId: def.id, gold });
    } else {
      emit({ type: "overflow-lost", itemId: def.id, qty });
    }
  }

  /** Routes one passive arrival (drop or Chest entry) to its destination (#59, extended by
   * #60 and #63): the currency item credits `state.gold` directly, never touching the Bank or
   * the Loot Zone. An EquipmentDef the player already owns is instead auto-sold on the spot when
   * the toggle is ON (#63) — see isDuplicateEquipment/sellDuplicate. Everything else goes to the
   * Loot Zone via addToLootZone's top-up/overflow rules above — combat outputs buffer there
   * instead of landing straight in the Bank. */
  function creditCombatItem(itemId: string, qty: number): void {
    if (itemId === currencyDef.id) {
      state.gold += qty;
      return;
    }
    const def = resolved.itemsById.get(itemId);
    if (state.autoSellDuplicates && def?.kind === "equipment" && isDuplicateEquipment(def)) {
      sellDuplicate(def, qty);
      return;
    }
    addToLootZone(itemId, qty);
  }

  /** Slot-as-home routing (#61): if `itemId` is assigned to a Food Slot, credits `qty` straight
   * into that slot and reports true — Slots have no qty cap, so a slot-bound arrival never
   * overflows. Returns false (no-op) when `itemId` isn't assigned anywhere, leaving the caller to
   * fall back to its own Bank/Loot-Zone placement. */
  function creditToFoodSlotIfHome(itemId: string, qty: number): boolean {
    const slotIndex = state.foodSlots.findIndex((slot) => slot?.itemId === itemId);
    if (slotIndex === -1) return false;
    (state.foodSlots[slotIndex] as { itemId: string; qty: number }).qty += qty;
    return true;
  }

  /** Routes one passive arrival to its home (#61, extends addToBank): a Food assigned to a Slot
   * lands there instead of the Bank; anything else falls through to addToBank's normal top-up/
   * overflow rules. Used by arrival paths outside the Loot Zone (fishing Catches) — combat Drops
   * still buffer in the Loot Zone first and only route to a Slot at sweep time, see
   * sweepLootZone below. */
  function arriveAtHome(itemId: string, qty: number): void {
    if (creditToFoodSlotIfHome(itemId, qty)) return;
    addToBank(itemId, qty);
  }

  /** Moves every Loot Zone stack to its home (#60, extended by #61's Slot-as-home routing): a
   * Food assigned to a Slot lands there (no cap, never overflows); everything else goes to the
   * Bank, where a top-up of an existing stack always fits and a stack that would need a brand-new
   * Bank Slot while the Bank is already at capacity stays in the Loot Zone untouched — a sweep
   * never sells, unlike zone-full overflow above. Emits one `looted` event listing exactly the
   * stacks actually moved; emits nothing if none moved. Shared by every auto-loot trigger and the
   * on-demand lootAll() command — both idempotent by construction, since a second sweep simply
   * finds nothing left that fits. */
  function sweepLootZone(): void {
    const banked: { itemId: string; qty: number }[] = [];
    for (const [itemId, qty] of [...state.lootZone]) {
      if (creditToFoodSlotIfHome(itemId, qty)) {
        state.lootZone.delete(itemId);
        banked.push({ itemId, qty });
        continue;
      }
      if (!hasRoomForNewStack(state.bank, state.bankCapacity, itemId)) continue; // stays in the zone
      state.bank.set(itemId, (state.bank.get(itemId) ?? 0) + qty);
      state.lootZone.delete(itemId);
      banked.push({ itemId, qty });
    }
    if (banked.length > 0) emit({ type: "looted", items: banked });
  }

  function rollDrops(monster: MonsterDef): void {
    for (const entry of monster.dropTable) {
      if (entry.chance < 1 && rng.next() >= entry.chance) continue;
      emit({ type: "drop", itemId: entry.itemId, qty: entry.qty, band: entry.band });
      creditCombatItem(entry.itemId, entry.qty);
    }
  }

  /** The MonsterFight fields for a freshly spawned `id`: full HP, both cooldowns re-armed. Used to
   * seed a brand-new "combat"/"dungeon" activity from a select/enter command. */
  function freshFight(id: string): MonsterFight {
    const def = monsterDef(id);
    return {
      monsterId: id,
      monsterHp: def.hp,
      playerCooldown: weaponSpeed(),
      monsterCooldown: def.attackSpeed,
    };
  }

  /** Mutates `fight` in place to `freshFight(id)`'s values, rather than replacing the object.
   * Used mid-Tick — kill-respawn, Dungeon wave advance, Respawn completion — where tick() has
   * already captured a reference to the active MonsterFight before calling in here; replacing the
   * object outright would leave that reference stale for the rest of the Tick's cooldown/attack
   * phase. Mirrors the pre-#29 code's single persistent playerCooldown/monsterCooldown fields,
   * which spawnMonster wrote through rather than swapped. */
  function respawnFight(fight: MonsterFight, id: string): void {
    const fresh = freshFight(id);
    fight.monsterId = fresh.monsterId;
    fight.monsterHp = fresh.monsterHp;
    fight.playerCooldown = fresh.playerCooldown;
    fight.monsterCooldown = fresh.monsterCooldown;
  }

  /** Rolls every Chest entry independently (multi-roll, unlike a Drop Table's per-kill roll):
   * routes each landed item like any other combat arrival (#59/#60 — currency to gold, everything
   * else to the Loot Zone) and returns it for chest-opened. No per-item `drop` events fire — Chest
   * contents are reported only via chest-opened (mirrors fishing's single fish-caught event
   * instead of per-item drops). */
  function rollChest(dungeon: DungeonDef): { itemId: string; qty: number; band: DropBand }[] {
    const items: { itemId: string; qty: number; band: DropBand }[] = [];
    for (const entry of dungeon.chest) {
      if (entry.chance < 1 && rng.next() >= entry.chance) continue;
      creditCombatItem(entry.itemId, entry.qty);
      items.push({ itemId: entry.itemId, qty: entry.qty, band: entry.band });
    }
    return items;
  }

  /** Called from playerAttack's kill branch when a Dungeon run is active: advances to the next
   * Wave, or — on the Boss (the last Wave) — rolls the Chest, marks the Dungeon completed, ejects
   * the player to idle (state.activity back to null), and auto-loots the run's Loot Zone into the
   * Bank (#60 — dungeon completion is a sweep trigger). Wave advance mutates `run` in place (see
   * respawnFight) rather than replacing state.activity, for the same stale-reference reason. */
  function handleDungeonKill(run: DungeonActivity): void {
    const dungeon = dungeonDef(run.dungeonId);
    const clearedWave = run.waveIndex + 1; // 1-based cleared count
    if (clearedWave < dungeon.waves.length) {
      run.waveIndex = clearedWave;
      emit({
        type: "wave-cleared",
        dungeonId: dungeon.id,
        wave: clearedWave,
        totalWaves: dungeon.waves.length,
      });
      respawnFight(run, dungeon.waves[clearedWave] as string);
      return;
    }
    // Boss killed: the Chest is on top of the boss's own Drop Table (already rolled by the caller).
    const items = rollChest(dungeon);
    state.completedDungeonIds.add(dungeon.id);
    state.activity = null;
    emit({ type: "dungeon-completed", dungeonId: dungeon.id });
    emit({ type: "chest-opened", dungeonId: dungeon.id, items });
    sweepLootZone();
  }

  const STYLE_SKILL: Record<"accurate" | "aggressive" | "defensive", SkillName> = {
    accurate: "attack",
    aggressive: "strength",
    defensive: "defence",
  };

  function grantXp(skill: SkillName, amount: number): void {
    const before = level(skill);
    state.xp[skill] += amount;
    const after = level(skill);
    emit({ type: "xp-gained", skill, amount });
    if (after > before) emit({ type: "levelup", skill, level: after });
  }

  /** Mode-aware damage XP routing (#339). Hitpoints always trickles last via a separate grantXp. */
  function awardCombatXp(damage: number): void {
    if (damage <= 0) return;
    const mode = weaponCombatModeFor(state.equipment.weapon, resolved);
    const style = state.combatStyle;

    if (mode === "melee") {
      grantXp(STYLE_SKILL[style as keyof typeof STYLE_SKILL], 4 * damage);
    } else if (mode === "ranged") {
      if (style === "defensive") {
        grantXp("ranged", 2 * damage);
        grantXp("defence", 2 * damage);
      } else {
        grantXp("ranged", 4 * damage);
      }
    } else if (mode === "magic") {
      if (style === "defensive") {
        grantXp("magic", 2 * damage);
        grantXp("defence", 2 * damage);
      } else {
        grantXp("magic", 4 * damage);
      }
    }

    grantXp("hitpoints", (4 / 3) * damage);
  }

  /** Player accuracy + max hit for the currently equipped weapon's Attack Type (#99). Melee
   * (stab/slash/crush) is byte-identical to pre-#99: Attack/Strength + Combat Style, unchanged.
   * Ranged is mechanically real: accuracy AND max hit both derive from the Ranged skill
   * (OSRS-style) rather than Attack/Strength — effectiveLevel already yields +8 with no Combat
   * Style boost for a non-melee skill, so no change needed there. Magic's accuracy mirrors
   * Ranged's shape (keyed off the Magic skill + weapon atkBonus), but max hit comes from the
   * resolved spell's `baseMaxHit` scaled by gear `magicDamage` (#362) instead of a
   * Strength-shaped formula (#101, replacing wave 1/4's interim level-driven magic max hit) —
   * Magic level gates WHICH spell and drives accuracy only; the spell's `baseMaxHit` and gear
   * `magicDamage` % decide max hit. */
  function playerAccuracyAndMaxHit(): { atkRoll: number; max: number } {
    const mode = weaponCombatModeFor(state.equipment.weapon, resolved);
    if (mode === "ranged") {
      const eff = Math.floor(
        effectiveLevel(level("ranged"), "ranged", state.combatStyle, mode) *
          skillLevelMultiplier("ranged"),
      );
      // Arrow strength (#119): the loaded Quiver arrow's rangedStr folds into max hit alongside
      // gear's rangedStr — the bow decides accuracy, the arrow decides power (owner decision).
      // Caller (playerAttack) has already gated on quiver.qty > 0, so this only ever runs with a
      // real loaded arrow; the `?? 0` guards a corrupted/missing content lookup defensively.
      const arrowDef = state.quiver
        ? resolved.itemsById.get((state.quiver as { itemId: string }).itemId)
        : undefined;
      const rangedStr = arrowDef?.kind === "ammo" ? (arrowDef.rangedStr ?? 0) : 0;
      return {
        atkRoll: attackRoll(eff, gearBonus("atkBonus")),
        max: maxHit(eff, gearBonus("rangedStr") + rangedStr),
      };
    }
    if (mode === "magic") {
      const eff = Math.floor(
        effectiveLevel(level("magic"), "magic", state.combatStyle, mode) *
          skillLevelMultiplier("magic"),
      );
      const baseMaxHit = currentSpell()?.baseMaxHit ?? 0;
      return {
        atkRoll: attackRoll(eff, gearBonus("atkBonus")),
        // Magic max hit: spell baseMaxHit × (1 + summed gear magicDamage % / 100), floored (#362).
        // Caller (playerAttack) has already gated on checkAmmo confirming a loaded Rune Slot, so
        // this only ever runs with a real Spell; the `?? 0` guards defensively, mirroring
        // arrowDef's own guard above.
        max: Math.floor(baseMaxHit * (1 + gearBonus("magicDamage") / 100)),
      };
    }
    return {
      atkRoll: attackRoll(
        Math.floor(
          effectiveLevel(level("attack"), "attack", state.combatStyle, mode) *
            skillLevelMultiplier("attack"),
        ),
        gearBonus("atkBonus"),
      ),
      max: maxHit(
        Math.floor(
          effectiveLevel(level("strength"), "strength", state.combatStyle, mode) *
            skillLevelMultiplier("strength"),
        ),
        gearBonus("strBonus"),
      ),
    };
  }

  /** Ammo gate (#119, #221): checked BEFORE any accuracy/damage math. Ranged needs the Quiver at
   * qty > 0; magic needs the Rune Slot loaded at qty > 0 — the loaded rune IS the cast Spell, so
   * there is no separate Element lookup any more. Melee is untouched (mode "melee" never reaches
   * either branch). Out-of-ammo warns ONCE per depletion (quiverOutWarned/runeOutWarned below)
   * rather than every Tick the resource sits empty, and clears that warning the moment the
   * resource is available again so the NEXT depletion gets its own event. The magic branch's
   * `element` (via `currentSpell()`) is set for a depleted (qty 0, itemId still present) Rune
   * Slot and omitted for a truly empty one, since an empty slot has no Spell. */
  function checkAmmo(mode: CombatMode): boolean {
    if (mode === "ranged") {
      if (state.quiver && state.quiver.qty > 0) {
        state.quiverOutWarned = false;
        return true;
      }
      if (!state.quiverOutWarned) {
        emit({ type: "out-of-ammo", need: "arrow" });
        state.quiverOutWarned = true;
      }
      return false;
    }
    if (mode === "magic") {
      if (state.runeSlot && state.runeSlot.qty > 0) {
        state.runeOutWarned = false;
        return true;
      }
      if (!state.runeOutWarned) {
        // exactOptionalPropertyTypes forbids an explicit `element: undefined` — spread it in only
        // when a (depleted) Spell is actually resolved, omitting the key entirely otherwise.
        const spell = currentSpell();
        emit({ type: "out-of-ammo", need: "rune", ...(spell ? { element: spell.element } : {}) });
        state.runeOutWarned = true;
      }
      return false;
    }
    return true; // melee: never gated
  }

  /** Decrements 1 unit of the resource a just-RESOLVED ranged/magic swing consumed (#119, #221) —
   * called only after checkAmmo confirmed availability and the swing actually resolved (hit or
   * miss both count, per the owner's "on a resolved attack" rule); melee is a no-op. Both stores
   * stay "loaded" at qty 0 rather than clearing (mirrors a Food Slot's empty != unassigned rule)
   * so the UI can still show "you're out of X" rather than the store vanishing. */
  function consumeAmmo(mode: CombatMode): void {
    if (mode === "ranged" && state.quiver) {
      state.quiver.qty -= 1;
    } else if (mode === "magic" && state.runeSlot) {
      state.runeSlot.qty -= 1;
    }
  }

  function playerAttack(monster: MonsterDef, activity: CombatActivity | DungeonActivity): void {
    const mode = weaponCombatModeFor(state.equipment.weapon, resolved);
    if (!checkAmmo(mode)) return; // swing doesn't resolve this Tick: no damage, no XP, monster still acts
    const weaponType = weaponAttackTypeFor(state.equipment.weapon, resolved);
    const { atkRoll, max } = playerAccuracyAndMaxHit();
    // Routed lookup (#99): the monster's weak spot is simply the type it defends worst.
    const defRoll = defenceRoll(monster.defenceLevel + 8, monster.def[weaponType]);
    const { hit, damage: rolled } = rollDamage(hitChance(atkRoll, defRoll), max);
    // Element weakness (#101): the ONE damage-side modifier in the Hybrid model — keyed off `hit`
    // per the owner's rule on the `attack` event (types.ts): a miss never gets it (moot here since
    // a miss's `rolled` is already 0), but a zero-damage HIT still applies it. Melee/ranged are
    // elementless (weaponType !== "magic"), so this never touches their damage.
    let elementDamage = rolled;
    if (weaponType === "magic" && hit && monster.weakElement === currentSpell()?.element) {
      elementDamage = Math.floor(rolled * ELEMENT_WEAKNESS_MULT);
    }
    const damage = Math.min(elementDamage, activity.monsterHp);
    activity.monsterHp -= damage;
    awardCombatXp(damage);
    emit({ type: "attack", actor: "player", damage, hit });
    // Ammo consumption (#119, #221): the swing above just RESOLVED (checkAmmo already confirmed
    // availability), so 1 unit is spent regardless of hit/miss, mirroring the owner's "on a
    // resolved attack" rule — melee is a no-op inside consumeAmmo.
    consumeAmmo(mode);
    // Charge decrement (#118): a resolved player attack is the qualifying action for every
    // combat-Skill-targeted potion, regardless of which Skill this particular swing trained —
    // "fishing-speed"/"production-speed" targets never match here (see the two other call sites).
    decrementPotionCharge((target) => target !== "fishing-speed" && target !== "production-speed");
    if (activity.monsterHp <= 0) {
      emit({ type: "kill", monsterId: monster.id });
      // Pet roll (#120): a kill is the "combat" pet's qualifying action, PLUS this specific
      // Monster's own boss pet (if any) — both roll independently, incl. dungeon waves/boss
      // (this branch is shared by CombatActivity and DungeonActivity alike).
      rollPetDrop(
        content.pets.filter((p) => p.source === "combat"),
        PET_DROP_CHANCE,
      );
      rollPetDrop(
        content.pets.filter((p) => typeof p.source === "object" && p.source.boss === monster.id),
        BOSS_PET_DROP_CHANCE,
      );
      rollDrops(monster); // wave Monsters still roll their normal Drop Table; the Chest is on top
      if (activity.kind === "dungeon") {
        handleDungeonKill(activity);
      } else {
        respawnFight(activity, monster.id);
      }
    }
  }

  /** RS-flavored combat level (#7): display-only since #24 replaced combat-level Area gating
   * with Dungeon-boss gating, so it no longer gates anything. Defence + Hitpoints are always
   * counted (the shared "durability" half); the other half is the best of three modes — melee
   * (Attack + Strength combined), Ranged, or Magic (each doubled to weigh the same as melee's
   * two combined Skills) — mirroring OSRS's own melee/ranged/magic combat-level split. At equal
   * Skill levels across the board this reduces to the pre-#7 formula unchanged (worked examples
   * in engine.test.ts pin this). */
  function combatLevel(): number {
    const base = level("defence") + level("hitpoints");
    const top = Math.max(
      level("attack") + level("strength"),
      2 * level("ranged"),
      2 * level("magic"),
    );
    return Math.floor((base + top) / 4);
  }

  function maxHp(): number {
    return level("hitpoints");
  }

  function snapshot(): Snapshot {
    const skills = {} as Snapshot["player"]["skills"];
    for (const skill of SKILL_NAMES) {
      skills[skill] = { level: level(skill), xp: state.xp[skill] };
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
    const dungeonRunDef = dungeonRun ? dungeonDef(dungeonRun.dungeonId) : undefined;
    const productionRecipeDef = productionActivity
      ? recipeDef(productionActivity.recipeId)
      : undefined;
    return {
      savedAt: now(),
      player: {
        hp: state.hp,
        maxHp: maxHp(),
        combatLevel: combatLevel(),
        combatStyle: state.combatStyle,
        spell: (() => {
          const spell = currentSpell();
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
          attackType: weaponAttackTypeFor(state.equipment.weapon, resolved),
          atkBonus: gearBonus("atkBonus"),
          strBonus: gearBonus("strBonus"),
          def: Object.fromEntries(ATTACK_TYPES.map((t) => [t, gearDef(t)])) as Record<
            AttackType,
            number
          >,
          attackSpeed: weaponSpeed(),
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
        nextSlotsPrice: nextBankSlotsPrice(state.bankCapacity),
      },
      lootZone: [...state.lootZone].map(([itemId, qty]) => ({ itemId, qty })),
      areas: content.areas.map((area) => {
        const unlocked = areaUnlocked(area);
        return {
          id: area.id,
          name: area.name,
          unlocked,
          gatedBy: unlocked
            ? null
            : (() => {
                const d = dungeonDef(area.unlockedByDungeonId as string);
                return { dungeonId: d.id, name: d.name };
              })(),
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
    const mode = weaponCombatModeFor(state.equipment.weapon, resolved);
    const atkRoll = attackRoll(monster.attackLevel + 8, 0);
    const defRoll = defenceRoll(
      effectiveLevel(level("defence"), "defence", state.combatStyle, mode),
      gearDef(monster.attackType),
    );
    const { hit, damage } = rollDamage(hitChance(atkRoll, defRoll), monster.maxHit);
    state.hp = Math.max(0, state.hp - damage);
    emit({ type: "attack", actor: "monster", damage, hit });
  }

  /** Eats one unit of `food` out of Food Slot `slotIndex` (#61 — replaces the old eat-from-Bank
   * bridge), healing without overheal; returns HP restored. The slot stays assigned at qty 0
   * (empty != unassigned) rather than clearing to null. Caller guarantees the slot actually holds
   * `food` at qty > 0. */
  function eatFromSlotAt(slotIndex: number, food: FoodDef): number {
    const healed = Math.min(food.heals, maxHp() - state.hp);
    state.hp += healed;
    (state.foodSlots[slotIndex] as { itemId: string; qty: number }).qty -= 1;
    emit({ type: "food-eaten", itemId: food.id, healed });
    return healed;
  }

  /** Rewritten for Food Slots (#61): drains the lowest-index slot with qty > 0 until HP clears
   * the threshold or every slot runs dry — the old Content-order Bank scan is gone. Threshold
   * semantics (0 = off) unchanged. */
  function autoEat(): void {
    if (state.autoEatThreshold === 0) return;
    while (state.hp < maxHp() * state.autoEatThreshold) {
      const slotIndex = state.foodSlots.findIndex((slot) => slot && slot.qty > 0);
      if (slotIndex === -1) return;
      const slot = state.foodSlots[slotIndex] as { itemId: string; qty: number };
      const def = resolved.itemsById.get(slot.itemId);
      if (!def || def.kind !== "food") return; // guards against a corrupted slot; not reachable via commands
      eatFromSlotAt(slotIndex, def);
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
  function fishingTick(activity: FishingActivity): void {
    const spot = fishingSpotDef(activity.spotId);
    activity.catchCooldown -= 1;
    if (activity.catchCooldown > 0) return;
    // #114: divided by the aggregate fishing-speed multiplier (1 = no sources, so this re-arms to
    // spot.catchTicks unchanged, same as before this wave).
    activity.catchCooldown = Math.max(
      1,
      Math.round(spot.catchTicks / actionSpeedMultiplier("fishing")),
    );
    activity.cooldownTotal = activity.catchCooldown;
    // Charge decrement (#118): the qualifying action for a "fishing-speed" potion is a catch
    // ATTEMPT, not a successful Catch — decremented here regardless of the roll below.
    decrementPotionCharge((target) => target === "fishing-speed");
    if (rng.next() < spot.catchChance) {
      grantXp("fishing", spot.xp);
      emit({ type: "fish-caught", spotId: spot.id, itemId: spot.itemId, qty: 1 });
      // a Catch is always a raw Material (validateContent, #115), never Food or currency — no
      // Food Slot can ever match its itemId (only Food is ever assigned to a slot), so
      // arriveAtHome always falls through to the ordinary Bank top-up/overflow rules.
      arriveAtHome(spot.itemId, 1);
      // Pet roll (#120): a successful Catch (not merely an attempt — mirrors the "qualifying
      // action" language in the issue, distinct from the charge-decrement rule just above, which
      // fires on every attempt) is the "fishing" pet's qualifying action.
      rollPetDrop(
        content.pets.filter((p) => p.source === "fishing"),
        PET_DROP_CHANCE,
      );
    }
  }

  /** Decrements the craft cooldown; at completion consumes `recipe.inputs` from the Bank (never
   * lost to an earlier interruption — see selectRecipe/the other select* commands, which only
   * ever swap `state.activity` wholesale, never mid-craft), adds the output Item to the Bank
   * (#59, subject to the same top-up/overflow rules as any other passive arrival), grants XP in
   * the recipe's own skill (#113: was hardcoded Smithing), and emits item-crafted. Auto-repeats
   * (re-arms the cooldown) while inputs still cover another craft; otherwise clears production
   * back to idle with no extra event — the Snapshot shows it. */
  function productionTick(activity: ProductionActivity): void {
    const recipe = recipeDef(activity.recipeId);
    activity.craftCooldown -= 1;
    if (activity.craftCooldown > 0) return;

    for (const input of recipe.inputs) {
      const owned = state.bank.get(input.itemId) ?? 0;
      const remaining = owned - input.qty;
      if (remaining > 0) state.bank.set(input.itemId, remaining);
      else state.bank.delete(input.itemId);
    }
    addToBank(recipe.outputItemId, 1);
    grantXp(recipe.skill, recipe.xp);
    emit({ type: "item-crafted", recipeId: recipe.id, itemId: recipe.outputItemId });
    // Pet roll (#120): a craft COMPLETION (this point, reached every time the cooldown elapses)
    // is the "production" pet's qualifying action — mirrors the charge-decrement's own "completion,
    // not attempt" rule just below.
    rollPetDrop(
      content.pets.filter((p) => p.source === "production"),
      PET_DROP_CHANCE,
    );
    // Charge decrement (#118): the qualifying action for a "production-speed" potion is a craft
    // COMPLETION — this point, reached every time the cooldown elapses (a craft always resolves
    // once started; see the doc above).
    decrementPotionCharge((target) => target === "production-speed");

    if (canCraftRecipe(recipe)) {
      // #114: divided by the aggregate production-speed multiplier (1 = no sources, so this
      // re-arms to recipe.craftTicks unchanged, same as before this wave).
      activity.craftCooldown = Math.max(
        1,
        Math.round(recipe.craftTicks / actionSpeedMultiplier("production")),
      );
      activity.cooldownTotal = activity.craftCooldown;
    } else {
      state.activity = null;
    }
  }

  function tick(): void {
    regen();

    if (state.activity?.kind === "fishing") {
      fishingTick(state.activity);
      return;
    }

    if (state.activity?.kind === "production") {
      productionTick(state.activity);
      return;
    }

    // Respawn is checked ahead of the "nothing active" guard below: a Dungeon death clears
    // state.activity to null (see the death branch at the bottom of this function) so Respawn can
    // still count down to completion with nothing active — it just completes to idle instead of
    // auto-resuming. The resume on completion is guarded accordingly.
    if (state.respawnTicksLeft > 0) {
      state.respawnTicksLeft -= 1;
      if (state.respawnTicksLeft === 0) {
        state.hp = maxHp();
        if (state.activity?.kind === "combat") {
          respawnFight(state.activity, state.activity.monsterId);
        }
      }
      return;
    }

    if (state.activity?.kind !== "combat" && state.activity?.kind !== "dungeon") return;

    const activity = state.activity;
    const monster = monsterDef(activity.monsterId);
    activity.playerCooldown -= 1;
    if (activity.playerCooldown <= 0) {
      activity.playerCooldown = weaponSpeed();
      playerAttack(monster, activity);
    }
    activity.monsterCooldown -= 1;
    if (activity.monsterCooldown <= 0) {
      activity.monsterCooldown = monster.attackSpeed;
      monsterAttack(monster);
    }
    autoEat();
    if (state.hp <= 0) {
      state.respawnTicksLeft = RESPAWN_TICKS;
      // Death ejects the player from a Dungeon run (all-or-nothing): clear state.activity now,
      // before Respawn starts, so Respawn completes to idle instead of auto-resuming on the
      // dungeon-only boss/wave Monster. Re-entry always restarts at wave 1.
      if (state.activity?.kind === "dungeon") {
        const dungeonId = state.activity.dungeonId;
        state.activity = null;
        // Dungeon runs are all-or-nothing for loot too (#60, owner amendment): a mid-run death
        // EMPTIES the Loot Zone instead of sweeping it — the failed run's own drops are lost, not
        // banked. Open-world death (below) never touches the Loot Zone.
        const lostItems = [...state.lootZone].map(([itemId, qty]) => ({ itemId, qty }));
        state.lootZone.clear();
        emit({ type: "dungeon-failed", dungeonId, lostItems });
      }
      emit({ type: "death" });
    }
  }

  // Activity resume (monster/fishing selection, cooldowns, monster HP) is already folded into
  // loadState/freshState above — nothing left to do here.

  function requireFoodSlotIndex(slotIndex: number | undefined): number {
    if (slotIndex === undefined) {
      throw new Error("food loadout slot requires slotIndex");
    }
    if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= FOOD_SLOT_COUNT) {
      throw new Error(`invalid food slot index: ${slotIndex}`);
    }
    return slotIndex;
  }

  function rejectSlotIndexForSingularKind(kind: LoadoutKind, slotIndex: number | undefined): void {
    if (slotIndex !== undefined) {
      throw new Error(`${kind} loadout slot does not take slotIndex`);
    }
  }

  function foodAssignAt(slotIndex: number, itemId: string): void {
    const def = resolveItem(
      itemId,
      (d): d is FoodDef => d.kind === "food",
      `${itemId} is not Food`,
    );
    const elsewhere = state.foodSlots.findIndex((slot) => slot?.itemId === itemId);
    if (elsewhere !== -1 && elsewhere !== slotIndex) {
      throw new Error(`${def.name} is already assigned to a Food Slot`);
    }
    const owned = assertOwned(itemId, def);

    const current = state.foodSlots[slotIndex];
    let homeQty = owned;
    if (current && current.itemId === itemId) {
      homeQty += current.qty;
    } else {
      swapBackToBank(current);
    }

    state.bank.delete(itemId);
    state.foodSlots[slotIndex] = { itemId, qty: homeQty };
  }

  function foodClearAt(slotIndex: number): void {
    const slot = state.foodSlots[slotIndex];
    if (!slot) return;
    returnToBank(slot.itemId, slot.qty);
    state.foodSlots[slotIndex] = null;
  }

  function potionAssignAt(itemId: string): void {
    const { def, owned } = takeOwned(
      itemId,
      (d): d is PotionDef => d.kind === "potion",
      `${itemId} is not a Potion`,
    );

    const current = state.potionSlot;
    if (current && current.itemId === itemId) {
      state.bank.delete(itemId);
      state.potionSlot = { itemId, qty: current.qty + owned, charges: current.charges };
      return;
    }
    if (current && current.charges > 0) {
      const remaining = current.qty - 1;
      swapBackToBank(remaining > 0 ? { itemId: current.itemId, qty: remaining } : null);
    }

    state.bank.delete(itemId);
    state.potionSlot = { itemId, qty: owned, charges: def.charges };
  }

  function potionClearAt(): void {
    const current = state.potionSlot;
    if (!current) return;
    returnToBank(current.itemId, current.qty - 1);
    state.potionSlot = null;
  }

  function quiverAssignAt(arrowItemId: string): void {
    const { owned } = takeOwned(
      arrowItemId,
      (d): d is AmmoDef => d.kind === "ammo" && d.ammoType === "arrow",
      `${arrowItemId} is not an Arrow`,
    );

    const current = state.quiver;
    let homeQty = owned;
    if (current && current.itemId === arrowItemId) {
      homeQty += current.qty;
    } else {
      swapBackToBank(current);
    }

    state.bank.delete(arrowItemId);
    state.quiver = { itemId: arrowItemId, qty: homeQty };
  }

  function quiverClearAt(): void {
    const current = state.quiver;
    if (!current) return;
    returnToBank(current.itemId, current.qty);
    state.quiver = null;
  }

  function runeAssignAt(runeItemId: string): void {
    const { def, owned } = takeOwned(
      runeItemId,
      (d): d is AmmoDef => d.kind === "ammo" && d.ammoType === "rune",
      `${runeItemId} is not a Rune`,
    );
    const spell = resolved.spellsByRuneId.get(def.id);
    if (spell && level("magic") < spell.levelReq) {
      throw new Error(`magic level too low: need ${spell.levelReq}`);
    }

    const current = state.runeSlot;
    let homeQty = owned;
    if (current && current.itemId === runeItemId) {
      homeQty += current.qty;
    } else {
      swapBackToBank(current);
    }

    state.bank.delete(runeItemId);
    state.runeSlot = { itemId: runeItemId, qty: homeQty };
  }

  function runeClearAt(): void {
    const current = state.runeSlot;
    if (!current) return;
    returnToBank(current.itemId, current.qty);
    state.runeSlot = null;
  }

  return {
    tick,
    snapshot,
    selectMonster(monsterId) {
      monsterDef(monsterId); // throws on unknown id
      const area = content.areas.find((a) => a.monsterIds.includes(monsterId));
      assertAreaUnlocked(area);
      state.respawnTicksLeft = 0;
      state.hp = Math.max(state.hp, 1);
      // Assigning state.activity wholesale is what makes "at most one of Monster / Fishing Spot /
      // Dungeon / Recipe" structural (#29): whatever was active is replaced outright, never
      // cleared field-by-field.
      state.activity = { kind: "combat", ...freshFight(monsterId) };
    },
    selectFishingSpot(spotId) {
      const spot = fishingSpotDef(spotId); // throws on unknown id
      const area = content.areas.find((a) => a.fishingSpotIds?.includes(spotId));
      assertAreaUnlocked(area);
      if (level("fishing") < spot.levelReq) {
        throw new Error(`${spot.name} requires Fishing level ${spot.levelReq}`);
      }
      state.respawnTicksLeft = 0;
      state.hp = Math.max(state.hp, 1);
      // Leaving combat for a non-combat activity auto-loots the Loot Zone (#60).
      sweepLootZone();
      state.activity = {
        kind: "fishing",
        spotId,
        catchCooldown: spot.catchTicks,
        cooldownTotal: spot.catchTicks,
      };
    },
    enterDungeon(dungeonId) {
      const dungeon = dungeonDef(dungeonId); // throws on unknown id
      const area = resolved.areasById.get(dungeon.areaId);
      assertAreaUnlocked(area);
      state.respawnTicksLeft = 0; // clears Respawn
      state.hp = Math.max(state.hp, 1); // mirrors selectMonster's respawn-cancel semantics
      // Entering a Dungeon also auto-loots first (#60, owner amendment): any open-world loot is
      // banked before the run starts, so the zone is empty at run start and only ever holds the
      // current run's own drops while inside — nothing pre-run is ever lost to a failed run.
      sweepLootZone();
      state.activity = {
        kind: "dungeon",
        dungeonId,
        waveIndex: 0,
        ...freshFight(dungeon.waves[0] as string),
      };
    },
    selectRecipe(recipeId) {
      const recipe = recipeDef(recipeId); // throws on unknown id
      if (level(recipe.skill) < recipe.levelReq) {
        throw new Error(`${recipe.name} requires ${recipe.skill} level ${recipe.levelReq}`);
      }
      if (!canCraftRecipe(recipe)) {
        throw new Error(`insufficient materials for ${recipe.name}`);
      }
      state.respawnTicksLeft = 0;
      state.hp = Math.max(state.hp, 1);
      // Leaving combat for a non-combat activity auto-loots the Loot Zone (#60).
      sweepLootZone();
      state.activity = {
        kind: "production",
        recipeId: recipe.id,
        craftCooldown: recipe.craftTicks,
        cooldownTotal: recipe.craftTicks,
      };
    },
    setCombatStyle(style) {
      if (!isCombatStyle(style)) {
        throw new Error(`invalid combat style: ${style}`);
      }
      const mode = weaponCombatModeFor(state.equipment.weapon, resolved);
      if (!isStyleLegalForMode(style, mode)) {
        throw new Error(`combat style ${style} is illegal for ${mode} weapons`);
      }
      state.combatStyle = style;
    },
    setAutoEatThreshold(threshold) {
      if (!isAutoEatThreshold(threshold)) {
        throw new Error(`invalid auto-eat threshold: ${threshold}`);
      }
      state.autoEatThreshold = threshold;
    },
    setAutoSellDuplicates(on) {
      if (typeof on !== "boolean") throw new Error(`invalid autoSellDuplicates: ${on}`);
      state.autoSellDuplicates = on;
    },
    equip(itemId) {
      const def = resolved.itemsById.get(itemId);
      if (!def) throw new Error(`unknown item: ${itemId}`);
      if (def.kind !== "equipment") throw new Error(`${def.name} cannot be equipped`);
      const owned = state.bank.get(itemId) ?? 0;
      if (owned <= 0) throw new Error(`you do not own ${def.name}`);

      const oldMode = weaponCombatModeFor(state.equipment.weapon, resolved);

      // Build the complete displaced set for one atomic bank-capacity preflight (#59, #340).
      const returns: string[] = [];
      const previous = state.equipment[def.slot];
      const sameSlotReequip = previous === itemId;
      if (previous !== null && !sameSlotReequip) {
        returns.push(previous);
      }

      let clearShield = false;
      let clearWeapon = false;
      if (def.slot === "weapon" && def.twoHanded === true && state.equipment.shield !== null) {
        returns.push(state.equipment.shield);
        clearShield = true;
      }
      if (def.slot === "shield") {
        const weaponId = state.equipment.weapon;
        const weaponDef = weaponId ? resolved.itemsById.get(weaponId) : undefined;
        if (weaponDef?.kind === "equipment" && weaponDef.twoHanded === true) {
          returns.push(weaponId!);
          clearWeapon = true;
        }
      }

      const pulled = owned === 1 ? 1 : 0;
      const sim = new Map(state.bank);
      if (owned > 1) sim.set(itemId, owned - 1);
      else sim.delete(itemId);
      let simPulled = pulled;
      for (const returnId of returns) {
        if (!hasRoomForNewStack(sim, state.bankCapacity, returnId, simPulled)) {
          throw new Error("bank is full");
        }
        sim.set(returnId, (sim.get(returnId) ?? 0) + 1);
        simPulled = 0;
      }
      if (sameSlotReequip) {
        sim.set(itemId, (sim.get(itemId) ?? 0) + 1);
      }

      if (owned > 1) state.bank.set(itemId, owned - 1);
      else state.bank.delete(itemId);
      for (const returnId of returns) {
        state.bank.set(returnId, (state.bank.get(returnId) ?? 0) + 1);
      }
      if (sameSlotReequip) {
        state.bank.set(itemId, (state.bank.get(itemId) ?? 0) + 1);
      }

      state.equipment[def.slot] = itemId;
      if (clearShield) state.equipment.shield = null;
      if (clearWeapon) state.equipment.weapon = null;

      const newMode = weaponCombatModeFor(state.equipment.weapon, resolved);
      if (oldMode !== newMode) {
        state.combatStyle = remapCombatStyle(state.combatStyle, newMode);
      }
      emit({ type: "equipped", itemId });
    },
    assignLoadoutSlot(kind, itemId, slotIndex) {
      switch (kind) {
        case "food":
          foodAssignAt(requireFoodSlotIndex(slotIndex), itemId);
          return;
        case "potion":
          rejectSlotIndexForSingularKind(kind, slotIndex);
          potionAssignAt(itemId);
          return;
        case "quiver":
          rejectSlotIndexForSingularKind(kind, slotIndex);
          quiverAssignAt(itemId);
          return;
        case "rune":
          rejectSlotIndexForSingularKind(kind, slotIndex);
          runeAssignAt(itemId);
          return;
        default:
          throw new Error(`unknown loadout kind: ${kind satisfies never}`);
      }
    },
    clearLoadoutSlot(kind, slotIndex) {
      switch (kind) {
        case "food":
          foodClearAt(requireFoodSlotIndex(slotIndex));
          return;
        case "potion":
          rejectSlotIndexForSingularKind(kind, slotIndex);
          potionClearAt();
          return;
        case "quiver":
          rejectSlotIndexForSingularKind(kind, slotIndex);
          quiverClearAt();
          return;
        case "rune":
          rejectSlotIndexForSingularKind(kind, slotIndex);
          runeClearAt();
          return;
        default:
          throw new Error(`unknown loadout kind: ${kind satisfies never}`);
      }
    },
    eatFromSlot(slotIndex) {
      if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= FOOD_SLOT_COUNT) {
        throw new Error(`invalid food slot index: ${slotIndex}`);
      }
      const slot = state.foodSlots[slotIndex];
      if (!slot || slot.qty <= 0) throw new Error(`food slot ${slotIndex} is empty`);
      const def = resolved.itemsById.get(slot.itemId);
      if (!def || def.kind !== "food") throw new Error(`food slot ${slotIndex} is empty`);
      eatFromSlotAt(slotIndex, def);
    },
    buy(itemId, qty = 1) {
      if (!Number.isInteger(qty) || qty < 1) throw new Error(`invalid buy quantity: ${qty}`);
      const entry = content.vendor.find((v) => v.itemId === itemId);
      if (!entry) throw new Error(`${itemId} is not sold by the vendor`);
      const cost = entry.price * qty;
      if (state.gold < cost) throw new Error(`not enough gold: need ${cost}`);
      if (!hasRoomForNewStack(state.bank, state.bankCapacity, itemId)) {
        throw new Error("bank is full");
      }

      state.gold -= cost;
      state.bank.set(itemId, (state.bank.get(itemId) ?? 0) + qty);
      emit({ type: "item-bought", itemId, qty, gold: cost });
    },
    sell(itemId, qty = 1) {
      if (!Number.isInteger(qty) || qty < 1) throw new Error(`invalid sell quantity: ${qty}`);
      const def = resolved.itemsById.get(itemId);
      if (!def) throw new Error(`unknown item: ${itemId}`);
      const value = sellValue(def);
      if (value === undefined) throw new Error(`${def.name} cannot be sold`);
      const owned = state.bank.get(itemId) ?? 0;
      if (owned < qty) throw new Error(`you do not own ${qty} ${def.name}`);

      const remaining = owned - qty;
      if (remaining > 0) state.bank.set(itemId, remaining);
      else state.bank.delete(itemId);
      const gold = value * qty;
      state.gold += gold;
      emit({ type: "item-sold", itemId, qty, gold });
    },
    buyBankSlots() {
      const price = nextBankSlotsPrice(state.bankCapacity);
      if (state.gold < price) throw new Error(`not enough gold: need ${price}`);

      state.gold -= price;
      state.bankCapacity += BANK_SLOTS_PER_PURCHASE;
    },
    lootAll() {
      sweepLootZone();
    },
    on(type, handler) {
      const list = handlers.get(type) ?? [];
      list.push(handler as (event: EngineEvent) => void);
      handlers.set(type, list);
    },
  };
}
