import type { Content } from "./types";

/**
 * Minimal two-Area world for Engine tests. "dummy" barely fights back;
 * "brute" hits hard and sits behind "meadow"'s own "gauntlet" Dungeon
 * (#24: Area gates are Dungeon-boss gates, not combat-level gates).
 */
export const fixtureContent: Content = {
  areas: [
    {
      id: "meadow",
      name: "Test Meadow",
      monsterIds: ["dummy"],
      fishingSpotIds: ["pond"],
      theme: "meadow",
    },
    {
      id: "crypt",
      name: "Test Crypt",
      unlockedByDungeonId: "gauntlet",
      monsterIds: ["brute"],
      fishingSpotIds: ["deep-pond"],
      theme: "crypt",
    },
  ],
  monsters: [
    {
      id: "dummy",
      name: "Training Dummy",
      hp: 3,
      attackLevel: 1,
      defenceLevel: 1,
      maxHit: 1,
      attackSpeed: 4,
      attackType: "crush",
      def: { stab: 0, slash: 0, crush: 0, ranged: 0, magic: 0 },
      dropTable: [
        { itemId: "gold", qty: 5, chance: 1, band: "guaranteed" },
        { itemId: "meat", qty: 1, chance: 0.25, band: "common" },
        { itemId: "bronze-sword", qty: 1, chance: 1 / 16, band: "uncommon" },
        { itemId: "lucky-charm", qty: 1, chance: 1 / 128, band: "rare" },
      ],
    },
    {
      id: "brute",
      name: "Crypt Brute",
      hp: 40,
      attackLevel: 40,
      defenceLevel: 40,
      maxHit: 8,
      attackSpeed: 4,
      attackType: "crush",
      def: { stab: 0, slash: 0, crush: 0, ranged: 0, magic: 0 },
      dropTable: [{ itemId: "gold", qty: 200, chance: 1, band: "guaranteed" }],
    },
    // Dungeon-only: absent from every Area's monsterIds (see the "gauntlet" Dungeon below).
    {
      id: "boss-dummy",
      name: "Boss Dummy",
      hp: 5,
      attackLevel: 1,
      defenceLevel: 1,
      maxHit: 1,
      attackSpeed: 4,
      attackType: "crush",
      def: { stab: 0, slash: 0, crush: 0, ranged: 0, magic: 0 },
      dropTable: [{ itemId: "gold", qty: 10, chance: 1, band: "guaranteed" }],
    },
    // Element weakness fixture pair (#101): byte-identical stats, differing only in weakElement —
    // paired so a test can run the SAME seeded Rng against both and prove the multiplier (or its
    // absence) rather than eyeballing statistics. Never attacks back (maxHit 0) and never dies
    // (hp 999) mid-test. Absent from every Area's monsterIds, same as boss-dummy above —
    // selectMonster doesn't require Area membership.
    {
      id: "weak-dummy",
      name: "Weak Dummy",
      hp: 999,
      attackLevel: 1,
      defenceLevel: 1,
      maxHit: 0,
      attackSpeed: 4,
      attackType: "crush",
      def: { stab: 0, slash: 0, crush: 0, ranged: 0, magic: 0 },
      weakElement: "air",
      dropTable: [{ itemId: "gold", qty: 1, chance: 1, band: "guaranteed" }],
    },
    {
      id: "control-dummy",
      name: "Control Dummy",
      hp: 999,
      attackLevel: 1,
      defenceLevel: 1,
      maxHit: 0,
      attackSpeed: 4,
      attackType: "crush",
      def: { stab: 0, slash: 0, crush: 0, ranged: 0, magic: 0 },
      dropTable: [{ itemId: "gold", qty: 1, chance: 1, band: "guaranteed" }],
    },
  ],
  // icon (#78): every value below reuses a real key from src/ui/icons.ts's registry (the same
  // keys the v1 Content in src/data/index.ts uses) rather than a fixture-only key, so UI tests
  // that mount this Content (app.sprites.test.ts, app.backdrop.test.ts, etc.) render real icons
  // through the same no-fallback registry lookup as production Content — never a special case.
  items: [
    { kind: "currency", id: "gold", name: "Gold", icon: "gold" },
    { kind: "food", id: "meat", name: "Cooked Meat", icon: "cooked-meat", heals: 4, value: 3 },
    // A second Food (#61): lets Food Slot tests exercise a swap (a slot occupied by a DIFFERENT
    // Food) independently of "meat", which most other fixtures already lean on.
    { kind: "food", id: "bread", name: "Bread", icon: "cooked-trout", heals: 2, value: 1 },
    {
      kind: "equipment",
      id: "bronze-sword",
      name: "Bronze Sword",
      icon: "bronze-sword",
      slot: "weapon",
      attackType: "slash",
      atkBonus: 10,
      strBonus: 30,
      def: { stab: 0, slash: 0, crush: 0, ranged: 0, magic: 0 },
      attackSpeed: 4,
      value: 20,
    },
    {
      kind: "equipment",
      id: "lucky-charm",
      name: "Lucky Charm",
      icon: "goblin-charm",
      slot: "head",
      def: { stab: 1, slash: 1, crush: 1, ranged: 1, magic: 1 },
      value: 100,
    },
    { kind: "material", id: "bar", name: "Test Bar", icon: "bronze-bar", value: 5 },
    // Raw catch fixture (#115): fishingSpots below now yield a Material, not Food — this is the
    // fixture's stand-in for raw-beef/raw-shrimp/etc. "test-cook" (recipes, below) converts it
    // back to "meat" (Food), mirroring the real cook-beef/cook-shrimp/etc. Recipes.
    { kind: "material", id: "raw-fish", name: "Raw Fish", icon: "iron-bar", value: 3 },
    // Crafting fixture (#116): stand-in for cowhide/wolf-hide/thick-hide — "test-craft" (recipes,
    // below) converts it into "lucky-charm" (equipment), mirroring the real craft-leather-*
    // Recipes' hide -> armour conversion. icon reuses the real "cowhide" key (registered in
    // src/ui/icons.ts, same discipline as every other fixture item above).
    { kind: "material", id: "hide", name: "Test Hide", icon: "cowhide", value: 2 },
    // Ranged/Magic fixtures (#7): same atk/str/speed as bronze-sword above, so XP-routing tests
    // can swap weapons without also changing the damage math being exercised.
    {
      kind: "equipment",
      id: "bow",
      name: "Test Bow",
      icon: "shortbow",
      slot: "weapon",
      attackType: "ranged",
      atkBonus: 10,
      strBonus: 30,
      def: { stab: 0, slash: 0, crush: 0, ranged: 0, magic: 0 },
      attackSpeed: 4,
      value: 20,
    },
    {
      kind: "equipment",
      id: "staff",
      name: "Test Staff",
      icon: "apprentice-staff",
      slot: "weapon",
      attackType: "magic",
      atkBonus: 10,
      strBonus: 30,
      def: { stab: 0, slash: 0, crush: 0, ranged: 0, magic: 0 },
      attackSpeed: 4,
      value: 20,
    },
    // Jewelry fixture (#117): stand-in for sapphire-amulet/-ring — an offence slot (owner
    // decision, grilled: "amulets/rings may carry atk/str bonuses, unlike armour"), so unlike
    // "lucky-charm" (head, def-only) above, this carries atkBonus/strBonus like a weapon while
    // staying attackType-less (jewelry never attacks). icon reuses the real "goblin-charm" key
    // (same discipline as every other fixture item above).
    {
      kind: "equipment",
      id: "lucky-amulet",
      name: "Lucky Amulet",
      icon: "goblin-charm",
      slot: "amulet",
      atkBonus: 5,
      strBonus: 8,
      def: { stab: 0, slash: 0, crush: 0, ranged: 0, magic: 1 },
      value: 50,
    },
    {
      kind: "equipment",
      id: "lucky-ring",
      name: "Lucky Ring",
      icon: "goblin-charm",
      slot: "ring",
      atkBonus: 3,
      strBonus: 4,
      def: { stab: 0, slash: 0, crush: 0, ranged: 0, magic: 0 },
      value: 40,
    },
    // Herblore fixtures (#118): "herb" stands in for a real herb Material (e.g. guam-herb),
    // "strength-potion"/"fishing-potion" for real charge potions — lets Potion-Slot/charge-
    // decrement/modifier-feed tests run without touching the real v1 Content. Two targets (a
    // combat Skill and "fishing-speed") so tests can exercise both qualifying-action kinds
    // independently. icon reuses real icons.ts keys, same discipline as every other fixture item.
    { kind: "material", id: "herb", name: "Test Herb", icon: "sapphire", value: 4 },
    {
      kind: "potion",
      id: "strength-potion",
      name: "Test Strength Potion",
      icon: "emerald",
      target: "strength",
      boostPct: 0.2,
      charges: 3,
      value: 10,
    },
    {
      kind: "potion",
      id: "fishing-potion",
      name: "Test Fishing Potion",
      icon: "ruby",
      target: "fishing-speed",
      boostPct: 0.5,
      charges: 3,
      value: 10,
    },
    {
      kind: "potion",
      id: "production-potion",
      name: "Test Production Potion",
      icon: "wolf-hide",
      target: "production-speed",
      boostPct: 0.5,
      charges: 3,
      value: 10,
    },
  ],
  fishingSpots: [
    // catchChance 1 keeps Fishing tests deterministic without Rng draw-counting. itemId is a
    // Material (#115: fishing yields a raw catch, not Food directly) — see "raw-fish" above.
    {
      id: "pond",
      name: "Test Pond",
      levelReq: 1,
      itemId: "raw-fish",
      xp: 10,
      catchTicks: 3,
      catchChance: 1,
    },
    // levelReq 20 behind the Crypt's Area gate: exercises both gate kinds independently.
    {
      id: "deep-pond",
      name: "Test Deep Pond",
      levelReq: 20,
      itemId: "raw-fish",
      xp: 50,
      catchTicks: 3,
      catchChance: 1,
    },
  ],
  dungeons: [
    // Two "dummy" Waves then the weak "boss-dummy" Boss; chest mixes a guaranteed entry with a
    // 1/2-chance one so seeded-Rng tests can pin exactly which items land.
    {
      id: "gauntlet",
      name: "The Gauntlet",
      areaId: "meadow",
      waves: ["dummy", "dummy", "boss-dummy"],
      chest: [
        { itemId: "gold", qty: 50, chance: 1, band: "guaranteed" },
        { itemId: "bronze-sword", qty: 1, chance: 0.5, band: "common" },
      ],
    },
  ],
  recipes: [
    // Cheap and fast: 1 bar, no level gate, so most Engine tests can craft immediately.
    {
      id: "test-sword",
      name: "Test Sword",
      skill: "smithing",
      levelReq: 1,
      inputs: [{ itemId: "bar", qty: 1 }],
      outputItemId: "bronze-sword",
      xp: 10,
      craftTicks: 3,
    },
    // Behind a Smithing level gate, for gate tests independent of the level-1 recipe above.
    {
      id: "test-charm",
      name: "Test Charm",
      skill: "smithing",
      levelReq: 20,
      inputs: [{ itemId: "bar", qty: 3 }],
      outputItemId: "lucky-charm",
      xp: 40,
      craftTicks: 5,
    },
    // Cooking fixture (#115): converts the fishing spots' raw catch ("raw-fish") into "meat"
    // (Food), mirroring the real cook-beef/cook-shrimp Recipes — lets Cooking-tab/XP-routing
    // tests run without touching the real v1 Content.
    {
      id: "test-cook",
      name: "Cook Fish",
      skill: "cooking",
      levelReq: 1,
      inputs: [{ itemId: "raw-fish", qty: 1 }],
      outputItemId: "meat",
      xp: 15,
      craftTicks: 3,
    },
    // Crafting fixture (#116): converts "hide" into "lucky-charm" (equipment), mirroring the real
    // craft-leather-body Recipe — lets Crafting-tab/XP-routing tests run without touching the real
    // v1 Content.
    {
      id: "test-craft",
      name: "Craft Vest",
      skill: "crafting",
      levelReq: 1,
      inputs: [{ itemId: "hide", qty: 1 }],
      outputItemId: "lucky-charm",
      xp: 15,
      craftTicks: 3,
    },
    // Herblore fixture (#118): converts "herb" into "strength-potion" — mirrors test-cook/
    // test-craft's role for their own Skills.
    {
      id: "test-brew",
      name: "Brew Strength Potion",
      skill: "herblore",
      levelReq: 1,
      inputs: [{ itemId: "herb", qty: 1 }],
      outputItemId: "strength-potion",
      xp: 20,
      craftTicks: 3,
    },
  ],
  // Spells (#101): one always-castable at levelReq 1 (validateContent's own requirement) plus one
  // gated, so level-gate tests don't need to touch the real v1 spellbook. "test-spark" is "air" so
  // it pairs with "weak-dummy" (monsters.ts, above) for element-multiplier tests.
  spells: [
    { id: "test-spark", name: "Test Spark", element: "air", levelReq: 1, baseMaxHit: 5 },
    { id: "test-blast", name: "Test Blast", element: "water", levelReq: 20, baseMaxHit: 15 },
  ],
};
