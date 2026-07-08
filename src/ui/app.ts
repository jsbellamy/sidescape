import type { Engine } from "../core/engine";
import type { CombatStyle, Content } from "../core/types";
import { monsterSprite, playerSprite } from "./sprites";

/** Combat Style segmented control labels — Object.entries drives the buttons, so
 * widening `CombatStyle` (issue #7) is a compile error here, not a silent gap. */
const STYLE_LABELS: Record<CombatStyle, string> = {
  accurate: "Accurate",
  aggressive: "Aggressive",
  defensive: "Defensive",
};

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

    root.querySelectorAll<HTMLButtonElement>("#style-row button").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset["style"] === player.combatStyle);
    });

    const monsterImg = el<HTMLImageElement>("#monster-sprite");
    if (monster) {
      el("#monster-name").textContent = monster.name;
      el("#monster-hp-fill").style.width = `${(monster.hp / monster.maxHp) * 100}%`;
      el("#monster-hp-text").textContent = `${monster.hp}/${monster.maxHp}`;

      const sprite = monsterSprite(monster.id);
      if (sprite) {
        monsterImg.src = sprite;
        monsterImg.alt = monster.name;
        monsterImg.hidden = false;
      } else {
        monsterImg.hidden = true;
      }
    } else {
      el("#monster-name").textContent = "Pick a monster ↓";
      el("#monster-hp-fill").style.width = "0%";
      el("#monster-hp-text").textContent = "";
      monsterImg.hidden = true;
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
        const cls =
          def?.kind === "equipment" ? "equippable" : def?.kind === "food" ? "eatable" : "";
        return `<li class="${cls}" data-item="${s.itemId}">
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
      <div id="sprite-row">
        <img id="monster-sprite" class="sprite pixel" alt="" hidden />
        <img id="player-sprite" class="sprite pixel" src="${playerSprite}" alt="Player" />
      </div>
      <p id="monster-name"></p>
      <div class="bar monster"><div id="monster-hp-fill" class="fill"></div><span id="monster-hp-text" class="bar-text"></span></div>
      <div class="bar player"><div id="player-hp-fill" class="fill"></div><span id="player-hp-text" class="bar-text"></span></div>
      <div id="style-row" class="style-row">
        ${Object.entries(STYLE_LABELS)
          .map(([style, label]) => `<button data-style="${style}">${label}</button>`)
          .join("")}
      </div>
    </section>
    <section id="xp-row"></section>
    <section id="picker"></section>
    <section id="panels">
      <p class="panel-title">Equipment <span id="gold"></span></p>
      <ul id="equipment"></ul>
      <p class="panel-title">Inventory <span class="hint">(click to equip or eat)</span></p>
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

  el("#style-row").addEventListener("click", (event) => {
    const style = (event.target as HTMLElement).dataset["style"] as CombatStyle | undefined;
    if (style) {
      engine.setCombatStyle(style);
      render();
    }
  });

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
    if (!itemId || !def) return;
    if (def.kind === "equipment") {
      engine.equip(itemId);
      feedLine(`Equipped ${def.name}`);
      render();
    } else if (def.kind === "food") {
      engine.eatFood(itemId); // logs its own feed line via the food-eaten listener above
      render();
    }
  });

  buildPicker();
  render();

  return { render };
}
