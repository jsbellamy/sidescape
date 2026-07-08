import type { Engine } from "../core/engine";
import { SKILL_NAMES } from "../core/types";
import type {
  AutoEatThreshold,
  CombatStyle,
  Content,
  DropTableEntry,
  SkillSnapshot,
} from "../core/types";
import { MAX_LEVEL, xpForLevel } from "../core/xp";
import { monsterSprite, playerSprite } from "./sprites";

/** Renders a per-kill chance as a short human-readable fraction (e.g. "1/24") when the chance
 * is (near enough) an exact reciprocal, falling back to a percentage otherwise (e.g. "30%"). */
function formatChance(chance: number): string {
  const inverse = 1 / chance;
  const rounded = Math.round(inverse);
  return Math.abs(inverse - rounded) < 0.01 ? `1/${rounded}` : `${Math.round(chance * 100)}%`;
}

/** Combat Style segmented control labels — Object.entries drives the buttons, so
 * widening `CombatStyle` (issue #7) is a compile error here, not a silent gap. */
const STYLE_LABELS: Record<CombatStyle, string> = {
  accurate: "Accurate",
  aggressive: "Aggressive",
  defensive: "Defensive",
};

/** Auto-eat threshold segmented control labels, keyed by the Engine's AutoEatThreshold union. */
const AUTO_EAT_LABELS: Record<AutoEatThreshold, string> = {
  0: "Off",
  0.25: "25%",
  0.5: "50%",
  0.75: "75%",
};

/** Fraction (0..1) of the way a Skill's XP is from its current level's threshold to the next
 * level's threshold. Skills at MAX_LEVEL have no next threshold, so the bar reads full. */
function skillProgress(skill: SkillSnapshot): number {
  if (skill.level >= MAX_LEVEL) return 1;
  const floor = xpForLevel(skill.level);
  const ceil = xpForLevel(skill.level + 1);
  return (skill.xp - floor) / (ceil - floor);
}

/**
 * One entry per panel tab. The tab strip, click handling, and show/hide logic below are generic
 * over this list — extending the tab mechanism (Bank #25, Character #26, Smithing #28) means
 * adding an entry here plus a matching `[data-tab-panel]` section in the `#tab-panels` markup;
 * no other code in this file needs to change.
 */
