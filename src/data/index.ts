import type { Content } from "../core/types";

/**
 * v1 starter content: Lumbry Meadows. Data only — conforms to core types,
 * never imports engine code (ADR-0001).
 */
// Combat Depth wave 4/4 (#102) monster re-stat: every Monster below gets a real per-Attack-Type
// `def` vector so it has a genuine weak spot (its lowest `def` entry, >=~40% below its strongest
// at that Monster's tier) instead of wave 1-3's uniform-zero placeholder. Rules of thumb encoded
// per-Monster below: soft beasts (chicken/cow/giant-rat/wolf) are weak to slash; light-armoured
// humanoids (goblin family/bandit) are weak to stab; bony undead (skeleton) are weak to crush;
// ethereal/caster Monsters (hollow-warden/crypt-shade) defend melee well and lean on a non-melee
// or off-melee weak spot; every Monster keeps decent-but-beatable def in its non-weak types so the
// matrix rewards switching without punishing ignoring it into unwinnability. Only bosses plus the
// Zombie carry a `weakElement`, keeping Magic's ×1.5 multiplier a boss tool. Exact numbers are
// tuning defaults, flagged as such — a later balance pass may retune them.
export const content: Content = {
  areas: [
    {
      id: "lumbry-meadows",
      name: "Lumbry Meadows",
      monsterIds: ["chicken", "cow", "goblin"],
      fishingSpotIds: ["shrimp-pool"],
      theme: "meadow",
    },
    {
      id: "darkroot-forest",
      name: "Darkroot Forest",
      unlockedByDungeonId: "meadow-depths",
      monsterIds: ["wolf", "goblin-warrior", "bandit"],
      fishingSpotIds: ["trout-run"],
      theme: "forest",
    },
    {
      id: "old-sewers",
      name: "Old Sewers",
      unlockedByDungeonId: "darkroot-hollow",
      monsterIds: ["giant-rat", "zombie", "skeleton"],
      theme: "sewer",
    },
    // Bone Crypt (#11): endgame Area holding the single boss-tier Crypt Shade, gated by the
    // Sewer King Dungeon (hosted in Old Sewers) rather than an Old Sewers Monster.
    {
      id: "bone-crypt",
      name: "Bone Crypt",
      unlockedByDungeonId: "sewer-king",
      monsterIds: ["crypt-shade"],
      theme: "crypt",
    },
  ],
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
        { itemId: "cooked-meat", qty: 1, chance: 0.3, band: "common" },
        { itemId: "bronze-dagger", qty: 1, chance: 1 / 24, band: "uncommon" },
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
        { itemId: "cooked-meat", qty: 1, chance: 0.5, band: "common" },
        { itemId: "leather-body", qty: 1, chance: 1 / 20, band: "uncommon" },
        { itemId: "bronze-sword", qty: 1, chance: 1 / 32, band: "uncommon" },
        { itemId: "bronze-bar", qty: 1, chance: 0.2, band: "common" },
        // Ranged and Magic starter weapons (#7): demoable from Lumbry Meadows' own Monsters.
        { itemId: "apprentice-staff", qty: 1, chance: 1 / 28, band: "uncommon" },
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
        { itemId: "cooked-meat", qty: 1, chance: 0.25, band: "common" },
        { itemId: "bronze-shield", qty: 1, chance: 1 / 24, band: "uncommon" },
        { itemId: "goblin-charm", qty: 1, chance: 1 / 128, band: "rare" },
        { itemId: "bronze-bar", qty: 1, chance: 0.25, band: "common" },
        // Ranged starter weapon (#7): demoable from Lumbry Meadows' own Monsters.
        { itemId: "shortbow", qty: 1, chance: 1 / 28, band: "uncommon" },
      ],
    },
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
        { itemId: "cooked-trout", qty: 1, chance: 0.35, band: "common" },
        { itemId: "iron-dagger", qty: 1, chance: 1 / 28, band: "uncommon" },
        // Ranged tier progression (#13): iron-tier bow, demoable from Darkroot Forest's own Monsters.
        { itemId: "iron-shortbow", qty: 1, chance: 1 / 30, band: "uncommon" },
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
        { itemId: "cooked-trout", qty: 1, chance: 0.3, band: "common" },
        { itemId: "iron-chainbody", qty: 1, chance: 1 / 32, band: "uncommon" },
        { itemId: "iron-bar", qty: 1, chance: 0.25, band: "common" },
        // Magic tier progression (#13): iron-tier staff, demoable from Darkroot Forest's own Monsters.
        { itemId: "iron-staff", qty: 1, chance: 1 / 30, band: "uncommon" },
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
        { itemId: "cooked-trout", qty: 1, chance: 0.28, band: "common" },
        { itemId: "iron-kiteshield", qty: 1, chance: 1 / 36, band: "uncommon" },
        { itemId: "iron-full-helm", qty: 1, chance: 1 / 150, band: "rare" },
        { itemId: "iron-bar", qty: 1, chance: 0.3, band: "common" },
      ],
    },
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
    // Old Sewers (#10): roughly double Darkroot Forest's hp/damage, mapping wolf -> giant-rat,
    // goblin-warrior -> zombie, bandit -> skeleton.
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
        { itemId: "cooked-pike", qty: 1, chance: 0.35, band: "common" },
        { itemId: "steel-dagger", qty: 1, chance: 1 / 28, band: "uncommon" },
        // Ranged tier progression (#13): steel-tier bow, demoable from Old Sewers' own Monsters.
        { itemId: "steel-shortbow", qty: 1, chance: 1 / 30, band: "uncommon" },
        // Gap-fill crush weapon (#102): no steel-bar Material exists, so steel-mace is drop-only.
        { itemId: "steel-mace", qty: 1, chance: 1 / 32, band: "uncommon" },
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
        { itemId: "cooked-pike", qty: 1, chance: 0.3, band: "common" },
        { itemId: "steel-chainbody", qty: 1, chance: 1 / 32, band: "uncommon" },
        // Magic tier progression (#13): steel-tier staff, demoable from Old Sewers' own Monsters.
        { itemId: "steel-staff", qty: 1, chance: 1 / 30, band: "uncommon" },
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
        { itemId: "cooked-pike", qty: 1, chance: 0.28, band: "common" },
        { itemId: "steel-kiteshield", qty: 1, chance: 1 / 36, band: "uncommon" },
        { itemId: "steel-full-helm", qty: 1, chance: 1 / 150, band: "rare" },
        // Gap-fill slash weapon (#102): no steel-bar Material exists, so steel-sword is drop-only.
        { itemId: "steel-sword", qty: 1, chance: 1 / 28, band: "uncommon" },
      ],
    },
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
    // Bone Crypt (#11): the endgame Area's single boss-tier Monster, roughly double Old Sewers'
    // top stats (Skeleton: hp 48 / maxHit 10). Open-world Area boss, NOT a dungeon boss — the
    // Shade Blade sits in its normal Drop Table at a ~1/512 rare band.
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
        { itemId: "cooked-pike", qty: 1, chance: 0.3, band: "common" },
        { itemId: "mithril-dagger", qty: 1, chance: 1 / 28, band: "uncommon" },
        { itemId: "mithril-chainbody", qty: 1, chance: 1 / 32, band: "uncommon" },
        { itemId: "mithril-kiteshield", qty: 1, chance: 1 / 34, band: "uncommon" },
        { itemId: "mithril-full-helm", qty: 1, chance: 1 / 150, band: "rare" },
        { itemId: "shade-blade", qty: 1, chance: 1 / 512, band: "rare" },
        // Ranged/Magic tier progression (#13): mithril-tier bow and staff — Bone Crypt has only
        // the one Monster, so both land on Crypt Shade's own Drop Table.
        { itemId: "mithril-shortbow", qty: 1, chance: 1 / 30, band: "uncommon" },
        { itemId: "mithril-staff", qty: 1, chance: 1 / 30, band: "uncommon" },
        // Gap-fill slash/crush weapons (#102): no mithril-bar Material exists, so both are
        // drop-only; Bone Crypt has only the one Monster, so both land here too.
        { itemId: "mithril-sword", qty: 1, chance: 1 / 30, band: "uncommon" },
        { itemId: "mithril-mace", qty: 1, chance: 1 / 30, band: "uncommon" },
      ],
    },
  ],
  items: [
    { kind: "currency", id: "gold", name: "Gold", icon: "gold" },
    {
      kind: "food",
      id: "cooked-meat",
      name: "Cooked Meat",
      icon: "cooked-meat",
      heals: 4,
      value: 3,
    },
    {
      kind: "equipment",
      id: "bronze-dagger",
      name: "Bronze Dagger",
      icon: "bronze-dagger",
      slot: "weapon",
      attackType: "stab",
      atkBonus: 4,
      strBonus: 3,
      def: { stab: 0, slash: 0, crush: 0, ranged: 0, magic: 0 },
      attackSpeed: 4,
      value: 10,
    },
    {
      kind: "equipment",
      id: "bronze-sword",
      name: "Bronze Sword",
      icon: "bronze-sword",
      slot: "weapon",
      attackType: "slash",
      atkBonus: 7,
      strBonus: 6,
      def: { stab: 0, slash: 0, crush: 0, ranged: 0, magic: 0 },
      attackSpeed: 5,
      value: 20,
    },
    // Gap-fill crush weapon (Combat Depth #102): no mace exists at any tier before this — atk/str
    // land between the tier's dagger and sword, same attackSpeed as the sword/dagger family.
    {
      kind: "equipment",
      id: "bronze-mace",
      name: "Bronze Mace",
      icon: "bronze-mace",
      slot: "weapon",
      attackType: "crush",
      atkBonus: 6,
      strBonus: 5,
      def: { stab: 0, slash: 0, crush: 0, ranged: 0, magic: 0 },
      attackSpeed: 5,
      value: 15,
    },
    {
      kind: "equipment",
      id: "leather-body",
      name: "Leather Body",
      icon: "leather-body",
      slot: "body",
      // Armour re-stat (#102, tuning defaults): modest melee def, the anti-caster choice — its
      // magic def beats every metal body's at its own tier.
      def: { stab: 3, slash: 3, crush: 3, ranged: 3, magic: 7 },
      value: 15,
    },
    {
      kind: "equipment",
      id: "bronze-shield",
      name: "Bronze Shield",
      icon: "bronze-shield",
      slot: "shield",
      // Armour re-stat (#102, tuning defaults): metal — strong vs stab/slash/ranged, weaker vs
      // crush, no magic def at the starter tier.
      def: { stab: 4, slash: 4, crush: 2, ranged: 3, magic: 0 },
      value: 12,
    },
    {
      kind: "equipment",
      id: "goblin-charm",
      name: "Goblin Charm",
      icon: "goblin-charm",
      slot: "head",
      // Armour re-stat (#102, tuning defaults): keeps its flavor, given a small magic lean.
      def: { stab: 1, slash: 1, crush: 1, ranged: 1, magic: 3 },
      value: 150,
    },
    {
      kind: "food",
      id: "cooked-trout",
      name: "Cooked Trout",
      icon: "cooked-trout",
      heals: 8,
      value: 8,
    },
    {
      kind: "equipment",
      id: "iron-dagger",
      name: "Iron Dagger",
      icon: "iron-dagger",
      slot: "weapon",
      attackType: "stab",
      atkBonus: 9,
      strBonus: 7,
      def: { stab: 0, slash: 0, crush: 0, ranged: 0, magic: 0 },
      attackSpeed: 4,
      value: 35,
    },
    {
      kind: "equipment",
      id: "iron-chainbody",
      name: "Iron Chainbody",
      icon: "iron-chainbody",
      slot: "body",
      // Armour re-stat (#102, tuning defaults): metal — strong vs stab/slash/ranged, weaker vs
      // crush, low magic def.
      def: { stab: 10, slash: 10, crush: 5, ranged: 9, magic: 1 },
      value: 60,
    },
    {
      kind: "equipment",
      id: "iron-kiteshield",
      name: "Iron Kiteshield",
      icon: "iron-kiteshield",
      slot: "shield",
      def: { stab: 8, slash: 8, crush: 4, ranged: 7, magic: 1 },
      value: 50,
    },
    {
      kind: "equipment",
      id: "iron-full-helm",
      name: "Iron Full Helm",
      icon: "iron-full-helm",
      slot: "head",
      def: { stab: 5, slash: 5, crush: 2, ranged: 4, magic: 0 },
      value: 120,
    },
    // Gap-fill iron-tier slash/crush weapons (Combat Depth #102): only bronze-sword existed
    // before this at any tier; mace atk/str land between the tier's dagger and sword.
    {
      kind: "equipment",
      id: "iron-sword",
      name: "Iron Sword",
      icon: "iron-sword",
      slot: "weapon",
      attackType: "slash",
      atkBonus: 12,
      strBonus: 10,
      def: { stab: 0, slash: 0, crush: 0, ranged: 0, magic: 0 },
      attackSpeed: 5,
      value: 45,
    },
    {
      kind: "equipment",
      id: "iron-mace",
      name: "Iron Mace",
      icon: "iron-mace",
      slot: "weapon",
      attackType: "crush",
      atkBonus: 11,
      strBonus: 9,
      def: { stab: 0, slash: 0, crush: 0, ranged: 0, magic: 0 },
      attackSpeed: 5,
      value: 40,
    },
    // Append-only: ids are referenced by saves (Food Slots persist an itemId, #61), so never
    // reorder above. Content order no longer drives autoEat — that's Food Slot order now.
    {
      kind: "food",
      id: "cooked-shrimp",
      name: "Cooked Shrimp",
      icon: "cooked-shrimp",
      heals: 3,
      value: 2,
    },
    // Smithing materials (#28): dropped by Monsters above, consumed by recipes below.
    { kind: "material", id: "bronze-bar", name: "Bronze Bar", icon: "bronze-bar", value: 8 },
    { kind: "material", id: "iron-bar", name: "Iron Bar", icon: "iron-bar", value: 20 },
    // Old Sewers (#10): steel Equipment tier and a stronger Food. Append-only — see the
    // append-only comment above cooked-shrimp; these go after iron-bar, never earlier.
    {
      kind: "equipment",
      id: "steel-dagger",
      name: "Steel Dagger",
      icon: "steel-dagger",
      slot: "weapon",
      attackType: "stab",
      atkBonus: 14,
      strBonus: 11,
      def: { stab: 0, slash: 0, crush: 0, ranged: 0, magic: 0 },
      attackSpeed: 4,
      value: 70,
    },
    {
      kind: "equipment",
      id: "steel-chainbody",
      name: "Steel Chainbody",
      icon: "steel-chainbody",
      slot: "body",
      // Armour re-stat (#102, tuning defaults): metal — dominates iron's vector in stab/slash/
      // ranged/crush, magic def still low.
      def: { stab: 16, slash: 16, crush: 8, ranged: 14, magic: 1 },
      value: 100,
    },
    {
      kind: "equipment",
      id: "steel-kiteshield",
      name: "Steel Kiteshield",
      icon: "steel-kiteshield",
      slot: "shield",
      def: { stab: 13, slash: 13, crush: 6, ranged: 11, magic: 1 },
      value: 85,
    },
    {
      kind: "equipment",
      id: "steel-full-helm",
      name: "Steel Full Helm",
      icon: "steel-full-helm",
      slot: "head",
      def: { stab: 8, slash: 8, crush: 4, ranged: 7, magic: 0 },
      value: 140,
    },
    // Gap-fill steel-tier slash/crush weapons (Combat Depth #102). No steel-bar Material exists
    // (steel Equipment has always been drop-only, like steel-kiteshield/steel-full-helm above) —
    // sourced the same way, from Old Sewers' own Monsters' Drop Tables.
    {
      kind: "equipment",
      id: "steel-sword",
      name: "Steel Sword",
      icon: "steel-sword",
      slot: "weapon",
      attackType: "slash",
      atkBonus: 17,
      strBonus: 14,
      def: { stab: 0, slash: 0, crush: 0, ranged: 0, magic: 0 },
      attackSpeed: 5,
      value: 90,
    },
    {
      kind: "equipment",
      id: "steel-mace",
      name: "Steel Mace",
      icon: "steel-mace",
      slot: "weapon",
      attackType: "crush",
      atkBonus: 16,
      strBonus: 13,
      def: { stab: 0, slash: 0, crush: 0, ranged: 0, magic: 0 },
      attackSpeed: 5,
      value: 80,
    },
    {
      kind: "food",
      id: "cooked-pike",
      name: "Cooked Pike",
      icon: "cooked-pike",
      heals: 12,
      value: 15,
    },
    // Bone Crypt (#11): the mithril Equipment tier and the Shade Blade, the best weapon in the
    // game. Append-only — see the append-only comment above cooked-shrimp; these go after
    // cooked-pike, never earlier.
    {
      kind: "equipment",
      id: "mithril-dagger",
      name: "Mithril Dagger",
      icon: "mithril-dagger",
      slot: "weapon",
      attackType: "stab",
      atkBonus: 19,
      strBonus: 15,
      def: { stab: 0, slash: 0, crush: 0, ranged: 0, magic: 0 },
      attackSpeed: 4,
      value: 140,
    },
    {
      kind: "equipment",
      id: "mithril-chainbody",
      name: "Mithril Chainbody",
      icon: "mithril-chainbody",
      slot: "body",
      // Armour re-stat (#102, tuning defaults): metal — dominates steel's vector in stab/slash/
      // ranged/crush; magic def turns slightly negative at this top tier (heavy metal draws
      // spells in).
      def: { stab: 22, slash: 22, crush: 11, ranged: 19, magic: -2 },
      value: 160,
    },
    {
      kind: "equipment",
      id: "mithril-kiteshield",
      name: "Mithril Kiteshield",
      icon: "mithril-kiteshield",
      slot: "shield",
      def: { stab: 18, slash: 18, crush: 9, ranged: 15, magic: -1 },
      value: 140,
    },
    {
      kind: "equipment",
      id: "mithril-full-helm",
      name: "Mithril Full Helm",
      icon: "mithril-full-helm",
      slot: "head",
      def: { stab: 11, slash: 11, crush: 5, ranged: 9, magic: -1 },
      value: 220,
    },
    // Gap-fill mithril-tier slash/crush weapons (Combat Depth #102). No mithril-bar Material
    // exists (mithril Equipment has always been drop-only) — sourced the same way, from Bone
    // Crypt's own Monster (Crypt Shade)'s Drop Table.
    {
      kind: "equipment",
      id: "mithril-sword",
      name: "Mithril Sword",
      icon: "mithril-sword",
      slot: "weapon",
      attackType: "slash",
      atkBonus: 22,
      strBonus: 18,
      def: { stab: 0, slash: 0, crush: 0, ranged: 0, magic: 0 },
      attackSpeed: 5,
      value: 160,
    },
    {
      kind: "equipment",
      id: "mithril-mace",
      name: "Mithril Mace",
      icon: "mithril-mace",
      slot: "weapon",
      attackType: "crush",
      atkBonus: 21,
      strBonus: 17,
      def: { stab: 0, slash: 0, crush: 0, ranged: 0, magic: 0 },
      attackSpeed: 5,
      value: 150,
    },
    {
      kind: "equipment",
      id: "shade-blade",
      name: "Shade Blade",
      icon: "shade-blade",
      slot: "weapon",
      attackType: "slash",
      atkBonus: 40,
      strBonus: 34,
      def: { stab: 0, slash: 0, crush: 0, ranged: 0, magic: 0 },
      attackSpeed: 3,
      value: 1000,
    },
    // Ranged and Magic starter weapons (#7): the first two Equipment in Content whose attackType
    // (#99) is ranged/magic rather than a melee sub-type — every weapon above this line is melee
    // (stab/slash). Dropped by Lumbry Meadows Monsters (see goblin/cow dropTable above) so the two
    // new Skills are demoable from the very first Area. Append-only — after shade-blade, never
    // earlier.
    {
      kind: "equipment",
      id: "shortbow",
      name: "Shortbow",
      icon: "shortbow",
      slot: "weapon",
      attackType: "ranged",
      atkBonus: 5,
      strBonus: 4,
      def: { stab: 0, slash: 0, crush: 0, ranged: 0, magic: 0 },
      attackSpeed: 5,
      value: 25,
    },
    {
      kind: "equipment",
      id: "apprentice-staff",
      name: "Apprentice Staff",
      icon: "apprentice-staff",
      slot: "weapon",
      attackType: "magic",
      atkBonus: 4,
      strBonus: 5,
      def: { stab: 0, slash: 0, crush: 0, ranged: 0, magic: 0 },
      attackSpeed: 6,
      value: 25,
    },
    // Ranged/Magic tier progression (#13): iron/steel/mithril bows and staves, mirroring the
    // dagger's atk/str progression (iron 9/7, steel 14/11, mithril 19/15) with the same
    // bow-leans-atk / staff-leans-str skew the starter shortbow/apprentice-staff pair set.
    // Append-only — after apprentice-staff, never earlier.
    {
      kind: "equipment",
      id: "iron-shortbow",
      name: "Iron Shortbow",
      icon: "iron-shortbow",
      slot: "weapon",
      attackType: "ranged",
      atkBonus: 10,
      strBonus: 8,
      def: { stab: 0, slash: 0, crush: 0, ranged: 0, magic: 0 },
      attackSpeed: 5,
      value: 40,
    },
    {
      kind: "equipment",
      id: "iron-staff",
      name: "Iron Staff",
      icon: "iron-staff",
      slot: "weapon",
      attackType: "magic",
      atkBonus: 8,
      strBonus: 10,
      def: { stab: 0, slash: 0, crush: 0, ranged: 0, magic: 0 },
      attackSpeed: 6,
      value: 40,
    },
    {
      kind: "equipment",
      id: "steel-shortbow",
      name: "Steel Shortbow",
      icon: "steel-shortbow",
      slot: "weapon",
      attackType: "ranged",
      atkBonus: 16,
      strBonus: 13,
      def: { stab: 0, slash: 0, crush: 0, ranged: 0, magic: 0 },
      attackSpeed: 5,
      value: 80,
    },
    {
      kind: "equipment",
      id: "steel-staff",
      name: "Steel Staff",
      icon: "steel-staff",
      slot: "weapon",
      attackType: "magic",
      atkBonus: 13,
      strBonus: 16,
      def: { stab: 0, slash: 0, crush: 0, ranged: 0, magic: 0 },
      attackSpeed: 6,
      value: 80,
    },
    {
      kind: "equipment",
      id: "mithril-shortbow",
      name: "Mithril Shortbow",
      icon: "mithril-shortbow",
      slot: "weapon",
      attackType: "ranged",
      atkBonus: 22,
      strBonus: 18,
      def: { stab: 0, slash: 0, crush: 0, ranged: 0, magic: 0 },
      attackSpeed: 5,
      value: 150,
    },
    {
      kind: "equipment",
      id: "mithril-staff",
      name: "Mithril Staff",
      icon: "mithril-staff",
      slot: "weapon",
      attackType: "magic",
      atkBonus: 18,
      strBonus: 22,
      def: { stab: 0, slash: 0, crush: 0, ranged: 0, magic: 0 },
      attackSpeed: 6,
      value: 150,
    },
  ],
  fishingSpots: [
    {
      id: "shrimp-pool",
      name: "Shrimp Pool",
      levelReq: 1,
      itemId: "cooked-shrimp",
      xp: 10,
      catchTicks: 5,
      catchChance: 0.6,
    },
    {
      id: "trout-run",
      name: "Trout Run",
      levelReq: 20,
      itemId: "cooked-trout",
      xp: 50,
      catchTicks: 5,
      catchChance: 0.5,
    },
  ],
  dungeons: [
    {
      id: "meadow-depths",
      name: "Meadow Depths",
      areaId: "lumbry-meadows",
      waves: ["goblin", "goblin-brute", "goblin-chief"],
      chest: [
        { itemId: "gold", qty: 75, chance: 1, band: "guaranteed" },
        { itemId: "cooked-meat", qty: 3, chance: 1, band: "guaranteed" },
        { itemId: "bronze-sword", qty: 1, chance: 1 / 3, band: "common" },
        { itemId: "goblin-charm", qty: 1, chance: 1 / 16, band: "rare" },
      ],
    },
    // Old Sewers (#10): Darkroot-Monster waves plus the dungeon-only Hollow Warden boss; the
    // Chest bridges the iron -> steel transition (an iron item at common, steel at uncommon/rare).
    {
      id: "darkroot-hollow",
      name: "Darkroot Hollow",
      areaId: "darkroot-forest",
      waves: ["wolf", "goblin-warrior", "bandit", "hollow-warden"],
      chest: [
        { itemId: "gold", qty: 150, chance: 1, band: "guaranteed" },
        { itemId: "cooked-trout", qty: 3, chance: 1, band: "guaranteed" },
        { itemId: "iron-full-helm", qty: 1, chance: 1 / 2, band: "common" },
        { itemId: "steel-dagger", qty: 1, chance: 1 / 4, band: "uncommon" },
        { itemId: "steel-kiteshield", qty: 1, chance: 1 / 8, band: "rare" },
      ],
    },
    // Sewer King (#11): Old-Sewers-Monster waves plus the dungeon-only Sewer King boss, hosted
    // in Old Sewers. Its Chest bridges the steel -> mithril transition (a steel item at common,
    // mithril at uncommon/rare), and clearing it is what gates Bone Crypt.
    {
      id: "sewer-king",
      name: "Sewer King",
      areaId: "old-sewers",
      waves: ["giant-rat", "zombie", "skeleton", "sewer-king"],
      chest: [
        { itemId: "gold", qty: 300, chance: 1, band: "guaranteed" },
        { itemId: "cooked-pike", qty: 3, chance: 1, band: "guaranteed" },
        { itemId: "steel-full-helm", qty: 1, chance: 1 / 2, band: "common" },
        { itemId: "mithril-dagger", qty: 1, chance: 1 / 4, band: "uncommon" },
        { itemId: "mithril-kiteshield", qty: 1, chance: 1 / 8, band: "rare" },
      ],
    },
  ],
  recipes: [
    {
      id: "bronze-dagger",
      name: "Bronze Dagger",
      skill: "smithing",
      levelReq: 1,
      inputs: [{ itemId: "bronze-bar", qty: 1 }],
      outputItemId: "bronze-dagger",
      xp: 12,
      craftTicks: 8,
    },
    {
      id: "bronze-shield",
      name: "Bronze Shield",
      skill: "smithing",
      levelReq: 5,
      inputs: [{ itemId: "bronze-bar", qty: 2 }],
      outputItemId: "bronze-shield",
      xp: 25,
      craftTicks: 10,
    },
    {
      id: "bronze-sword",
      name: "Bronze Sword",
      skill: "smithing",
      levelReq: 8,
      inputs: [{ itemId: "bronze-bar", qty: 2 }],
      outputItemId: "bronze-sword",
      xp: 30,
      craftTicks: 10,
    },
    // Gap-fill crush weapon (#102): mirrors bronze-sword's recipe pattern, level-gated between
    // bronze-dagger and bronze-sword.
    {
      id: "bronze-mace",
      name: "Bronze Mace",
      skill: "smithing",
      levelReq: 6,
      inputs: [{ itemId: "bronze-bar", qty: 2 }],
      outputItemId: "bronze-mace",
      xp: 20,
      craftTicks: 9,
    },
    {
      id: "iron-dagger",
      name: "Iron Dagger",
      skill: "smithing",
      levelReq: 15,
      inputs: [{ itemId: "iron-bar", qty: 2 }],
      outputItemId: "iron-dagger",
      xp: 50,
      craftTicks: 12,
    },
    {
      id: "iron-chainbody",
      name: "Iron Chainbody",
      skill: "smithing",
      levelReq: 20,
      inputs: [{ itemId: "iron-bar", qty: 3 }],
      outputItemId: "iron-chainbody",
      xp: 80,
      craftTicks: 15,
    },
    // Gap-fill slash/crush weapons (#102): mirror bronze-sword/bronze-mace's recipe pattern,
    // level-gated between iron-dagger and iron-chainbody.
    {
      id: "iron-mace",
      name: "Iron Mace",
      skill: "smithing",
      levelReq: 16,
      inputs: [{ itemId: "iron-bar", qty: 2 }],
      outputItemId: "iron-mace",
      xp: 65,
      craftTicks: 13,
    },
    {
      id: "iron-sword",
      name: "Iron Sword",
      skill: "smithing",
      levelReq: 18,
      inputs: [{ itemId: "iron-bar", qty: 2 }],
      outputItemId: "iron-sword",
      xp: 70,
      craftTicks: 14,
    },
  ],
  // Starter spellbook (Combat Depth wave 3/4, #101): one Strike per Element up the Magic ladder.
  // Tuning defaults, flagged as such — wave 4/4 (#102) is the real content pass (monster
  // weaknesses); this wave only needs a levelReq-1 spell plus a plausible progression to exist.
  spells: [
    { id: "air-strike", name: "Air Strike", element: "air", levelReq: 1, baseMaxHit: 4 },
    { id: "water-strike", name: "Water Strike", element: "water", levelReq: 5, baseMaxHit: 6 },
    { id: "earth-strike", name: "Earth Strike", element: "earth", levelReq: 9, baseMaxHit: 8 },
    { id: "fire-strike", name: "Fire Strike", element: "fire", levelReq: 13, baseMaxHit: 10 },
  ],
};
