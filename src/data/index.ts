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
        // #115: cooked-meat -> raw-beef (Cooking now sits between a beast drop and edible Food).
        { itemId: "raw-beef", qty: 1, chance: 0.3, band: "common" },
        { itemId: "bronze-dagger", qty: 1, chance: 1 / 24, band: "uncommon" },
        // #116: hide drop (economy check comment sits on the Crafting recipes below, near cow's
        // own cowhide entry — the reference kill-rate the arithmetic is worked against).
        { itemId: "cowhide", qty: 1, chance: 0.4, band: "common" },
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
        { itemId: "cowhide", qty: 1, chance: 0.5, band: "common" },
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
        // #115: cooked-pike -> raw-pike.
        { itemId: "raw-pike", qty: 1, chance: 0.35, band: "common" },
        { itemId: "steel-dagger", qty: 1, chance: 1 / 28, band: "uncommon" },
        // Ranged tier progression (#13): steel-tier bow, demoable from Old Sewers' own Monsters.
        { itemId: "steel-shortbow", qty: 1, chance: 1 / 30, band: "uncommon" },
        // Gap-fill crush weapon (#102): no steel-bar Material exists, so steel-mace is drop-only.
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
        // #115: cooked-pike -> raw-pike.
        { itemId: "raw-pike", qty: 1, chance: 0.3, band: "common" },
        { itemId: "steel-chainbody", qty: 1, chance: 1 / 32, band: "uncommon" },
        // Magic tier progression (#13): steel-tier staff, demoable from Old Sewers' own Monsters.
        { itemId: "steel-staff", qty: 1, chance: 1 / 30, band: "uncommon" },
        // #117: gem drop (Old Sewers -> Emerald) — see the gem-economy comment above the jewelry
        // Crafting recipes below.
        { itemId: "emerald", qty: 1, chance: 1 / 140, band: "rare" },
        // #118: herb drop — see the economy-check comment above the Herblore recipes below.
        { itemId: "tarromin-herb", qty: 1, chance: 0.15, band: "uncommon" },
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
        // #115: cooked-pike -> raw-pike.
        { itemId: "raw-pike", qty: 1, chance: 0.28, band: "common" },
        { itemId: "steel-kiteshield", qty: 1, chance: 1 / 36, band: "uncommon" },
        { itemId: "steel-full-helm", qty: 1, chance: 1 / 150, band: "rare" },
        // Gap-fill slash weapon (#102): no steel-bar Material exists, so steel-sword is drop-only.
        { itemId: "steel-sword", qty: 1, chance: 1 / 28, band: "uncommon" },
        // #117: gem drop (Old Sewers -> Emerald) — see the gem-economy comment above the jewelry
        // Crafting recipes below.
        { itemId: "emerald", qty: 1, chance: 1 / 140, band: "rare" },
        // #118: herb drop — see the economy-check comment above the Herblore recipes below.
        { itemId: "harralander-herb", qty: 1, chance: 0.15, band: "uncommon" },
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
        // Gap-fill slash/crush weapons (#102): no mithril-bar Material exists, so both are
        // drop-only; Bone Crypt has only the one Monster, so both land here too.
        { itemId: "mithril-sword", qty: 1, chance: 1 / 30, band: "uncommon" },
        { itemId: "mithril-mace", qty: 1, chance: 1 / 30, band: "uncommon" },
        // #117: gem drop (Bone Crypt -> Ruby) — see the gem-economy comment above the jewelry
        // Crafting recipes below.
        { itemId: "ruby", qty: 1, chance: 1 / 220, band: "rare" },
        // #118: herb drop — see the economy-check comment above the Herblore recipes below.
        { itemId: "harralander-herb", qty: 1, chance: 0.15, band: "uncommon" },
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
      // Re-stat (#116, Crafting's ranged-armour line): leather is now the LIGHT-armour shape —
      // low stab/slash/crush, higher ranged/magic def — rather than #102's "modest melee, anti-
      // caster" numbers. Still beats every metal body's magic def (armour-directional.test.ts),
      // and is now craftable (see craft-leather-body below) in addition to its existing rare drop.
      def: { stab: 2, slash: 2, crush: 3, ranged: 6, magic: 5 },
      value: 20,
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
    // Cooking wave (#115): raw fish/beast Materials — fishing spots and monster drop tables that
    // used to yield cooked Food (see the "#115: cooked-X -> raw-X" comments above) now yield
    // these instead; Cooking recipes (below) convert them back to the same cooked Food. Append-
    // only — after mithril-staff, never earlier.
    { kind: "material", id: "raw-beef", name: "Raw Beef", icon: "raw-beef", value: 1 },
    { kind: "material", id: "raw-shrimp", name: "Raw Shrimp", icon: "raw-shrimp", value: 1 },
    { kind: "material", id: "raw-trout", name: "Raw Trout", icon: "raw-trout", value: 2 },
    { kind: "material", id: "raw-pike", name: "Raw Pike", icon: "raw-pike", value: 3 },
    // Crafting wave (#116): hide Materials, dropped by the four beasts (see the "#116: hide drop"
    // comments on chicken/cow/wolf/giant-rat's dropTables above) and consumed by the Crafting
    // recipes below. Append-only — after raw-pike, never earlier.
    { kind: "material", id: "cowhide", name: "Cowhide", icon: "cowhide", value: 2 },
    { kind: "material", id: "wolf-hide", name: "Wolf Hide", icon: "wolf-hide", value: 4 },
    { kind: "material", id: "thick-hide", name: "Thick Hide", icon: "thick-hide", value: 8 },
    // Crafting wave (#116): the base leather tier's other two pieces (leather-body itself already
    // exists above, re-stat'd to this same light-armour shape — see its own comment). Light armour
    // (#99's Combat Depth Defence Vector split): low stab/slash/crush, higher ranged/magic def, no
    // atk/str (armour never carries those — see validateContent's weapon-only invariant).
    {
      kind: "equipment",
      id: "leather-chaps",
      name: "Leather Chaps",
      icon: "leather-chaps",
      slot: "legs",
      def: { stab: 1, slash: 1, crush: 2, ranged: 4, magic: 3 },
      value: 15,
    },
    {
      kind: "equipment",
      id: "leather-coif",
      name: "Leather Coif",
      icon: "leather-coif",
      slot: "head",
      def: { stab: 1, slash: 1, crush: 1, ranged: 3, magic: 2 },
      value: 12,
    },
    // Crafting wave (#116): the hard-leather tier — wolf-hide/thick-hide inputs, levelReq 20+ (see
    // the Crafting recipes below). Same light-armour shape as the base tier, scaled up: bigger
    // ranged/magic def, melee def stays low relative to it.
    {
      kind: "equipment",
      id: "hard-leather-coif",
      name: "Hard Leather Coif",
      icon: "hard-leather-coif",
      slot: "head",
      def: { stab: 1, slash: 1, crush: 2, ranged: 5, magic: 4 },
      value: 35,
    },
    {
      kind: "equipment",
      id: "hard-leather-chaps",
      name: "Hard Leather Chaps",
      icon: "hard-leather-chaps",
      slot: "legs",
      def: { stab: 2, slash: 2, crush: 3, ranged: 7, magic: 5 },
      value: 45,
    },
    {
      kind: "equipment",
      id: "hard-leather-body",
      name: "Hard Leather Body",
      icon: "hard-leather-body",
      slot: "body",
      def: { stab: 3, slash: 3, crush: 4, ranged: 10, magic: 8 },
      value: 60,
    },
    // Crafting wave (#117): Crafting's jewelry line — gem Materials, dropped by Monsters in the
    // three tiered Areas (see the "#117: gem drop" comments on wolf/goblin-warrior/bandit,
    // giant-rat/zombie/skeleton, and crypt-shade's dropTables above) and consumed by the jewelry
    // Crafting recipes below. Append-only — after hard-leather-body, never earlier.
    { kind: "material", id: "sapphire", name: "Sapphire", icon: "sapphire", value: 15 },
    { kind: "material", id: "emerald", name: "Emerald", icon: "emerald", value: 30 },
    { kind: "material", id: "ruby", name: "Ruby", icon: "ruby", value: 60 },
    // Jewelry (#117): the amulet/ring Gear Slots (types.ts) are an OFFENCE slot (owner decision,
    // grilled, verbatim: "amulets/rings may carry atk/str bonuses, unlike armour") — mechanically
    // distinct from every other armour slot above, which never carries atk/str. Each gem tier's
    // atk/str stays well under the matching-tier weapon's own (e.g. ruby-amulet's 10/7 vs
    // mithril-dagger's 19/15) so jewelry augments a build rather than replacing its weapon choice,
    // plus a small magic-leaning def vector (a gem pendant/band, not armour plating).
    {
      kind: "equipment",
      id: "sapphire-amulet",
      name: "Sapphire Amulet",
      icon: "sapphire-amulet",
      slot: "amulet",
      atkBonus: 3,
      strBonus: 2,
      def: { stab: 0, slash: 0, crush: 0, ranged: 0, magic: 1 },
      value: 60,
    },
    {
      kind: "equipment",
      id: "sapphire-ring",
      name: "Sapphire Ring",
      icon: "sapphire-ring",
      slot: "ring",
      atkBonus: 2,
      strBonus: 1,
      def: { stab: 0, slash: 0, crush: 0, ranged: 0, magic: 0 },
      value: 50,
    },
    {
      kind: "equipment",
      id: "emerald-amulet",
      name: "Emerald Amulet",
      icon: "emerald-amulet",
      slot: "amulet",
      atkBonus: 6,
      strBonus: 4,
      def: { stab: 0, slash: 0, crush: 0, ranged: 0, magic: 2 },
      value: 120,
    },
    {
      kind: "equipment",
      id: "emerald-ring",
      name: "Emerald Ring",
      icon: "emerald-ring",
      slot: "ring",
      atkBonus: 4,
      strBonus: 2,
      def: { stab: 0, slash: 0, crush: 0, ranged: 0, magic: 1 },
      value: 100,
    },
    {
      kind: "equipment",
      id: "ruby-amulet",
      name: "Ruby Amulet",
      icon: "ruby-amulet",
      slot: "amulet",
      atkBonus: 10,
      strBonus: 7,
      def: { stab: 0, slash: 0, crush: 0, ranged: 0, magic: 3 },
      value: 220,
    },
    {
      kind: "equipment",
      id: "ruby-ring",
      name: "Ruby Ring",
      icon: "ruby-ring",
      slot: "ring",
      atkBonus: 6,
      strBonus: 4,
      def: { stab: 0, slash: 0, crush: 0, ranged: 0, magic: 2 },
      value: 180,
    },
    // Herblore wave (#118): herb Materials, dropped by the tiered Areas' own Monsters (see the
    // "#118: herb drop" comments on chicken/cow/goblin, wolf/goblin-warrior/bandit,
    // giant-rat/zombie/skeleton, and skeleton/crypt-shade's dropTables above) and consumed by the
    // Herblore recipes below. Append-only — after ruby-ring, never earlier.
    { kind: "material", id: "guam-herb", name: "Guam Herb", icon: "guam-herb", value: 4 },
    {
      kind: "material",
      id: "marrentill-herb",
      name: "Marrentill Herb",
      icon: "marrentill-herb",
      value: 6,
    },
    {
      kind: "material",
      id: "tarromin-herb",
      name: "Tarromin Herb",
      icon: "tarromin-herb",
      value: 8,
    },
    {
      kind: "material",
      id: "harralander-herb",
      name: "Harralander Herb",
      icon: "harralander-herb",
      value: 10,
    },
    // Herblore wave (#118): the charge potions brewed from the herbs above (see the Herblore
    // recipes below). `strength-potion`'s boostPct 0.20 / charges 50 is the owner's own worked
    // example ("+20% str for 50 attacks"); `fishing-potion`'s boostPct 0.15 / charges 40 is also
    // the owner's own worked example. `attack-potion`/`production-potion` mirror those shapes for
    // the combat-stat and skilling-speed target kinds the owner decision called for ("potions may
    // target combat stats ... and skilling speed").
    {
      kind: "potion",
      id: "strength-potion",
      name: "Strength Potion",
      icon: "strength-potion",
      target: "strength",
      boostPct: 0.2,
      charges: 50,
      value: 30,
    },
    {
      kind: "potion",
      id: "attack-potion",
      name: "Attack Potion",
      icon: "attack-potion",
      target: "attack",
      boostPct: 0.15,
      charges: 50,
      value: 30,
    },
    {
      kind: "potion",
      id: "fishing-potion",
      name: "Fishing Potion",
      icon: "fishing-potion",
      target: "fishing-speed",
      boostPct: 0.15,
      charges: 40,
      value: 25,
    },
    {
      kind: "potion",
      id: "production-potion",
      name: "Production Potion",
      icon: "production-potion",
      target: "production-speed",
      boostPct: 0.15,
      charges: 40,
      value: 25,
    },
    // Ammo wave (#119): arrow tiers (ranged's own resource, feeding the Quiver) and the four
    // Element runes (magic's resource, feeding the Rune Pouch) — both sold by the vendor below,
    // never dropped by Monsters this wave. Append-only — after production-potion, never earlier.
    // rangedStr climbs with tier, roughly the same spacing the dagger/bow atk/str ladders use
    // (bronze->steel->mithril, skipping iron — three tiers matches the issue's own "bronze/steel/
    // mithril or similar" suggestion).
    //
    // Economy check (owner-mandated arithmetic — see the issue's own worked numbers, §6): at
    // ~2,000 attacks/hr (idle, ~3 ticks/attack) and 1 arrow/attack, bronze-arrow's 3g vendor price
    // (below) costs ~6,000g/hr in ammo. Mid-game gold income runs ~15,000-20,000g/hr (e.g.
    // giant-rat's 30g guaranteed drop x ~600 kills/hr = ~18,000g/hr, the issue's own reference
    // rate) — 6,000/18,000 = ~33%, landing inside the issue's target ~30-40% gold-sink band:
    // meaningful, not bankrupting. Magic mirrors this at 1 rune/cast: a rune's 3g price (below,
    // picked to match bronze-arrow's own ratio rather than the issue's illustrative 4g) x ~2,000
    // casts/hr is also ~6,000g/hr, the same ~33% ratio — so switching between a bow and a staff
    // (see the Rune Pouch's own "no reload" test) never trades into a cheaper or pricier resource
    // sink, only a different one. steel-/mithril-arrow scale the SAME ratio at their own tier's
    // higher assumed gold income, so the sink stays proportionally ~30-40% up the whole ladder
    // rather than compounding into a bigger bite at higher tiers.
    {
      kind: "ammo",
      id: "bronze-arrow",
      name: "Bronze Arrow",
      icon: "bronze-arrow",
      ammoType: "arrow",
      rangedStr: 3,
      value: 1,
    },
    {
      kind: "ammo",
      id: "steel-arrow",
      name: "Steel Arrow",
      icon: "steel-arrow",
      ammoType: "arrow",
      rangedStr: 6,
      value: 2,
    },
    {
      kind: "ammo",
      id: "mithril-arrow",
      name: "Mithril Arrow",
      icon: "mithril-arrow",
      ammoType: "arrow",
      rangedStr: 10,
      value: 4,
    },
    {
      kind: "ammo",
      id: "air-rune",
      name: "Air Rune",
      icon: "air-rune",
      ammoType: "rune",
      element: "air",
      value: 1,
    },
    {
      kind: "ammo",
      id: "water-rune",
      name: "Water Rune",
      icon: "water-rune",
      ammoType: "rune",
      element: "water",
      value: 1,
    },
    {
      kind: "ammo",
      id: "earth-rune",
      name: "Earth Rune",
      icon: "earth-rune",
      ammoType: "rune",
      element: "earth",
      value: 1,
    },
    {
      kind: "ammo",
      id: "fire-rune",
      name: "Fire Rune",
      icon: "fire-rune",
      ammoType: "rune",
      element: "fire",
      value: 1,
    },
  ],
  fishingSpots: [
    // #115: itemId flipped from the cooked Food to the matching raw Material — Cooking (recipes
    // below) is now the only source of edible fish Food.
    {
      id: "shrimp-pool",
      name: "Shrimp Pool",
      levelReq: 1,
      itemId: "raw-shrimp",
      xp: 10,
      catchTicks: 5,
      catchChance: 0.6,
    },
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
    // Cooking wave (#115): the #113 Recipe chassis's first non-Smithing content — converts a raw
    // catch (fishing spot / beast drop, see the items/dropTable comments above) into the matching
    // cooked Food. Owner decision, grilled and verbatim: "Raw drops + keep boss cooked" — a
    // level-1 recipe is mandatory so a fresh player is never foodless (cook-beef/cook-shrimp both
    // sit at levelReq 1, sourced respectively from Lumbry Meadows' beasts and its Shrimp Pool).
    //
    // Economy check (owner-mandated arithmetic, not vibes — see the issue's own worked numbers):
    // Shrimp Pool (catchChance 0.6, catchTicks 5) idles at 0.6/5 = ~144 raw-shrimp/hr (6000
    // ticks/hr). cook-shrimp's craftTicks 3 gives ~2000 cooks/hr of *capacity* with a full raw
    // stack, so fishing — not cooking speed — is always the bottleneck; the Fishing Spot domain
    // rule ("progression comes from unlocking better spots, not from scaling odds") holds. At xp
    // 30/cook, ~144/hr * 30 = ~4,300 Cooking xp/hr, enough to hit level 20 (4,470 xp) in about an
    // hour — a plausible early curve. Trout Run (0.5/5 = ~120 raw-trout/hr) at xp 70/cook gives
    // ~8,400 xp/hr for the mid-game jump to levelReq 15. cook-pike (levelReq 25) scales the same
    // way off Old Sewers' better catch rate, not off a faster Cooking action.
    {
      id: "cook-beef",
      name: "Cook Beef",
      skill: "cooking",
      levelReq: 1,
      inputs: [{ itemId: "raw-beef", qty: 1 }],
      outputItemId: "cooked-meat",
      xp: 30,
      craftTicks: 3,
    },
    {
      id: "cook-shrimp",
      name: "Cook Shrimp",
      skill: "cooking",
      levelReq: 1,
      inputs: [{ itemId: "raw-shrimp", qty: 1 }],
      outputItemId: "cooked-shrimp",
      xp: 30,
      craftTicks: 3,
    },
    {
      id: "cook-trout",
      name: "Cook Trout",
      skill: "cooking",
      levelReq: 15,
      inputs: [{ itemId: "raw-trout", qty: 1 }],
      outputItemId: "cooked-trout",
      xp: 70,
      craftTicks: 4,
    },
    {
      id: "cook-pike",
      name: "Cook Pike",
      skill: "cooking",
      levelReq: 25,
      inputs: [{ itemId: "raw-pike", qty: 1 }],
      outputItemId: "cooked-pike",
      xp: 90,
      craftTicks: 4,
    },
    // Crafting wave (#116): the #113 Recipe chassis's ranged-armour line — beasts drop hides (see
    // the "#116: hide drop" comments on chicken/cow/wolf/giant-rat's dropTables above), Crafting
    // converts them straight to leather/ranged armour (no cured intermediate — one-step, matching
    // Smithing's bar->gear chain). Owner framing (#76, verbatim): "ranged and jewelry/trinkets for
    // crafting" — this is the ranged-armour half; jewelry (#117) shares this Skill and tab.
    //
    // Economy check (owner-mandated arithmetic, not vibes — mirrors the issue's own worked
    // numbers): a mid-game farmer idles at ~600 kills/hr. Cow's Cowhide chance is 0.5/kill ->
    // ~300 hides/hr; craft-leather-body needs 1 Cowhide -> 300 crafts/hr of *capacity*, so the
    // Cowhide drop (not craft speed) is always the bottleneck, same as Cooking's own Fishing-spot-
    // bottlenecked design. At xp 25/craft -> ~7,500 Crafting xp/hr, hitting L30 (13,363 xp) in
    // ~1.8 hr — a plausible early curve (byte-identical to the issue's own worked example).
    // craft-leather-chaps/coif ride the same Cowhide bottleneck at slightly lower xp (22/20), so
    // their rate is proportionally close.
    //
    // The hard-leather tier (levelReq 20+) rides Wolf Hide (chance 0.4/kill -> ~240/hr from Wolf)
    // and Thick Hide (chance 0.35/kill -> ~210/hr from Giant Rat). craft-hard-leather-coif (1
    // input, xp 40) -> ~9,600 xp/hr, clearing L20->L25 (4470->7842, ~3,372 xp) in ~0.35 hr.
    // craft-hard-leather-chaps (2 inputs, halving the craft rate to ~120/hr, xp 55) -> ~6,600
    // xp/hr, clearing L25->L30 (~5,521 xp) in ~0.84 hr. craft-hard-leather-body (2 Thick Hide, xp
    // 70) -> ~105 crafts/hr * 70 = ~7,350 xp/hr, clearing L30->L40 (13,363->37,224, ~23,861 xp) in
    // ~3.25 hr. Every segment, base and hard-leather tier alike, lands well inside single-digit
    // hours from the same realistic 600-kills/hr assumption.
    {
      id: "craft-leather-body",
      name: "Leather Body",
      skill: "crafting",
      levelReq: 1,
      inputs: [{ itemId: "cowhide", qty: 1 }],
      outputItemId: "leather-body",
      xp: 25,
      craftTicks: 5,
    },
    {
      id: "craft-leather-chaps",
      name: "Leather Chaps",
      skill: "crafting",
      levelReq: 5,
      inputs: [{ itemId: "cowhide", qty: 1 }],
      outputItemId: "leather-chaps",
      xp: 22,
      craftTicks: 5,
    },
    {
      id: "craft-leather-coif",
      name: "Leather Coif",
      skill: "crafting",
      levelReq: 8,
      inputs: [{ itemId: "cowhide", qty: 1 }],
      outputItemId: "leather-coif",
      xp: 20,
      craftTicks: 4,
    },
    {
      id: "craft-hard-leather-coif",
      name: "Hard Leather Coif",
      skill: "crafting",
      levelReq: 20,
      inputs: [{ itemId: "wolf-hide", qty: 1 }],
      outputItemId: "hard-leather-coif",
      xp: 40,
      craftTicks: 6,
    },
    {
      id: "craft-hard-leather-chaps",
      name: "Hard Leather Chaps",
      skill: "crafting",
      levelReq: 25,
      inputs: [{ itemId: "wolf-hide", qty: 2 }],
      outputItemId: "hard-leather-chaps",
      xp: 55,
      craftTicks: 7,
    },
    {
      id: "craft-hard-leather-body",
      name: "Hard Leather Body",
      skill: "crafting",
      levelReq: 30,
      inputs: [{ itemId: "thick-hide", qty: 2 }],
      outputItemId: "hard-leather-body",
      xp: 70,
      craftTicks: 8,
    },
    // Crafting wave (#117): the #113 chassis's jewelry line — gems (see the "#117: gem drop"
    // comments on Darkroot/Old-Sewers/Bone-Crypt Monsters' dropTables above) cut straight to
    // amulet/ring jewelry (Crafting's own #76 framing, verbatim: "ranged and jewelry/trinkets for
    // crafting" — this is the jewelry half; #116 shipped the ranged-armour half). levelReqs
    // interleave INTO the existing leather ladder (12/16 sit between craft-leather-coif's 8 and
    // craft-hard-leather-coif's 20) rather than appending after it, then extend the ladder upward
    // for the emerald/ruby tiers (35-50), past the leather ladder's own top (30).
    //
    // Gem-drop-rate economy (owner-mandated, "a rare sink, not a grind ladder" — verbatim from the
    // issue): jewelry is NOT meant to be farmable the way leather is; it's an occasional bonus a
    // farmer stumbles into while grinding the Area for its usual kill-XP/gold, not something worth
    // camping for. Chances are picked in the issue's own ~1/64-1/256 rare-band range, scaled down
    // through the tiers as Areas get slower to clear (assumed farmer kill rates below are rough,
    // same "worked example" spirit as the leather-ladder comment above, not measured):
    // - Darkroot Forest (wolf/goblin-warrior/bandit, chance 1/96 each): ~300 kills/hr assumed ->
    //   combined ~9.4 Sapphire/hr, enough for 1-2 craft-sapphire-ring/-amulet per short session.
    // - Old Sewers (giant-rat/zombie/skeleton, chance 1/140 each): ~200 kills/hr assumed ->
    //   combined ~4.3 Emerald/hr, a handful per multi-hour session.
    // - Bone Crypt (crypt-shade only, chance 1/220): ~100 kills/hr assumed (single boss-tier
    //   Monster) -> ~0.45 Ruby/hr — the endgame gem stays a rare highlight-reel drop, not a
    //   craftable-every-session item.
    // Recipe xp (40-130, scaling with tier) is a bonus on top of the leather ladder's own xp/hr,
    // never the primary Crafting-leveling path — consistent with the gem supply being the
    // bottleneck (same "drop rate gates the pace, not craft speed" shape as #116's leather line).
    {
      id: "craft-sapphire-ring",
      name: "Sapphire Ring",
      skill: "crafting",
      levelReq: 12,
      inputs: [{ itemId: "sapphire", qty: 1 }],
      outputItemId: "sapphire-ring",
      xp: 40,
      craftTicks: 5,
    },
    {
      id: "craft-sapphire-amulet",
      name: "Sapphire Amulet",
      skill: "crafting",
      levelReq: 16,
      inputs: [{ itemId: "sapphire", qty: 1 }],
      outputItemId: "sapphire-amulet",
      xp: 50,
      craftTicks: 6,
    },
    {
      id: "craft-emerald-ring",
      name: "Emerald Ring",
      skill: "crafting",
      levelReq: 35,
      inputs: [{ itemId: "emerald", qty: 1 }],
      outputItemId: "emerald-ring",
      xp: 70,
      craftTicks: 6,
    },
    {
      id: "craft-emerald-amulet",
      name: "Emerald Amulet",
      skill: "crafting",
      levelReq: 40,
      inputs: [{ itemId: "emerald", qty: 1 }],
      outputItemId: "emerald-amulet",
      xp: 85,
      craftTicks: 7,
    },
    {
      id: "craft-ruby-ring",
      name: "Ruby Ring",
      skill: "crafting",
      levelReq: 45,
      inputs: [{ itemId: "ruby", qty: 1 }],
      outputItemId: "ruby-ring",
      xp: 110,
      craftTicks: 7,
    },
    {
      id: "craft-ruby-amulet",
      name: "Ruby Amulet",
      skill: "crafting",
      levelReq: 50,
      inputs: [{ itemId: "ruby", qty: 1 }],
      outputItemId: "ruby-amulet",
      xp: 130,
      craftTicks: 8,
    },
    // Herblore wave (#118): the #113 chassis's fourth non-Smithing content — brews herbs (see the
    // "#118: herb drop" comments on the tiered Areas' Monsters' dropTables above) straight into
    // charge potions (#118's PotionDef, consumed via the Potion Slot — see engine.ts's
    // assignPotionSlot/decrementPotionCharge). levelReqs climb with the herb tier, mirroring the
    // Cooking/Crafting ladders' own tier-interleaving shape.
    //
    // Economy check (owner-mandated arithmetic, verbatim from the issue's own worked example):
    // Guam Herb's drop chance is 0.15/kill; at a ~600-kills/hr farmer (this repo's own assumed
    // rate, same as the Crafting-wave comments above) that's ~90 herbs/hr -> ~90
    // brew-strength-potion crafts/hr of *capacity* (Herblore's own craft speed, craftTicks 5,
    // comfortably outpaces the drop-rate bottleneck, same "drop rate gates the pace" shape as
    // Cooking/Crafting). At xp 50/brew -> ~90 * 50 = ~4,500 Herblore xp/hr, clearing L1->L20
    // (~4,470 xp) in about an hour — the issue's own stated curve. A 50-charge Strength Potion
    // (owner's "+20% str for 50 attacks") covers ~50 player attacks (~1.5 min of unarmed-speed
    // combat, less with a faster weapon); sustaining the buff PERMANENTLY costs ~1 potion per
    // ~50 attacks, and at ~600 kills/hr (several attacks per kill) that's well under 90 potions/hr
    // — worked out by the issue as ~40 potions/hr, i.e. ~40 herbs/hr — comfortably under the ~90
    // herbs/hr drop rate. A buff is affordable but not free, matching the issue's own framing.
    // marrentill/tarromin/harralander-herb ride the same 0.15/kill chance from their own (slower-
    // clearing) Areas, so their brews scale down proportionally — a bonus on top of each Area's own
    // kill-XP/gold, not a dedicated grind target, same shape as the Crafting-wave gem ladder.
    {
      id: "brew-strength-potion",
      name: "Strength Potion",
      skill: "herblore",
      levelReq: 3,
      inputs: [{ itemId: "guam-herb", qty: 1 }],
      outputItemId: "strength-potion",
      xp: 50,
      craftTicks: 5,
    },
    {
      id: "brew-attack-potion",
      name: "Attack Potion",
      skill: "herblore",
      levelReq: 12,
      inputs: [{ itemId: "marrentill-herb", qty: 1 }],
      outputItemId: "attack-potion",
      xp: 65,
      craftTicks: 5,
    },
    {
      id: "brew-fishing-potion",
      name: "Fishing Potion",
      skill: "herblore",
      levelReq: 22,
      inputs: [{ itemId: "tarromin-herb", qty: 1 }],
      outputItemId: "fishing-potion",
      xp: 80,
      craftTicks: 6,
    },
    {
      id: "brew-production-potion",
      name: "Production Potion",
      skill: "herblore",
      levelReq: 32,
      inputs: [{ itemId: "harralander-herb", qty: 1 }],
      outputItemId: "production-potion",
      xp: 95,
      craftTicks: 6,
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
  // Fixed-price vendor (#119): sells the arrow tiers and four Element runes above — see the
  // economy-check comment on the ammo items themselves for the price arithmetic.
  vendor: [
    { itemId: "bronze-arrow", price: 3 },
    { itemId: "steel-arrow", price: 6 },
    { itemId: "mithril-arrow", price: 10 },
    { itemId: "air-rune", price: 3 },
    { itemId: "water-rune", price: 3 },
    { itemId: "earth-rune", price: 3 },
    { itemId: "fire-rune", price: 3 },
  ],
  // Starter pet roster (#120): one per source (combat/fishing/production) plus one boss pet, tied
  // to Bone Crypt's own boss-tier Monster ("crypt-shade" — see monsters above, "carries a real
  // weakElement... boss tool"). Every boostPct is deliberately tiny (all-owned-additive: a fully
  // collected roster sums its boosts, unlike the single-slot potion) — tuning, not spec.
  pets: [
    {
      id: "rock-golem",
      name: "Rock Golem",
      icon: "rock-golem",
      target: "strength",
      boostPct: 0.01,
      source: "combat",
    },
    {
      id: "fishing-frog",
      name: "Fishing Frog",
      icon: "fishing-frog",
      target: "fishing-speed",
      boostPct: 0.01,
      source: "fishing",
    },
    {
      id: "kiln-cat",
      name: "Kiln Cat",
      icon: "kiln-cat",
      target: "production-speed",
      boostPct: 0.01,
      source: "production",
    },
    {
      id: "shade-wisp",
      name: "Shade Wisp",
      icon: "shade-wisp",
      target: "magic",
      boostPct: 0.02,
      source: { boss: "crypt-shade" },
    },
  ],
};
