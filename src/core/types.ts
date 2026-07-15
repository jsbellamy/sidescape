/** Ordered list of Skills; order is load-bearing for the XP row render order. Ranged and Magic
 * (#7) are appended, never inserted earlier — mirrors items.ts's own append-only convention.
 * Cooking/crafting/herblore (#113, the Production & Consumables wave's chosen chassis) are
 * appended after magic for the same reason: no content ships for them this slice (#113 is the
 * chassis only), but the chassis they ride — RecipeDef.skill/selectRecipe — is skill-agnostic. */
export const SKILL_NAMES = [
  "attack",
  "strength",
  "defence",
  "hitpoints",
  "fishing",
  "smithing",
  "ranged",
  "magic",
  "cooking",
  "crafting",
  "herblore",
] as const;
export type SkillName = (typeof SKILL_NAMES)[number];

/** The five Attack Types (Combat Depth #99): a weapon attacks with exactly one, chosen by the
 * weapon itself (dagger=stab, sword=slash, mace/hammer=crush, bow=ranged, staff=magic) — no
 * per-weapon style selector (owner decision, #75). Defence is a per-type vector on armour and
 * Monsters (see EquipmentDef.def / MonsterDef.def): the player's accuracy roll routes against the
 * Monster's defence bonus for the weapon's own type, so a Monster's "weak spot" is simply the
 * type it defends worst. Order is load-bearing for render order (mirrors SKILL_NAMES). */
export const ATTACK_TYPES = ["stab", "slash", "crush", "ranged", "magic"] as const;
export type AttackType = (typeof ATTACK_TYPES)[number];

/** The four Elements (Combat Depth wave 3/4, #101) — magic-only: melee/ranged are elementless.
 * A spell carries exactly one Element; a Monster may declare a `weakElement` (MonsterDef below)
 * that a matching spell deals bonus damage against (see engine.ts's ELEMENT_WEAKNESS_MULT, the
 * one damage-side modifier in the otherwise accuracy-only Hybrid combat model). Explicit
 * per-Monster weakness, no elemental wheel (owner decision, #75/#101) — revisit if a wheel ever
 * earns its keep. */
export const ELEMENTS = ["air", "water", "earth", "fire"] as const;
export type Element = (typeof ELEMENTS)[number];

/** Scene-backdrop themes (#80): one per Area, plus the shared `town` theme for non-Area activities
 * (Smithing today; #76's other production Skills later). Theme resolution itself is a UI-only
 * concern (ADR-0001's #20 Engine/Snapshot boundary — see ui/theme.ts's `resolveTheme`); this type
 * lives in core/types.ts only because `AreaDef.theme` (below) needs it. */
// Frostspire (#254): the 5th Area's glacial theme. Appended, never inserted.
export const THEMES = ["meadow", "forest", "sewer", "crypt", "town", "glacier"] as const;
export type Theme = (typeof THEMES)[number];

export type CombatStyle = "accurate" | "aggressive" | "defensive";
/** A weapon's Combat Mode (#7) — deliberately NOT a widening of CombatStyle: CombatStyle is the
 * player's melee training selector (Accurate/Aggressive/Defensive), while Combat Mode is which of
 * Attack's three families a weapon belongs to. A melee weapon's damage XP still routes through
 * CombatStyle (STYLE_SKILL in engine.ts); a ranged or magic weapon routes straight to its own
 * Skill instead, bypassing Combat Style entirely. See ADR-0002 for why STYLE_SKILL/STYLE_BOOST
 * stay separate maps — this type is orthogonal to both. Since #99 there is no stored `combatMode`
 * field: it's derived from the weapon's `attackType` (stab|slash|crush -> melee, ranged -> ranged,
 * magic -> magic) — see weaponCombatModeFor in engine.ts, the one source of truth. */