const TABS = [
  { id: "loot", label: "Loot Feed" },
  { id: "equipment", label: "Equipment" },
  { id: "inventory", label: "Inventory" },
] as const;
type TabId = (typeof TABS)[number]["id"];

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
  let activeTab: TabId = TABS[0].id;

  /** Shows the active tab's panel and hides the rest; highlights the matching tab button. */
  function renderTabs(): void {
    root.querySelectorAll<HTMLButtonElement>("#tab-row button").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset["tab"] === activeTab);
    });
    root.querySelectorAll<HTMLElement>("[data-tab-panel]").forEach((panel) => {
      panel.hidden = panel.dataset["tabPanel"] !== activeTab;
    });
  }

  function itemName(itemId: string): string {
    return content.items.find((i) => i.id === itemId)?.name ?? itemId;
  }

  /** Gold per unit if `itemId` can be sold from the Inventory; undefined otherwise. */
  function sellPrice(itemId: string): number | undefined {
    const def = content.items.find((i) => i.id === itemId);
    return def && def.kind !== "currency" ? def.value : undefined;
  }

  /** One tooltip line per Drop Table entry: item name, quantity, band, and human-readable chance. */
  function dropEntryLine(entry: DropTableEntry): string {
    const chanceLabel =
      entry.band === "guaranteed" ? "always" : `${entry.band} ${formatChance(entry.chance)}`;
    return `${itemName(entry.itemId)} ×${entry.qty} — ${chanceLabel}`;
  }

  /** `title` tooltip text previewing a Monster's full Drop Table. */
  function dropTableTooltip(monsterId: string): string {
    const def = content.monsters.find((m) => m.id === monsterId);
    return def ? def.dropTable.map(dropEntryLine).join("\n") : "";
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
    const { player, monster, fishing } = snap;

    el("#player-hp-fill").style.width = `${(player.hp / player.maxHp) * 100}%`;
    el("#player-hp-text").textContent = player.respawning
      ? "Respawning…"
      : `HP ${player.hp}/${player.maxHp}`;

    root.querySelectorAll<HTMLButtonElement>("#style-row button").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset["style"] === player.combatStyle);
    });

    root.querySelectorAll<HTMLButtonElement>("#autoeat-row button").forEach((btn) => {
      btn.classList.toggle("active", Number(btn.dataset["threshold"]) === player.autoEatThreshold);
    });

    const monsterImg = el<HTMLImageElement>("#monster-sprite");
    const monsterBar = el<HTMLElement>("#monster-bar");
    const monsterStats = el<HTMLElement>("#monster-stats");
    if (fishing) {
      el("#monster-name").textContent = `🎣 Fishing at ${fishing.name}`;
      monsterImg.hidden = true;
      monsterBar.hidden = true;
      monsterStats.hidden = true;
      monsterStats.textContent = "";
    } else if (monster) {
      monsterBar.hidden = false;
      el("#monster-name").textContent = monster.name;
      el("#monster-hp-fill").style.width = `${(monster.hp / monster.maxHp) * 100}%`;
      el("#monster-hp-text").textContent = `${monster.hp}/${monster.maxHp}`;

      const def = content.monsters.find((m) => m.id === monster.id);
      if (def) {
        monsterStats.textContent = `Atk ${def.attackLevel} · Def ${def.defenceLevel} · Max hit ${def.maxHit} · Speed ${def.attackSpeed}t`;
        monsterStats.hidden = false;
      } else {
        monsterStats.textContent = "";
        monsterStats.hidden = true;
      }

      const sprite = monsterSprite(monster.id);
      if (sprite) {
        monsterImg.src = sprite;
        monsterImg.alt = monster.name;
        monsterImg.hidden = false;
      } else {
        monsterImg.hidden = true;
      }
    } else {
      monsterBar.hidden = false;
      el("#monster-name").textContent = "Pick a monster ↓";
      el("#monster-hp-fill").style.width = "0%";
      el("#monster-hp-text").textContent = "";
      monsterImg.hidden = true;
      monsterStats.hidden = true;
      monsterStats.textContent = "";
    }

    el("#xp-row").innerHTML = SKILL_NAMES.map((skill) => {
      const s = player.skills[skill];
      const pct = Math.floor(skillProgress(s) * 100);
      return `<div class="skill" data-skill="${skill}" title="${skill}: ${Math.floor(s.xp)} xp">
             <span class="skill-abbr">${skill.slice(0, 3).toUpperCase()}</span>
             <span class="skill-level">${s.level}</span>
             <div class="skill-bar"><div class="skill-bar-fill" style="width: ${pct}%"></div></div>
           </div>`;
    }).join("");

    const gold = player.inventory.find((s) => s.itemId === "gold")?.qty ?? 0;
    el("#gold").textContent = `🪙 ${gold}`;

    el("#inventory").innerHTML = player.inventory
      .filter((s) => s.itemId !== "gold")
      .map((s) => {
        const def = content.items.find((i) => i.id === s.itemId);
        const cls =
          def?.kind === "equipment" ? "equippable" : def?.kind === "food" ? "eatable" : "";
        const price = sellPrice(s.itemId);
        const sellBtn =
          price !== undefined
            ? `<button class="sell-btn" data-sell="${s.itemId}">Sell ${price}g</button>`
            : "";
        return `<li class="${cls}" data-item="${s.itemId}">
                  ${itemName(s.itemId)} ×${s.qty}${sellBtn}</li>`;
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
      .map((area) => {
        const monsterButtons = area.monsterIds
          .map((id) => {
            const def = content.monsters.find((m) => m.id === id);
            return `<button data-monster="${id}" ${area.unlocked ? "" : "disabled"} title="${dropTableTooltip(id)}">${def?.name ?? id}</button>`;
          })
          .join("");
        const spotButtons = area.fishingSpots
          .map(({ id, unlocked }) => {
            const def = content.fishingSpots.find((s) => s.id === id);
            return `<button data-spot="${id}" ${unlocked ? "" : "disabled"}>🎣 ${def?.name ?? id}</button>`;
          })
          .join("");
        return `
          <p class="area-name">${area.name}${area.unlocked ? "" : " 🔒"}</p>
          <div class="monster-buttons">${monsterButtons}</div>
          ${spotButtons ? `<div class="monster-buttons fishing-buttons">${spotButtons}</div>` : ""}`;
      })
      .join("");
  }

  root.innerHTML = `
    <section id="scene">
      <div id="sprite-row">
        <img id="monster-sprite" class="sprite pixel" alt="" hidden />
        <img id="player-sprite" class="sprite pixel" src="${playerSprite}" alt="Player" />
      </div>
      <p id="monster-name"></p>
      <p id="monster-stats" hidden></p>
      <div id="monster-bar" class="bar monster"><div id="monster-hp-fill" class="fill"></div><span id="monster-hp-text" class="bar-text"></span></div>
      <div class="bar player"><div id="player-hp-fill" class="fill"></div><span id="player-hp-text" class="bar-text"></span></div>
      <div id="style-row" class="style-row">
        ${Object.entries(STYLE_LABELS)
          .map(([style, label]) => `<button data-style="${style}">${label}</button>`)
          .join("")}
      </div>
      <div id="autoeat-row" class="style-row">
        ${Object.entries(AUTO_EAT_LABELS)
          .map(([threshold, label]) => `<button data-threshold="${threshold}">${label}</button>`)
          .join("")}
      </div>
    </section>
    <section id="xp-row"></section>
    <section id="picker"></section>
    <section id="panels">
      <div id="tab-row" class="tab-row">
        ${TABS.map((tab) => `<button data-tab="${tab.id}">${tab.label}</button>`).join("")}
      </div>
      <div id="tab-panels">
        <div data-tab-panel="loot" class="tab-panel">
          <ul id="feed"></ul>
        </div>
        <div data-tab-panel="equipment" class="tab-panel">
          <p class="panel-title">Equipment <span id="gold"></span></p>
          <ul id="equipment"></ul>
        </div>
        <div data-tab-panel="inventory" class="tab-panel">
          <p class="panel-title">Inventory <span class="hint">(click to equip or eat)</span></p>
          <ul id="inventory"></ul>
        </div>
      </div>
    </section>`;

  engine.on("kill", (e) =>
    feedLine(`Killed ${content.monsters.find((m) => m.id === e.monsterId)?.name}`),
  );
  engine.on("drop", (e) => feedLine(`+${e.qty} ${itemName(e.itemId)}`, `drop-${e.band}`));
  engine.on("levelup", (e) => feedLine(`⭐ ${e.skill} level ${e.level}!`, "levelup"));
  engine.on("death", () => feedLine("💀 You died — respawning…", "death"));
  engine.on("food-eaten", (e) => feedLine(`🍖 Ate ${itemName(e.itemId)} (+${e.healed})`, "eat"));
  engine.on("item-sold", (e) => feedLine(`Sold ${itemName(e.itemId)} (+${e.gold}g)`, "sell"));
  engine.on("fish-caught", (e) => feedLine(`🎣 Caught ${itemName(e.itemId)} (+${e.qty})`, "catch"));
  engine.on("levelup", () => buildPicker()); // gate flags may change

  el("#style-row").addEventListener("click", (event) => {
    const style = (event.target as HTMLElement).dataset["style"] as CombatStyle | undefined;
    if (style) {
      engine.setCombatStyle(style);
      render();
    }
  });

  el("#autoeat-row").addEventListener("click", (event) => {
    const raw = (event.target as HTMLElement).dataset["threshold"];
    if (raw !== undefined) {
      engine.setAutoEatThreshold(Number(raw) as AutoEatThreshold);
      render();
    }
  });

  el("#tab-row").addEventListener("click", (event) => {
    const tab = (event.target as HTMLElement).dataset["tab"] as TabId | undefined;
    if (tab) {
      activeTab = tab;
      renderTabs();
    }
  });

  el("#picker").addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const monsterId = target.dataset["monster"];
    if (monsterId) {
      engine.selectMonster(monsterId);
      render();
      return;
    }
    const spotId = target.dataset["spot"];
    if (spotId) {
      engine.selectFishingSpot(spotId);
      render();
    }
  });

  el("#inventory").addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const sellId = target.dataset["sell"];
    if (sellId) {
      engine.sell(sellId, 1); // logs its own feed line via the item-sold listener above
      render();
      return;
    }

    const itemId = target.closest("li")?.dataset["item"];
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
  renderTabs();

  return { render };
}
