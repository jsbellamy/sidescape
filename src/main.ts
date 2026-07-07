import { getCurrentWindow } from "@tauri-apps/api/window";
import { createEngine } from "./core/engine";
import { mathRandomRng } from "./core/rng";
import { content } from "./data";
import type { Snapshot } from "./core/types";

const SAVE_KEY = "sidescape-save-v1";
const TICK_MS = 600;

function loadSave(): Snapshot | undefined {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? (JSON.parse(raw) as Snapshot) : undefined;
  } catch {
    return undefined;
  }
}

const engine = createEngine(content, mathRandomRng, loadSave());

function itemName(itemId: string): string {
  return content.items.find((i) => i.id === itemId)?.name ?? itemId;
}

function el<T extends HTMLElement>(selector: string): T {
  return document.querySelector(selector) as T;
}

function feedLine(text: string, cls = ""): void {
  const li = document.createElement("li");
  li.textContent = text;
  if (cls) li.className = cls;
  const feed = el<HTMLUListElement>("#feed");
  feed.prepend(li);
  while (feed.children.length > 40) feed.lastChild?.remove();
}

function render(): void {
  const snap = engine.snapshot();
  const { player, monster } = snap;

  el("#player-hp-fill").style.width = `${(player.hp / player.maxHp) * 100}%`;
  el("#player-hp-text").textContent = player.respawning
    ? "Respawning…"
    : `HP ${player.hp}/${player.maxHp}`;

  if (monster) {
    el("#monster-name").textContent = monster.name;
    el("#monster-hp-fill").style.width = `${(monster.hp / monster.maxHp) * 100}%`;
    el("#monster-hp-text").textContent = `${monster.hp}/${monster.maxHp}`;
  } else {
    el("#monster-name").textContent = "Pick a monster ↓";
    el("#monster-hp-fill").style.width = "0%";
    el("#monster-hp-text").textContent = "";
  }

  el("#xp-row").innerHTML = (["attack", "strength", "defence", "hitpoints"] as const)
    .map(
      (skill) =>
        `<div class="skill" title="${skill}: ${Math.floor(player.skills[skill].xp)} xp">
           <span class="skill-abbr">${skill.slice(0, 3).toUpperCase()}</span>
           <span class="skill-level">${player.skills[skill].level}</span>
         </div>`,
    )
    .join("");

  const gold = player.inventory.find((s) => s.itemId === "gold")?.qty ?? 0;
  el("#gold").textContent = `🪙 ${gold}`;

  el("#inventory").innerHTML = player.inventory
    .filter((s) => s.itemId !== "gold")
    .map((s) => {
      const def = content.items.find((i) => i.id === s.itemId);
      const equippable = def?.kind === "equipment";
      return `<li class="${equippable ? "equippable" : ""}" data-item="${s.itemId}">
                ${itemName(s.itemId)} ×${s.qty}</li>`;
    })
    .join("");

  el("#equipment").innerHTML = Object.entries(player.equipment)
    .map(([slot, itemId]) => `<li><span class="slot">${slot}</span> ${itemId ? itemName(itemId) : "—"}</li>`)
    .join("");
}

function buildPicker(): void {
  const snap = engine.snapshot();
  el("#picker").innerHTML = snap.areas
    .map(
      (area) => `
        <p class="area-name">${area.name}${area.unlocked ? "" : " 🔒"}</p>
        <div class="monster-buttons">
          ${area.monsterIds
            .map((id) => {
              const def = content.monsters.find((m) => m.id === id);
              return `<button data-monster="${id}" ${area.unlocked ? "" : "disabled"}>${def?.name ?? id}</button>`;
            })
            .join("")}
        </div>`,
    )
    .join("");
}

window.addEventListener("DOMContentLoaded", () => {
  el("#close-btn").addEventListener("click", () => {
    localStorage.setItem(SAVE_KEY, JSON.stringify(engine.snapshot()));
    getCurrentWindow()
      .close()
      .catch((err) => console.error("window close failed:", err));
  });

  el("#app").innerHTML = `
    <section id="scene">
      <p id="monster-name"></p>
      <div class="bar monster"><div id="monster-hp-fill" class="fill"></div><span id="monster-hp-text" class="bar-text"></span></div>
      <div class="bar player"><div id="player-hp-fill" class="fill"></div><span id="player-hp-text" class="bar-text"></span></div>
    </section>
    <section id="xp-row"></section>
    <section id="picker"></section>
    <section id="panels">
      <p class="panel-title">Equipment <span id="gold"></span></p>
      <ul id="equipment"></ul>
      <p class="panel-title">Inventory <span class="hint">(click to equip)</span></p>
      <ul id="inventory"></ul>
      <p class="panel-title">Loot Feed</p>
      <ul id="feed"></ul>
    </section>`;

  engine.on("kill", (e) => feedLine(`Killed ${content.monsters.find((m) => m.id === e.monsterId)?.name}`));
  engine.on("drop", (e) => feedLine(`+${e.qty} ${itemName(e.itemId)}`, `drop-${e.band}`));
  engine.on("levelup", (e) => feedLine(`⭐ ${e.skill} level ${e.level}!`, "levelup"));
  engine.on("death", () => feedLine("💀 You died — respawning…", "death"));
  engine.on("food-eaten", (e) => feedLine(`🍖 Ate ${itemName(e.itemId)} (+${e.healed})`, "eat"));
  engine.on("levelup", () => buildPicker()); // gate flags may change

  el("#picker").addEventListener("click", (event) => {
    const id = (event.target as HTMLElement).dataset.monster;
    if (id) {
      engine.selectMonster(id);
      render();
    }
  });

  el("#inventory").addEventListener("click", (event) => {
    const itemId = (event.target as HTMLElement).closest("li")?.dataset.item;
    const def = content.items.find((i) => i.id === itemId);
    if (itemId && def?.kind === "equipment") {
      engine.equip(itemId);
      feedLine(`Equipped ${def.name}`);
      render();
    }
  });

  buildPicker();
  render();

  setInterval(() => {
    engine.tick();
    render();
  }, TICK_MS);

  setInterval(() => {
    localStorage.setItem(SAVE_KEY, JSON.stringify(engine.snapshot()));
  }, 10_000);
});