export type CombatMode = "melee" | "ranged" | "magic";
/** Append-only, load-bearing order — GEAR_SLOT_ORDER (ui/app.ts) renders the Character panel's
 * tiles in this order. `amulet`/`ring` (#117, Crafting's jewelry line) are an OFFENCE slot,
 * mechanically distinct from the other four armour slots (owner decision, grilled: "amulets/rings
 * may carry atk/str bonuses, unlike armour") — see EquipmentDef.atkBonus/strBonus's own doc and
 * validateContent's amulet/ring carve-out. */
export type GearSlot = "weapon" | "shield" | "head" | "body" | "legs" | "amulet" | "ring";
export type DropBand = "guaranteed" | "common" | "uncommon" | "rare";

/** Fraction of max HP below which `autoEat` kicks in; 0 disables it entirely. */
export const AUTO_EAT_THRESHOLDS = [0, 0.25, 0.5, 0.75] as const;
export type AutoEatThreshold = (typeof AUTO_EAT_THRESHOLDS)[number];

/** One of the FOOD_SLOT_COUNT (engine.ts) Active Food Slots (#61): a slot IS the assigned Food's
 * home — while assigned, its entire Bank stock lives here and every new arrival of that Food
 * (fishing Catches, Loot Zone sweeps) routes here instead of the Bank. `null` = unassigned. A
 * slot may sit at `qty: 0` while still assigned — the itemId persists (empty != unassigned), so
 * the next arrival refills it automatically. Slot order (array index) is auto-eat's draining
 * priority, 1→2→3. */
export type FoodSlot = { itemId: string; qty: number } | null;

/** The single active-potion loadout slot (#118), sibling to FoodSlot above but singular (an
 * array of one wouldn't add anything — only one potion may ever be active, owner decision, see
 * PotionDef's own doc). `itemId` = the potion type; `qty` = potions remaining in the slot
 * INCLUDING the currently-open one; `charges` = charges left on the open potion. `null` = none
 * active. Unlike a Food Slot, a potion slot is NEVER assigned-but-empty: charges hitting 0 with
 * qty 1 clears the whole slot to null in the same Tick (see engine.ts's charge-decrement wiring),
 * so a non-null slot always has both qty > 0 and charges > 0. */
export type PotionSlot = { itemId: string; qty: number; charges: number } | null;

/** Source of randomness; next() returns a float in [0, 1). */
export interface Rng {
  next(): number;
}

export interface EquipmentDef {
  kind: "equipment";
  id: string;
  name: string;
  /** Key resolved through the UI's `src/ui/icons.ts` registry (core itself never touches the
   * asset) — required and validated (validateContent, #78), same discipline as a weapon's
   * attackSpeed (#90): no placeholder/fallback icon exists in the UI. */
  icon: string;
  slot: GearSlot;
  /** Weapons only, required-by-validation (validateContent, #99): omitted on armour — see
   * ATTACK_TYPES. Combat Mode (melee/ranged/magic) is derived from this, not stored separately;
   * see weaponCombatModeFor in engine.ts. Jewelry (slot amulet|ring) is NEVER a weapon — it may
   * carry atkBonus/strBonus (below) but must never carry this or attackSpeed (#117). */
  attackType?: AttackType;
  /** Weapons only, PLUS jewelry (slot amulet|ring, #117) — the owner's "offence slot" decision:
   * amulets/rings may carry atk/str bonuses, mechanically distinct from every other armour slot,
   * which must NOT declare these (validateContent enforces both halves of this rule). */
  atkBonus?: number;
  /** Weapons only, PLUS jewelry (slot amulet|ring, #117) — see atkBonus's doc above. */
  strBonus?: number;
  /** Every piece's defence, per Attack Type (#99) — replaces the old scalar defBonus. All five
   * keys are required (a compile error forces every content site to update). */
  def: Record<AttackType, number>;
  /** Weapons only: Ticks between player attacks. */
  attackSpeed?: number;
  /** Gold per unit when sold from the Bank; omit to make it unsellable. */
  value?: number;
}

export interface FoodDef {
  kind: "food";
  id: string;
  name: string;
  /** See EquipmentDef.icon's doc — same requirement, every ItemDef kind. */
  icon: string;
  heals: number;
  /** Gold per unit when sold from the Bank; omit to make it unsellable. */
  value?: number;
}

