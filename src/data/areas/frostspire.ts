import type { AreaContent } from "../area-content";

export const frostspire: AreaContent = {
  // Frostspire (#254): the 5th and terminal Area, gated by the Shade Crypt Dungeon (#253) hosted
  // in Bone Crypt. Adamant gear finally becomes obtainable here (open-world); rune is gated
  // behind this Area's own Frost Warden Dungeon (see dungeons below) — retires #252's interim.
  // Glacial Melt (#387) is Frostspire's Fishing Spot for raw-icefin.
  area: {
    id: "frostspire",
    name: "Frostspire",
    unlockedByDungeonId: "shade-crypt",
    theme: "glacier",
  },
  monsters: [
    {
      id: "frost-wolf",
      name: "Frost Wolf",
      hp: 130,
      attackLevel: 68,
      defenceLevel: 50,
      maxHit: 25,
      attackSpeed: 4,
      attackType: "slash",
      // Fast, light beast, weak to slash (its own attack type — precedent: wolf/bandit).
      def: { stab: 34, slash: 20, crush: 36, ranged: 32, magic: 28 },
      dropTable: [
        { itemId: "gold", qty: 180, chance: 1, band: "guaranteed" },
        { itemId: "raw-pike", qty: 1, chance: 0.3, band: "common" },
        { itemId: "adamant-dagger", qty: 1, chance: 1 / 30, band: "uncommon" },
        { itemId: "adamant-shortbow", qty: 1, chance: 1 / 32, band: "uncommon" },
        { itemId: "adamant-bar", qty: 1, chance: 0.25, band: "common" },
      ],
    },
    {
      id: "ice-wraith",
      name: "Ice Wraith",
      hp: 140,
      attackLevel: 72,
      defenceLevel: 54,
      maxHit: 27,
      attackSpeed: 5,
      attackType: "magic",
      // Ethereal caster, defends melee well; weak to ranged (precedent: crypt-shade).
      def: { stab: 40, slash: 42, crush: 38, ranged: 22, magic: 46 },
      dropTable: [
        { itemId: "gold", qty: 200, chance: 1, band: "guaranteed" },
        { itemId: "adamant-staff", qty: 1, chance: 1 / 30, band: "uncommon" },
        { itemId: "adamant-chainbody", qty: 1, chance: 1 / 170, band: "rare" },
        { itemId: "adamant-bar", qty: 1, chance: 0.25, band: "common" },
      ],
    },
    {
      id: "frost-giant",
      name: "Frost Giant",
      hp: 155,
      attackLevel: 76,
      defenceLevel: 58,
      maxHit: 30,
      attackSpeed: 6,
      attackType: "crush",
      // Heavy crush hitter; its icy hide shatters under blunt force, weak to crush (its own
      // attack type — precedent: bone-knight).
      def: { stab: 44, slash: 46, crush: 26, ranged: 40, magic: 36 },
      dropTable: [
        { itemId: "gold", qty: 230, chance: 1, band: "guaranteed" },
        { itemId: "raw-pike", qty: 1, chance: 0.32, band: "common" },
        { itemId: "adamant-mace", qty: 1, chance: 1 / 30, band: "uncommon" },
        { itemId: "adamant-sword", qty: 1, chance: 1 / 32, band: "uncommon" },
        { itemId: "adamant-kiteshield", qty: 1, chance: 1 / 170, band: "rare" },
        { itemId: "adamant-full-helm", qty: 1, chance: 1 / 180, band: "rare" },
        { itemId: "adamant-bar", qty: 1, chance: 0.28, band: "common" },
      ],
    },
    {
      id: "ice-troll",
      name: "Ice Troll",
      hp: 145,
      attackLevel: 70,
      defenceLevel: 52,
      maxHit: 26,
      attackSpeed: 6,
      attackType: "crush",
      // Frost-crusted hide: turns blades and arrows; a thrust finds the gaps between plates of rime.
      def: { stab: 40, slash: 38, crush: 24, ranged: 36, magic: 32 },
      dropTable: [
        { itemId: "gold", qty: 210, chance: 1, band: "guaranteed" },
        { itemId: "adamant-bar", qty: 1, chance: 0.25, band: "common" },
        { itemId: "adamant-mace", qty: 1, chance: 1 / 30, band: "uncommon" },
        { itemId: "adamant-full-helm", qty: 1, chance: 1 / 180, band: "rare" },
      ],
    },
    {
      id: "rime-sorcerer",
      name: "Rime Sorcerer",
      hp: 135,
      attackLevel: 74,
      defenceLevel: 56,
      maxHit: 28,
      attackSpeed: 5,
      attackType: "magic",
      weakElement: "fire",
      // Robed and warded: physical blows land, but his own element turns aside.
      def: { stab: 38, slash: 40, crush: 36, ranged: 28, magic: 48 },
      dropTable: [
        { itemId: "gold", qty: 220, chance: 1, band: "guaranteed" },
        { itemId: "adamant-bar", qty: 1, chance: 0.25, band: "common" },
        { itemId: "adamant-staff", qty: 1, chance: 1 / 30, band: "uncommon" },
        { itemId: "adamant-chainbody", qty: 1, chance: 1 / 170, band: "rare" },
      ],
    },
  ],
  dungeons: [
    {
      dungeon: {
        id: "frost-warden",
        name: "Frost Warden",
        waves: ["frost-wolf", "ice-wraith", "frost-giant", "frost-warden"],
        chest: [
          { itemId: "gold", qty: 800, chance: 1, band: "guaranteed" },
          { itemId: "rune-bar", qty: 2, chance: 1, band: "guaranteed" },
          { itemId: "adamant-full-helm", qty: 1, chance: 1 / 2, band: "common" },
          { itemId: "rune-dagger", qty: 1, chance: 1 / 4, band: "uncommon" },
          { itemId: "rune-kiteshield", qty: 1, chance: 1 / 8, band: "rare" },
          { itemId: "rune-shortbow", qty: 1, chance: 1 / 16, band: "rare" },
          { itemId: "rune-staff", qty: 1, chance: 1 / 16, band: "rare" },
        ],
      },
      monsters: [
        // Frost Warden Dungeon (#254): dungeon-only boss hosted in Frostspire, absent from every
        // Area's monsterIds, fought only inside "frost-warden" — like goblin-chief/hollow-warden/
        // sewer-king, its own dropTable stays gold-only; the Dungeon's Chest (below) is the actual
        // reward, and the ONLY source of rune-bar anywhere in Content.
        {
          id: "frost-warden",
          name: "Frost Warden",
          hp: 215,
          attackLevel: 95,
          defenceLevel: 70,
          maxHit: 40,
          attackSpeed: 5,
          attackType: "magic",
          // Ice-magic boss, defends melee's slash/crush well but cracks under a precise point strike;
          // weak to stab. Carries a weakElement (fire, melts ice) as a boss.
          def: { stab: 30, slash: 52, crush: 48, ranged: 44, magic: 60 },
          weakElement: "fire",
          dropTable: [{ itemId: "gold", qty: 260, chance: 1, band: "guaranteed" }],
        },
      ],
    },
  ],
  fishingSpots: [
    {
      id: "glacial-melt",
      name: "Glacial Melt",
      levelReq: 60,
      itemId: "raw-icefin",
      xp: 150,
      catchTicks: 5,
      catchChance: 0.35,
    },
  ],
};
