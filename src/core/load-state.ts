import { levelForXp, xpForLevel } from "./xp";
import type { ResolvedContent } from "./validate-content";
import { AUTO_EAT_THRESHOLDS, SKILL_NAMES } from "./types";
import type {
  AttackType,
  AutoEatThreshold,
  CombatMode,
  CombatStyle,
  Content,
  FoodSlot,
  GearSlot,
  PotionSlot,
  RecipeDef,
  SkillName,
  Snapshot,
} from "./types";
import type { Activity, ProductionActivity, State } from "./state";

/** Active Food Slot count (#61): tuning, not spec — a fixed-length loadout that replaced
 * free-form eat-from-Bank. Slot order (array index) is auto-eat's draining priority. */
const FOOD_SLOT_COUNT = 3;

/** Bank Slot capacity: 1 slot = 1 item stack, regardless of stack quantity. */
const BANK_START_CAPACITY = 100;
const DEFAULT_AUTO_EAT_THRESHOLD = 0.5;
/** Auto-sell-duplicate-Equipment toggle (#63): default ON. */
const DEFAULT_AUTO_SELL_DUPLICATES = true;
/** Ticks between player attacks with the weapon slot empty — mirrors engine.ts UNARMED_SPEED. */
const UNARMED_SPEED = 4;

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

/** Aggressive ↔ Rapid when the equipped weapon's Combat Mode changes (#339). */
function remapCombatStyle(style: CombatStyle, newMode: CombatMode): CombatStyle {
  if (newMode === "melee") {
    return style === "rapid" ? "aggressive" : style;
  }
  return style === "aggressive" ? "rapid" : style;
}

export function styleAdjustedWeaponSpeed(
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
export function weaponAttackTypeFor(weaponId: string | null, content: ResolvedContent): AttackType {
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
export function freshState(_content: Content): State {
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
    pendingLegacyRuneBank: [],
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
export function loadState(saved: Snapshot, content: ResolvedContent): State {
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
    pendingLegacyRuneBank: loadLegacyRuneStacks(saved, content),
  };
}