export interface CurrencyDef {
  kind: "currency";
  id: string;
  name: string;
  /** See EquipmentDef.icon's doc — same requirement, every ItemDef kind. */
  icon: string;
}

/** A Smithing input/output ingredient (e.g. a Bar). Stackable, unequippable, uneatable; sellable
 * when it carries a `value` and always bankable, same as Food/Equipment. NOT a currency-kind
 * item: `content.items.find(i => i.kind === "currency")` resolves THE currency, so a second
 * currency-kind item would silently corrupt the sell-credit target. */
export interface MaterialDef {
  kind: "material";
  id: string;
  name: string;
  /** See EquipmentDef.icon's doc — same requirement, every ItemDef kind. */
  icon: string;
  /** Gold per unit when sold from the Bank; omit to make it unsellable. */
  value?: number;
}

/** A Herblore-brewed charge potion (#118): grants a `boostPct` boost to `target` — a combat
 * SkillName raises that Skill's EFFECTIVE level (folded into `skillLevelMultiplier`, engine.ts's
 * modifier-aggregation layer, #114), while "fishing-speed"/"production-speed" shorten that
 * activity's action cadence (`actionSpeedMultiplier`, same layer). `charges` is how many
 * qualifying actions ONE open potion lasts before it's consumed — see `Snapshot.player.potionSlot`
 * for the qualifying-action rules per target kind. Only one potion may be active at a time (owner
 * decision, grilled: "the player can only have 1 active potion at a time") via the single Potion
 * Slot, so potions never stack with each other. */
export interface PotionDef {
  kind: "potion";
  id: string;
  name: string;
  /** See EquipmentDef.icon's doc — same requirement, every ItemDef kind. */
  icon: string;
  target: SkillName | "fishing-speed" | "production-speed";
  /** Boost fraction, e.g. 0.20 = +20%. */
  boostPct: number;
  /** Qualifying actions one open potion lasts before it's consumed: a combat-Skill target counts
   * a player attack (`playerAttack`), "fishing-speed" counts a catch attempt (`fishingTick`),
   * "production-speed" counts a craft completion (`productionTick`). */
  charges: number;
  /** Gold per unit when sold from the Bank; omit to make it unsellable. */
  value?: number;
}

/** A very-rare drop (#120) from a qualifying action (a combat kill, a fishing Catch, a production
 * craft completion) or a specific Boss — NOT an Item (never touches the Bank), a collection
 * instead: once obtained, a pet is owned forever and its `boostPct` modifier is ALWAYS ON, folded
 * into `activeModifierSources()` (engine.ts, #114) unconditionally alongside the active potion —
 * no active-pet slot, no charges (owner decision, grilled: "All owned always-on" — power
 * accumulates with the collection, bounded by the pet roster itself, one of each). `target` is the
 * same shape #114/`PotionDef.target` use. `source` decides which qualifying action can roll this
 * pet: "combat" (any kill), "fishing" (any Catch), "production" (any craft), or `{ boss }` — only
 * a kill of THAT Monster id (a Dungeon boss or an open-world boss-tier Monster). */
export interface PetDef {
  id: string;
  name: string;
  /** See EquipmentDef.icon's doc — same requirement, every ItemDef kind; a PetDef isn't an
   * ItemDef, but validateContent/icons.ts hold it to the identical "required + registered"
   * discipline. */
  icon: string;
  target: SkillName | "fishing-speed" | "production-speed";
  /** Boost fraction, e.g. 0.01 = +1% — deliberately tiny: every owned pet contributes forever, so
   * the roster's boosts sum rather than replace each other (unlike a single-slot potion). */
  boostPct: number;
  source: "combat" | "fishing" | "production" | { boss: string /* monsterId */ };
}

