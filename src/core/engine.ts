import { attackRoll, defenceRoll, effectiveLevel, hitChance, maxHit } from "./combat";
import { levelForXp } from "./xp";
import { resolveContent } from "./validate-content";
import type { ResolvedContent } from "./validate-content";
import { AUTO_EAT_THRESHOLDS } from "./types";
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
  ItemDef,
  MonsterDef,
  PetDef,
  PotionDef,
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
import {
  freshState,
  loadState,
  weaponCombatModeFor,
  weaponAttackTypeFor,
  styleAdjustedWeaponSpeed,
} from "./load-state";
import { buildSnapshot } from "./snapshot";
import type {
  CombatActivity,
  DungeonActivity,
  FishingActivity,
  MonsterFight,
  ProductionActivity,
  State,
} from "./state";

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
  /** Returns the item worn in `slot` to the Bank and empties the slot. A no-op on an already-empty
   * slot (same rule as `clearLoadoutSlot`/`foodClearAt`). Throws "bank is full" if the item needs a
   * brand-new Bank stack and the Bank is at capacity — a player command, never auto-sold (the
   * universal "passive flows auto-sell on overflow; player commands throw" rule). Deliberately does
   * NOT check `levelReq`: under-levelled gear from a grandfathered save (#363) can always be taken
   * off — it just cannot be put back on. Emits `unequipped`. */
  unequip(slot: GearSlot): void;
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

export { weaponCombatModeFor } from "./load-state";

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
  for (const { itemId, qty } of state.pendingLegacyRuneBank) {
    addToBank(itemId, qty);
  }
  state.pendingLegacyRuneBank = [];

  function level(skill: SkillName): number {
    return levelForXp(state.xp[skill]);
  }

  function maxHp(): number {
    return level("hitpoints");
  }

  function checkLevelReq(def: { levelReq?: Partial<Record<SkillName, number>> }): void {
    for (const [skill, need] of Object.entries(def.levelReq ?? {})) {
      if (level(skill as SkillName) < need) {
        throw new Error(`${skill} level too low: need ${need}`);
      }
    }
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

  /** Adds `qty` of `itemId` to the Bank (#59), or to its assigned Food Slot when slot-homed
   * (#61): a top-up of an existing stack always fits (the #25 rule). A brand-new stack needed
   * while the Bank is already at capacity is instead auto-sold (sellable) or discarded
   * (unsellable) — the universal "passive flows auto-sell on overflow; player commands throw"
   * rule. Slot-first routing costs Bank capacity nothing — the Slot IS that Food's home. Never
   * throws — this is only ever reached from a passive arrival (drop, Catch, craft output), never
   * a player command. */
  function addToBank(itemId: string, qty: number): void {
    if (creditToFoodSlotIfHome(itemId, qty)) return;
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

  function snapshot(): Snapshot {
    return buildSnapshot(state, content, resolved, now, {
      level,
      currentSpell,
      gearBonus,
      gearDef,
      weaponSpeed,
      weaponAttackTypeFor,
      areaUnlocked,
      dungeonDef,
      fishingSpotDef,
      recipeDef,
      nextBankSlotsPrice,
    });
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
      // Food Slot can ever match its itemId (only Food is ever assigned to a slot), so addToBank
      // always falls through to the ordinary Bank top-up/overflow rules.
      addToBank(spot.itemId, 1);
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
    const { def, owned } = takeOwned(
      arrowItemId,
      (d): d is AmmoDef => d.kind === "ammo" && d.ammoType === "arrow",
      `${arrowItemId} is not an Arrow`,
    );
    checkLevelReq(def);

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
    // Rune level gates live on the Spell, not AmmoDef.levelReq — do not add a second gate here.
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
      checkLevelReq(def);

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
    unequip(slot) {
      if (!(slot in state.equipment)) throw new Error(`unknown gear slot: ${slot}`);
      const itemId = state.equipment[slot];
      if (itemId === null) return;

      const oldMode = weaponCombatModeFor(state.equipment.weapon, resolved);

      returnToBank(itemId, 1);
      state.equipment[slot] = null;

      const newMode = weaponCombatModeFor(state.equipment.weapon, resolved);
      if (oldMode !== newMode) {
        state.combatStyle = remapCombatStyle(state.combatStyle, newMode);
      }
      emit({ type: "unequipped", itemId });
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
      const slotHomed = creditToFoodSlotIfHome(itemId, qty);
      if (!slotHomed && !hasRoomForNewStack(state.bank, state.bankCapacity, itemId)) {
        throw new Error("bank is full");
      }

      state.gold -= cost;
      if (!slotHomed) {
        state.bank.set(itemId, (state.bank.get(itemId) ?? 0) + qty);
      }
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
