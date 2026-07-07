import type { Content } from "./types";

/**
 * Minimal two-Area world for Engine tests. "dummy" barely fights back;
 * "brute" hits hard and sits behind a combat-level gate.
 */
export const fixtureContent: Content = {
  areas: [
    { id: "meadow", name: "Test Meadow", combatLevelReq: 0, monsterIds: ["dummy"] },
    { id: "crypt", name: "Test Crypt", combatLevelReq: 40, monsterIds: ["brute"] },
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
      dropTable: [{ itemId: "gold", qty: 200, chance: 1, band: "guaranteed" }],
    },
  ],
  items: [
    { kind: "currency", id: "gold", name: "Gold" },
    { kind: "food", id: "meat", name: "Cooked Meat", heals: 4 },
    {
      kind: "equipment",
      id: "bronze-sword",
      name: "Bronze Sword",
      slot: "weapon",
      atkBonus: 10,
      strBonus: 30,
      defBonus: 0,
      attackSpeed: 4,
    },
    {
      kind: "equipment",
      id: "lucky-charm",
      name: "Lucky Charm",
      slot: "head",
      atkBonus: 0,
      strBonus: 0,
      defBonus: 1,
    },
  ],
};