/** Ammo (#119, #221): the resource ranged/magic attacks consume — an arrow from the Quiver, or a
 * rune from the Rune Slot (see `Snapshot.player.quiver`/`runeSlot`). Two independent stores, not a
 * shared ammo slot — the Quiver holds ONE active arrow stack, the Rune Slot holds ONE active rune
 * stack (#221 collapsed the old four-Element Rune Pouch to a single slot: the loaded rune IS the
 * Spell choice). */
export interface AmmoDef {
  kind: "ammo";
  id: string;
  name: string;
  /** See EquipmentDef.icon's doc — same requirement, every ItemDef kind. */
  icon: string;
  ammoType: "arrow" | "rune";
  /** Runes only: this rune's Element, which must equal its owning Spell's `element`
   * (`SpellDef.runeId` -> this item; validateContent enforces agreement). Required for runes,
   * forbidden on arrows (validateContent enforces both halves). */
  element?: Element;
  /** Arrows only: ranged-strength bonus folded into ranged max hit alongside gear's strBonus
   * (`playerAccuracyAndMaxHit`'s ranged branch, engine.ts) — the bow decides accuracy, the arrow
   * decides power. Required for arrows, forbidden on runes (magic max hit is spell-driven, not
   * strength-shaped — runes add no strength). */
  rangedStr?: number;
  /** Gold per unit when sold from the Bank; omit to make it unsellable. */
  value?: number;
}

export type ItemDef = EquipmentDef | FoodDef | CurrencyDef | MaterialDef | PotionDef | AmmoDef;

export interface RecipeDef {
  id: string;
  name: string;
  /** The Skill this Recipe trains and gates on (#113 — was implicitly "smithing" before the
   * multi-skill production chassis; Cooking/Crafting/Herblore ride this same field). */
  skill: SkillName;
  /** Level in `skill` required to select this Recipe. */
  levelReq: number;
  inputs: { itemId: string; qty: number }[];
  /** Item produced per craft; always qty 1 (see the item-crafted event). */
  outputItemId: string;
  /** XP in `skill` per craft. */
  xp: number;
  /** Ticks per craft. */
  craftTicks: number;
}

export interface DropTableEntry {
  itemId: string;
  qty: number;
  /** Probability per kill, 0..1; 1 = guaranteed. Rolled independently per entry. */
  chance: number;
  band: DropBand;
}

export interface MonsterDef {
  id: string;
  name: string;
  hp: number;
  attackLevel: number;
  defenceLevel: number;
  maxHit: number;
  /** Ticks between monster attacks. */
  attackSpeed: number;
  /** The Monster's own offence Attack Type (#100) — its accuracy roll routes against the player's
   * armour Defence Vector entry for this type (`gearDef(monster.attackType)`), the mirror of the
   * player's own routing (#99). Required, so every content site must pick one. */
  attackType: AttackType;
  /** The bonus half of the Monster's defence roll, per Attack Type (#99) — defenceLevel stays as
   * the level half. Every Monster ships a uniform vector this wave (today's hardcoded 0); wave 4/4
   * gives real weak spots. */
  def: Record<AttackType, number>;
  /** The Element a matching spell deals ×ELEMENT_WEAKNESS_MULT damage against (engine.ts,
   * Combat Depth wave 3/4, #101) — melee/ranged are elementless, so this only ever matters against
   * a magic attacker. Optional: most Monsters ship with none set this wave; wave 4/4 (#102) authors
   * the actual weaknesses. */
  weakElement?: Element;
  dropTable: DropTableEntry[];
}

/** Magic's own content ladder (Combat Depth wave 3/4, #101; collapsed to rune-driven selection by
 * #221) — a spell, not an element-on-staff: Magic level gates WHICH spell can be cast, the spell
 * itself decides the damage (baseMaxHit). Since #221 there is no independent spell selection: the
 * loaded rune IS the Spell choice (see `runeId` and `Snapshot.player.spell`/`runeSlot`). */
