import type { AreaContent } from "../area-content";

export const boneCrypt: AreaContent = {
  // Bone Crypt (#11): endgame Area, gated by the Sewer King Dungeon (hosted in Old Sewers)
  // rather than an Old Sewers Monster. Shade Crypt (#253) is its own Dungeon: Crypt Shade moved
  // there as its boss, so Bone Crypt's open-world cast is now crypt-ghoul/bone-knight instead.
  area: {
    id: "bone-crypt",
    name: "Bone Crypt",
    unlockedByDungeonId: "sewer-king",
    theme: "crypt",
  },
  monsters: [
    {
      id: "crypt-ghoul",
      name: "Crypt Ghoul",
      hp: 65,
      attackLevel: 34,
      defenceLevel: 24,
      maxHit: 13,
      attackSpeed: 5,
      attackType: "slash",
      // Decayed flesh, easily punctured; weak to stab.
      def: { stab: 10, slash: 22, crush: 18, ranged: 16, magic: 14 },
      dropTable: [
        { itemId: "gold", qty: 90, chance: 1, band: "guaranteed" },
        // #115: cooked-pike -> raw-pike.
        { itemId: "raw-pike", qty: 1, chance: 0.28, band: "common" },
        { itemId: "mithril-dagger", qty: 1, chance: 1 / 30, band: "uncommon" },
        { itemId: "mithril-shortbow", qty: 1, chance: 1 / 32, band: "uncommon" },
        { itemId: "mithril-full-helm", qty: 1, chance: 1 / 160, band: "rare" },
        // Gear Tier ladder (#251): mithril-bar Material, feeding the mithril-tier Recipes.
        { itemId: "mithril-bar", qty: 1, chance: 0.25, band: "common" },
      ],
    },
    {
      id: "bone-knight",
      name: "Bone Knight",
      hp: 85,
      attackLevel: 46,
      defenceLevel: 34,
      maxHit: 17,
      attackSpeed: 5,
      attackType: "crush",
      // Bone armour, like Skeleton's, shatters under blunt force; weak to crush.
      def: { stab: 24, slash: 28, crush: 12, ranged: 20, magic: 16 },
      dropTable: [
        { itemId: "gold", qty: 120, chance: 1, band: "guaranteed" },
        // #115: cooked-pike -> raw-pike.
        { itemId: "raw-pike", qty: 1, chance: 0.3, band: "common" },
        { itemId: "mithril-chainbody", qty: 1, chance: 1 / 30, band: "uncommon" },
        { itemId: "mithril-mace", qty: 1, chance: 1 / 32, band: "uncommon" },
        { itemId: "mithril-kiteshield", qty: 1, chance: 1 / 150, band: "rare" },
        // Gear Tier ladder (#251): mithril-bar Material, feeding the mithril-tier Recipes.
        { itemId: "mithril-bar", qty: 1, chance: 0.28, band: "common" },
      ],
    },
  ],
  dungeons: [
    {
      dungeon: {
        id: "shade-crypt",
        name: "Shade Crypt",
        waves: ["skeleton", "crypt-ghoul", "bone-knight", "crypt-shade"],
        chest: [
          { itemId: "gold", qty: 500, chance: 1, band: "guaranteed" },
          { itemId: "cooked-pike", qty: 3, chance: 1, band: "guaranteed" },
          { itemId: "mithril-full-helm", qty: 1, chance: 1 / 2, band: "common" },
          { itemId: "adamant-dagger", qty: 1, chance: 1 / 4, band: "uncommon" },
          { itemId: "adamant-kiteshield", qty: 1, chance: 1 / 8, band: "rare" },
        ],
      },
      monsters: [
        // Shade Crypt (#253): Crypt Shade is promoted to that Dungeon's boss — dungeon-only, absent
        // from every Area's monsterIds, exactly like goblin-chief/hollow-warden/sewer-king. Id and
        // stats are UNCHANGED from the open-world-farmable era; roughly double Old Sewers' top stats
        // (Skeleton: hp 48 / maxHit 10). The Shade Blade still sits in its normal Drop Table at a
        // ~1/512 rare band.
        {
          id: "crypt-shade",
          name: "Crypt Shade",
          hp: 110,
          attackLevel: 60,
          defenceLevel: 44,
          maxHit: 22,
          attackSpeed: 5,
          attackType: "magic",
          // Ethereal caster boss, defends melee well and is weak to ranged; carries a weakElement
          // (fire) as a boss.
          def: { stab: 30, slash: 32, crush: 28, ranged: 8, magic: 36 },
          weakElement: "fire",
          dropTable: [
            { itemId: "gold", qty: 200, chance: 1, band: "guaranteed" },
            // #115: cooked-pike -> raw-pike.
            { itemId: "raw-pike", qty: 1, chance: 0.3, band: "common" },
            { itemId: "mithril-dagger", qty: 1, chance: 1 / 28, band: "uncommon" },
            { itemId: "mithril-chainbody", qty: 1, chance: 1 / 32, band: "uncommon" },
            { itemId: "mithril-kiteshield", qty: 1, chance: 1 / 34, band: "uncommon" },
            { itemId: "mithril-full-helm", qty: 1, chance: 1 / 150, band: "rare" },
            { itemId: "shade-blade", qty: 1, chance: 1 / 512, band: "rare" },
            // Ranged/Magic tier progression (#13): mithril-tier bow and staff — Bone Crypt has only
            // the one Monster, so both land on Crypt Shade's own Drop Table.
            { itemId: "mithril-shortbow", qty: 1, chance: 1 / 30, band: "uncommon" },
            { itemId: "mithril-staff", qty: 1, chance: 1 / 30, band: "uncommon" },
            // Gap-fill slash/crush weapons (#102): both also have a Smithing Recipe since #251; Bone
            // Crypt has only the one Monster, so both still land here too.
            { itemId: "mithril-sword", qty: 1, chance: 1 / 30, band: "uncommon" },
            { itemId: "mithril-mace", qty: 1, chance: 1 / 30, band: "uncommon" },
            // #117: gem drop (Bone Crypt -> Ruby) — see the gem-economy comment above the jewelry
            // Crafting recipes below.
            { itemId: "ruby", qty: 1, chance: 1 / 220, band: "rare" },
            // #118: herb drop — see the economy-check comment above the Herblore recipes below.
            { itemId: "harralander-herb", qty: 1, chance: 0.15, band: "uncommon" },
            // Gear Tier ladder (#251): mithril-bar Material, feeding the new mithril-tier Recipes.
            { itemId: "mithril-bar", qty: 1, chance: 0.25, band: "common" },
          ],
        },
      ],
    },
  ],
  fishingSpots: [
    {
      id: "flooded-ossuary",
      name: "Flooded Ossuary",
      levelReq: 45,
      itemId: "raw-cave-eel",
      xp: 110,
      catchTicks: 5,
      catchChance: 0.4,
    },
  ],
};
