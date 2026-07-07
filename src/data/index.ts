import type { Content } from "../core/types";

/**
 * v1 starter content: Lumbry Meadows. Data only — conforms to core types,
 * never imports engine code (ADR-0001).
 */
export const content: Content = {
  areas: [
    {
      id: "lumbry-meadows",
      name: "Lumbry Meadows",
      combatLevelReq: 0,
      monsterIds: ["chicken", "cow", "goblin"],
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
      dropTable: [
        { itemId: "gold", qty: 5, chance: 1, band: "guaranteed" },
        { itemId: "cooked-meat", qty: 1, chance: 0.5, band: "common" },
        { itemId: "leather-body", qty: 1, chance: 1 / 20, band: "uncommon" },
        { itemId: "bronze-sword", qty: 1, chance: 1 / 32, band: "uncommon" },
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
      dropTable: [
        { itemId: "gold", qty: 8, chance: 1, band: "guaranteed" },
        { itemId: "cooked-meat", qty: 1, chance: 0.25, band: "common" },
        { itemId: "bronze-shield", qty: 1, chance: 1 / 24, band: "uncommon" },
        { itemId: "goblin-charm", qty: 1, chance: 1 / 128, band: "rare" },
      ],
    },
  ],
  items: [
    { kind: "currency", id: "gold", name: "Gold" },
    { kind: "food", id: "cooked-meat", name: "Cooked Meat", heals: 4 },
    {
      kind: "equipment",
      id: "bronze-dagger",
      name: "Bronze Dagger",
      slot: "weapon",
      atkBonus: 4,
      strBonus: 3,
      defBonus: 0,
      attackSpeed: 4,
    },
    {
      kind: "equipment",
      id: "bronze-sword",
      name: "Bronze Sword",
      slot: "weapon",
      atkBonus: 7,
      strBonus: 6,
      defBonus: 0,
      attackSpeed: 5,
    },
    {
      kind: "equipment",
      id: "leather-body",
      name: "Leather Body",
      slot: "body",
      atkBonus: 0,
      strBonus: 0,
      defBonus: 4,
    },
    {
      kind: "equipment",
      id: "bronze-shield",
      name: "Bronze Shield",
      slot: "shield",
      atkBonus: 0,
      strBonus: 0,
      defBonus: 3,
    },
    {
      kind: "equipment",
      id: "goblin-charm",
      name: "Goblin Charm",
      slot: "head",
      atkBonus: 2,
      strBonus: 2,
      defBonus: 1,
    },
  ],
};