export interface SpellDef {
  id: string;
  name: string;
  element: Element;
  /** Magic level required to cast. */
  levelReq: number;
  /** Spell-driven max hit — Magic level gates WHICH spell, the spell decides the damage. */
  baseMaxHit: number;
  /** The rune Item that casts this Spell (#221). Exactly one rune per Spell and one Spell per
   * rune — validateContent enforces the 1:1. Runes ARE the Spell's charges: 10 Air Runes = 10 Air
   * Strikes. A future rune tier is therefore pure data: a new rune Item + a new SpellDef pointing
   * at it, with no Engine change. */
  runeId: string;
}

export interface FishingSpotDef {
  id: string;
  name: string;
  /** Fishing level required to fish here. */
  levelReq: number;
  /** Caught item; must be a MaterialDef — a raw catch (#115: fishing no longer yields Food
   * directly). Cooking recipes (RecipeDef.skill === "cooking") convert it to Food. */
  itemId: string;
  /** Fishing XP per successful Catch. */
  xp: number;
  /** Ticks between Catch attempts. */
  catchTicks: number;
  /** Probability per attempt, 0..1; rolled via Rng. */
  catchChance: number;
}

export interface AreaDef {
  id: string;
  name: string;
  /** DungeonDef id whose completion unlocks this Area; absent = unlocked from the start. */
  unlockedByDungeonId?: string;
  monsterIds: string[];
  fishingSpotIds?: string[];
  /** The scene backdrop this Area shows while fighting/fishing/dungeoning in it (#80). Required
   * (not optional) so adding an Area is a compile error until it's themed — see THEMES. */
  theme: Theme;
}

export interface DungeonDef {
  id: string;
  name: string;
  /** Area whose picker section hosts this dungeon; entry requires that Area unlocked. */
  areaId: string;
  /** MonsterDef ids fought in order; the last entry is the boss. Length >= 1. */
  waves: string[];
  /** Chest reward table: every entry rolled independently per completion (multi-roll);
   * chance 1 = guaranteed. Reuses DropTableEntry — same semantics as rollDrops. */
  chest: DropTableEntry[];
}

/** A fixed-price vendor entry (#119) — distinct from a Dungeon Chest's rolled reward table: every
 * entry sells for a flat `price` per unit, no roll involved. See `buy` (engine.ts), which mirrors
 * `buyBankSlots`'s throw-on-insufficient-gold pattern. This wave's vendor sells only arrows and
 * the four element runes; a future wave may widen the itemId set this points at. */
export interface VendorEntry {
  itemId: string;
  price: number;
}

export interface Content {
  areas: AreaDef[];
  monsters: MonsterDef[];
  items: ItemDef[];
  fishingSpots: FishingSpotDef[];
  dungeons: DungeonDef[];
  recipes: RecipeDef[];
  spells: SpellDef[];
  vendor: VendorEntry[];
  pets: PetDef[];
}

