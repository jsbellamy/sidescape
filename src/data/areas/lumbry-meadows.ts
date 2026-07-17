import type { AreaContent } from "../area-content";

export const lumbryMeadows: AreaContent = {
  area: {
    id: "lumbry-meadows",
    name: "Lumbry Meadows",
    theme: "meadow",
  },
  monsters: [
    {
      id: "chicken",
      name: "Chicken",
      hp: 3,
      attackLevel: 1,
      defenceLevel: 1,
      maxHit: 1,
      attackSpeed: 4,
      attackType: "stab",
      // Soft beast, weak to slash.
      def: { stab: 3, slash: 1, crush: 3, ranged: 2, magic: 2 },
      dropTable: [
        { itemId: "gold", qty: 2, chance: 1, band: "guaranteed" },
        // #388: chicken drops its own meat — raw-chicken is its only source in the game.
        { itemId: "raw-chicken", qty: 1, chance: 0.45, band: "common" },
        // #118: herb drop (economy check comment sits on the Herblore recipes below).
        { itemId: "guam-herb", qty: 1, chance: 0.15, band: "uncommon" },
      ],
    },
    {
      id: "cow",
      name: "Cow",
      hp: 8,
      attackLevel: 1,
      defenceLevel: 1,
      maxHit: 1,
      attackSpeed: 5,
      attackType: "crush",
      // Soft beast, weak to slash.
      def: { stab: 3, slash: 1, crush: 4, ranged: 2, magic: 2 },
      dropTable: [
        { itemId: "gold", qty: 5, chance: 1, band: "guaranteed" },
        // #115: cooked-meat -> raw-beef.
        { itemId: "raw-beef", qty: 1, chance: 0.5, band: "common" },
        { itemId: "leather-body", qty: 1, chance: 1 / 20, band: "uncommon" },
        { itemId: "bronze-sword", qty: 1, chance: 1 / 32, band: "uncommon" },
        { itemId: "bronze-bar", qty: 1, chance: 0.2, band: "common" },
        // Ranged and Magic starter weapons (#7): demoable from Lumbry Meadows' own Monsters.
        { itemId: "apprentice-staff", qty: 1, chance: 1 / 28, band: "uncommon" },
        // #116: hide drop — see the economy-check comment above the Crafting recipes below.
        // #388: raised 0.5 -> 0.65 — chicken (hp 3, fastest kill) no longer supplies cowhide.
        { itemId: "cowhide", qty: 1, chance: 0.65, band: "common" },
        // #118: herb drop — see the economy-check comment above the Herblore recipes below.
        { itemId: "guam-herb", qty: 1, chance: 0.15, band: "uncommon" },
      ],
    },
    {
      id: "goblin",
      name: "Goblin",
      hp: 5,
      attackLevel: 5,
      defenceLevel: 3,
      maxHit: 2,
      attackSpeed: 4,
      attackType: "crush",
      // Light-armoured humanoid, weak to stab.
      def: { stab: 1, slash: 3, crush: 3, ranged: 2, magic: 2 },
      dropTable: [
        { itemId: "gold", qty: 8, chance: 1, band: "guaranteed" },
        // #115: cooked-meat -> raw-beef.
        { itemId: "raw-beef", qty: 1, chance: 0.25, band: "common" },
        { itemId: "bronze-shield", qty: 1, chance: 1 / 24, band: "uncommon" },
        { itemId: "goblin-charm", qty: 1, chance: 1 / 128, band: "rare" },
        { itemId: "bronze-bar", qty: 1, chance: 0.25, band: "common" },
        // Ranged starter weapon (#7): demoable from Lumbry Meadows' own Monsters.
        { itemId: "shortbow", qty: 1, chance: 1 / 28, band: "uncommon" },
        // #118: herb drop — see the economy-check comment above the Herblore recipes below.
        { itemId: "guam-herb", qty: 1, chance: 0.15, band: "uncommon" },
      ],
    },
    {
      id: "spider",
      name: "Spider",
      hp: 6,
      attackLevel: 3,
      defenceLevel: 2,
      maxHit: 1,
      attackSpeed: 3, // fast, but hits for almost nothing
      attackType: "stab", // fangs
      // Soft-bodied, weak to slash; a crush swing mostly misses the mass.
      def: { stab: 2, slash: 1, crush: 4, ranged: 3, magic: 2 },
      dropTable: [
        { itemId: "gold", qty: 3, chance: 1, band: "guaranteed" },
        // Silk: groundwork for magic robes. INTERIM — no Crafting recipe consumes silk yet; it is
        // sellable only. A later slice adds the robe line. Do not add a recipe here.
        { itemId: "silk", qty: 1, chance: 0.35, band: "common" },
        { itemId: "guam-herb", qty: 1, chance: 0.15, band: "uncommon" },
      ],
    },
    {
      id: "boar",
      name: "Boar",
      hp: 12,
      attackLevel: 6,
      defenceLevel: 4,
      maxHit: 3,
      attackSpeed: 5,
      attackType: "stab", // tusks
      // Thick-hided beast; the hump turns a crush blow, the flank does not stop a blade.
      def: { stab: 4, slash: 2, crush: 5, ranged: 3, magic: 3 },
      dropTable: [
        { itemId: "gold", qty: 10, chance: 1, band: "guaranteed" },
        { itemId: "raw-beef", qty: 1, chance: 0.45, band: "common" },
        { itemId: "cowhide", qty: 1, chance: 0.4, band: "common" },
        { itemId: "bronze-mace", qty: 1, chance: 1 / 24, band: "uncommon" },
        { itemId: "guam-herb", qty: 1, chance: 0.15, band: "uncommon" },
      ],
    },
  ],
  fishingSpots: [
    {
      id: "shrimp-pool",
      name: "Shrimp Pool",
      levelReq: 1,
      itemId: "raw-shrimp",
      xp: 10,
      catchTicks: 5,
      catchChance: 0.6,
    },
  ],
  dungeons: [
    {
      dungeon: {
        id: "meadow-depths",
        name: "Meadow Depths",
        waves: ["goblin", "goblin-brute", "goblin-chief"],
        chest: [
          { itemId: "gold", qty: 75, chance: 1, band: "guaranteed" },
          { itemId: "cooked-meat", qty: 3, chance: 1, band: "guaranteed" },
          { itemId: "bronze-sword", qty: 1, chance: 1 / 3, band: "common" },
          { itemId: "goblin-charm", qty: 1, chance: 1 / 16, band: "rare" },
        ],
      },
      monsters: [
        // Dungeon-only: absent from every Area's monsterIds, fought only inside "meadow-depths".
        {
          id: "goblin-brute",
          name: "Goblin Brute",
          hp: 15,
          attackLevel: 8,
          defenceLevel: 5,
          maxHit: 3,
          attackSpeed: 4,
          attackType: "crush",
          // Light-armoured humanoid, weak to stab.
          def: { stab: 2, slash: 5, crush: 5, ranged: 4, magic: 3 },
          dropTable: [{ itemId: "gold", qty: 12, chance: 1, band: "guaranteed" }],
        },
        {
          id: "goblin-chief",
          name: "Goblin Chief",
          hp: 30,
          attackLevel: 12,
          defenceLevel: 8,
          maxHit: 4,
          attackSpeed: 4,
          attackType: "crush",
          // Light-armoured humanoid, weak to stab.
          def: { stab: 3, slash: 8, crush: 8, ranged: 6, magic: 5 },
          dropTable: [{ itemId: "gold", qty: 20, chance: 1, band: "guaranteed" }],
        },
      ],
    },
  ],
};
