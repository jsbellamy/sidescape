import { describe, expect, it } from "vitest";
import { createEngine } from "../core/engine";
import { seededRng } from "../core/rng";
import { resolveContent } from "../core/validate-content";
import { content } from "./index";

const LUMBRYS_MONSTER_IDS = ["chicken", "cow", "goblin", "spider", "boar"] as const;

describe("resolveContent(content)", () => {
  it("does not throw with Spider and Boar Drop Tables", () => {
    expect(() => resolveContent(content)).not.toThrow();
  });
});

describe("Lumbry Meadows content (#394)", () => {
  it("derives spider and boar in monsterIds via composeContent", () => {
    const meadows = content.areas.find((a) => a.id === "lumbry-meadows")!;
    expect(meadows.monsterIds).toEqual([...LUMBRYS_MONSTER_IDS]);
  });

  it("Spider and Boar are appended after Goblin in the global monsters list", () => {
    const monsterIds = content.monsters.map((m) => m.id);
    const goblinIdx = monsterIds.indexOf("goblin");
    expect(monsterIds.indexOf("spider")).toBe(goblinIdx + 1);
    expect(monsterIds.indexOf("boar")).toBe(goblinIdx + 2);
  });

  it("a fresh player can select Spider and Boar (Lumbry Meadows has no unlock gate)", () => {
    const fresh = createEngine(content, seededRng(1));
    expect(() => fresh.selectMonster("spider")).not.toThrow();
    expect(() => fresh.selectMonster("boar")).not.toThrow();
  });

  it("Spider and Boar Drop Tables carry guaranteed, common, and uncommon bands", () => {
    for (const monsterId of ["spider", "boar"] as const) {
      const monster = content.monsters.find((m) => m.id === monsterId)!;
      const bands = new Set(monster.dropTable.map((e) => e.band));
      expect(bands.has("guaranteed"), `${monsterId} missing guaranteed`).toBe(true);
      expect(bands.has("common"), `${monsterId} missing common`).toBe(true);
      expect(bands.has("uncommon"), `${monsterId} missing uncommon`).toBe(true);

      for (const entry of monster.dropTable) {
        const item = content.items.find((i) => i.id === entry.itemId);
        expect(item, `${monsterId} drops unknown item ${entry.itemId}`).toBeDefined();
      }
    }
  });

  it("Spider drops silk and no Crafting recipe consumes silk — interim sell-only until magic robes", () => {
    const spider = content.monsters.find((m) => m.id === "spider")!;
    expect(spider.dropTable).toContainEqual({
      itemId: "silk",
      qty: 1,
      chance: 0.35,
      band: "common",
    });
    for (const recipe of content.recipes) {
      for (const input of recipe.inputs) {
        expect(input.itemId, `${recipe.id} consumes silk`).not.toBe("silk");
      }
    }
  });

  it.each([
    { monsterId: "spider", goldQty: 3, seed: 42 },
    { monsterId: "boar", goldQty: 10, seed: 7 },
  ] as const)(
    "a $monsterId kill lands guaranteed gold and emits a drop event with band guaranteed (seeded Rng, real Content)",
    ({ monsterId, goldQty, seed }) => {
      const engine = createEngine(content, seededRng(seed));
      const goldBefore = engine.snapshot().player.gold;
      engine.selectMonster(monsterId);

      let kills = 0;
      let goldDrop: { qty: number; band: string } | undefined;
      engine.on("kill", () => kills++);
      engine.on("drop", (e) => {
        if (e.itemId === "gold" && goldDrop === undefined) {
          goldDrop = { qty: e.qty, band: e.band };
        }
      });

      for (let i = 0; i < 10_000 && kills === 0; i++) engine.tick();

      expect(kills).toBe(1);
      expect(goldDrop).toEqual({ qty: goldQty, band: "guaranteed" });
      expect(engine.snapshot().player.gold).toBe(goldBefore + goldQty);
    },
  );
});