export type EngineEvent =
  | { type: "kill"; monsterId: string }
  /** One resolved swing (player or monster), fired every time an attack resolves — including
   * accuracy misses (hit: false, damage 0) and hits that rolled 0 damage (hit: true, damage 0).
   * Owner's rule, recorded for the Combat Depth wave (#75): "the boolean may only apply to magic
   * where it can be a zero hit but still apply the effect and a miss should not apply the effect."
   * Today the UI renders damage 0 as a blue miss splat either way; `hit` exists so effect
   * application can key off it later without an event-shape change. */
  | { type: "attack"; actor: "player" | "monster"; damage: number; hit: boolean }
  | { type: "drop"; itemId: string; qty: number; band: DropBand }
  | { type: "levelup"; skill: SkillName; level: number }
  | { type: "death" }
  | { type: "food-eaten"; itemId: string; healed: number }
  | { type: "item-sold"; itemId: string; qty: number; gold: number }
  | { type: "fish-caught"; spotId: string; itemId: string; qty: number }
  | { type: "item-crafted"; recipeId: string; itemId: string }
  | { type: "equipped"; itemId: string }
  /** A passive arrival (drop, Catch, craft output) that needed a NEW Bank stack while the Bank
   * was full: sellable, so it was auto-sold instead of lost (#59 — passive flows auto-sell on
   * overflow, player commands throw). Top-ups of an existing stack never trigger this. */
  | { type: "overflow-sold"; itemId: string; qty: number; gold: number }
  /** Sibling to overflow-sold (#59): the same full-Bank/new-stack situation, but the item has no
   * `value` (unsellable), so it was discarded instead. */
  | { type: "overflow-lost"; itemId: string; qty: number }
  /** A passive combat arrival (kill Drop or Chest item) that is an EquipmentDef the player already
   * owns — equipped, banked, or already sitting in the Loot Zone — auto-sold on arrival instead of
   * taking a Loot Zone slot (#63, toggleable via `setAutoSellDuplicates`, default ON). Credits
   * `value` straight to gold; an unsellable duplicate (no `value`) is discarded with overflow-lost
   * instead. The `drop` event still fires first, unchanged — this only redirects the destination. */
  | { type: "duplicate-sold"; itemId: string; gold: number }
  /** wave = 1-based cleared count (e.g. clearing the 2nd of 3 waves emits wave: 2). */
  | { type: "wave-cleared"; dungeonId: string; wave: number; totalWaves: number }
  | { type: "dungeon-completed"; dungeonId: string }
  | {
      type: "chest-opened";
      dungeonId: string;
      items: { itemId: string; qty: number; band: DropBand }[];
    }
  /** A sweep of the Loot Zone into the Bank (#60) — fired by leaving combat (selectFishingSpot,
   * selectRecipe, enterDungeon, dungeon completion) or by the on-demand lootAll() command. Lists
   * only the stacks actually banked; a stack that needed a new Bank Slot at capacity stays in the
   * Loot Zone and is left out. Never fires when nothing moved. */
  | { type: "looted"; items: { itemId: string; qty: number }[] }
  /** Death mid-Dungeon-run (#60): the run is abandoned (mirrors the existing death/ejection
   * handling) AND the Loot Zone is emptied — the failed run's own drops are lost, not banked.
   * Open-world death is unchanged: no sweep, no loss, same fight resumes. */
  | { type: "dungeon-failed"; dungeonId: string; lostItems: { itemId: string; qty: number }[] }
  /** A player command bought `qty` of `itemId` from the fixed-price vendor (#119) — see `buy`. */
  | { type: "item-bought"; itemId: string; qty: number; gold: number }
  /** A ranged/magic swing that could NOT resolve this Tick because its resource ran out — the
   * Quiver (need: "arrow") or the Rune Slot (need: "rune") — see `playerAttack`'s ammo-gate
   * (engine.ts, #119, #221). `element` is set when a Spell was loaded (a depleted Rune Slot); it
   * is omitted for an empty Rune Slot, since an empty slot has no Spell and therefore no Element.
   * Fires once per DEPLETION, not once per Tick the resource sits empty: the swing keeps skipping
   * silently every Tick after the first until ammo is loaded again. Melee never emits this. */
  | { type: "out-of-ammo"; need: "arrow" | "rune"; element?: Element }
  /** A never-before-owned Pet (#120) just rolled on a qualifying action (a kill, a Catch, or a
   * craft completion) — see `PetDef.source`. Fires once per NEW pet only; an already-owned pet
   * never re-rolls, so this never fires twice for the same `petId`. */
  | { type: "pet-dropped"; petId: string }
  /** Every XP grant (#285), general-purpose — fired for all Skills regardless of whether the same
   * grant also crosses a level boundary (`levelup` still fires independently, unchanged). The UI
   * decides what to render from it (e.g. floating combat-style XP above the player). */
  | { type: "xp-gained"; skill: SkillName; amount: number };

export interface SkillSnapshot {
  level: number;
  xp: number;
}

