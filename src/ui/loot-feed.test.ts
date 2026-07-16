// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { createEngine } from "../core/engine";
import type { Engine } from "../core/engine";
import type { Content, Rng } from "../core/types";
import { fixtureContent } from "../core/testing/fixture-content";
import { makeSnapshot } from "../core/testing/make-snapshot";
import { seededRng } from "../core/rng";
import { resolveContent } from "../core/validate-content";
import { createItemPresentation } from "./item-presentation";
import { createLootFeed, FEED_MAX_LINES } from "./loot-feed";

function sequenceRng(values: number[], fallback = 0): Rng {
  let index = 0;
  return { next: () => values[index++] ?? fallback };
}

function mountLootFeed(
  content: Content = fixtureContent,
  rng: Rng = seededRng(1),
  overrides?: Parameters<typeof makeSnapshot>[0],
) {
  const engine = overrides
    ? createEngine(content, rng, makeSnapshot(overrides))
    : createEngine(content, rng);
  const resolved = resolveContent(content);
  const items = createItemPresentation(resolved);
  const root = document.createElement("main");
  root.innerHTML = '<ul id="feed" class="card-scroll"></ul>';
  const feed = createLootFeed({ engine, content: resolved, items, root });
  return { engine, root, feed, content: resolved, items };
}

function feedItems(root: ParentNode): HTMLLIElement[] {
  return [...root.querySelectorAll<HTMLLIElement>("#feed li")];
}

function pumpUntil(engine: Engine, predicate: () => boolean, maxTicks = 50_000): void {
  for (let i = 0; i < maxTicks; i++) {
    engine.tick();
    if (predicate()) return;
  }
  throw new Error(`condition never became true in ${maxTicks} ticks`);
}

