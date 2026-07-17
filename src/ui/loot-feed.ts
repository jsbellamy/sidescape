import type { Engine } from "../core/engine";
import type { ResolvedContent } from "../core/validate-content";
import type { ItemPresentation } from "./item-presentation";

/** Feed length cap: lines beyond this are trimmed from the tail. Tuning, not spec. */
export const FEED_MAX_LINES = 40;

export interface LootFeedDeps {
  engine: Engine;
  content: ResolvedContent;
  items: ItemPresentation;
  root: ParentNode;
}

/** Imperative feed lines not driven by Engine events (e.g. bank-slot purchase). */
export interface LootFeedHandle {
  logLine(text: string, cls?: string): void;
}

export function createLootFeed(deps: LootFeedDeps): LootFeedHandle {
  const { engine, content, items, root } = deps;

  function feedLine(text: string, cls = ""): void {
    const li = document.createElement("li");
    li.textContent = text;
    if (cls) li.className = cls;
    const feed = root.querySelector<HTMLUListElement>("#feed");
    if (!feed) return;
    feed.prepend(li);
    while (feed.children.length > FEED_MAX_LINES) feed.lastChild?.remove();
  }

  engine.on("kill", (e) => feedLine(`Killed ${content.monstersById.get(e.monsterId)?.name}`));
  engine.on("drop", (e) => feedLine(`+${e.qty} ${items.name(e.itemId)}`, `drop-${e.band}`));
  engine.on("levelup", (e) => feedLine(`⭐ ${e.skill} level ${e.level}!`, "levelup"));
  engine.on("death", () => feedLine("💀 You died — respawning…", "death"));
  engine.on("food-eaten", (e) => feedLine(`🍖 Ate ${items.name(e.itemId)} (+${e.healed})`, "eat"));
  engine.on("item-sold", (e) => feedLine(`Sold ${items.name(e.itemId)} (+${e.gold}g)`, "sell"));
  engine.on("overflow-sold", (e) =>
    feedLine(`⚠ Bank full — sold ${items.name(e.itemId)} (+${e.gold}g)`, "overflow"),
  );
  engine.on("overflow-lost", (e) =>
    feedLine(`⚠ Bank full — ${items.name(e.itemId)} lost!`, "overflow"),
  );
  engine.on("duplicate-sold", (e) =>
    feedLine(`⚠ Auto-sold duplicate ${items.name(e.itemId)} (+${e.gold}g)`, "overflow"),
  );
  engine.on("looted", (e) => {
    if (e.items.length <= 3) {
      for (const item of [...e.items].reverse()) {
        feedLine(`Banked ${item.qty} ${items.name(item.itemId)}`, "loot");
      }
    } else {
      feedLine(`Banked ${e.items.length} stacks of loot`, "loot");
    }
    if (engine.snapshot().lootZone.length > 0) {
      feedLine("⚠ Bank full — loot left behind", "overflow");
    }
  });
  engine.on("dungeon-failed", (e) => {
    for (const item of [...e.lostItems].reverse()) {
      feedLine(`-${item.qty} ${items.name(item.itemId)}`, "dungeon-failed");
    }
    feedLine("💀 Run failed — loot lost!", "dungeon-failed");
  });
  engine.on("fish-caught", (e) =>
    feedLine(`🎣 Caught ${items.name(e.itemId)} (+${e.qty})`, "catch"),
  );
  engine.on("item-crafted", (e) => feedLine(`🔨 Crafted ${items.name(e.itemId)}`, "craft"));
  engine.on("equipped", (e) => feedLine(`Equipped ${items.name(e.itemId)}`));
  engine.on("unequipped", (e) => feedLine(`Unequipped ${items.name(e.itemId)}`));
  engine.on("item-bought", (e) =>
    feedLine(`Bought ${e.qty} ${items.name(e.itemId)} (-${e.gold}g)`, "buy"),
  );
  engine.on("out-of-ammo", (e) => {
    const text =
      e.need === "arrow"
        ? "🏹 Out of arrows!"
        : e.element
          ? `🔮 Out of ${e.element} runes!`
          : "🔮 No rune loaded!";
    feedLine(`⚠ ${text}`, "overflow");
  });
  engine.on("pet-dropped", (e) => {
    const name = content.petsById.get(e.petId)?.name ?? e.petId;
    feedLine(`🐾 New pet: ${name}!`, "pet-dropped");
  });
  engine.on("wave-cleared", (e) => feedLine(`Wave ${e.wave}/${e.totalWaves} cleared`));
  engine.on("dungeon-completed", (e) => {
    const def = content.dungeonsById.get(e.dungeonId);
    feedLine(`🏰 ${def?.name ?? e.dungeonId} cleared!`, "dungeon-completed");
  });
  engine.on("chest-opened", (e) => {
    for (const item of [...e.items].reverse()) {
      feedLine(`+${item.qty} ${items.name(item.itemId)}`, `drop-${item.band}`);
    }
    feedLine("📦 Chest opened!", "chest-header");
  });

  return { logLine: feedLine };
}
