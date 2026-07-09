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
      def: { stab: 0, slash: 0, crush: 0, ranged: 0, magic: 0 },
      dropTable: [{ itemId: "gold", qty: 10, chance: 1, band: "guaranteed" }],
    },
  ],
  items: [
    { kind: "currency", id: "gold", name: "Gold" },
    { kind: "food", id: "meat", name: "Cooked Meat", heals: 4, value: 3 },
    // A second Food (#61): lets Food Slot tests exercise a swap (a slot occupied by a DIFFERENT
    // Food) independently of "meat", which most other fixtures already lean on.
    { kind: "food", id: "bread", name: "Bread", heals: 2, value: 1 },
    {
      kind: "equipment",
      id: "bronze-sword",
      name: "Bronze Sword",
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
      slot: "head",
      def: { stab: 1, slash: 1, crush: 1, ranged: 1, magic: 1 },
      value: 100,
    },
    { kind: "material", id: "bar", name: "Test Bar", value: 5 },
    // Ranged/Magic fixtures (#7): same atk/str/speed as bronze-sword above, so XP-routing tests
    // can swap weapons without also changing the damage math being exercised.
    {
      kind: "equipment",
      id: "bow",
      name: "Test Bow",
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
      slot: "weapon",
      attackType: "magic",
      atkBonus: 10,
      strBonus: 30,
      def: { stab: 0, slash: 0, crush: 0, ranged: 0, magic: 0 },
      attackSpeed: 4,
      value: 20,
    },
  ],
  fishingSpots: [
    // catchChance 1 keeps Fishing tests deterministic without Rng draw-counting.
    {
      id: "pond",
      name: "Test Pond",
      levelReq: 1,
      itemId: "meat",
      xp: 10,
      catchTicks: 3,
      catchChance: 1,
    },
    // levelReq 20 behind the Crypt's Area gate: exercises both gate kinds independently.
    {
      id: "deep-pond",
      name: "Test Deep Pond",
      levelReq: 20,
      itemId: "meat",
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
      levelReq: 20,
      inputs: [{ itemId: "bar", qty: 3 }],
      outputItemId: "lucky-charm",
      xp: 40,
      craftTicks: 5,
    },
  ],
};
