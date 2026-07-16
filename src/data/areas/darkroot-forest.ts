import type { AreaContent } from "../area-content";

export const darkrootForest: AreaContent = {
  area: {
    id: "darkroot-forest",
    name: "Darkroot Forest",
    unlockedByDungeonId: "meadow-depths",
    theme: "forest",
  },
  monsters: [
    {
      id: "wolf",
      name: "Wolf",
      hp: 16,
      attackLevel: 6,
      defenceLevel: 4,
      maxHit: 3,
      attackSpeed: 5,
      attackType: "slash",
      // Soft beast, weak to slash (its own attack type — hide isn't armour).
      def: { stab: 4, slash: 1, crush: 4, ranged: 3, magic: 2 },
      dropTable: [
        { itemId: "gold", qty: 15, chance: 1, band: "guaranteed" },
        // #115: cooked-trout -> raw-trout.
        { itemId: "raw-trout", qty: 1, chance: 0.35, band: "common" },
        { itemId: "iron-dagger", qty: 1, chance: 1 / 28, band: "uncommon" },
        // Ranged tier progression (#13): iron-tier bow, demoable from Darkroot Forest's own Monsters.
        { itemId: "iron-shortbow", qty: 1, chance: 1 / 30, band: "uncommon" },
        // #116: hide drop — see the economy-check comment above the Crafting recipes below.
        { itemId: "wolf-hide", qty: 1, chance: 0.4, band: "common" },
        // #117: gem drop (Darkroot Forest -> Sapphire) — see the gem-economy comment above the
        // jewelry Crafting recipes below.
        { itemId: "sapphire", qty: 1, chance: 1 / 96, band: "rare" },
        // #118: herb drop — see the economy-check comment above the Herblore recipes below.
        { itemId: "marrentill-herb", qty: 1, chance: 0.15, band: "uncommon" },
      ],
    },
    {
      id: "goblin-warrior",
      name: "Goblin Warrior",
      hp: 20,
      attackLevel: 12,
      defenceLevel: 8,
      maxHit: 4,
      attackSpeed: 4,
      attackType: "slash",
      // Light-armoured humanoid, weak to stab.
      def: { stab: 3, slash: 8, crush: 6, ranged: 5, magic: 4 },
      dropTable: [
        { itemId: "gold", qty: 20, chance: 1, band: "guaranteed" },
        // #115: cooked-trout -> raw-trout.
        { itemId: "raw-trout", qty: 1, chance: 0.3, band: "common" },
        { itemId: "iron-chainbody", qty: 1, chance: 1 / 32, band: "uncommon" },
        { itemId: "iron-bar", qty: 1, chance: 0.25, band: "common" },
        // Magic tier progression (#13): iron-tier staff, demoable from Darkroot Forest's own Monsters.
        { itemId: "iron-staff", qty: 1, chance: 1 / 30, band: "uncommon" },
        // #117: gem drop (Darkroot Forest -> Sapphire) — see the gem-economy comment above the
        // jewelry Crafting recipes below.
        { itemId: "sapphire", qty: 1, chance: 1 / 96, band: "rare" },
        // #118: herb drop — see the economy-check comment above the Herblore recipes below.
        { itemId: "marrentill-herb", qty: 1, chance: 0.15, band: "uncommon" },
      ],
    },
    {
      id: "bandit",
      name: "Bandit",
      hp: 24,
      attackLevel: 14,
      defenceLevel: 10,
      maxHit: 5,
      attackSpeed: 5,
      attackType: "stab",
      // Light-armoured humanoid, weak to stab (its own attack type — a raider's own leathers
      // don't stop a matching point).
      def: { stab: 4, slash: 9, crush: 8, ranged: 7, magic: 6 },
      dropTable: [
        { itemId: "gold", qty: 25, chance: 1, band: "guaranteed" },
        // #115: cooked-trout -> raw-trout.
        { itemId: "raw-trout", qty: 1, chance: 0.28, band: "common" },
        { itemId: "iron-kiteshield", qty: 1, chance: 1 / 36, band: "uncommon" },
        { itemId: "iron-full-helm", qty: 1, chance: 1 / 150, band: "rare" },
        { itemId: "iron-bar", qty: 1, chance: 0.3, band: "common" },
        // #117: gem drop (Darkroot Forest -> Sapphire) — see the gem-economy comment above the
        // jewelry Crafting recipes below.
        { itemId: "sapphire", qty: 1, chance: 1 / 96, band: "rare" },
        // #118: herb drop — see the economy-check comment above the Herblore recipes below.
        { itemId: "marrentill-herb", qty: 1, chance: 0.15, band: "uncommon" },
      ],
    },
  ],
  fishingSpots: [
    {
      id: "trout-run",
      name: "Trout Run",
      levelReq: 20,
      itemId: "raw-trout",
      xp: 50,
      catchTicks: 5,
      catchChance: 0.5,
    },
  ],
  dungeons: [
    {
      dungeon: {
        // Old Sewers (#10): Darkroot-Monster waves plus the dungeon-only Hollow Warden boss; the
        // Chest bridges the iron -> steel transition (an iron item at common, steel at uncommon/rare).
        id: "darkroot-hollow",
        name: "Darkroot Hollow",
        waves: ["wolf", "goblin-warrior", "bandit", "hollow-warden"],
        chest: [
          { itemId: "gold", qty: 150, chance: 1, band: "guaranteed" },
          { itemId: "cooked-trout", qty: 3, chance: 1, band: "guaranteed" },
          { itemId: "iron-full-helm", qty: 1, chance: 1 / 2, band: "common" },
          { itemId: "steel-dagger", qty: 1, chance: 1 / 4, band: "uncommon" },
          { itemId: "steel-kiteshield", qty: 1, chance: 1 / 8, band: "rare" },
        ],
      },
      monsters: [
        // Dungeon-only: absent from every Area's monsterIds, fought only inside "darkroot-hollow".
        {
          id: "hollow-warden",
          name: "Hollow Warden",
          hp: 35,
          attackLevel: 18,
          defenceLevel: 14,
          maxHit: 6,
          attackSpeed: 4,
          attackType: "magic",
          // Caster boss, defends melee's edged/pointed types well but its hollow armour shatters
          // under blunt force; carries a weakElement (fire) as a boss.
          def: { stab: 12, slash: 14, crush: 6, ranged: 10, magic: 16 },
          weakElement: "fire",
          dropTable: [{ itemId: "gold", qty: 30, chance: 1, band: "guaranteed" }],
        },
      ],
    },
  ],
};
