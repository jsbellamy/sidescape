import type { Engine } from "../core/engine";
import type { Content } from "../core/types";

/** Handle returned by `mountApp` for driving re-renders after each Tick. */
export interface MountedApp {
  /** Re-renders the scene from the Engine's current Snapshot. Call after every `engine.tick()`. */
  render(): void;
}

/**
 * Mounts the entire SideScape interface into `root`, driven by `engine`.
 * Adds no timers of its own (ADR-0001): the caller pumps `engine.tick()` and
 * calls the returned `render()` to reflect the new Snapshot.
 */
export function mountApp(engine: Engine, root: HTMLElement, content: Content): MountedApp {
  function itemName(itemId: string): string {
    return content.items.find((i) => i.id === itemId)?.name ?? itemId;
  }

  function el<T extends HTMLElement>(selector: string): T {
    return root.querySelector(selector) as T;
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
      .map(
        ([slot, itemId]) =>
          `<li><span class="slot">${slot}</span> ${itemId ? itemName(itemId) : "—"}</li>`,
      )
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

  root.innerHTML = `
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

  engine.on("kill", (e) =>
    feedLine(`Killed ${content.monsters.find((m) => m.id === e.monsterId)?.name}`),
  );
  engine.on("drop", (e) => feedLine(`+${e.qty} ${itemName(e.itemId)}`, `drop-${e.band}`));
  engine.on("levelup", (e) => feedLine(`⭐ ${e.skill} level ${e.level}!`, "levelup"));
  engine.on("death", () => feedLine("💀 You died — respawning…", "death"));
  engine.on("food-eaten", (e) => feedLine(`🍖 Ate ${itemName(e.itemId)} (+${e.healed})`, "eat"));
  engine.on("levelup", () => buildPicker()); // gate flags may change

  el("#picker").addEventListener("click", (event) => {
    const id = (event.target as HTMLElement).dataset["monster"];
    if (id) {
      engine.selectMonster(id);
      render();
    }
  });

  el("#inventory").addEventListener("click", (event) => {
    const itemId = (event.target as HTMLElement).closest("li")?.dataset["item"];
    const def = content.items.find((i) => i.id === itemId);
    if (itemId && def?.kind === "equipment") {
      engine.equip(itemId);
      feedLine(`Equipped ${def.name}`);
      render();
    }
  });

  buildPicker();
  render();

  return { render };
}
