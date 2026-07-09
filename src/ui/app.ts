import type { Engine } from "../core/engine";
import { SKILL_NAMES } from "../core/types";
import type {
  AutoEatThreshold,
  CombatStyle,
  Content,
  DropTableEntry,
  EquipmentDef,
  FoodSlot,
  GearSlot,
  SkillSnapshot,
  Snapshot,
} from "../core/types";
import { MAX_LEVEL, xpForLevel } from "../core/xp";
import { monsterSprite, playerSprite } from "./sprites";
import { loadSortKey, saveSortKey, sortStacks, SORT_KEYS } from "./sort";
import type { SortKey } from "./sort";

/** Mirrors engine.ts's own UNARMED_SPEED: the Character panel shows a weapon's own speed if it
 * declares one, otherwise the same unarmed fallback the Engine uses for the totals row. */
const UNARMED_SPEED = 4;

/** Gear Slot render order for the Character panel; independent of `Snapshot.player.equipment`'s
 * key order (a plain object, not guaranteed stable across engines/serialization). */
const GEAR_SLOT_ORDER: GearSlot[] = ["weapon", "shield", "head", "body", "legs"];

/** Sort control labels, in `SORT_KEYS` order — "Kind | Value | Name". */
const SORT_LABELS: Record<SortKey, string> = { kind: "Kind", value: "Value", name: "Name" };

/** Damage-splat fade duration (#4); mirrors styles.css's `splat-fade` keyframes so the DOM node is
 * removed right as the CSS animation finishes. */
const SPLAT_FADE_MS = 700;
/** Level-up toast auto-dismiss delay (#4). */
const TOAST_DISMISS_MS = 2500;
/** Rare-Drop screen-flash duration (#4); mirrors styles.css's `rare-flash` keyframes. */
const FLASH_DURATION_MS = 400;

/** One line per non-zero stat on `def` (e.g. "+4 atk", "+3 str", "def 4"), plus the weapon's own
 * speed for weapon-slot items. Empty-stat gear (e.g. a Charm with only a name) yields []. */
function equipmentStatParts(def: EquipmentDef): string[] {
  const parts: string[] = [];
  if (def.atkBonus !== 0) parts.push(`+${def.atkBonus} atk`);
  if (def.strBonus !== 0) parts.push(`+${def.strBonus} str`);
  if (def.defBonus !== 0) parts.push(`def ${def.defBonus}`);
  if (def.slot === "weapon") parts.push(`spd ${def.attackSpeed ?? UNARMED_SPEED}t`);
  return parts;
}

/** Renders a per-kill chance as a short human-readable fraction (e.g. "1/24") when the chance
 * is (near enough) an exact reciprocal, falling back to a percentage otherwise (e.g. "30%"). */
function formatChance(chance: number): string {
  const inverse = 1 / chance;
  const rounded = Math.round(inverse);
  return Math.abs(inverse - rounded) < 0.01 ? `1/${rounded}` : `${Math.round(chance * 100)}%`;
}

