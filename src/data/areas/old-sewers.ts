import type { AreaContent } from "../area-content";

export const oldSewers: AreaContent = {
  area: {
    id: "old-sewers",
    name: "Old Sewers",
    unlockedByDungeonId: "darkroot-hollow",
    theme: "sewer",
  },
  monsters: [
    {
      id: "giant-rat",
      name: "Giant Rat",
      hp: 32,
      attackLevel: 12,
      defenceLevel: 8,
      maxHit: 6,
      attackSpeed: 5,
      attackType: "stab",
      // Soft beast, weak to slash.
      def: { stab: 8, slash: 3, crush: 7, ranged: 5, magic: 4 },
      dropTable: [
        { itemId: "gold", qty: 30, chance: 1, band: "guaranteed" },
        // #115: cooked-pike -> raw-pike.
        { itemId: "raw-pike", qty: 1, chance: 0.35, band: "common" },
        { itemId: "steel-dagger", qty: 1, chance: 1 / 28, band: "uncommon" },
        // Ranged tier progression (#13): steel-tier bow, demoable from Old Sewers' own Monsters.
        { itemId: "steel-shortbow", qty: 1, chance: 1 / 30, band: "uncommon" },
        // Gap-fill crush weapon (#102): steel-mace also has a Smithing Recipe since #251.
        { itemId: "steel-mace", qty: 1, chance: 1 / 32, band: "uncommon" },
        // #116: hide drop — see the economy-check comment above the Crafting recipes below.
        { itemId: "thick-hide", qty: 1, chance: 0.35, band: "common" },
        // #117: gem drop (Old Sewers -> Emerald) — see the gem-economy comment above the jewelry
        // Crafting recipes below.
        { itemId: "emerald", qty: 1, chance: 1 / 140, band: "rare" },
        // #118: herb drop — see the economy-check comment above the Herblore recipes below.
        { itemId: "tarromin-herb", qty: 1, chance: 0.15, band: "uncommon" },
      ],
    },
    {
      id: "zombie",
      name: "Zombie",
      hp: 40,
      attackLevel: 24,
      defenceLevel: 16,
      maxHit: 8,
      attackSpeed: 4,
      attackType: "crush",
      // Shambling undead flesh, weak to slash; carries a weakElement (fire) as one of the two
      // non-boss exceptions.
      def: { stab: 10, slash: 6, crush: 14, ranged: 8, magic: 7 },
      weakElement: "fire",
      dropTable: [
        { itemId: "gold", qty: 40, chance: 1, band: "guaranteed" },
        { itemId: "steel-chainbody", qty: 1, chance: 1 / 32, band: "uncommon" },
        // Magic tier progression (#13): steel-tier staff, demoable from Old Sewers' own Monsters.
        { itemId: "steel-staff", qty: 1, chance: 1 / 30, band: "uncommon" },
        // #117: gem drop (Old Sewers -> Emerald) — see the gem-economy comment above the jewelry
        // Crafting recipes below.
        { itemId: "emerald", qty: 1, chance: 1 / 140, band: "rare" },
        // #118: herb drop — see the economy-check comment above the Herblore recipes below.
        { itemId: "tarromin-herb", qty: 1, chance: 0.15, band: "uncommon" },
        // Gear Tier ladder (#251): steel-bar Material, feeding the new steel-tier Smithing Recipes.
        { itemId: "steel-bar", qty: 1, chance: 0.25, band: "common" },
      ],
    },
    {
      id: "skeleton",
      name: "Skeleton",
      hp: 48,
      attackLevel: 28,
      defenceLevel: 20,
      maxHit: 10,
      attackSpeed: 5,
      attackType: "slash",
      // Bony undead, weak to crush.
      def: { stab: 14, slash: 20, crush: 8, ranged: 12, magic: 10 },
      dropTable: [
        { itemId: "gold", qty: 50, chance: 1, band: "guaranteed" },
        { itemId: "steel-kiteshield", qty: 1, chance: 1 / 36, band: "uncommon" },
        { itemId: "steel-full-helm", qty: 1, chance: 1 / 150, band: "rare" },
        // Gap-fill slash weapon (#102): steel-sword also has a Smithing Recipe since #251.
        { itemId: "steel-sword", qty: 1, chance: 1 / 28, band: "uncommon" },
        // #117: gem drop (Old Sewers -> Emerald) — see the gem-economy comment above the jewelry
        // Crafting recipes below.
        { itemId: "emerald", qty: 1, chance: 1 / 140, band: "rare" },
        // #118: herb drop — see the economy-check comment above the Herblore recipes below.
        { itemId: "harralander-herb", qty: 1, chance: 0.15, band: "uncommon" },
        // Gear Tier ladder (#251): steel-bar Material, feeding the new steel-tier Smithing Recipes.
        { itemId: "steel-bar", qty: 1, chance: 0.3, band: "common" },
      ],
    },
    {
      id: "sewer-slime",
      name: "Sewer Slime",
      hp: 36,
      attackLevel: 18,
      defenceLevel: 12,
      maxHit: 7,
      attackSpeed: 6,
      attackType: "crush",
      weakElement: "fire",
      // Amorphous: crush and stab bury themselves harmlessly in the mass; a blade cleaves it.
      def: { stab: 14, slash: 4, crush: 18, ranged: 12, magic: 8 },
      dropTable: [
        { itemId: "gold", qty: 35, chance: 1, band: "guaranteed" },
        { itemId: "steel-bar", qty: 1, chance: 0.25, band: "common" },
        { itemId: "steel-mace", qty: 1, chance: 1 / 32, band: "uncommon" },
        { itemId: "tarromin-herb", qty: 1, chance: 0.15, band: "uncommon" },
      ],
    },
    {
      id: "grave-robber",
      name: "Grave Robber",
      hp: 44,
      attackLevel: 26,
      defenceLevel: 18,
      maxHit: 9,
      attackSpeed: 4,
      attackType: "stab",
      // Patched leather: turns a slash, does little against a thrust.
      def: { stab: 12, slash: 14, crush: 10, ranged: 12, magic: 8 },
      dropTable: [
        { itemId: "gold", qty: 45, chance: 1, band: "guaranteed" },
        { itemId: "raw-pike", qty: 1, chance: 0.3, band: "common" },
        { itemId: "steel-bar", qty: 1, chance: 0.25, band: "common" },
        { itemId: "steel-dagger", qty: 1, chance: 1 / 28, band: "uncommon" },
        { itemId: "harralander-herb", qty: 1, chance: 0.15, band: "uncommon" },
        { itemId: "emerald", qty: 1, chance: 1 / 140, band: "rare" },
      ],
    },
  ],
  dungeons: [
    {
      dungeon: {
        id: "sewer-king",
        name: "Sewer King",
        waves: ["giant-rat", "zombie", "skeleton", "sewer-king"],
        chest: [
          { itemId: "gold", qty: 300, chance: 1, band: "guaranteed" },
          { itemId: "cooked-pike", qty: 3, chance: 1, band: "guaranteed" },
          { itemId: "steel-full-helm", qty: 1, chance: 1 / 2, band: "common" },
          { itemId: "mithril-dagger", qty: 1, chance: 1 / 4, band: "uncommon" },
          { itemId: "mithril-kiteshield", qty: 1, chance: 1 / 8, band: "rare" },
        ],
      },
      monsters: [
        // Sewer King Dungeon (#11): dungeon-only boss hosted in Old Sewers, absent from every Area's
        // monsterIds, fought only inside "sewer-king". Roughly Old-Sewers-boss-tier, above Skeleton.
        {
          id: "sewer-king",
          name: "Sewer King",
          hp: 70,
          attackLevel: 36,
          defenceLevel: 28,
          maxHit: 12,
          attackSpeed: 4,
          attackType: "crush",
          // Light-armoured humanoid boss, weak to stab; carries a weakElement (earth) as a boss.
          def: { stab: 12, slash: 22, crush: 24, ranged: 18, magic: 16 },
          weakElement: "earth",
          dropTable: [{ itemId: "gold", qty: 70, chance: 1, band: "guaranteed" }],
        },
      ],
    },
  ],
  fishingSpots: [
    {
      id: "sewer-outflow",
      name: "Sewer Outflow",
      levelReq: 30,
      itemId: "raw-pike",
      xp: 80,
      catchTicks: 5,
      catchChance: 0.45,
    },
  ],
};