export interface Snapshot {
  /** Epoch ms at the moment this Snapshot was produced (#69), stamped in `snapshot()` via the
   * Engine's injected `now` clock option (defaults to `Date.now`, mirroring the injected-Rng
   * precedent). Used on the next boot to simulate away-time by pumping `tick()` — see
   * `ui/offline-progress.ts`. Tolerant on load: a save missing this field (pre-#69) is treated as
   * "no offline time", never as an error. */
  savedAt: number;
  player: {
    hp: number;
    maxHp: number;
    combatLevel: number;
    combatStyle: CombatStyle;
    autoEatThreshold: AutoEatThreshold;
    /** Toggles auto-sell of duplicate Equipment (#63), default true; tolerant load (`?? true`).
     * See the `duplicate-sold` event and engine.ts's isDuplicateEquipment for the rule. */
    autoSellDuplicates: boolean;
    /** The Active Food Slot loadout (#61), fixed length FOOD_SLOT_COUNT (3): replaces free-form
     * eat-from-Bank. See FoodSlot's own doc for the home/routing/priority rules. */
    foodSlots: FoodSlot[];
    /** The active-potion loadout slot (#118) — see PotionSlot's own doc for the shape/rules.
     * Tolerant load: missing/pre-#118 -> null (a save-shape slice, like foodSlots/spell before
     * it). */
    potionSlot: PotionSlot;
    /** The Quiver (#119): the single active arrow stack for ranged combat — ONE arrow type at a
     * time, unlike the Rune Pouch below (mirrors a Food Slot's "the store is that ammo's home"
     * shape, but singular, like PotionSlot). `null` = empty. Empty != unloaded: qty may sit at 0
     * while `itemId` persists (a depleted stack stays "loaded" — see `loadQuiver`/`unloadQuiver`,
     * engine.ts), same as a Food Slot's own qty-0-while-assigned rule. Tolerant load: missing/
     * pre-#119 -> null. */
    quiver: { itemId: string; qty: number } | null;
    /** The Rune Slot (#221): the single loaded rune stack, or null when nothing is loaded.
     * Replaces the pre-#221 four-Element Rune Pouch. The loaded rune determines the Spell that is
     * cast (`SpellDef.runeId`) and its `qty` is the number of casts remaining. Empty != unloaded:
     * qty may sit at 0 while `itemId` persists (a depleted stack stays "loaded" — mirrors the
     * Quiver above exactly, see `loadRuneSlot`/`unloadRuneSlot`, engine.ts). Tolerant load:
     * missing/pre-#221 `player.runePouch` -> null, and any stacks found in the old pouch are
     * returned to the Bank (see loadState). */
    runeSlot: { itemId: string; qty: number } | null;
    skills: Record<SkillName, SkillSnapshot>;
    equipment: Record<GearSlot, string | null>;
    /** Derived totals across every equipped Gear Slot (ADR-0001: a rule, not raw data), computed
     * fresh each snapshot from `content.items` — harmless to persist in a save, ignored on load.
     * Since #99: atkBonus/strBonus come from the equipped weapon only (armour no longer carries
     * them); `attackType` is the equipped weapon's own type (unarmed = "crush", the OSRS punch
     * type); `def` is the per-Attack-Type sum across every equipped Gear Slot. */
    bonuses: {
      attackType: AttackType;
      atkBonus: number;
      strBonus: number;
      def: Record<AttackType, number>;
      attackSpeed: number;
    };
    /** The Spell the loaded rune casts, or null when the Rune Slot is empty (#221). Derived from
     * `runeSlot`, never independently selected — there is no spellId state any more; see
     * engine.ts's `currentSpell`. */
    spell: { id: string; name: string; element: Element } | null;
    /** The player's currency balance (#59) — a number on the player, not an Item stack; the Bank
     * is the sole store for every other Item. */
    gold: number;
    respawning: boolean;
    completedDungeonIds: string[];
    /** Pet ids the player owns (#120) — every owned pet's modifier is always-on, no active-pet
     * slot (see PetDef's own doc). Append-only, stored internally as a `Set<string>` (mirrors
     * `completedDungeonIds`), serialised to an array here. Tolerant load: missing/pre-#120-> []. */
    ownedPets: string[];
  };
  /** Deepened (#184, "a rule, not raw data" — mirrors player.bonuses/areas.gatedBy): the six
   * fields below are ALWAYS recomputed from the active MonsterDef at `snapshot()` time, never
   * trusted from a saved Snapshot — see engine.ts's snapshot(). Populated for both a farmed
   * Monster and the current Dungeon Wave/Boss (dungeon reuses this same field, see
   * `Snapshot.dungeon`'s own doc). */
  monster: {
    id: string;
    name: string;
    hp: number;
    maxHp: number;
    /** Mirrors MonsterDef.attackType — the Monster's own offence Attack Type. */
    attackType: AttackType;
    /** The lowest entry in the Monster's Defence Vector, ties broken by ATTACK_TYPES order — see
     * `weakSpot` in combat.ts and CONTEXT.md's Weak Spot entry. */
    weakSpot: AttackType;
    attackLevel: number;
    defenceLevel: number;
    maxHit: number;
    /** Ticks between monster attacks. */
    attackSpeed: number;
    /** Mirrors MonsterDef.weakElement (optional, magic-only) — kept so renderScene's existing
     * "Weak: <element>" suffix needs no separate Content lookup; not one of #184's six required
     * derived fields, but necessary so `renderScene` can drop `content.monsters.find` entirely
     * while still rendering identical text. */
    weakElement?: Element;
  } | null;
  /** `progress` (#284) is the elapsed fraction, 0..1, of the current catch-attempt cycle —
   * `(cooldownTotal - catchCooldown) / cooldownTotal` in engine.ts, derived fresh every
   * snapshot() from internal-only Engine state (not persisted; a reload always restarts at a
   * fresh cooldown, so `progress` never resumes mid-cycle). Resets every attempt regardless of
   * catch-roll success — a full bar does not guarantee a catch. */
  fishing: { spotId: string; name: string; progress: number } | null;
  /** Sibling to monster/fishing; monster stays populated with the current wave Monster so the
   * existing HP-bar rendering works untouched. 1-based wave, mid-run only — never persisted
   * across a reload (a reload is an abandon, see engine.ts's loadState). */
  dungeon: { id: string; name: string; wave: number; totalWaves: number } | null;
  /** Sibling to monster/fishing/dungeon; at most one of the five is non-null at a time (#28's
   * mutual exclusion). Like fishing, a production activity RESUMES on load. Renamed from
   * `smithing` (#113, the multi-skill production chassis) to `production`, carrying `skill` so
   * the UI can label any Skill's Recipe generically, not just Smithing's. Tolerant load reads
   * `production ?? smithing` (engine.ts's loadState) so a pre-#113 save (which stored `smithing`,
   * `{ recipeId, name }` with no skill) still resumes — skill is resolved from the recipe. */
  /** `progress` (#284) mirrors `fishing.progress`'s own doc: elapsed fraction 0..1 of the current
   * craft cycle, not persisted, restarts cleanly on reload. */
  production: { recipeId: string; name: string; skill: SkillName; progress: number } | null;
  bank: {
    items: { itemId: string; qty: number }[];
    capacity: number;
    /** Derived, not stored: the gold cost of the next `buyBankSlots()` call. */
    nextSlotsPrice: number;
  };
  /** The Loot Zone (#60): a small buffer, capped at LOOT_ZONE_CAPACITY stacks, that combat Drops
   * (kill Drops and Dungeon Chest items) land in on their way to the Bank, instead of going there
   * directly — a sibling store to `bank`, not a subset of it. Currency Drops still bypass it
   * straight to `player.gold`; non-combat outputs (Catches, Smithing outputs) still go straight to
   * the Bank, unchanged. Swept into the Bank on leaving combat, or on demand via `lootAll()`. */
  lootZone: { itemId: string; qty: number }[];
  areas: {
    id: string;
    name: string;
    unlocked: boolean;
    /** The Dungeon gating this Area while it is locked; null once unlocked or if never gated.
     * The derived "why" completing ADR-0001's legality-flag promise — the UI renders lock labels
     * from this, never from raw Content. */
    gatedBy: { dungeonId: string; name: string } | null;
    monsterIds: string[];
    fishingSpots: { id: string; unlocked: boolean }[];
  }[];
}