describe("createLootFeed", () => {
  describe("EngineEvent variants — line-producing", () => {
    it("kill → Killed {monster name}", () => {
      const { engine, root } = mountLootFeed();
      engine.selectMonster("dummy");
      pumpUntil(engine, () => feedItems(root).some((li) => /^Killed /.test(li.textContent ?? "")));
      const line = feedItems(root).find((li) => /^Killed /.test(li.textContent ?? ""));
      expect(line?.textContent).toBe("Killed Training Dummy");
      expect(line?.className).toBe("");
    });

    it("drop → +qty name with drop-{band} class", () => {
      const guaranteedGold = {
        ...fixtureContent,
        monsters: fixtureContent.monsters.map((m) =>
          m.id === "dummy"
            ? {
                ...m,
                dropTable: [{ itemId: "gold", qty: 7, chance: 1, band: "guaranteed" as const }],
              }
            : m,
        ),
      };
      const { engine, root } = mountLootFeed(guaranteedGold);
      engine.selectMonster("dummy");
      pumpUntil(engine, () => feedItems(root).some((li) => li.className === "drop-guaranteed"));
      const line = feedItems(root).find((li) => li.className === "drop-guaranteed");
      expect(line?.textContent).toBe("+7 Gold");
    });

    it("levelup → ⭐ {skill} level {n}! with levelup class", () => {
      const { engine, root } = mountLootFeed();
      engine.selectMonster("dummy");
      pumpUntil(engine, () => feedItems(root).some((li) => li.className === "levelup"));
      const line = feedItems(root).find((li) => li.className === "levelup");
      expect(line?.textContent).toMatch(/^⭐ \w+ level \d+!$/);
      expect(line?.className).toBe("levelup");
    });

    it("death → 💀 You died — respawning… with death class", () => {
      const lethal = {
        ...fixtureContent,
        monsters: fixtureContent.monsters.map((m) =>
          m.id === "dummy" ? { ...m, attackLevel: 99, maxHit: 20, attackSpeed: 1 } : m,
        ),
      };
      const { engine, root } = mountLootFeed(lethal);
      engine.selectMonster("dummy");
      pumpUntil(engine, () => feedItems(root).some((li) => li.className === "death"));
      const line = feedItems(root).find((li) => li.className === "death");
      expect(line?.textContent).toBe("💀 You died — respawning…");
    });

    it("food-eaten → 🍖 Ate {name} (+healed) with eat class", () => {
      const fierce = {
        ...fixtureContent,
        monsters: fixtureContent.monsters.map((m) =>
          m.id === "dummy" ? { ...m, attackLevel: 5, maxHit: 2, attackSpeed: 3 } : m,
        ),
      };
      const { engine, root } = mountLootFeed(fierce, seededRng(42), {
        player: {
          hp: 10,
          maxHp: 10,
          foodSlots: [{ itemId: "meat", qty: 20 }, null, null],
          autoEatThreshold: 0.5,
        },
      });
      engine.selectMonster("dummy");
      pumpUntil(engine, () => feedItems(root).some((li) => li.className === "eat"));
      const line = feedItems(root).find((li) => li.className === "eat");
      expect(line?.textContent).toMatch(/^🍖 Ate Cooked Meat \(\+\d+\)$/);
    });

    it("item-sold → Sold {name} (+gold g) with sell class", () => {
      const { engine, root } = mountLootFeed(fixtureContent, seededRng(1), {
        bank: { items: [{ itemId: "meat", qty: 5 }] },
      });
      engine.sell("meat", 1);
      const line = feedItems(root)[0];
      expect(line?.textContent).toBe("Sold Cooked Meat (+3g)");
      expect(line?.className).toBe("sell");
    });

    it("overflow-sold → ⚠ Bank full — sold {name} (+gold g) with overflow class", () => {
      const contentExt = {
        ...fixtureContent,
        items: [
          ...fixtureContent.items,
          ...Array.from({ length: 7 }, (_, i) => ({
            kind: "material" as const,
            id: `junk-${i}`,
            name: `Junk ${i}`,
            icon: "bronze-bar",
            value: 1,
          })),
        ],
      };
      const { engine, root } = mountLootFeed(contentExt, seededRng(1), {
        lootZone: [
          { itemId: "bar", qty: 1 },
          { itemId: "bow", qty: 1 },
          { itemId: "staff", qty: 1 },
          { itemId: "junk-0", qty: 1 },
          { itemId: "junk-1", qty: 1 },
          { itemId: "junk-2", qty: 1 },
          { itemId: "junk-3", qty: 1 },
          { itemId: "junk-4", qty: 1 },
          { itemId: "junk-5", qty: 1 },
          { itemId: "junk-6", qty: 1 },
        ],
      });
      engine.selectMonster("dummy");
      let sold = false;
      engine.on("overflow-sold", () => {
        sold = true;
      });
      pumpUntil(engine, () => sold);
      const line = feedItems(root).find((li) => li.className === "overflow");
      expect(line?.textContent).toMatch(/⚠ Bank full — sold .+ \(\+\d+g\)/);
    });

    it("overflow-lost → ⚠ Bank full — {name} lost! with overflow class", () => {
      const noValueContent = {
        ...fixtureContent,
        items: fixtureContent.items.map((i) => {
          if (i.id !== "raw-fish" || i.kind === "currency") return i;
          const { value: _value, ...rest } = i;
          return rest;
        }),
      };
      const { engine, root } = mountLootFeed(noValueContent, seededRng(1), {
        player: { skills: { fishing: { level: 1, xp: 0 } } },
        bank: { items: [{ itemId: "bar", qty: 1 }], capacity: 1 },
      });
      engine.selectFishingSpot("pond");
      for (let i = 0; i < 3; i++) engine.tick();
      const line = feedItems(root).find((li) => /lost!/i.test(li.textContent ?? ""));
      expect(line?.textContent).toBe("⚠ Bank full — Raw Fish lost!");
      expect(line?.className).toBe("overflow");
    });

    it("duplicate-sold → ⚠ Auto-sold duplicate {name} (+gold g) with overflow class", () => {
      const guaranteedSword = {
        ...fixtureContent,
        monsters: fixtureContent.monsters.map((m) =>
          m.id === "dummy"
            ? {
                ...m,
                dropTable: [
                  { itemId: "bronze-sword", qty: 1, chance: 1, band: "uncommon" as const },
                ],
              }
            : m,
        ),
      };
      const { engine, root } = mountLootFeed(guaranteedSword, seededRng(7), {
        bank: { items: [{ itemId: "bronze-sword", qty: 1 }] },
      });
      engine.selectMonster("dummy");
      pumpUntil(engine, () =>
        feedItems(root).some((li) => /auto-sold duplicate/i.test(li.textContent ?? "")),
      );
      const line = feedItems(root).find((li) => /auto-sold duplicate/i.test(li.textContent ?? ""));
      expect(line?.textContent).toBe("⚠ Auto-sold duplicate Bronze Sword (+20g)");
      expect(line?.className).toBe("overflow");
    });

    it("fish-caught → 🎣 Caught {name} (+qty) with catch class", () => {
      const { engine, root } = mountLootFeed(fixtureContent, seededRng(1), {
        player: { skills: { fishing: { level: 1, xp: 0 } } },
      });
      engine.selectFishingSpot("pond");
      for (let i = 0; i < 3; i++) engine.tick();
      const line = feedItems(root).find((li) => li.className === "catch");
      expect(line?.textContent).toMatch(/^🎣 Caught Raw Fish \(\+1\)$/);
    });

    it("item-crafted → 🔨 Crafted {name} with craft class", () => {
      const { engine, root } = mountLootFeed(fixtureContent, seededRng(1), {
        bank: { items: [{ itemId: "bar", qty: 1 }] },
      });
      engine.selectRecipe("test-sword");
      for (let i = 0; i < 5; i++) engine.tick();
      const line = feedItems(root).find((li) => li.className === "craft");
      expect(line?.textContent).toBe("🔨 Crafted Bronze Sword");
    });

    it("equipped → Equipped {name}", () => {
      const { engine, root } = mountLootFeed(fixtureContent, seededRng(1), {
        bank: { items: [{ itemId: "bronze-sword", qty: 1 }] },
      });
      engine.equip("bronze-sword");
      const line = feedItems(root)[0];
      expect(line?.textContent).toBe("Equipped Bronze Sword");
      expect(line?.className).toBe("");
    });

    it("item-bought → Bought qty name (-gold g) with buy class", () => {
      const { engine, root } = mountLootFeed(fixtureContent, seededRng(1), {
        player: { gold: 100 },
      });
      engine.buy("arrow", 5);
      const line = feedItems(root)[0];
      expect(line?.textContent).toBe("Bought 5 Test Arrow (-10g)");
      expect(line?.className).toBe("buy");
    });

    it("out-of-ammo → ⚠ {text} with overflow class (arrow need)", () => {
      const { engine, root } = mountLootFeed(fixtureContent, seededRng(1), {
        player: { equipment: { weapon: "bow" }, quiver: { itemId: "arrow", qty: 0 } },
      });
      engine.selectMonster("dummy");
      for (let i = 0; i < 20; i++) engine.tick();
      const line = feedItems(root).find((li) => /out of arrows/i.test(li.textContent ?? ""));
      expect(line?.textContent).toBe("⚠ 🏹 Out of arrows!");
      expect(line?.className).toBe("overflow");
    });

    it("out-of-ammo → ⚠ No rune loaded! when Rune Slot is empty (rune need, no element)", () => {
      const { engine, root } = mountLootFeed(fixtureContent, seededRng(1), {
        player: { equipment: { weapon: "staff" }, runeSlot: null },
      });
      engine.selectMonster("dummy");
      for (let i = 0; i < 20; i++) engine.tick();
      const line = feedItems(root).find((li) => /no rune loaded/i.test(li.textContent ?? ""));
      expect(line?.textContent).toBe("⚠ 🔮 No rune loaded!");
    });

    it("pet-dropped → 🐾 New pet: {name}! with pet-dropped class", () => {
      const { engine, root } = mountLootFeed(fixtureContent, sequenceRng([0, 0.999, 0]));
      engine.selectMonster("pet-target");
      pumpUntil(engine, () => feedItems(root).some((li) => li.className === "pet-dropped"));
      const line = feedItems(root).find((li) => li.className === "pet-dropped");
      expect(line?.textContent).toBe("🐾 New pet: Test Combat Pet!");
    });

    it("wave-cleared → Wave i/N cleared", () => {
      const { engine, root } = mountLootFeed();
      engine.enterDungeon("gauntlet");
      pumpUntil(engine, () =>
        feedItems(root).some((li) => /^Wave \d+\/\d+ cleared$/.test(li.textContent ?? "")),
      );
      const line = feedItems(root).find((li) => li.textContent === "Wave 1/3 cleared");
      expect(line).toBeDefined();
    });

    it("dungeon-completed → 🏰 {name} cleared! with dungeon-completed class", () => {
      const { engine, root } = mountLootFeed();
      engine.enterDungeon("gauntlet");
      pumpUntil(engine, () => feedItems(root).some((li) => li.className === "dungeon-completed"));
      const line = feedItems(root).find((li) => li.className === "dungeon-completed");
      expect(line?.textContent).toBe("🏰 The Gauntlet cleared!");
    });

    it("chest-opened → header visually first, then chest items", () => {
      const { engine, root } = mountLootFeed();
      engine.enterDungeon("gauntlet");
      pumpUntil(engine, () => feedItems(root).some((li) => li.className === "chest-header"));
      const texts = feedItems(root).map((li) => li.textContent);
      const headerIdx = texts.indexOf("📦 Chest opened!");
      const goldIdx = texts.findIndex((t) => t?.includes("Gold"));
      expect(headerIdx).toBeGreaterThanOrEqual(0);
      expect(goldIdx).toBeGreaterThanOrEqual(0);
      expect(headerIdx).toBeLessThan(goldIdx);
    });
  });

  describe("EngineEvent variants — non-line-producing", () => {
    it("attack produces no feed line", () => {
      const { engine, root } = mountLootFeed();
      engine.selectMonster("dummy");
      for (let i = 0; i < 5; i++) engine.tick();
      expect(feedItems(root)).toHaveLength(0);
    });

    it("xp-gained produces no feed line", () => {
      const { engine, root } = mountLootFeed();
      let sawXp = false;
      engine.on("xp-gained", () => {
        sawXp = true;
        expect(feedItems(root)).toHaveLength(0);
      });
      engine.selectMonster("dummy");
      for (let i = 0; i < 50 && !sawXp; i++) engine.tick();
      expect(sawXp).toBe(true);
    });
  });

  describe("multi-line handlers — prepend order", () => {
    it("dungeon-failed: trailer visually first, then lost stacks", () => {
      const lethal = {
        ...fixtureContent,
        monsters: fixtureContent.monsters.map((m) =>
          m.id === "dummy" ? { ...m, attackLevel: 99, maxHit: 20, attackSpeed: 1 } : m,
        ),
      };
      const { engine, root } = mountLootFeed(lethal, seededRng(42));
      engine.enterDungeon("gauntlet");
      pumpUntil(engine, () =>
        feedItems(root).some((li) => /run failed/i.test(li.textContent ?? "")),
      );
      const texts = feedItems(root).map((li) => li.textContent);
      expect(texts).toContain("💀 Run failed — loot lost!");
    });

    it("looted: ≤3 items → one Banked line per item (reversed prepend)", () => {
      const { engine, root } = mountLootFeed(fixtureContent, seededRng(1), {
        lootZone: [
          { itemId: "meat", qty: 1 },
          { itemId: "bar", qty: 2 },
        ],
      });
      engine.lootAll();
      const banked = feedItems(root).filter((li) => li.className === "loot");
      expect(banked).toHaveLength(2);
      expect(banked[0]?.textContent).toBe("Banked 1 Cooked Meat");
      expect(banked[1]?.textContent).toBe("Banked 2 Test Bar");
    });

    it("looted: >3 items → aggregate Banked N stacks of loot line", () => {
      const { engine, root } = mountLootFeed(fixtureContent, seededRng(1), {
        lootZone: [
          { itemId: "meat", qty: 1 },
          { itemId: "bar", qty: 1 },
          { itemId: "bow", qty: 1 },
          { itemId: "staff", qty: 1 },
        ],
      });
      engine.lootAll();
      const banked = feedItems(root).filter((li) => li.className === "loot");
      expect(banked).toHaveLength(1);
      expect(banked[0]?.textContent).toBe("Banked 4 stacks of loot");
    });

    it("looted leftover warning appears only when snapshot().lootZone is non-empty after sweep", () => {
      const { engine, root } = mountLootFeed(fixtureContent, seededRng(1), {
        bank: { items: [{ itemId: "bar", qty: 1 }], capacity: 1 },
        lootZone: [
          { itemId: "bar", qty: 2 },
          { itemId: "meat", qty: 3 },
        ],
      });
      engine.lootAll();
      const overflow = feedItems(root).filter((li) => /left behind/i.test(li.textContent ?? ""));
      expect(overflow).toHaveLength(1);
      expect(overflow[0]?.textContent).toBe("⚠ Bank full — loot left behind");
    });

    it("looted does not log leftover warning when loot zone empties", () => {
      const { engine, root } = mountLootFeed(fixtureContent, seededRng(1), {
        lootZone: [{ itemId: "meat", qty: 3 }],
      });
      engine.lootAll();
      expect(feedItems(root).some((li) => /left behind/i.test(li.textContent ?? ""))).toBe(false);
    });
  });

  describe("feed trim and imperative logLine", () => {
    it(`trims feed to ${FEED_MAX_LINES} lines`, () => {
      const { root, feed } = mountLootFeed();
      for (let i = 0; i < FEED_MAX_LINES + 5; i++) {
        feed.logLine(`line ${i}`);
      }
      expect(feedItems(root)).toHaveLength(FEED_MAX_LINES);
      expect(feedItems(root)[0]?.textContent).toBe(`line ${FEED_MAX_LINES + 4}`);
    });

    it("logLine supports imperative feed lines (e.g. bank expanded)", () => {
      const { root, feed } = mountLootFeed();
      feed.logLine("Bank expanded to 110 slots");
      expect(feedItems(root)[0]?.textContent).toBe("Bank expanded to 110 slots");
    });
  });
});