/** Combat Style segmented control labels — Object.entries drives the buttons, so a future
 * widening of `CombatStyle` is a compile error here, not a silent gap. Issue #7 (Ranged/Magic)
 * deliberately did NOT widen this union: a weapon's Combat Mode (melee/ranged/magic) is a
 * separate concept that decides XP routing, while Combat Style (Accurate/Aggressive/Defensive)
 * stays the player's melee-only training selector — see CombatMode in core/types.ts. */
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
  { id: "character", label: "Character" },
  { id: "bank", label: "Bank" },
  { id: "smithing", label: "Smithing" },
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
  // Presentation-only, persisted in localStorage (#26) — never part of the Snapshot/save.
  let sortKey: SortKey = loadSortKey();
  // Which empty Food Slot (if any) currently has its Bank-Food chooser open (#61) — purely
  // presentational UI state, never part of the Snapshot/save. Re-clicking the same slot's [+], or
  // picking a Food from the chooser, closes it (set back to null).
  let openFoodChooserSlot: number | null = null;

  // Combat feedback (#4) — damage splats, level-up toast, rare-Drop flash. Purely presentational:
  // reacts to Snapshot deltas and the Engine's own events, adding no new Engine state (ADR-0001:
  // Snapshot is the only continuous state the UI reads, and there is no hit/miss Engine event to
  // react to instead). `fx*` tracks a mirror of the Engine's own attack cooldowns — sized from the
  // Snapshot's public `player.bonuses.attackSpeed` and the Monster's own `attackSpeed` — so a real
  // miss (an attack landed for 0 damage) can be told apart from a quiet Tick where nobody swung.
  // It advances once per `render()` call, which the caller pairs 1:1 with `engine.tick()` in
  // production (see main.ts's interval); a `render()` from an unrelated click (e.g. selling an
  // Item) can nudge the cadence by a beat — a cosmetic approximation acceptable for feedback FX
  // that never touches core combat resolution.
  let fxMonsterId: string | null = null;
  let fxMonsterHp = 0;
  let fxPlayerHp = engine.snapshot().player.hp;
  let fxPlayerCd = 0;
  let fxMonsterCd = 0;
  let flashTimer: ReturnType<typeof setTimeout> | undefined;

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

  /** Gold per unit if `itemId` can be sold from the Bank; undefined otherwise. */
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

  /** Appends a damage splat (a red hit for `amount > 0`, a blue "0" miss otherwise) to `layer`,
   * removing it after SPLAT_FADE_MS — long enough for styles.css's `splat-fade` animation to play.
   * Each splat owns its own timer so overlapping splats (both combatants landing an attack the
   * same Tick) fade independently. */
  function showSplat(layer: HTMLElement, amount: number): void {
    const splat = document.createElement("span");
    splat.className = amount > 0 ? "splat splat-hit" : "splat splat-miss";
    splat.textContent = String(amount);
    layer.appendChild(splat);
    setTimeout(() => splat.remove(), SPLAT_FADE_MS);
  }

  /** Advances the combat-fx cooldown mirror from the latest Snapshot and shows a damage splat over
   * whichever side(s) attacked this call — see the `fx*` declarations above for why this mirrors
   * (rather than reads) attack cadence. No-ops whenever combat isn't actually happening (no
   * Monster selected, or the player is mid-Respawn), keeping the baselines fresh so the next real
   * engagement starts from a clean reading instead of a stale delta. */
  function advanceCombatFx(snap: Snapshot): void {
    const { player, monster } = snap;
    if (!monster || player.respawning) {
      fxMonsterId = monster?.id ?? null;
      fxMonsterHp = monster?.hp ?? 0;
      fxPlayerHp = player.hp;
      return;
    }

    const monsterSpeed = content.monsters.find((m) => m.id === monster.id)?.attackSpeed ?? 1;
    // Monster HP only ever resets to max via the Engine's own spawnMonster (new selection, a kill
    // respawning the same Monster, a wave change, or resuming play after the player's own death) —
    // every one of those also re-arms the Engine's real cooldowns, so mirroring that same signal
    // here keeps our cooldown mirror in lockstep instead of drifting across those transitions.
    const freshSpawn =
      monster.id !== fxMonsterId || (monster.hp === monster.maxHp && fxMonsterHp < monster.maxHp);

    if (freshSpawn) {
      fxPlayerCd = player.bonuses.attackSpeed;
      fxMonsterCd = monsterSpeed;
    } else {
      fxPlayerCd -= 1;
      if (fxPlayerCd <= 0) {
        fxPlayerCd = player.bonuses.attackSpeed;
        showSplat(el("#monster-splats"), Math.max(0, fxMonsterHp - monster.hp));
      }
      fxMonsterCd -= 1;
      if (fxMonsterCd <= 0) {
        fxMonsterCd = monsterSpeed;
        // Player HP can also move the same Tick from regen/auto-eat, which can mask (or invert) a
        // hit's true delta — an accepted approximation, same as the cadence mirror above.
        showSplat(el("#player-splats"), Math.max(0, fxPlayerHp - player.hp));
      }
    }

    fxMonsterId = monster.id;
    fxMonsterHp = monster.hp;
    fxPlayerHp = player.hp;
  }

  /** Appends a level-up toast to #toast-container, auto-dismissing after TOAST_DISMISS_MS; each
   * toast owns its own timer so multiple same-Tick level-ups (e.g. a kill's damage XP and its
   * trickle of Hitpoints XP both crossing a level boundary) stack and dismiss independently. */
  function showLevelUpToast(text: string): void {
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = text;
    el<HTMLElement>("#toast-container").appendChild(toast);
    setTimeout(() => toast.remove(), TOAST_DISMISS_MS);
  }

  /** Briefly flashes the whole scene on a rare Drop; re-triggers the CSS animation (via a forced
   * reflow) if a second rare Drop lands before the previous flash finished. */
  function triggerRareFlash(): void {
    const overlay = el<HTMLElement>("#flash-overlay");
    overlay.classList.remove("flash-rare");
    void overlay.offsetWidth; // force reflow so re-adding the class restarts the animation
    overlay.classList.add("flash-rare");
    if (flashTimer) clearTimeout(flashTimer);
    flashTimer = setTimeout(() => overlay.classList.remove("flash-rare"), FLASH_DURATION_MS);
  }

  /** Renders the 3-slot Active Food Slot bar (#61), near the player HP bar: a filled slot shows
   * name/qty (click = eatFromSlot) plus a small ✕ (click = unassignFoodSlot); an empty slot shows
   * a `[+]` that opens a chooser listing the Bank's Food stacks (click one = assignFoodSlot).
   * `openFoodChooserSlot` is presentation-only UI state (never part of the Snapshot), so this
   * reads it directly from the enclosing closure rather than taking it as a parameter. */
  function renderFoodSlots(
    foodSlots: FoodSlot[],
    bankItems: { itemId: string; qty: number }[],
  ): void {
    const foodStacks = bankItems.filter(
      (s) => content.items.find((i) => i.id === s.itemId)?.kind === "food",
    );
    el("#food-slots").innerHTML = foodSlots
      .map((slot, i) => {
        if (slot) {
          return `<div class="food-slot filled" data-slot="${i}">
                    <button class="food-slot-eat" data-eat="${i}">${itemName(slot.itemId)} ×${slot.qty}</button>
                    <button class="food-slot-unassign" data-unassign="${i}" title="Unassign">✕</button>
                  </div>`;
        }
        const chooserOpen = openFoodChooserSlot === i;
        const chooser = chooserOpen
          ? `<div class="food-slot-chooser">
              ${
                foodStacks.length > 0
                  ? foodStacks
                      .map(
                        (s) =>
                          `<button data-assign="${i}" data-item="${s.itemId}">${itemName(s.itemId)} ×${s.qty}</button>`,
                      )
                      .join("")
                  : `<p class="hint">No Food in Bank</p>`
              }
            </div>`
          : "";
        return `<div class="food-slot empty" data-slot="${i}">
                  <button class="food-slot-add" data-add="${i}">+</button>
                  ${chooser}
                </div>`;
      })
      .join("");
  }

  function render(): void {
    const snap = engine.snapshot();
    advanceCombatFx(snap);
    const { player, monster, fishing, dungeon, smithing, bank } = snap;

    const dungeonHeader = el<HTMLElement>("#dungeon-header");
    if (dungeon) {
      dungeonHeader.textContent = `⚔ ${dungeon.name} — Wave ${dungeon.wave}/${dungeon.totalWaves}`;
      dungeonHeader.hidden = false;
    } else {
      dungeonHeader.textContent = "";
      dungeonHeader.hidden = true;
    }

    el("#player-hp-fill").style.width = `${(player.hp / player.maxHp) * 100}%`;
    el("#player-hp-text").textContent = player.respawning
      ? "Respawning…"
      : `HP ${player.hp}/${player.maxHp}`;

    renderFoodSlots(player.foodSlots, bank.items);

    root.querySelectorAll<HTMLButtonElement>("#style-row button").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset["style"] === player.combatStyle);
    });

    root.querySelectorAll<HTMLButtonElement>("#autoeat-row button").forEach((btn) => {
      btn.classList.toggle("active", Number(btn.dataset["threshold"]) === player.autoEatThreshold);
    });

    el<HTMLInputElement>("#autosell-duplicates-toggle").checked = player.autoSellDuplicates;

    const monsterImg = el<HTMLImageElement>("#monster-sprite");
    const monsterBar = el<HTMLElement>("#monster-bar");
    const monsterStats = el<HTMLElement>("#monster-stats");
    if (smithing) {
      el("#monster-name").textContent = `🔨 Smithing: ${smithing.name}`;
      monsterImg.hidden = true;
      monsterBar.hidden = true;
      monsterStats.hidden = true;
      monsterStats.textContent = "";
    } else if (fishing) {
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

    const gold = player.gold;
    el("#gold").textContent = `🪙 ${gold}`;

    root.querySelectorAll<HTMLButtonElement>("#sort-row button").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset["sort"] === sortKey);
    });

    el("#character-slots").innerHTML = GEAR_SLOT_ORDER.map((slot) => {
      const itemId = player.equipment[slot];
      const def = itemId ? content.items.find((i) => i.id === itemId) : undefined;
      const label = def ? def.name : "—";
      const stats = def && def.kind === "equipment" ? equipmentStatParts(def).join(" ") : "";
      return `<li data-slot="${slot}"><span class="slot">${slot}</span> <span class="slot-item">${label}</span>${
        stats ? ` <span class="slot-stats">${stats}</span>` : ""
      }</li>`;
    }).join("");

    const b = player.bonuses;
    el("#character-totals").textContent =
      `+${b.atkBonus} atk +${b.strBonus} str def ${b.defBonus} spd ${b.attackSpeed}t`;

    const lootZone = snap.lootZone;
    const lootStrip = el<HTMLElement>("#loot-strip");
    lootStrip.hidden = lootZone.length === 0;
    el("#loot-strip-items").innerHTML = lootZone
      .map(
        (s) => `<li class="loot-chip" data-item="${s.itemId}">${itemName(s.itemId)} ×${s.qty}</li>`,
      )
      .join("");

    const used = bank.items.length;
    el("#bank-header").textContent = `Bank ${used}/${bank.capacity}`;
    const buySlotsBtn = el<HTMLButtonElement>("#buy-slots-btn");
    buySlotsBtn.textContent = `Buy +10 slots (${bank.nextSlotsPrice}g)`;
    buySlotsBtn.disabled = gold < bank.nextSlotsPrice;

    el("#bank").innerHTML = sortStacks(bank.items, sortKey, content)
      .map((s) => {
        const def = content.items.find((i) => i.id === s.itemId);
        const cls =
          def?.kind === "equipment"
            ? "equippable"
            : def?.kind === "food"
              ? "eatable"
              : def?.kind === "material"
                ? "material"
                : "";
        const price = sellPrice(s.itemId);
        const sellBtn =
          price !== undefined
            ? `<button class="sell-btn" data-sell="${s.itemId}">Sell ${price}g</button>`
            : "";
        const equipBtn =
          def?.kind === "equipment"
            ? `<button class="equip-btn" data-equip="${s.itemId}">Equip</button>`
            : "";
        return `<li class="${cls}" data-item="${s.itemId}">
                  ${itemName(s.itemId)} ×${s.qty}${equipBtn}${sellBtn}</li>`;
      })
      .join("");

    const owned = (itemId: string) => bank.items.find((s) => s.itemId === itemId)?.qty ?? 0;
    const smithingLevel = player.skills.smithing.level;
    el("#smithing-recipes").innerHTML = content.recipes
      .map((recipe) => {
        const inputsLine = recipe.inputs
          .map((input) => `${input.qty}× ${itemName(input.itemId)} (have ${owned(input.itemId)})`)
          .join(", ");
        const underLeveled = smithingLevel < recipe.levelReq;
        const shortOnInputs = recipe.inputs.some((input) => owned(input.itemId) < input.qty);
        const disabled = underLeveled || shortOnInputs;
        return `<li data-recipe-row="${recipe.id}">
                  <p class="recipe-name">${recipe.name} <span class="recipe-level">Lvl ${recipe.levelReq}</span></p>
                  <p class="recipe-inputs">${inputsLine}</p>
                  <button class="craft-btn" data-recipe="${recipe.id}" ${disabled ? "disabled" : ""}>Craft</button>
                </li>`;
      })
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
        const dungeonButtons = content.dungeons
          .filter((d) => d.areaId === area.id)
          .map(
            (d) =>
              `<button data-dungeon="${d.id}" ${area.unlocked ? "" : "disabled"}>⚔ ${d.name}</button>`,
          )
          .join("");
        return `
          <p class="area-name">${area.name}${area.unlocked ? "" : ` ${lockClearLabel(area.id)}`}</p>
          <div class="monster-buttons">${monsterButtons}</div>
          ${spotButtons ? `<div class="monster-buttons fishing-buttons">${spotButtons}</div>` : ""}
          ${dungeonButtons ? `<div class="monster-buttons dungeon-buttons">${dungeonButtons}</div>` : ""}`;
      })
      .join("");
  }

  /** "🔒 Clear <dungeon name>" for a locked Area's picker label. The Snapshot's areas carry only
   * the derived `unlocked` flag (#24: Engine keeps gate rules internal), so the gating Dungeon
   * itself is looked up from the raw Content's `unlockedByDungeonId`. */
  function lockClearLabel(areaId: string): string {
    const areaDef = content.areas.find((a) => a.id === areaId);
    const dungeon = content.dungeons.find((d) => d.id === areaDef?.unlockedByDungeonId);
    return `🔒 Clear ${dungeon?.name ?? "?"}`;
  }

  root.innerHTML = `
    <div id="flash-overlay"></div>
    <section id="scene">
      <div id="toast-container"></div>
      <div id="sprite-row">
        <div id="monster-sprite-wrap" class="sprite-wrap">
          <img id="monster-sprite" class="sprite pixel" alt="" hidden />
          <div id="monster-splats" class="splat-layer"></div>
        </div>
        <div id="player-sprite-wrap" class="sprite-wrap">
          <img id="player-sprite" class="sprite pixel" src="${playerSprite}" alt="Player" />
          <div id="player-splats" class="splat-layer"></div>
        </div>
      </div>
      <p id="dungeon-header" hidden></p>
      <p id="monster-name"></p>
      <p id="monster-stats" hidden></p>
      <div id="monster-bar" class="bar monster"><div id="monster-hp-fill" class="fill"></div><span id="monster-hp-text" class="bar-text"></span></div>
      <div class="bar player"><div id="player-hp-fill" class="fill"></div><span id="player-hp-text" class="bar-text"></span></div>
      <div id="food-slots" class="food-slots"></div>
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
      <label id="autosell-duplicates-row" class="checkbox-row">
        <input type="checkbox" id="autosell-duplicates-toggle" />
        Auto-sell duplicate gear
      </label>
    </section>
    <section id="xp-row"></section>
    <section id="picker"></section>
    <section id="loot-strip" hidden>
      <ul id="loot-strip-items"></ul>
      <button id="loot-all-btn" data-loot-all>Loot all</button>
    </section>
    <section id="panels">
      <div id="tab-row" class="tab-row">
        ${TABS.map((tab) => `<button data-tab="${tab.id}">${tab.label}</button>`).join("")}
      </div>
      <div id="tab-panels">
        <div data-tab-panel="loot" class="tab-panel">
          <ul id="feed"></ul>
        </div>
        <div data-tab-panel="character" class="tab-panel">
          <p class="panel-title">Character <span id="gold"></span></p>
          <ul id="character-slots"></ul>
          <p id="character-totals" class="totals-row"></p>
        </div>
        <div data-tab-panel="bank" class="tab-panel">
          <p class="panel-title">
            <span id="bank-header"></span>
            <button id="buy-slots-btn" data-buy-slots></button>
            <span class="hint">(Equip/Sell buttons; Food is eaten from the Food Slot bar)</span>
          </p>
          <div id="sort-row" class="style-row">
            ${SORT_KEYS.map((key) => `<button data-sort="${key}">${SORT_LABELS[key]}</button>`).join("")}
          </div>
          <ul id="bank"></ul>
        </div>
        <div data-tab-panel="smithing" class="tab-panel">
          <p class="panel-title">Smithing</p>
          <ul id="smithing-recipes"></ul>
        </div>
      </div>
    </section>`;

  engine.on("kill", (e) =>
    feedLine(`Killed ${content.monsters.find((m) => m.id === e.monsterId)?.name}`),
  );
  engine.on("drop", (e) => feedLine(`+${e.qty} ${itemName(e.itemId)}`, `drop-${e.band}`));
  engine.on("drop", (e) => {
    if (e.band === "rare") triggerRareFlash();
  });
  engine.on("levelup", (e) => feedLine(`⭐ ${e.skill} level ${e.level}!`, "levelup"));
  engine.on("levelup", (e) => showLevelUpToast(`⭐ ${e.skill} level ${e.level}!`));
  engine.on("death", () => feedLine("💀 You died — respawning…", "death"));
  engine.on("food-eaten", (e) => feedLine(`🍖 Ate ${itemName(e.itemId)} (+${e.healed})`, "eat"));
  engine.on("item-sold", (e) => feedLine(`Sold ${itemName(e.itemId)} (+${e.gold}g)`, "sell"));
  engine.on("overflow-sold", (e) =>
    feedLine(`⚠ Bank full — sold ${itemName(e.itemId)} (+${e.gold}g)`, "overflow"),
  );
  engine.on("overflow-lost", (e) =>
    feedLine(`⚠ Bank full — ${itemName(e.itemId)} lost!`, "overflow"),
  );
  engine.on("duplicate-sold", (e) =>
    feedLine(`⚠ Auto-sold duplicate ${itemName(e.itemId)} (+${e.gold}g)`, "overflow"),
  );
  // Loot Zone (#60): a sweep (auto-loot on leaving combat, or the Loot all button) banks whatever
  // fits and leaves the rest in the zone — check the post-sweep Snapshot for leftovers right here,
  // rather than a per-render check, so the warning fires once per sweep instead of spamming every
  // Tick while the zone sits non-empty.
  engine.on("looted", (e) => {
    if (e.items.length <= 3) {
      for (const item of [...e.items].reverse()) {
        feedLine(`Banked ${item.qty} ${itemName(item.itemId)}`, "loot");
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
      feedLine(`-${item.qty} ${itemName(item.itemId)}`, "dungeon-failed");
    }
    feedLine("💀 Run failed — loot lost!", "dungeon-failed");
  });
  engine.on("fish-caught", (e) => feedLine(`🎣 Caught ${itemName(e.itemId)} (+${e.qty})`, "catch"));
  engine.on("item-crafted", (e) => feedLine(`🔨 Crafted ${itemName(e.itemId)}`, "craft"));
  engine.on("equipped", (e) => feedLine(`Equipped ${itemName(e.itemId)}`));
  engine.on("wave-cleared", (e) => feedLine(`Wave ${e.wave}/${e.totalWaves} cleared`));
  engine.on("dungeon-completed", (e) => {
    const def = content.dungeons.find((d) => d.id === e.dungeonId);
    feedLine(`🏰 ${def?.name ?? e.dungeonId} cleared!`, "dungeon-completed");
  });
  engine.on("chest-opened", (e) => {
    // feedLine prepends, so the newest call ends up on top: insert items in reverse, then the
    // header last, so the visual (top-to-bottom) order reads header followed by items in order.
    for (const item of [...e.items].reverse()) {
      feedLine(`+${item.qty} ${itemName(item.itemId)}`, `drop-${item.band}`);
    }
    feedLine("📦 Chest opened!", "chest-header");
  });
  engine.on("levelup", () => buildPicker()); // Fishing-Spot levelReq gates are level-driven
  engine.on("dungeon-completed", () => buildPicker()); // Area gates flip on Dungeon completion

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

  el<HTMLInputElement>("#autosell-duplicates-toggle").addEventListener("change", (event) => {
    engine.setAutoSellDuplicates((event.target as HTMLInputElement).checked);
    render();
  });

  el("#sort-row").addEventListener("click", (event) => {
    const key = (event.target as HTMLElement).dataset["sort"] as SortKey | undefined;
    if (key) {
      sortKey = key;
      saveSortKey(key);
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
      return;
    }
    const dungeonId = target.dataset["dungeon"];
    if (dungeonId) {
      engine.enterDungeon(dungeonId);
      render();
    }
  });

  el("#bank").addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    // Click-handler order is load-bearing (#59, mirrors #25's deposit-before-sell-before-equip
    // rule): the Sell button fires before Equip. Bank rows no longer eat (#61 moved eating to the
    // Food Slot bar) — a Food row's only actions left are Equip (never applicable) and Sell.
    const sellId = target.dataset["sell"];
    if (sellId) {
      engine.sell(sellId, 1); // logs its own feed line via the item-sold listener above
      render();
      return;
    }

    const equipId = target.dataset["equip"];
    if (equipId) {
      engine.equip(equipId); // logs its own feed line via the equipped listener above
      render();
    }
  });

  // Food Slot bar (#61): dispatch order is load-bearing — data-unassign (✕) is checked before the
  // slot-level eat, so unassigning never also eats; data-assign (a chooser pick) is checked before
  // data-add (the [+] toggle) so picking a Food both assigns it and doesn't re-toggle the chooser.
  el("#food-slots").addEventListener("click", (event) => {
    const target = event.target as HTMLElement;

    const unassignIndex = target.dataset["unassign"];
    if (unassignIndex !== undefined) {
      engine.unassignFoodSlot(Number(unassignIndex)); // logs nothing; no feed line for unassign
      render();
      return;
    }

    const eatIndex = target.dataset["eat"];
    if (eatIndex !== undefined) {
      engine.eatFromSlot(Number(eatIndex)); // logs its own feed line via the food-eaten listener
      render();
      return;
    }

    const assignIndex = target.dataset["assign"];
    const assignItemId = target.dataset["item"];
    if (assignIndex !== undefined && assignItemId !== undefined) {
      engine.assignFoodSlot(Number(assignIndex), assignItemId);
      openFoodChooserSlot = null;
      render();
      return;
    }

    const addIndex = target.dataset["add"];
    if (addIndex !== undefined) {
      const index = Number(addIndex);
      openFoodChooserSlot = openFoodChooserSlot === index ? null : index; // re-click dismisses
      render();
    }
  });

  el("#loot-all-btn").addEventListener("click", () => {
    const before = engine.snapshot().lootZone.length;
    engine.lootAll(); // logs its own feed line via the looted subscription above, if anything moved
    const after = engine.snapshot().lootZone.length;
    render();
    // If something moved, the looted listener above already logged the leftover check itself; this
    // covers the otherwise-silent case where the sweep moved nothing at all (no looted event fires).
    if (after > 0 && after === before) {
      feedLine("⚠ Bank full — loot left behind", "overflow");
    }
  });

  el("#buy-slots-btn").addEventListener("click", () => {
    engine.buyBankSlots();
    feedLine(`Bank expanded to ${engine.snapshot().bank.capacity} slots`);
    render();
  });

  el("#smithing-recipes").addEventListener("click", (event) => {
    const recipeId = (event.target as HTMLElement).dataset["recipe"];
    if (!recipeId) return;
    engine.selectRecipe(recipeId); // logs its own feed line via the item-crafted subscription
    render();
  });

  buildPicker();
  render();
  renderTabs();

  return { render };
}
