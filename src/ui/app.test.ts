// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEngine } from "../core/engine";
import { fixtureContent } from "../core/fixture-content";
import { makeSnapshot } from "../core/make-snapshot";
import { xpForLevel } from "../core/xp";
import { seededRng } from "../core/rng";
import { mountApp } from "./app";
import type { WorkspaceChrome } from "./workspace-chrome";

/** A do-nothing WorkspaceChrome for tests that don't care about window resize/position (the vast
 * majority) — mirrors main.ts's real Tauri adapter's `.catch(console.error)`-guarded contract
 * without any Tauri API access, same shape as the browser-degrade path `npm run dev` uses. Tests
 * that specifically exercise the card-count seam (see "Workspace cards" below) pass their own spy
 * instead, to assert `setCardCount` is called with the right open-card count. */
const noopWindowChrome: WorkspaceChrome = {
  getCapacity: () => Promise.resolve(3),
  setCardCount: () => {},
};

/** Pump Ticks until `itemId` shows up in either the Bank or the Loot Zone (or fail the test), then
 * loot it all into the Bank, mirroring core/engine.test.ts's grindFor — combat Drops land in the
 * Loot Zone first, not the Bank directly (#60). */
function grindFor(engine: ReturnType<typeof createEngine>, itemId: string, maxTicks = 20_000) {
  for (let i = 0; i < maxTicks; i++) {
    engine.tick();
    const snap = engine.snapshot();
    if (
      snap.bank.items.some((s) => s.itemId === itemId) ||
      snap.lootZone.some((s) => s.itemId === itemId)
    ) {
      engine.lootAll();
      return;
    }
  }
  throw new Error(`${itemId} never dropped in ${maxTicks} ticks`);
}

/**
 * happy-dom's localStorage getter doesn't resolve reliably under Vitest's global-population
 * strategy (mirrors the stub in ui/sfx.test.ts).
 */
function stubLocalStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => (store.has(key) ? (store.get(key) as string) : null),
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
}

function mount(seed: number) {
  const engine = createEngine(fixtureContent, seededRng(seed));
  const root = document.createElement("main");
  const app = mountApp(engine, root, fixtureContent, noopWindowChrome);
  return { engine, root, app };
}

/** Clicks a Bank tile to select it (#78: Equip/Sell now live in the detail strip below the grid,
 * not inline on the tile itself), returning the tile so callers can assert on it if they want. */
function selectBankTile(root: HTMLElement, itemId: string): HTMLElement | null {
  const tile = root.querySelector<HTMLElement>(`#bank .tile[data-item="${itemId}"]`);
  tile?.click();
  return tile;
}

/** Dispatches a bubbling `mouseover` on `el` (#78's shared `#item-tooltip` hover panel is wired
 * with delegation on the mount root, not a per-tile listener, so a real bubbling event is what
 * the app actually reacts to — not a direct method call), then returns the tooltip element for
 * assertions. */
function hoverTile(root: HTMLElement, el: Element): HTMLElement | null {
  el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
  return root.querySelector<HTMLElement>("#item-tooltip");
}

describe("mountApp", () => {
  it("renders the Monster picker for every unlocked Area, gating locked ones", () => {
    const { root } = mount(1);
    const dummyBtn = root.querySelector<HTMLButtonElement>('[data-monster="dummy"]');
    const bruteBtn = root.querySelector<HTMLButtonElement>('[data-monster="brute"]');
    expect(dummyBtn?.textContent).toBe("Training Dummy");
    expect(dummyBtn?.disabled).toBe(false);
    expect(bruteBtn?.disabled).toBe(true); // Test Crypt is locked until "gauntlet" is cleared
  });

  it("shows a locked Area's picker label as '🔒 Clear <dungeon name>'", () => {
    const { root } = mount(1);
    const cryptLabel = [...root.querySelectorAll(".area-name")].find((p) =>
      p.textContent?.startsWith("Test Crypt"),
    );
    expect(cryptLabel?.textContent).toBe("Test Crypt 🔒 Clear The Gauntlet");

    const meadowLabel = [...root.querySelectorAll(".area-name")].find((p) =>
      p.textContent?.startsWith("Test Meadow"),
    );
    expect(meadowLabel?.textContent).toBe("Test Meadow"); // unlocked from the start, no lock suffix
  });

  it("selecting a Monster renders its name and a full HP bar", () => {
    const { root } = mount(1);
    root.querySelector<HTMLButtonElement>('[data-monster="dummy"]')?.click();

    expect(root.querySelector("#monster-name")?.textContent).toBe("Training Dummy");
    expect((root.querySelector("#monster-hp-fill") as HTMLElement).style.width).toBe("100%");
    expect(root.querySelector("#monster-hp-text")?.textContent).toBe("3/3");
  });

  it("pumping Ticks visibly reduces the selected Monster's HP", () => {
    const { engine, root, app } = mount(99);
    root.querySelector<HTMLButtonElement>('[data-monster="dummy"]')?.click();
    expect(root.querySelector("#monster-hp-text")?.textContent).toBe("3/3");

    for (let i = 0; i < 4; i++) {
      engine.tick();
      app.render();
    }

    expect(root.querySelector("#monster-hp-text")?.textContent).toBe("2/3");
    expect((root.querySelector("#monster-hp-fill") as HTMLElement).style.width).not.toBe("100%");
  });

  it("clicking a Food row in the Bank panel no longer eats it (#61 moved eating to the Food Slot bar)", () => {
    const { engine, root, app } = mount(1);
    root.querySelector<HTMLButtonElement>('[data-monster="dummy"]')?.click();

    // grind until a Cooked Meat drops and the player has taken some damage
    for (let i = 0; i < 2000; i++) {
      engine.tick();
      if (engine.snapshot().lootZone.some((s) => s.itemId === "meat")) break;
    }
    engine.lootAll();
    app.render();
    const meatQty = engine.snapshot().bank.items.find((s) => s.itemId === "meat")?.qty ?? 0;
    expect(meatQty).toBeGreaterThan(0);
    const hpBefore = engine.snapshot().player.hp;

    const meatTile = selectBankTile(root, "meat"); // clicking a tile only selects it (#78)
    expect(meatTile).not.toBeNull();

    expect(engine.snapshot().bank.items.find((s) => s.itemId === "meat")?.qty ?? 0).toBe(meatQty);
    expect(engine.snapshot().player.hp).toBe(hpBefore);
    expect(root.querySelector("#feed li")?.textContent).not.toMatch(/ate/i);
  });

  it("shows a sell button with price only for items with a value", () => {
    const noValueContent = {
      ...fixtureContent,
      items: fixtureContent.items.map((i) => {
        if (i.id !== "lucky-charm" || i.kind === "currency") return i;
        const { value: _value, ...rest } = i;
        return rest;
      }),
    };
    const engine = createEngine(
      noValueContent,
      seededRng(1),
      makeSnapshot({
        player: {
          hp: 10,
          maxHp: 10,
          skills: { hitpoints: { level: 10, xp: xpForLevel(10) } },
        },
        bank: {
          items: [
            { itemId: "meat", qty: 1 },
            { itemId: "lucky-charm", qty: 1 },
          ],
        },
      }),
    );
    const root = document.createElement("main");
    mountApp(engine, root, noValueContent, noopWindowChrome);

    selectBankTile(root, "meat");
    expect(root.querySelector('#bank-detail [data-sell="meat"]')?.textContent).toBe("Sell 3g");

    selectBankTile(root, "lucky-charm");
    expect(root.querySelector('#bank-detail [data-sell="lucky-charm"]')).toBeNull();
  });

  it("clicking sell sells exactly one unit of Equipment, credits gold, logs a feed line, and does not equip it", () => {
    const { engine, root, app } = mount(1);
    root.querySelector<HTMLButtonElement>('[data-monster="dummy"]')?.click();

    for (let i = 0; i < 20_000; i++) {
      engine.tick();
      if (engine.snapshot().lootZone.some((s) => s.itemId === "bronze-sword")) break;
    }
    engine.lootAll();
    app.render();
    const swordQty =
      engine.snapshot().bank.items.find((s) => s.itemId === "bronze-sword")?.qty ?? 0;
    const goldBefore = engine.snapshot().player.gold;
    expect(swordQty).toBeGreaterThan(0);

    selectBankTile(root, "bronze-sword");
    const sellBtn = root.querySelector<HTMLButtonElement>(
      '#bank-detail [data-sell="bronze-sword"]',
    );
    expect(sellBtn?.textContent).toBe("Sell 20g");
    sellBtn?.click();

    const after = engine.snapshot();
    expect(after.bank.items.find((s) => s.itemId === "bronze-sword")?.qty ?? 0).toBe(swordQty - 1);
    expect(after.player.gold).toBe(goldBefore + 20);
    expect(after.player.equipment.weapon).toBeNull(); // sold, not equipped
    expect(root.querySelector("#feed li")?.textContent).toMatch(/sold.*bronze sword.*\+20g/i);
    expect(root.querySelector("#gold")?.textContent).toContain(String(goldBefore + 20));
  });

  it("clicking sell on Food sells it instead of eating it (no HP change, no food-eaten line)", () => {
    const { engine, root, app } = mount(1);
    root.querySelector<HTMLButtonElement>('[data-monster="dummy"]')?.click();

    for (let i = 0; i < 2000; i++) {
      engine.tick();
      if (engine.snapshot().lootZone.some((s) => s.itemId === "meat")) break;
    }
    engine.lootAll();
    app.render();
    const meatQty = engine.snapshot().bank.items.find((s) => s.itemId === "meat")?.qty ?? 0;
    const hpBefore = engine.snapshot().player.hp;

    selectBankTile(root, "meat");
    const sellBtn = root.querySelector<HTMLButtonElement>('#bank-detail [data-sell="meat"]');
    expect(sellBtn?.textContent).toBe("Sell 3g");
    sellBtn?.click();

    const after = engine.snapshot();
    expect(after.bank.items.find((s) => s.itemId === "meat")?.qty ?? 0).toBe(meatQty - 1);
    expect(after.player.hp).toBe(hpBefore); // not eaten, so no healing
    expect(root.querySelector("#feed li")?.textContent).toMatch(/sold.*meat.*\+3g/i);
    expect(root.querySelector("#feed li")?.textContent).not.toMatch(/ate/i);
  });
});

describe("Monster stats line", () => {
  it("shows attack type, attack level, defence level, max hit, and attack speed for the selected Monster", () => {
    const { root } = mount(1);
    root.querySelector<HTMLButtonElement>('[data-monster="dummy"]')?.click();

    const stats = root.querySelector<HTMLElement>("#monster-stats");
    expect(stats?.hidden).toBe(false);
    // "dummy"'s attackType is "crush" (fixture-content.ts); its def vector is uniform-zero, so
    // the weak spot tie-breaks to "stab" (first in ATTACK_TYPES order).
    expect(stats?.textContent).toBe("Crush · Atk 1 · Def 1 · Max hit 1 · Speed 4t · Weak: stab");
  });

  it("updates the stats line when a different Monster is selected", () => {
    // Test Crypt is gated by the "gauntlet" Dungeon, so mark it completed to unlock "brute".
    const engine = createEngine(
      fixtureContent,
      seededRng(1),
      makeSnapshot({
        player: { completedDungeonIds: ["gauntlet"] },
      }),
    );
    const root = document.createElement("main");
    mountApp(engine, root, fixtureContent, noopWindowChrome);
    root.querySelector<HTMLButtonElement>('[data-monster="brute"]')?.click();

    // "brute"'s attackType is "crush" too (fixture-content.ts); same uniform-zero def vector.
    expect(root.querySelector("#monster-stats")?.textContent).toBe(
      "Crush · Atk 40 · Def 40 · Max hit 8 · Speed 4t · Weak: stab",
    );
  });

  it("shows the lowest def-vector entry as the weak spot, plus weakElement when the Monster declares one (#102)", () => {
    const weakToSlashWithFire = {
      ...fixtureContent,
      monsters: fixtureContent.monsters.map((m) =>
        m.id === "dummy"
          ? {
              ...m,
              def: { stab: 5, slash: 1, crush: 5, ranged: 5, magic: 5 },
              weakElement: "fire" as const,
            }
          : m,
      ),
    };
    const engine = createEngine(weakToSlashWithFire, seededRng(1));
    const root = document.createElement("main");
    mountApp(engine, root, weakToSlashWithFire, noopWindowChrome);
    root.querySelector<HTMLButtonElement>('[data-monster="dummy"]')?.click();

    expect(root.querySelector("#monster-stats")?.textContent).toBe(
      "Crush · Atk 1 · Def 1 · Max hit 1 · Speed 4t · Weak: slash · Weak: fire",
    );
  });

  it("is absent (hidden, no text) before any Monster is selected", () => {
    const { root } = mount(1);
    const stats = root.querySelector<HTMLElement>("#monster-stats");
    expect(stats?.hidden).toBe(true);
    expect(stats?.textContent).toBe("");
  });

  it("is absent while Fishing", () => {
    const { root } = mount(1);
    root.querySelector<HTMLButtonElement>('[data-monster="dummy"]')?.click();
    root.querySelector<HTMLButtonElement>('[data-spot="pond"]')?.click();

    const stats = root.querySelector<HTMLElement>("#monster-stats");
    expect(stats?.hidden).toBe(true);
    expect(stats?.textContent).toBe("");
  });
});

describe("Monster picker Drop Table tooltip", () => {
  it("lists every Drop Table entry with its band and a human-readable chance", () => {
    const { root } = mount(1);
    const dummyBtn = root.querySelector<HTMLButtonElement>('[data-monster="dummy"]');

    expect(dummyBtn?.title).toBe(
      [
        "Gold ×5 — always",
        "Cooked Meat ×1 — common 1/4",
        "Bronze Sword ×1 — uncommon 1/16",
        "Lucky Charm ×1 — rare 1/128",
      ].join("\n"),
    );
  });

  it("gives each Monster its own tooltip, keyed off its Drop Table", () => {
    const { root } = mount(1);
    const bruteBtn = root.querySelector<HTMLButtonElement>('[data-monster="brute"]');

    expect(bruteBtn?.title).toBe("Gold ×200 — always");
  });
});

describe("Combat Style selector", () => {
  function styleButtons(root: HTMLElement) {
    return [...root.querySelectorAll<HTMLButtonElement>("#style-row button")];
  }

  it("renders one button per Combat Style, generated from the label map (not hard-coded)", () => {
    const { root } = mount(1);
    const buttons = styleButtons(root);
    expect(buttons).toHaveLength(3);
    const styles = buttons.map((b) => b.dataset["style"]).sort();
    expect(styles).toEqual(["accurate", "aggressive", "defensive"]);
  });

  it("the active button reflects the Engine's default Combat Style on mount", () => {
    const { root } = mount(1);
    const buttons = styleButtons(root);
    const active = buttons.filter((b) => b.classList.contains("active"));
    expect(active).toHaveLength(1);
    expect(active[0]?.dataset["style"]).toBe("aggressive");
  });

  it("highlights a non-default Combat Style when mounted from a saved Snapshot", () => {
    const engine = createEngine(
      fixtureContent,
      seededRng(1),
      makeSnapshot({
        player: {
          hp: 10,
          maxHp: 10,
          combatStyle: "defensive",
          skills: { hitpoints: { level: 10, xp: xpForLevel(10) } },
        },
      }),
    );
    const root = document.createElement("main");
    mountApp(engine, root, fixtureContent, noopWindowChrome);

    const active = styleButtons(root).filter((b) => b.classList.contains("active"));
    expect(active).toHaveLength(1);
    expect(active[0]?.dataset["style"]).toBe("defensive");
  });

  it("clicking a style updates the active button and calls setCombatStyle on the Engine", () => {
    const { engine, root } = mount(1);
    root.querySelector<HTMLButtonElement>('[data-style="accurate"]')?.click();

    expect(engine.snapshot().player.combatStyle).toBe("accurate");
    const active = styleButtons(root).filter((b) => b.classList.contains("active"));
    expect(active).toHaveLength(1);
    expect(active[0]?.dataset["style"]).toBe("accurate");
  });

  it("routes subsequent kill XP to the matching Skill, with Hitpoints XP still trickling", () => {
    const { engine, root } = mount(7);
    root.querySelector<HTMLButtonElement>('[data-style="accurate"]')?.click();
    root.querySelector<HTMLButtonElement>('[data-monster="dummy"]')?.click();

    for (let i = 0; i < 400; i++) engine.tick();

    const { skills } = engine.snapshot().player;
    expect(skills.attack.xp).toBeGreaterThan(0);
    expect(skills.strength.xp).toBe(0);
    expect(skills.hitpoints.xp).toBeGreaterThan(xpForLevel(10));
  });
});

describe("Auto-eat threshold selector", () => {
  function thresholdButtons(root: HTMLElement) {
    return [...root.querySelectorAll<HTMLButtonElement>("#autoeat-row button")];
  }

  it("renders one button per threshold, generated from the label map (not hard-coded)", () => {
    const { root } = mount(1);
    const buttons = thresholdButtons(root);
    expect(buttons).toHaveLength(4);
    const labels = buttons.map((b) => b.textContent);
    expect(labels).toEqual(["Off", "25%", "50%", "75%"]);
  });

  it("the active button reflects the Engine's default threshold (50%) on mount", () => {
    const { root } = mount(1);
    const active = thresholdButtons(root).filter((b) => b.classList.contains("active"));
    expect(active).toHaveLength(1);
    expect(active[0]?.dataset["threshold"]).toBe("0.5");
  });

  it("highlights a non-default threshold when mounted from a saved Snapshot", () => {
    const engine = createEngine(
      fixtureContent,
      seededRng(1),
      makeSnapshot({
        player: {
          hp: 10,
          maxHp: 10,
          autoEatThreshold: 0.25,
          skills: { hitpoints: { level: 10, xp: xpForLevel(10) } },
        },
      }),
    );
    const root = document.createElement("main");
    mountApp(engine, root, fixtureContent, noopWindowChrome);

    const active = thresholdButtons(root).filter((b) => b.classList.contains("active"));
    expect(active).toHaveLength(1);
    expect(active[0]?.dataset["threshold"]).toBe("0.25");
  });

  it("clicking a threshold updates the active button and calls setAutoEatThreshold on the Engine", () => {
    const { engine, root } = mount(1);
    root.querySelector<HTMLButtonElement>('[data-threshold="0"]')?.click();

    expect(engine.snapshot().player.autoEatThreshold).toBe(0);
    const active = thresholdButtons(root).filter((b) => b.classList.contains("active"));
    expect(active).toHaveLength(1);
    expect(active[0]?.dataset["threshold"]).toBe("0");
  });
});

describe("Auto-sell duplicates toggle (#63)", () => {
  function toggle(root: HTMLElement) {
    return root.querySelector<HTMLInputElement>("#autosell-duplicates-toggle");
  }

  it("reflects the Engine's default (ON) on mount", () => {
    const { root } = mount(1);
    expect(toggle(root)?.checked).toBe(true);
  });

  it("reflects OFF when mounted from a saved Snapshot with the toggle off", () => {
    const engine = createEngine(
      fixtureContent,
      seededRng(1),
      makeSnapshot({
        player: {
          hp: 10,
          maxHp: 10,
          autoSellDuplicates: false,
          skills: { hitpoints: { level: 10, xp: xpForLevel(10) } },
        },
      }),
    );
    const root = document.createElement("main");
    mountApp(engine, root, fixtureContent, noopWindowChrome);

    expect(toggle(root)?.checked).toBe(false);
  });

  it("unchecking the checkbox calls setAutoSellDuplicates(false); re-checking flips it back on", () => {
    const { engine, root } = mount(1);
    const input = toggle(root)!;

    // happy-dom's checkbox .click() doesn't reliably flip .checked before dispatching, so drive
    // the interaction the way a real "uncheck the box" user action lands on the DOM: flip the
    // property, then fire the "change" event the click handler listens for.
    input.checked = false;
    input.dispatchEvent(new Event("change", { bubbles: true }));

    expect(engine.snapshot().player.autoSellDuplicates).toBe(false);
    expect(toggle(root)?.checked).toBe(false);

    input.checked = true;
    input.dispatchEvent(new Event("change", { bubbles: true }));

    expect(engine.snapshot().player.autoSellDuplicates).toBe(true);
    expect(toggle(root)?.checked).toBe(true);
  });
});

describe("XP progress bars", () => {
  it("shows a fill bar at 0% right at a level threshold", () => {
    const engine = createEngine(
      fixtureContent,
      seededRng(1),
      makeSnapshot({
        player: {
          hp: 10,
          maxHp: 10,
          skills: { hitpoints: { level: 10, xp: xpForLevel(10) } },
        },
      }),
    );
    const root = document.createElement("main");
    mountApp(engine, root, fixtureContent, noopWindowChrome);

    const fill = root.querySelector<HTMLElement>('[data-skill="hitpoints"] .skill-bar-fill');
    expect(fill?.style.width).toBe("0%");
  });

  it("shows a fill bar approaching 100% just below the next level threshold", () => {
    const nextFloor = xpForLevel(11);
    const engine = createEngine(
      fixtureContent,
      seededRng(1),
      makeSnapshot({
        player: {
          hp: 10,
          maxHp: 10,
          skills: { hitpoints: { level: 10, xp: nextFloor - 1 } },
        },
      }),
    );
    const root = document.createElement("main");
    mountApp(engine, root, fixtureContent, noopWindowChrome);

    const fill = root.querySelector<HTMLElement>('[data-skill="hitpoints"] .skill-bar-fill');
    expect(fill?.style.width).toBe("99%");
  });

  it("bar fill changes after XP-granting Ticks", () => {
    const { engine, root, app } = mount(7);
    root.querySelector<HTMLButtonElement>('[data-monster="dummy"]')?.click();

    const before = root.querySelector<HTMLElement>('[data-skill="hitpoints"] .skill-bar-fill')
      ?.style.width;

    for (let i = 0; i < 400; i++) engine.tick();
    app.render();

    const after = root.querySelector<HTMLElement>('[data-skill="hitpoints"] .skill-bar-fill')?.style
      .width;
    expect(after).not.toBe(before);
  });

  it("shows exact XP in a tooltip on the Skill chip", () => {
    const { engine, root } = mount(1);
    const xp = Math.floor(engine.snapshot().player.skills.attack.xp);

    const attackSkill = root.querySelector<HTMLElement>('[data-skill="attack"]');
    expect(attackSkill?.title).toBe(`attack: ${xp} xp`);
  });
});

describe("Panel tabs (#62: moved into the RIGHT side panel, closed by default)", () => {
  function tabButtons(root: HTMLElement) {
    return [...root.querySelectorAll<HTMLButtonElement>("#tab-row button")];
  }

  it("renders one tab per panel — Skills, Character, Bank, Vendor, Smithing, Cooking, Crafting, Herblore, Loot Feed — none active and the right panel closed by default", () => {
    const { root } = mount(1);
    const buttons = tabButtons(root);
    expect(buttons.map((b) => b.textContent)).toEqual([
      "Skills",
      "Character",
      "Bank",
      "Vendor",
      "Smithing",
      "Cooking",
      "Crafting",
      "Herblore",
      "Loot Feed",
    ]);

    expect(buttons.filter((b) => b.classList.contains("active"))).toHaveLength(0);
    expect(root.querySelector<HTMLElement>("#right-panel")?.hidden).toBe(true);
  });

  it("every tab panel's content is absent from view (right panel hidden) on a fresh mount", () => {
    const { root } = mount(1);
    for (const tab of ["skills", "character", "bank", "smithing", "cooking", "crafting", "loot"]) {
      expect(root.querySelector<HTMLElement>(`[data-tab-panel="${tab}"]`)?.hidden).toBe(true);
    }
  });

  it("clicking an inactive tab opens the right panel showing it and highlights the tab", () => {
    const { root } = mount(1);
    root.querySelector<HTMLButtonElement>('[data-tab="character"]')?.click();

    expect(root.querySelector<HTMLElement>("#right-panel")?.hidden).toBe(false);
    expect(root.querySelector<HTMLElement>('[data-tab-panel="character"]')?.hidden).toBe(false);
    expect(root.querySelector<HTMLElement>('[data-tab-panel="loot"]')?.hidden).toBe(true);
    expect(root.querySelector<HTMLElement>('[data-tab-panel="bank"]')?.hidden).toBe(true);

    const active = tabButtons(root).filter((b) => b.classList.contains("active"));
    expect(active).toHaveLength(1);
    expect(active[0]?.dataset["tab"]).toBe("character");
  });

  it("clicking the active tab again closes the right panel", () => {
    const { root } = mount(1);
    root.querySelector<HTMLButtonElement>('[data-tab="bank"]')?.click();
    expect(root.querySelector<HTMLElement>("#right-panel")?.hidden).toBe(false);

    root.querySelector<HTMLButtonElement>('[data-tab="bank"]')?.click();

    expect(root.querySelector<HTMLElement>("#right-panel")?.hidden).toBe(true);
    expect(tabButtons(root).filter((b) => b.classList.contains("active"))).toHaveLength(0);
  });

  it("clicking a different tab switches the open panel instead of opening a second one", () => {
    const { root } = mount(1);
    root.querySelector<HTMLButtonElement>('[data-tab="bank"]')?.click();
    root.querySelector<HTMLButtonElement>('[data-tab="smithing"]')?.click();

    expect(root.querySelector<HTMLElement>("#right-panel")?.hidden).toBe(false);
    expect(root.querySelector<HTMLElement>('[data-tab-panel="smithing"]')?.hidden).toBe(false);
    expect(root.querySelector<HTMLElement>('[data-tab-panel="bank"]')?.hidden).toBe(true);
    const active = tabButtons(root).filter((b) => b.classList.contains("active"));
    expect(active).toHaveLength(1);
    expect(active[0]?.dataset["tab"]).toBe("smithing");
  });

  it("the active tab persists visually across re-renders", () => {
    const { engine, root, app } = mount(1);
    root.querySelector<HTMLButtonElement>('[data-tab="bank"]')?.click();

    engine.tick();
    app.render();

    expect(root.querySelector<HTMLElement>('[data-tab-panel="bank"]')?.hidden).toBe(false);
    const active = tabButtons(root).filter((b) => b.classList.contains("active"));
    expect(active[0]?.dataset["tab"]).toBe("bank");
  });

  it("existing panel content (Character, Bank, Loot Feed) still renders inside its tab panel", () => {
    const { root } = mount(1);
    expect(root.querySelector("#character-slots")).not.toBeNull();
    expect(root.querySelector("#bank")).not.toBeNull();
    expect(root.querySelector("#feed")).not.toBeNull();
  });

  it("the gold chip moved to the main column, outside any tab panel", () => {
    const { root } = mount(1);
    const gold = root.querySelector("#gold");
    expect(gold).not.toBeNull();
    expect(gold?.closest("#main-column")).not.toBeNull();
    expect(gold?.closest("[data-tab-panel]")).toBeNull();
  });
});

describe("Workspace cards (#138: LEFT Areas arrow + RIGHT tab strip open floating cards)", () => {
  function spyWindowChrome() {
    const calls: number[] = [];
    const chrome: WorkspaceChrome = {
      getCapacity: () => Promise.resolve(3),
      setCardCount: (count) => {
        calls.push(count);
      },
    };
    return { chrome, calls };
  }

  function mountWithChrome(chrome: WorkspaceChrome) {
    const engine = createEngine(fixtureContent, seededRng(1));
    const root = document.createElement("main");
    const app = mountApp(engine, root, fixtureContent, chrome);
    return { engine, root, app };
  }

  it("both panels are closed on a fresh mount", () => {
    const { root } = mountWithChrome(noopWindowChrome);
    expect(root.querySelector<HTMLElement>("#left-panel")?.hidden).toBe(true);
    expect(root.querySelector<HTMLElement>("#right-panel")?.hidden).toBe(true);
  });

  it("boot sync requests zero cards exactly once when both panels start closed (#151 §3/§6)", () => {
    const { chrome, calls } = spyWindowChrome();
    mountWithChrome(chrome);
    expect(calls).toEqual([0]);
  });

  it("the left arrow toggles the Areas card and reports the open-card count", () => {
    const { chrome, calls } = spyWindowChrome();
    const { root } = mountWithChrome(chrome);
    calls.length = 0; // ignore the initial mount call

    root.querySelector<HTMLButtonElement>("#left-arrow")?.click();
    expect(root.querySelector<HTMLElement>("#left-panel")?.hidden).toBe(false);
    expect(calls).toEqual([1]);

    root.querySelector<HTMLButtonElement>("#left-arrow")?.click();
    expect(root.querySelector<HTMLElement>("#left-panel")?.hidden).toBe(true);
    expect(calls).toEqual([1, 0]);
  });

  it("opening a right tab reports one card; re-clicking it reports zero", () => {
    const { chrome, calls } = spyWindowChrome();
    const { root } = mountWithChrome(chrome);
    calls.length = 0;

    root.querySelector<HTMLButtonElement>('[data-tab="bank"]')?.click();
    expect(calls).toEqual([1]);

    root.querySelector<HTMLButtonElement>('[data-tab="bank"]')?.click();
    expect(calls).toEqual([1, 0]);
  });

  it("both sides can be open at once, and the count reflects them together", () => {
    const { chrome, calls } = spyWindowChrome();
    const { root } = mountWithChrome(chrome);
    calls.length = 0;

    root.querySelector<HTMLButtonElement>("#left-arrow")?.click();
    root.querySelector<HTMLButtonElement>('[data-tab="skills"]')?.click();

    expect(root.querySelector<HTMLElement>("#left-panel")?.hidden).toBe(false);
    expect(root.querySelector<HTMLElement>("#right-panel")?.hidden).toBe(false);
    expect(calls).toEqual([1, 2]);

    // Closing the left side leaves the right card open (count back to one).
    root.querySelector<HTMLButtonElement>("#left-arrow")?.click();
    expect(calls[calls.length - 1]).toBe(1);
    expect(root.querySelector<HTMLElement>("#right-panel")?.hidden).toBe(false);
  });

  it("the picker, XP row, and style/auto-eat controls still work from their new homes", () => {
    const { engine, root } = mountWithChrome(noopWindowChrome);
    root.querySelector<HTMLButtonElement>("#left-arrow")?.click(); // open Areas
    root.querySelector<HTMLButtonElement>('[data-monster="dummy"]')?.click();
    expect(engine.snapshot().monster?.id).toBe("dummy");
    expect(root.querySelector("#monster-name")?.textContent).toBe("Training Dummy");

    root.querySelector<HTMLButtonElement>('[data-tab="character"]')?.click(); // open Character
    root.querySelector<HTMLButtonElement>('[data-style="accurate"]')?.click();
    expect(engine.snapshot().player.combatStyle).toBe("accurate");
    root.querySelector<HTMLButtonElement>('[data-threshold="0"]')?.click();
    expect(engine.snapshot().player.autoEatThreshold).toBe(0);

    root.querySelector<HTMLButtonElement>('[data-tab="skills"]')?.click(); // open Skills
    expect(root.querySelector('[data-skill="attack"]')).not.toBeNull();
  });

  it("legacy panel state never reopens cards on remount and never touches the Snapshot/save", () => {
    vi.stubGlobal("localStorage", stubLocalStorage());
    try {
      const { chrome: chrome1 } = spyWindowChrome();
      const { engine, root } = mountWithChrome(chrome1);
      root.querySelector<HTMLButtonElement>("#left-arrow")?.click();
      root.querySelector<HTMLButtonElement>('[data-tab="bank"]')?.click();

      const raw = localStorage.getItem("sidescape-ui-panels");
      expect(raw).not.toBeNull();
      expect(JSON.parse(raw as string)).toEqual({ left: true, tab: "bank" });
      expect(JSON.stringify(engine.snapshot())).not.toMatch(/panel/i);

      const { chrome: chrome2, calls: calls2 } = spyWindowChrome();
      const root2 = document.createElement("main");
      mountApp(engine, root2, fixtureContent, chrome2);

      expect(root2.querySelector<HTMLElement>("#left-panel")?.hidden).toBe(true);
      expect(root2.querySelector<HTMLElement>("#right-panel")?.hidden).toBe(true);
      expect(calls2).toEqual([0]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("Vertical cards-on-glass composition (#151 §1/§2)", () => {
  it("builds one transparent union (#app) with the management row and the opaque compact widget as siblings", () => {
    const { root } = mount(1);
    const managementRow = root.querySelector<HTMLElement>("#management-row");
    const compact = root.querySelector<HTMLElement>("#compact-widget");
    expect(managementRow).not.toBeNull();
    expect(compact).not.toBeNull();
    expect(managementRow?.parentElement).toBe(root); // #app
    expect(compact?.parentElement).toBe(root);
    // Default DOM order (bottom / no anchor) keeps the management row before the compact widget;
    // CSS `order` flips it for a "top" anchor.
    const relation = managementRow!.compareDocumentPosition(compact!);
    expect(relation & Node.DOCUMENT_POSITION_FOLLOWING).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("nests the titlebar and its export/import/mute/close controls inside the compact widget card", () => {
    const { root } = mount(1);
    const compact = root.querySelector<HTMLElement>("#compact-widget");
    expect(root.querySelector("#titlebar")?.closest("#compact-widget")).toBe(compact);
    for (const id of ["#export-save", "#import-save", "#mute-toggle", "#close-btn"]) {
      expect(root.querySelector(id)?.closest("#compact-widget")).toBe(compact);
    }
    // No opaque shell wraps the union any more — the old #compact-widget-shell is gone.
    expect(root.querySelector("#compact-widget-shell")).toBeNull();
  });

  it("collapses the management row while both cards are closed, and reveals it once one opens", () => {
    const { root } = mount(1);
    expect(root.querySelector<HTMLElement>("#management-row")?.hidden).toBe(true);
    root.querySelector<HTMLButtonElement>('[data-tab="bank"]')?.click();
    expect(root.querySelector<HTMLElement>("#management-row")?.hidden).toBe(false);
    root.querySelector<HTMLButtonElement>('[data-tab="bank"]')?.click();
    expect(root.querySelector<HTMLElement>("#management-row")?.hidden).toBe(true);
  });
});

describe("Cards on glass — close interactions and drag regions (#138 §4/§5, #151 §6)", () => {
  it("clicking the transparent glass (document.body itself) closes every open card", () => {
    const engine = createEngine(fixtureContent, seededRng(1));
    // Mount into document.body so the body-level glass-click handler has a real body to fire on.
    document.body.innerHTML = "";
    const root = document.createElement("main");
    document.body.appendChild(root);
    try {
      mountApp(engine, root, fixtureContent, noopWindowChrome);
      root.querySelector<HTMLButtonElement>("#left-arrow")?.click();
      root.querySelector<HTMLButtonElement>('[data-tab="bank"]')?.click();
      expect(root.querySelector<HTMLElement>("#left-panel")?.hidden).toBe(false);
      expect(root.querySelector<HTMLElement>("#right-panel")?.hidden).toBe(false);

      document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }));

      expect(root.querySelector<HTMLElement>("#left-panel")?.hidden).toBe(true);
      expect(root.querySelector<HTMLElement>("#right-panel")?.hidden).toBe(true);
    } finally {
      document.body.innerHTML = "";
    }
  });

  it("a card's own close button closes only that card, leaving the other open", () => {
    const { root } = mount(1);
    root.querySelector<HTMLButtonElement>("#left-arrow")?.click();
    root.querySelector<HTMLButtonElement>('[data-tab="bank"]')?.click();
    expect(root.querySelector<HTMLElement>("#left-panel")?.hidden).toBe(false);
    expect(root.querySelector<HTMLElement>("#right-panel")?.hidden).toBe(false);

    root.querySelector<HTMLButtonElement>("[data-close-right]")?.click();
    expect(root.querySelector<HTMLElement>("#right-panel")?.hidden).toBe(true);
    expect(root.querySelector<HTMLElement>("#left-panel")?.hidden).toBe(false); // still open

    root.querySelector<HTMLButtonElement>("[data-close-left]")?.click();
    expect(root.querySelector<HTMLElement>("#left-panel")?.hidden).toBe(true);
  });

  it("card headers are Tauri drag regions but their close buttons are not", () => {
    const { root } = mount(1);
    for (const id of ["#left-panel", "#right-panel"]) {
      const header = root.querySelector<HTMLElement>(`${id} .management-card-header`);
      expect(header?.hasAttribute("data-tauri-drag-region")).toBe(true);
      const closeBtn = header?.querySelector<HTMLElement>(".card-close");
      expect(closeBtn).not.toBeNull();
      expect(closeBtn?.hasAttribute("data-tauri-drag-region")).toBe(false);
    }
  });

  it("opening, switching, and closing cards never mutates the Engine's Snapshot (presentation-only)", () => {
    const { engine, root } = mount(1);
    // `savedAt` is re-stamped on every snapshot() call, so drop it before comparing state.
    const stateOf = () => {
      const { savedAt: _savedAt, ...rest } = engine.snapshot();
      return JSON.stringify(rest);
    };
    const before = stateOf();

    root.querySelector<HTMLButtonElement>("#left-arrow")?.click();
    root.querySelector<HTMLButtonElement>('[data-tab="bank"]')?.click();
    root.querySelector<HTMLButtonElement>('[data-tab="character"]')?.click(); // switch tabs
    root.querySelector<HTMLButtonElement>("[data-close-left]")?.click();
    root.querySelector<HTMLButtonElement>("[data-close-right]")?.click();

    expect(stateOf()).toBe(before);
  });
});

describe("Event ticker (#62 amendment): a one-line heartbeat of the most recent feed event", () => {
  it("updates on every feedLine call, matching the newest #feed li exactly", () => {
    const { engine, root } = mount(1);
    root.querySelector<HTMLButtonElement>('[data-monster="dummy"]')?.click();

    for (let i = 0; i < 2000; i++) {
      engine.tick();
      if (root.querySelector("#feed li")) break;
    }

    const latestFeedLine = root.querySelector<HTMLLIElement>("#feed li");
    const ticker = root.querySelector<HTMLElement>("#ticker");
    expect(latestFeedLine).not.toBeNull();
    expect(ticker?.textContent).toBe(latestFeedLine?.textContent);
    expect(ticker?.className).toBe(latestFeedLine?.className);
  });

  it("does not replace the Loot Feed panel — both the ticker and the full #feed list keep updating", () => {
    const { engine, root } = mount(1);
    root.querySelector<HTMLButtonElement>('[data-monster="dummy"]')?.click();

    for (let i = 0; i < 5000 && root.querySelectorAll("#feed li").length < 2; i++) engine.tick();

    expect(root.querySelectorAll("#feed li").length).toBeGreaterThanOrEqual(2);
    expect(root.querySelector<HTMLElement>("#ticker")?.textContent).toBe(
      root.querySelector<HTMLLIElement>("#feed li")?.textContent,
    );
  });

  it("carries rare-Drop band styling (drop-rare) through to the ticker", () => {
    const rareDropContent = {
      ...fixtureContent,
      monsters: fixtureContent.monsters.map((m) =>
        m.id === "dummy"
          ? {
              ...m,
              dropTable: [{ itemId: "lucky-charm", qty: 1, chance: 1, band: "rare" as const }],
            }
          : m,
      ),
    };
    const engine = createEngine(rareDropContent, seededRng(1));
    const root = document.createElement("main");
    mountApp(engine, root, rareDropContent, noopWindowChrome);
    root.querySelector<HTMLButtonElement>('[data-monster="dummy"]')?.click();

    for (let i = 0; i < 2000 && engine.snapshot().lootZone.length === 0; i++) engine.tick();

    expect(root.querySelector<HTMLElement>("#ticker")?.className).toBe("drop-rare");
    expect(root.querySelector<HTMLElement>("#ticker")?.textContent).toMatch(/lucky charm/i);
  });
});

describe("Bank", () => {
  function bankMount(overrides: Parameters<typeof makeSnapshot>[0] = {}) {
    const engine = createEngine(fixtureContent, seededRng(1), makeSnapshot(overrides));
    const root = document.createElement("main");
    const app = mountApp(engine, root, fixtureContent, noopWindowChrome);
    root.querySelector<HTMLButtonElement>('[data-tab="bank"]')?.click();
    return { engine, root, app };
  }

  it("shows the Bank header as used/capacity and the next slot price on the buy button", () => {
    const { root } = bankMount({
      bank: { items: [{ itemId: "meat", qty: 5 }], capacity: 100 },
    });
    expect(root.querySelector("#bank-header")?.textContent).toBe("Bank 1/100");
    expect(root.querySelector("#buy-slots-btn")?.textContent).toBe("Buy +10 slots (1000g)");
  });

  it("disables the buy-slots button when gold is short of the price, enables it when affordable", () => {
    const short = bankMount({ player: { gold: 500 } });
    expect(short.root.querySelector<HTMLButtonElement>("#buy-slots-btn")?.disabled).toBe(true);

    const flush = bankMount({ player: { gold: 1000 } });
    expect(flush.root.querySelector<HTMLButtonElement>("#buy-slots-btn")?.disabled).toBe(false);
  });

  it("clicking Buy +10 slots grows capacity, debits gold, updates the header/price, and logs a feed line", () => {
    const { engine, root } = bankMount({ player: { gold: 1000 } });
    root.querySelector<HTMLButtonElement>("#buy-slots-btn")?.click();

    expect(engine.snapshot().bank.capacity).toBe(110);
    expect(engine.snapshot().player.gold).toBe(0);
    expect(root.querySelector("#bank-header")?.textContent).toBe("Bank 0/110");
    expect(root.querySelector("#buy-slots-btn")?.textContent).toBe("Buy +10 slots (1500g)");
    expect(root.querySelector("#feed li")?.textContent).toMatch(/bank expanded to 110 slots/i);
  });

  it("clicking Equip on a Bank row moves the item into its Gear Slot and logs a feed line", () => {
    const { engine, root } = bankMount({
      bank: { items: [{ itemId: "bronze-sword", qty: 1 }] },
    });

    selectBankTile(root, "bronze-sword");
    const equipBtn = root.querySelector<HTMLButtonElement>(
      '#bank-detail [data-equip="bronze-sword"]',
    );
    expect(equipBtn).not.toBeNull();
    equipBtn?.click();

    expect(engine.snapshot().player.equipment.weapon).toBe("bronze-sword");
    expect(engine.snapshot().bank.items).toEqual([]);
    expect(root.querySelector("#feed li")?.textContent).toMatch(/equipped.*bronze sword/i);
  });

  it("an Equip button is only shown on equipment rows, not food or material rows", () => {
    const { root } = bankMount({
      bank: {
        items: [
          { itemId: "meat", qty: 1 },
          { itemId: "bar", qty: 1 },
        ],
      },
    });
    selectBankTile(root, "meat");
    expect(root.querySelector("#bank-detail [data-equip]")).toBeNull();
    selectBankTile(root, "bar");
    expect(root.querySelector("#bank-detail [data-equip]")).toBeNull();
  });

  it("clicking a Food tile in the Bank (not the Equip/Sell buttons) does nothing — Food is eaten from the Food Slot bar, not the Bank (#61)", () => {
    const { engine, root } = bankMount({
      player: { hp: 5, maxHp: 10, skills: { hitpoints: { level: 10, xp: xpForLevel(10) } } },
      bank: { items: [{ itemId: "meat", qty: 3 }] },
    });

    selectBankTile(root, "meat"); // selecting a tile only opens the detail strip (#78)

    expect(engine.snapshot().player.hp).toBe(5);
    expect(engine.snapshot().bank.items).toEqual([{ itemId: "meat", qty: 3 }]);
    expect(root.querySelector("#feed li")).toBeNull();
  });

  it("logs an overflow-sold feed line when a sellable combat Drop can't fit a full Loot Zone (#60 — kill Drops overflow the zone, not the Bank)", () => {
    // Extend fixtureContent with junk Material items purely to pre-fill all 10 Loot Zone stacks
    // with items that are NOT among dummy's own Drop Table entries (meat/bronze-sword/lucky-charm),
    // so the next one of those to land is a genuine 11th stack.
    const content = {
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
    const engine = createEngine(
      content,
      seededRng(1),
      makeSnapshot({
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
      }),
    );
    const root = document.createElement("main");
    mountApp(engine, root, content, noopWindowChrome);
    root.querySelector<HTMLButtonElement>('[data-monster="dummy"]')?.click();

    let sold = false;
    engine.on("overflow-sold", () => {
      sold = true;
    });
    for (let i = 0; i < 20_000 && !sold; i++) engine.tick();
    expect(sold).toBe(true);

    expect(root.querySelector("#feed li")?.textContent).toMatch(/bank full.*sold/i);
  });

  it("logs an overflow-lost feed line when an unsellable passive arrival can't fit a full Bank", () => {
    const noValueContent = {
      ...fixtureContent,
      items: fixtureContent.items.map((i) => {
        if (i.id !== "raw-fish" || i.kind === "currency") return i;
        const { value: _value, ...rest } = i;
        return rest;
      }),
    };
    const engine = createEngine(
      noValueContent,
      seededRng(1),
      makeSnapshot({
        player: { skills: { fishing: { level: 1, xp: 0 } } },
        bank: { items: [{ itemId: "bar", qty: 1 }], capacity: 1 },
      }),
    );
    const root = document.createElement("main");
    mountApp(engine, root, noValueContent, noopWindowChrome);
    engine.selectFishingSpot("pond"); // catchChance 1, always catches "raw-fish"

    for (let i = 0; i < 3; i++) engine.tick(); // catchTicks === 3: exactly one Catch lands

    expect(root.querySelector("#feed li")?.textContent).toMatch(/bank full.*lost/i);
  });

  it("logs a duplicate-sold feed line when a repeat Equipment Drop is auto-sold (#63)", () => {
    const guaranteedSwordDropContent = {
      ...fixtureContent,
      monsters: fixtureContent.monsters.map((m) =>
        m.id === "dummy"
          ? {
              ...m,
              dropTable: [{ itemId: "bronze-sword", qty: 1, chance: 1, band: "uncommon" as const }],
            }
          : m,
      ),
    };
    const engine = createEngine(
      guaranteedSwordDropContent,
      seededRng(7),
      makeSnapshot({ bank: { items: [{ itemId: "bronze-sword", qty: 1 }] } }),
    );
    const root = document.createElement("main");
    mountApp(engine, root, guaranteedSwordDropContent, noopWindowChrome);
    engine.selectMonster("dummy");

    let killed = false;
    engine.on("kill", () => {
      killed = true;
    });
    for (let i = 0; i < 5000 && !killed; i++) engine.tick();
    expect(killed).toBe(true);

    expect(root.querySelector("#feed li")?.textContent).toMatch(
      /auto-sold duplicate bronze sword \(\+20g\)/i,
    );
  });
});

describe("Food Slot bar (#61)", () => {
  function foodMount(overrides: Parameters<typeof makeSnapshot>[0] = {}) {
    const engine = createEngine(fixtureContent, seededRng(1), makeSnapshot(overrides));
    const root = document.createElement("main");
    const app = mountApp(engine, root, fixtureContent, noopWindowChrome);
    return { engine, root, app };
  }

  it("an empty slot shows a [+] that opens a chooser listing only the Bank's Food stacks", () => {
    const { root } = foodMount({
      bank: {
        items: [
          { itemId: "meat", qty: 5 },
          { itemId: "bread", qty: 2 },
          { itemId: "bar", qty: 1 }, // a Material — must never show up as a Food choice
        ],
      },
    });
    expect(root.querySelector('[data-add="0"]')).not.toBeNull();
    expect(root.querySelector(".food-slot-chooser")).toBeNull(); // closed by default

    root.querySelector<HTMLButtonElement>('[data-add="0"]')?.click();

    const chooser = root.querySelector(".food-slot-chooser");
    expect(chooser).not.toBeNull();
    expect(chooser?.querySelector('[data-assign="0"][data-item="meat"]')).not.toBeNull();
    expect(chooser?.querySelector('[data-assign="0"][data-item="bread"]')).not.toBeNull();
    expect(chooser?.querySelector('[data-item="bar"]')).toBeNull();
  });

  it("an empty slot's chooser shows a hint when the Bank has no Food at all", () => {
    const { root } = foodMount();
    root.querySelector<HTMLButtonElement>('[data-add="0"]')?.click();
    expect(root.querySelector(".food-slot-chooser .hint")?.textContent).toMatch(/no food/i);
  });

  it("re-clicking the same [+] dismisses the chooser without assigning", () => {
    const { root } = foodMount({ bank: { items: [{ itemId: "meat", qty: 5 }] } });
    root.querySelector<HTMLButtonElement>('[data-add="0"]')?.click();
    expect(root.querySelector(".food-slot-chooser")).not.toBeNull();

    root.querySelector<HTMLButtonElement>('[data-add="0"]')?.click();
    expect(root.querySelector(".food-slot-chooser")).toBeNull();
  });

  it("picking a Food from the chooser assigns it (moving the whole Bank stock) and closes the chooser", () => {
    const { engine, root } = foodMount({ bank: { items: [{ itemId: "meat", qty: 5 }] } });
    root.querySelector<HTMLButtonElement>('[data-add="0"]')?.click();
    root.querySelector<HTMLButtonElement>('[data-assign="0"][data-item="meat"]')?.click();

    expect(engine.snapshot().player.foodSlots[0]).toEqual({ itemId: "meat", qty: 5 });
    expect(engine.snapshot().bank.items).toEqual([]);
    expect(root.querySelector(".food-slot-chooser")).toBeNull(); // closed after picking
    const eatTile = root.querySelector<HTMLElement>('[data-eat="0"]');
    expect(eatTile?.dataset["item"]).toBe("meat"); // #78: icon + qty tile, not a text row
    expect(eatTile?.querySelector("img")?.alt).toBe("Cooked Meat");
    expect(eatTile?.querySelector(".tile-qty")?.textContent).toBe("×5");
  });

  it("clicking a filled slot eats one and logs a feed line", () => {
    const { engine, root } = foodMount({
      player: {
        hp: 5,
        maxHp: 10,
        skills: { hitpoints: { level: 10, xp: xpForLevel(10) } },
        foodSlots: [{ itemId: "meat", qty: 3 }, null, null],
      },
    });

    root.querySelector<HTMLButtonElement>('[data-eat="0"]')?.click();

    expect(engine.snapshot().player.hp).toBeGreaterThan(5);
    expect(engine.snapshot().player.foodSlots[0]).toEqual({ itemId: "meat", qty: 2 });
    expect(root.querySelector("#feed li")?.textContent).toMatch(/ate.*meat/i);
  });

  it("clicking ✕ unassigns the slot, returning its stock to the Bank", () => {
    const { engine, root } = foodMount({
      player: { foodSlots: [{ itemId: "meat", qty: 3 }, null, null] },
    });

    root.querySelector<HTMLButtonElement>('[data-unassign="0"]')?.click();

    expect(engine.snapshot().player.foodSlots[0]).toBeNull();
    expect(engine.snapshot().bank.items).toEqual([{ itemId: "meat", qty: 3 }]);
    expect(root.querySelector('[data-add="0"]')).not.toBeNull(); // now renders as empty
  });

  it("dispatch order: clicking ✕ on a filled slot unassigns only, never also eats", () => {
    const { engine, root } = foodMount({
      player: {
        hp: 5,
        maxHp: 10,
        skills: { hitpoints: { level: 10, xp: xpForLevel(10) } },
        foodSlots: [{ itemId: "meat", qty: 3 }, null, null],
      },
    });

    root.querySelector<HTMLButtonElement>('[data-unassign="0"]')?.click();

    expect(engine.snapshot().player.hp).toBe(5); // not eaten
    expect(engine.snapshot().bank.items).toEqual([{ itemId: "meat", qty: 3 }]); // full stock back
  });
});

describe("Loot strip (#60)", () => {
  it("is hidden when the Loot Zone is empty, on a fresh mount", () => {
    const { root } = mount(1);
    expect(root.querySelector<HTMLElement>("#loot-strip")?.hidden).toBe(true);
  });

  it("renders zone stacks as chips and shows the strip once combat Drops land in the zone", () => {
    const { engine, root, app } = mount(1);
    root.querySelector<HTMLButtonElement>('[data-monster="dummy"]')?.click();

    for (let i = 0; i < 2000 && engine.snapshot().lootZone.length === 0; i++) engine.tick();
    app.render();

    expect(root.querySelector<HTMLElement>("#loot-strip")?.hidden).toBe(false);
    const chip = root.querySelector<HTMLLIElement>("#loot-strip-items .loot-chip");
    expect(chip).not.toBeNull();
    const zoneEntry = engine.snapshot().lootZone[0]!;
    expect(chip?.textContent).toContain(`×${zoneEntry.qty}`);
  });

  it("clicking Loot all sweeps the zone into the Bank, hides the strip, and logs a Banked feed line", () => {
    const engine = createEngine(
      fixtureContent,
      seededRng(1),
      makeSnapshot({ lootZone: [{ itemId: "meat", qty: 3 }] }),
    );
    const root = document.createElement("main");
    mountApp(engine, root, fixtureContent, noopWindowChrome);
    expect(root.querySelector<HTMLElement>("#loot-strip")?.hidden).toBe(false);

    root.querySelector<HTMLButtonElement>("#loot-all-btn")?.click();

    expect(engine.snapshot().lootZone).toEqual([]);
    expect(engine.snapshot().bank.items).toEqual([{ itemId: "meat", qty: 3 }]);
    expect(root.querySelector<HTMLElement>("#loot-strip")?.hidden).toBe(true);
    expect(root.querySelector("#feed li")?.textContent).toMatch(/banked.*meat/i);
  });

  it("a sweep that leaves a stack behind (full Bank) logs a 'Bank full — loot left behind' feed line and keeps the strip visible", () => {
    const engine = createEngine(
      fixtureContent,
      seededRng(1),
      makeSnapshot({
        bank: { items: [{ itemId: "bar", qty: 1 }], capacity: 1 },
        lootZone: [{ itemId: "meat", qty: 3 }],
      }),
    );
    const root = document.createElement("main");
    mountApp(engine, root, fixtureContent, noopWindowChrome);

    root.querySelector<HTMLButtonElement>("#loot-all-btn")?.click();

    expect(engine.snapshot().lootZone).toEqual([{ itemId: "meat", qty: 3 }]); // couldn't fit
    expect(root.querySelector<HTMLElement>("#loot-strip")?.hidden).toBe(false);
    expect(root.querySelector("#feed li")?.textContent).toMatch(/bank full.*left behind/i);
  });

  it("logs a 'Run failed — loot lost!' feed line (plus the lost stacks) on dungeon-failed", () => {
    const lethalDungeonContent = {
      ...fixtureContent,
      monsters: fixtureContent.monsters.map((m) =>
        m.id === "dummy" ? { ...m, attackLevel: 99, maxHit: 20, attackSpeed: 1 } : m,
      ),
    };
    const engine = createEngine(
      lethalDungeonContent,
      seededRng(42),
      makeSnapshot({ lootZone: [{ itemId: "meat", qty: 2 }] }),
    );
    const root = document.createElement("main");
    mountApp(engine, root, lethalDungeonContent, noopWindowChrome);
    // enterDungeon sweeps first (#60), banking the seeded stack, so the run itself starts empty —
    // this only needs to prove the dungeon-failed feed line fires, not that it carries real loot
    // (that's covered at the Engine level in core/engine.test.ts).
    engine.enterDungeon("gauntlet");

    let died = false;
    engine.on("death", () => {
      died = true;
    });
    for (let i = 0; i < 5000 && !died; i++) engine.tick();

    expect(died).toBe(true);
    const feedTexts = [...root.querySelectorAll("#feed li")].map((li) => li.textContent);
    expect(feedTexts.some((t) => /run failed.*loot lost/i.test(t ?? ""))).toBe(true);
  });
});

describe("Fishing", () => {
  it("renders a 🎣 Fishing Spot button under each Area, disabled when locked", () => {
    const { root } = mount(1);
    const pondBtn = root.querySelector<HTMLButtonElement>('[data-spot="pond"]');
    const deepPondBtn = root.querySelector<HTMLButtonElement>('[data-spot="deep-pond"]');
    expect(pondBtn?.textContent).toBe("🎣 Test Pond");
    expect(pondBtn?.disabled).toBe(false);
    expect(deepPondBtn?.disabled).toBe(true); // behind the Test Crypt's Dungeon-completion gate
  });

  it("XP row shows all 11 chips, including a FIS chip for Fishing", () => {
    const { root } = mount(1);
    const abbrs = [...root.querySelectorAll(".skill-abbr")].map((el) => el.textContent);
    expect(abbrs).toEqual([
      "ATT",
      "STR",
      "DEF",
      "HIT",
      "FIS",
      "SMI",
      "RAN",
      "MAG",
      "COO",
      "CRA",
      "HER",
    ]);
  });

  it("selecting a Fishing Spot shows the fishing scene, hiding the Monster HP bar and sprite", () => {
    const { root } = mount(1);
    root.querySelector<HTMLButtonElement>('[data-spot="pond"]')?.click();

    expect(root.querySelector("#monster-name")?.textContent).toBe("🎣 Fishing at Test Pond");
    expect((root.querySelector("#monster-bar") as HTMLElement).hidden).toBe(true);
    expect((root.querySelector("#monster-sprite") as HTMLElement).hidden).toBe(true);
  });

  it("selecting a Monster afterwards restores the normal combat scene", () => {
    const { root } = mount(1);
    root.querySelector<HTMLButtonElement>('[data-spot="pond"]')?.click();
    root.querySelector<HTMLButtonElement>('[data-monster="dummy"]')?.click();

    expect(root.querySelector("#monster-name")?.textContent).toBe("Training Dummy");
    expect((root.querySelector("#monster-bar") as HTMLElement).hidden).toBe(false);
  });

  it("logs a feed line when a Catch lands and grants Fishing XP (fixture pond has catchChance 1)", () => {
    const { engine, root, app } = mount(1);
    root.querySelector<HTMLButtonElement>('[data-spot="pond"]')?.click();

    for (let i = 0; i < 3; i++) engine.tick(); // pond.catchTicks === 3
    app.render();

    // #115: pond now catches "raw-fish", a Material — never "meat" (Food) directly.
    expect(root.querySelector("#feed li")?.textContent).toMatch(/caught.*raw fish/i);
    expect(engine.snapshot().player.skills.fishing.xp).toBeGreaterThan(0);
    expect(engine.snapshot().bank.items.find((s) => s.itemId === "raw-fish")?.qty).toBe(1);
  });

  it("picker still rebuilds on levelup: Fishing-Spot levelReq gates are level-driven, independent of dungeon-completed", () => {
    const engine = createEngine(
      fixtureContent,
      seededRng(1),
      makeSnapshot({
        player: {
          completedDungeonIds: ["gauntlet"], // Crypt Area gate already open
          skills: { fishing: { level: 19, xp: xpForLevel(20) - 5 } }, // one Catch from level 20
        },
      }),
    );
    const root = document.createElement("main");
    mountApp(engine, root, fixtureContent, noopWindowChrome);

    const deepPondBefore = root.querySelector<HTMLButtonElement>('[data-spot="deep-pond"]');
    expect(deepPondBefore?.disabled).toBe(true); // Area open, but Fishing level 19 < levelReq 20

    engine.selectFishingSpot("pond"); // pond: catchChance 1, xp 10 per Catch (fixtureContent)
    for (let i = 0; i < 3; i++) engine.tick(); // pond.catchTicks === 3: exactly one Catch lands
    expect(engine.snapshot().player.skills.fishing.level).toBe(20);

    // buildPicker runs off the levelup event itself — no explicit render() call here.
    const deepPondAfter = root.querySelector<HTMLButtonElement>('[data-spot="deep-pond"]');
    expect(deepPondAfter?.disabled).toBe(false);
  });
});

describe("Character panel (#26)", () => {
  it("shows an empty tile (no data-item) for every empty Gear Slot on a fresh engine", () => {
    const { root } = mount(1);
    // amulet/ring (#117, Crafting's jewelry line) appended after legs.
    for (const slot of ["weapon", "shield", "head", "body", "legs", "amulet", "ring"]) {
      const tile = root.querySelector<HTMLElement>(`[data-slot="${slot}"]`);
      expect(tile?.classList.contains("tile-empty")).toBe(true);
      expect(tile?.dataset["item"]).toBeUndefined();
    }
  });

  // Compact defence-vector readout (#99): every Attack Type at bonus 0.
  const ZERO_DEF_VECTOR = "st 0 · sl 0 · cr 0 · rn 0 · mg 0";

  it("shows the totals row at all zero with the unarmed attack speed (4t) when nothing is equipped", () => {
    const { root } = mount(1);
    expect(root.querySelector("#character-totals")?.textContent).toBe(
      `+0 atk +0 str ${ZERO_DEF_VECTOR} spd 4t`,
    );
  });

  // #78 moved a filled slot's own stats off the always-visible row and onto the shared
  // #item-tooltip hover panel — #99's defence-vector readout is folded in there, not deleted.
  it("shows a weapon's own attack type, atk/str/speed and defence vector on hover", () => {
    const { engine, root, app } = mount(1);
    engine.selectMonster("dummy");
    grindFor(engine, "bronze-sword");
    engine.equip("bronze-sword");
    app.render();

    const weaponTile = root.querySelector<HTMLElement>('[data-slot="weapon"]');
    expect(weaponTile?.dataset["item"]).toBe("bronze-sword");
    const tooltip = hoverTile(root, weaponTile as Element);
    expect(tooltip?.hidden).toBe(false);
    expect(tooltip?.querySelector(".tooltip-name")?.textContent).toBe("Bronze Sword");
    expect(tooltip?.querySelector(".tooltip-stat")?.textContent).toBe(
      `slash +10 atk +30 str ${ZERO_DEF_VECTOR} spd 4t`,
    );
  });

  it("shows an armor piece's defence vector only (no atk/str/speed line noise) on hover", () => {
    const { engine, root, app } = mount(1);
    engine.selectMonster("dummy");
    grindFor(engine, "lucky-charm");
    engine.equip("lucky-charm");
    app.render();

    const headTile = root.querySelector<HTMLElement>('[data-slot="head"]');
    expect(headTile?.dataset["item"]).toBe("lucky-charm");
    const tooltip = hoverTile(root, headTile as Element);
    expect(tooltip?.querySelector(".tooltip-name")?.textContent).toBe("Lucky Charm");
    expect(tooltip?.querySelector(".tooltip-stat")?.textContent).toBe(
      "st 1 · sl 1 · cr 1 · rn 1 · mg 1",
    );
  });

  it("renders the amulet Gear Slot tile and shows jewelry's atk/str bonuses on hover (#117: jewelry is an offence slot, unlike armour)", () => {
    const engine = createEngine(
      fixtureContent,
      seededRng(1),
      makeSnapshot({ bank: { items: [{ itemId: "lucky-amulet", qty: 1 }] } }),
    );
    const root = document.createElement("main");
    const app = mountApp(engine, root, fixtureContent, noopWindowChrome);
    engine.equip("lucky-amulet");
    app.render();

    const amuletTile = root.querySelector<HTMLElement>('[data-slot="amulet"]');
    expect(amuletTile?.dataset["item"]).toBe("lucky-amulet");
    const tooltip = hoverTile(root, amuletTile as Element);
    expect(tooltip?.querySelector(".tooltip-name")?.textContent).toBe("Lucky Amulet");
    // Unlike armour (see the "armor piece" test above), jewelry's atk/str lines DO show — no
    // attackType prefix (jewelry never attacks) or speed suffix (slot !== "weapon"), same
    // `equipmentStatParts` codepath, no UI change needed beyond GEAR_SLOT_ORDER (#117).
    expect(tooltip?.querySelector(".tooltip-stat")?.textContent).toBe(
      "+5 atk +8 str st 0 · sl 0 · cr 0 · rn 0 · mg 1",
    );
  });

  it("totals row matches snapshot().player.bonuses and updates when Gear is equipped", () => {
    const { engine, root, app } = mount(1);
    engine.selectMonster("dummy");
    grindFor(engine, "bronze-sword");
    app.render();
    expect(root.querySelector("#character-totals")?.textContent).toBe(
      `+0 atk +0 str ${ZERO_DEF_VECTOR} spd 4t`,
    );

    engine.equip("bronze-sword");
    app.render();

    const b = engine.snapshot().player.bonuses;
    expect(b).toEqual({
      attackType: "slash",
      atkBonus: 10,
      strBonus: 30,
      def: { stab: 0, slash: 0, crush: 0, ranged: 0, magic: 0 },
      attackSpeed: 4,
    });
    expect(root.querySelector("#character-totals")?.textContent).toBe(
      `+${b.atkBonus} atk +${b.strBonus} str ${ZERO_DEF_VECTOR} spd ${b.attackSpeed}t`,
    );
  });
});

describe("Spell picker (#101)", () => {
  function spellButtons(root: HTMLElement) {
    return [...root.querySelectorAll<HTMLButtonElement>("#spell-row button")];
  }

  it("renders one row per Content spell (fixtureContent's test-spark and test-blast)", () => {
    const { root } = mount(1);
    const buttons = spellButtons(root);
    expect(buttons).toHaveLength(2);
    expect(buttons.map((b) => b.dataset["spell"]).sort()).toEqual(["test-blast", "test-spark"]);
  });

  it("a fresh engine highlights the resolved levelReq-1 spell (test-spark) and shows the level gate on the under-leveled one", () => {
    const { root } = mount(1);
    const buttons = spellButtons(root);
    const spark = buttons.find((b) => b.dataset["spell"] === "test-spark");
    const blast = buttons.find((b) => b.dataset["spell"] === "test-blast");

    expect(spark?.classList.contains("active")).toBe(true);
    expect(spark?.disabled).toBe(false);

    expect(blast?.classList.contains("active")).toBe(false);
    expect(blast?.disabled).toBe(true);
    expect(blast?.querySelector(".spell-req")?.textContent).toBe("Lvl 20");
  });

  it("clicking a gated spell's disabled button does nothing (no selectSpell call, no engine error)", () => {
    const { engine, root } = mount(1);
    const blast = root.querySelector<HTMLButtonElement>('[data-spell="test-blast"]');
    expect(() => blast?.click()).not.toThrow();
    expect(engine.snapshot().player.spell?.id).toBe("test-spark");
  });

  it("clicking a legal spell (including a click on its inner element-tag span) selects it, calls selectSpell, and moves the highlight", () => {
    const engine = createEngine(
      fixtureContent,
      seededRng(1),
      makeSnapshot({ player: { skills: { magic: { level: 20, xp: xpForLevel(20) } } } }),
    );
    const root = document.createElement("main");
    mountApp(engine, root, fixtureContent, noopWindowChrome);

    // The button's child <span> is the actual click target (closest("[data-spell]") walks up to
    // the button) — proves the handler doesn't require clicking the bare button element.
    const elementTag = root.querySelector<HTMLElement>('[data-spell="test-blast"] .spell-element');
    elementTag?.click();

    expect(engine.snapshot().player.spell).toEqual({
      id: "test-blast",
      name: "Test Blast",
      element: "water",
    });
    const buttons = spellButtons(root);
    expect(
      buttons.find((b) => b.dataset["spell"] === "test-blast")?.classList.contains("active"),
    ).toBe(true);
    expect(
      buttons.find((b) => b.dataset["spell"] === "test-spark")?.classList.contains("active"),
    ).toBe(false);
  });

  it("survives a save/remount round-trip: the selected spell stays highlighted after reloading from a fresh Snapshot", () => {
    const engine1 = createEngine(
      fixtureContent,
      seededRng(1),
      makeSnapshot({ player: { skills: { magic: { level: 20, xp: xpForLevel(20) } } } }),
    );
    const root1 = document.createElement("main");
    mountApp(engine1, root1, fixtureContent, noopWindowChrome);
    root1.querySelector<HTMLButtonElement>('[data-spell="test-blast"]')?.click();
    expect(engine1.snapshot().player.spell?.id).toBe("test-blast");

    const saved = JSON.parse(JSON.stringify(engine1.snapshot()));
    const engine2 = createEngine(fixtureContent, seededRng(2), saved);
    const root2 = document.createElement("main");
    mountApp(engine2, root2, fixtureContent, noopWindowChrome);

    expect(engine2.snapshot().player.spell?.id).toBe("test-blast");
    const blast = root2.querySelector<HTMLButtonElement>('[data-spell="test-blast"]');
    expect(blast?.classList.contains("active")).toBe(true);
  });
});

describe("Equip via Bank click emits the equipped event (#26, #59)", () => {
  it("clicking Equip on a Bank row equips it and logs its feed line via the equipped subscription", () => {
    const { engine, root, app } = mount(1);
    engine.selectMonster("dummy");
    grindFor(engine, "bronze-sword");
    app.render();

    selectBankTile(root, "bronze-sword");
    const equipBtn = root.querySelector<HTMLButtonElement>(
      '#bank-detail [data-equip="bronze-sword"]',
    );
    expect(equipBtn).not.toBeNull();
    equipBtn?.click();

    expect(engine.snapshot().player.equipment.weapon).toBe("bronze-sword");
    expect(root.querySelector("#feed li")?.textContent).toMatch(/equipped.*bronze sword/i);
  });

  it("equip emits exactly one equipped event carrying the item's id, exercised through the UI", () => {
    const { engine, root, app } = mount(1);
    const equipped: string[] = [];
    engine.on("equipped", (e) => equipped.push(e.itemId));
    engine.selectMonster("dummy");
    grindFor(engine, "bronze-sword");
    app.render();

    selectBankTile(root, "bronze-sword");
    root.querySelector<HTMLButtonElement>('#bank-detail [data-equip="bronze-sword"]')?.click();

    expect(equipped).toEqual(["bronze-sword"]);
  });

  it("clicking Equip on a Bank row moves it into its Gear Slot, updates the Equipment panel, and removes it from the Bank list (#9)", () => {
    const { engine, root, app } = mount(1);
    engine.selectMonster("dummy");
    grindFor(engine, "bronze-sword");
    app.render();

    // Before the click: still banked, and the weapon slot is empty.
    expect(root.querySelector('#bank .tile[data-item="bronze-sword"]')).not.toBeNull();
    const weaponTileBefore = root.querySelector<HTMLElement>('[data-slot="weapon"]');
    expect(weaponTileBefore?.classList.contains("tile-empty")).toBe(true);

    selectBankTile(root, "bronze-sword");
    root.querySelector<HTMLButtonElement>('#bank-detail [data-equip="bronze-sword"]')?.click();

    // The click handler calls render() itself (no explicit app.render() needed here) — the DOM
    // should already reflect the equip.
    expect(root.querySelector('#bank .tile[data-item="bronze-sword"]')).toBeNull();
    const weaponTileAfter = root.querySelector<HTMLElement>('[data-slot="weapon"]');
    expect(weaponTileAfter?.dataset["item"]).toBe("bronze-sword");
    const tooltip = hoverTile(root, weaponTileAfter as Element);
    expect(tooltip?.querySelector(".tooltip-name")?.textContent).toBe("Bronze Sword");
    expect(tooltip?.querySelector(".tooltip-stat")?.textContent).toBe(
      "slash +10 atk +30 str st 0 · sl 0 · cr 0 · rn 0 · mg 0 spd 4t",
    );
    expect(engine.snapshot().bank.items.some((s) => s.itemId === "bronze-sword")).toBe(false);
  });
});

describe("Sorting the Bank list (#26, #59 — its only remaining consumer)", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", stubLocalStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function seededBank() {
    return makeSnapshot({
      player: { gold: 50 },
      bank: {
        items: [
          { itemId: "meat", qty: 3 },
          { itemId: "bronze-sword", qty: 1 },
          { itemId: "lucky-charm", qty: 1 },
        ],
      },
    });
  }

  function bankIds(root: HTMLElement) {
    return [...root.querySelectorAll<HTMLElement>("#bank .tile")].map(
      (tile) => tile.dataset["item"],
    );
  }

  it("renders a Kind | Value | Name control row above the Bank list", () => {
    const engine = createEngine(fixtureContent, seededRng(1));
    const root = document.createElement("main");
    mountApp(engine, root, fixtureContent, noopWindowChrome);

    const buttons = [...root.querySelectorAll<HTMLButtonElement>("#sort-row button")];
    expect(buttons.map((b) => b.textContent)).toEqual(["Kind", "Value", "Name"]);
  });

  it("sorting by Value orders the Bank by def.value descending, ties broken by name", () => {
    const engine = createEngine(fixtureContent, seededRng(1), seededBank());
    const root = document.createElement("main");
    mountApp(engine, root, fixtureContent, noopWindowChrome);

    root.querySelector<HTMLButtonElement>('[data-sort="value"]')?.click();

    // lucky-charm 100g, bronze-sword 20g, meat 3g (gold is never a Bank stack, #59).
    expect(bankIds(root)).toEqual(["lucky-charm", "bronze-sword", "meat"]);
  });

  it("sorting by Kind groups equipment before food, ties broken by name", () => {
    const engine = createEngine(fixtureContent, seededRng(1), seededBank());
    const root = document.createElement("main");
    mountApp(engine, root, fixtureContent, noopWindowChrome);

    root.querySelector<HTMLButtonElement>('[data-sort="kind"]')?.click();

    // equipment (Bronze Sword, Lucky Charm — alphabetical) before food (Cooked Meat).
    expect(bankIds(root)).toEqual(["bronze-sword", "lucky-charm", "meat"]);
  });

  it("sorting by Name orders the Bank alphabetically by display name", () => {
    const engine = createEngine(fixtureContent, seededRng(1), seededBank());
    const root = document.createElement("main");
    mountApp(engine, root, fixtureContent, noopWindowChrome);

    root.querySelector<HTMLButtonElement>('[data-sort="name"]')?.click();

    // Bronze Sword, Cooked Meat, Lucky Charm — alphabetical.
    expect(bankIds(root)).toEqual(["bronze-sword", "meat", "lucky-charm"]);
  });

  it("the sort choice survives a remount via localStorage and is never written into the save", () => {
    const engine = createEngine(fixtureContent, seededRng(1), seededBank());
    const root = document.createElement("main");
    mountApp(engine, root, fixtureContent, noopWindowChrome);

    root.querySelector<HTMLButtonElement>('[data-sort="value"]')?.click();
    expect(localStorage.getItem("sidescape-ui-sort")).toBe("value");

    // Simulate an app restart: a fresh mount against the same Engine reads the persisted choice.
    const root2 = document.createElement("main");
    mountApp(engine, root2, fixtureContent, noopWindowChrome);
    expect(bankIds(root2)).toEqual(["lucky-charm", "bronze-sword", "meat"]);

    // Presentation-only: never part of the Snapshot/save (same boundary as the SFX mute, #20).
    expect(JSON.stringify(engine.snapshot())).not.toMatch(/sort/i);
  });

  it("sell/equip click handling still targets the right item after sorting (data attributes, not row index)", () => {
    const engine = createEngine(fixtureContent, seededRng(1), seededBank());
    const root = document.createElement("main");
    mountApp(engine, root, fixtureContent, noopWindowChrome);

    root.querySelector<HTMLButtonElement>('[data-sort="value"]')?.click();
    // sorted order is now: lucky-charm, bronze-sword, meat — bronze-sword sits in the middle row.

    selectBankTile(root, "bronze-sword");
    const sellBtn = root.querySelector<HTMLButtonElement>(
      '#bank-detail [data-sell="bronze-sword"]',
    );
    expect(sellBtn).not.toBeNull();
    sellBtn?.click();

    expect(engine.snapshot().bank.items.some((s) => s.itemId === "bronze-sword")).toBe(false);
    expect(engine.snapshot().player.equipment.weapon).toBeNull(); // sold, not equipped
    expect(engine.snapshot().bank.items.find((s) => s.itemId === "lucky-charm")?.qty).toBe(1); // untouched neighbor row
  });
});

describe("Dungeons", () => {
  it("renders a ⚔ dungeon button under its Area's picker section, disabled when the Area is locked", () => {
    const lockedDungeonContent = {
      ...fixtureContent,
      dungeons: [
        ...fixtureContent.dungeons,
        {
          id: "crypt-dungeon",
          name: "Crypt Dungeon",
          areaId: "crypt",
          waves: ["dummy"],
          chest: [{ itemId: "gold", qty: 1, chance: 1, band: "guaranteed" as const }],
        },
      ],
    };
    const engine = createEngine(lockedDungeonContent, seededRng(1));
    const root = document.createElement("main");
    mountApp(engine, root, lockedDungeonContent, noopWindowChrome);

    const gauntletBtn = root.querySelector<HTMLButtonElement>('[data-dungeon="gauntlet"]');
    expect(gauntletBtn?.textContent).toBe("⚔ The Gauntlet");
    expect(gauntletBtn?.disabled).toBe(false); // meadow is unlocked

    const cryptBtn = root.querySelector<HTMLButtonElement>('[data-dungeon="crypt-dungeon"]');
    expect(cryptBtn?.textContent).toBe("⚔ Crypt Dungeon");
    expect(cryptBtn?.disabled).toBe(true); // Test Crypt is locked until "gauntlet" is cleared
  });

  it("the dungeon header is absent (hidden, no text) outside a run", () => {
    const { root } = mount(1);
    const header = root.querySelector<HTMLElement>("#dungeon-header");
    expect(header?.hidden).toBe(true);
    expect(header?.textContent).toBe("");
  });

  it("clicking a dungeon button enters it and shows the wave header above the Monster name", () => {
    const { root } = mount(1);
    root.querySelector<HTMLButtonElement>('[data-dungeon="gauntlet"]')?.click();

    const header = root.querySelector<HTMLElement>("#dungeon-header");
    expect(header?.hidden).toBe(false);
    expect(header?.textContent).toBe("⚔ The Gauntlet — Wave 1/3");
    expect(root.querySelector("#monster-name")?.textContent).toBe("Training Dummy");
  });

  it("logs a 'Wave i/N cleared' feed line as each wave advances", () => {
    const { engine, root, app } = mount(5);
    root.querySelector<HTMLButtonElement>('[data-dungeon="gauntlet"]')?.click();

    for (let i = 0; i < 5000 && engine.snapshot().dungeon?.wave !== 2; i++) engine.tick();
    app.render();

    expect(root.querySelector("#dungeon-header")?.textContent).toBe("⚔ The Gauntlet — Wave 2/3");
    const feedTexts = [...root.querySelectorAll("#feed li")].map((li) => li.textContent);
    expect(feedTexts).toContain("Wave 1/3 cleared");
  });

  it("logs dungeon-completed and chest-opened feed lines on the Boss kill, with a band-styled line per Chest item, then ejects to idle", () => {
    const { engine, root, app } = mount(5);
    root.querySelector<HTMLButtonElement>('[data-dungeon="gauntlet"]')?.click();

    let completed = false;
    engine.on("dungeon-completed", () => {
      completed = true;
    });
    for (let i = 0; i < 5000 && !completed; i++) engine.tick();
    app.render();

    const feedItems = [...root.querySelectorAll("#feed li")];
    const feedTexts = feedItems.map((li) => li.textContent);
    expect(feedTexts.some((t) => /the gauntlet.*cleared/i.test(t ?? ""))).toBe(true);
    expect(feedTexts).toContain("📦 Chest opened!");
    // The Chest's guaranteed 50 gold always lands and is band-styled like a normal Drop.
    const goldLine = feedItems.find((li) => li.textContent?.includes("Gold"));
    expect(goldLine?.className).toBe("drop-guaranteed");

    // Ejected to idle: no more Dungeon, no Monster selected.
    expect(root.querySelector<HTMLElement>("#dungeon-header")?.hidden).toBe(true);
    expect(root.querySelector("#monster-name")?.textContent).toBe("Pick a monster ↓");
  });

  it("picker rebuilds on dungeon-completed, unlocking the Crypt gate immediately with no levelup involved", () => {
    const { engine, root } = mount(5); // seed 5 completes "gauntlet" within 5000 Ticks (see core/engine.test.ts)
    const bruteBefore = root.querySelector<HTMLButtonElement>('[data-monster="brute"]');
    expect(bruteBefore?.disabled).toBe(true);
    const cryptLabelBefore = [...root.querySelectorAll(".area-name")].find((p) =>
      p.textContent?.startsWith("Test Crypt"),
    );
    expect(cryptLabelBefore?.textContent).toBe("Test Crypt 🔒 Clear The Gauntlet");

    root.querySelector<HTMLButtonElement>('[data-dungeon="gauntlet"]')?.click();
    for (let i = 0; i < 5000 && engine.snapshot().player.completedDungeonIds.length === 0; i++) {
      engine.tick();
    }
    expect(engine.snapshot().player.completedDungeonIds).toEqual(["gauntlet"]);

    // buildPicker runs off the dungeon-completed event itself — no explicit render() call here.
    const bruteAfter = root.querySelector<HTMLButtonElement>('[data-monster="brute"]');
    expect(bruteAfter?.disabled).toBe(false);
    const cryptLabelAfter = [...root.querySelectorAll(".area-name")].find((p) =>
      p.textContent?.startsWith("Test Crypt"),
    );
    expect(cryptLabelAfter?.textContent).toBe("Test Crypt");
  });
});

describe("Smithing (#28)", () => {
  function mountWithBars(barQty: number, seed = 1) {
    const engine = createEngine(
      fixtureContent,
      seededRng(seed),
      makeSnapshot({ bank: { items: [{ itemId: "bar", qty: barQty }] } }),
    );
    const root = document.createElement("main");
    const app = mountApp(engine, root, fixtureContent, noopWindowChrome);
    return { engine, root, app };
  }

  it("XP row shows a SMI chip for Smithing, alongside the other ten (11 chips at 320px)", () => {
    const { root } = mount(1);
    const abbrs = [...root.querySelectorAll(".skill-abbr")].map((el) => el.textContent);
    expect(abbrs).toHaveLength(11);
    expect(abbrs).toContain("SMI");
  });

  it("renders one recipe row per Content.recipes, with level req and owned counts for each input", () => {
    const { root } = mountWithBars(0);
    const swordRow = root.querySelector('[data-recipe-row="test-sword"]');
    expect(swordRow?.textContent).toContain("Test Sword");
    expect(swordRow?.textContent).toContain("Lvl 1");
    expect(swordRow?.textContent).toContain("1× Test Bar (have 0)");

    const charmRow = root.querySelector('[data-recipe-row="test-charm"]');
    expect(charmRow?.textContent).toContain("Test Charm");
    expect(charmRow?.textContent).toContain("Lvl 20");
    expect(charmRow?.textContent).toContain("3× Test Bar (have 0)");
  });

  it("the owned count in a recipe row updates as the Bank's contents change", () => {
    const { root } = mountWithBars(5);
    const swordRow = root.querySelector('[data-recipe-row="test-sword"]');
    expect(swordRow?.textContent).toContain("1× Test Bar (have 5)");
  });

  it("disables the Craft button when short on inputs, enables it once inputs are sufficient", () => {
    const short = mountWithBars(0);
    expect(
      short.root.querySelector<HTMLButtonElement>('[data-recipe="test-sword"]')?.disabled,
    ).toBe(true);

    const enough = mountWithBars(1);
    expect(
      enough.root.querySelector<HTMLButtonElement>('[data-recipe="test-sword"]')?.disabled,
    ).toBe(false);
  });

  it("disables the Craft button when under-leveled, even with enough inputs", () => {
    const { root } = mountWithBars(5); // fresh player is Smithing level 1; test-charm needs 20
    expect(root.querySelector<HTMLButtonElement>('[data-recipe="test-charm"]')?.disabled).toBe(
      true,
    );
  });

  it("clicking Craft starts the Recipe, showing the Smithing scene and hiding the Monster HP bar/sprite", () => {
    const { root } = mountWithBars(5);
    root.querySelector<HTMLButtonElement>('[data-recipe="test-sword"]')?.click();

    expect(root.querySelector("#monster-name")?.textContent).toBe("🔨 Smithing: Test Sword");
    expect((root.querySelector("#monster-bar") as HTMLElement).hidden).toBe(true);
    expect((root.querySelector("#monster-sprite") as HTMLElement).hidden).toBe(true);
  });

  it("selecting a Monster afterwards restores the normal combat scene", () => {
    const { root } = mountWithBars(5);
    root.querySelector<HTMLButtonElement>('[data-recipe="test-sword"]')?.click();
    root.querySelector<HTMLButtonElement>('[data-monster="dummy"]')?.click();

    expect(root.querySelector("#monster-name")?.textContent).toBe("Training Dummy");
    expect((root.querySelector("#monster-bar") as HTMLElement).hidden).toBe(false);
  });

  it("logs a feed line and grants Smithing XP when a craft completes (item-crafted)", () => {
    const { engine, root, app } = mountWithBars(5);
    root.querySelector<HTMLButtonElement>('[data-recipe="test-sword"]')?.click();

    for (let i = 0; i < 3; i++) engine.tick(); // test-sword.craftTicks === 3
    app.render();

    expect(root.querySelector("#feed li")?.textContent).toMatch(/crafted.*bronze sword/i);
    expect(engine.snapshot().player.skills.smithing.xp).toBeGreaterThan(0);
    expect(engine.snapshot().bank.items.find((s) => s.itemId === "bronze-sword")?.qty).toBe(1);
  });

  it("a Material Bank tile is neither equippable nor eatable, but still sellable", () => {
    const { engine, root, app } = mountWithBars(2);
    app.render();

    const hpBefore = engine.snapshot().player.hp;
    selectBankTile(root, "bar"); // selecting only opens the detail strip — no equip/eat side effect

    expect(root.querySelector('#bank-detail [data-sell="bar"]')?.textContent).toBe("Sell 5g");
    expect(root.querySelector('#bank-detail [data-equip="bar"]')).toBeNull();
    expect(engine.snapshot().player.hp).toBe(hpBefore);
    expect(engine.snapshot().bank.items.find((s) => s.itemId === "bar")?.qty).toBe(2);
  });
});

describe("Cooking (#115)", () => {
  function mountWithRawFish(qty: number, seed = 1) {
    const engine = createEngine(
      fixtureContent,
      seededRng(seed),
      makeSnapshot({ bank: { items: [{ itemId: "raw-fish", qty }] } }),
    );
    const root = document.createElement("main");
    const app = mountApp(engine, root, fixtureContent, noopWindowChrome);
    return { engine, root, app };
  }

  it("renders a Cooking recipe row for the fixture's test-cook Recipe, with level req and owned counts", () => {
    const { root } = mountWithRawFish(0);
    root.querySelector<HTMLButtonElement>('[data-tab="cooking"]')?.click();

    const row = root.querySelector('[data-recipe-row="test-cook"]');
    expect(row?.textContent).toContain("Cook Fish");
    expect(row?.textContent).toContain("Lvl 1");
    expect(row?.textContent).toContain("1× Raw Fish (have 0)");
  });

  it("disables the Craft button when short on inputs, enables it once inputs are sufficient", () => {
    const short = mountWithRawFish(0);
    expect(short.root.querySelector<HTMLButtonElement>('[data-recipe="test-cook"]')?.disabled).toBe(
      true,
    );

    const enough = mountWithRawFish(1);
    expect(
      enough.root.querySelector<HTMLButtonElement>('[data-recipe="test-cook"]')?.disabled,
    ).toBe(false);
  });

  it("clicking Craft starts the Recipe, showing the Cooking scene (🍳) and hiding the Monster HP bar/sprite", () => {
    const { root } = mountWithRawFish(1);
    root.querySelector<HTMLButtonElement>('[data-recipe="test-cook"]')?.click();

    expect(root.querySelector("#monster-name")?.textContent).toBe("🍳 Cooking: Cook Fish");
    expect((root.querySelector("#monster-bar") as HTMLElement).hidden).toBe(true);
    expect((root.querySelector("#monster-sprite") as HTMLElement).hidden).toBe(true);
  });

  it("logs a feed line and grants Cooking XP (never Smithing) when a craft completes", () => {
    const { engine, root, app } = mountWithRawFish(1);
    root.querySelector<HTMLButtonElement>('[data-recipe="test-cook"]')?.click();

    for (let i = 0; i < 3; i++) engine.tick(); // test-cook.craftTicks === 3
    app.render();

    expect(root.querySelector("#feed li")?.textContent).toMatch(/crafted.*cooked meat/i);
    expect(engine.snapshot().player.skills.cooking.xp).toBeGreaterThan(0);
    expect(engine.snapshot().player.skills.smithing.xp).toBe(0);
    expect(engine.snapshot().bank.items.find((s) => s.itemId === "meat")?.qty).toBe(1);
  });
});

describe("Crafting (#116)", () => {
  function mountWithHide(qty: number, seed = 1) {
    const engine = createEngine(
      fixtureContent,
      seededRng(seed),
      makeSnapshot({ bank: { items: [{ itemId: "hide", qty }] } }),
    );
    const root = document.createElement("main");
    const app = mountApp(engine, root, fixtureContent, noopWindowChrome);
    return { engine, root, app };
  }

  it("renders a Crafting recipe row for the fixture's test-craft Recipe, with level req and owned counts", () => {
    const { root } = mountWithHide(0);
    root.querySelector<HTMLButtonElement>('[data-tab="crafting"]')?.click();

    const row = root.querySelector('[data-recipe-row="test-craft"]');
    expect(row?.textContent).toContain("Craft Vest");
    expect(row?.textContent).toContain("Lvl 1");
    expect(row?.textContent).toContain("1× Test Hide (have 0)");
  });

  it("disables the Craft button when short on inputs, enables it once inputs are sufficient", () => {
    const short = mountWithHide(0);
    expect(
      short.root.querySelector<HTMLButtonElement>('[data-recipe="test-craft"]')?.disabled,
    ).toBe(true);

    const enough = mountWithHide(1);
    expect(
      enough.root.querySelector<HTMLButtonElement>('[data-recipe="test-craft"]')?.disabled,
    ).toBe(false);
  });

  it("clicking Craft starts the Recipe, showing the Crafting scene (🧵) and hiding the Monster HP bar/sprite", () => {
    const { root } = mountWithHide(1);
    root.querySelector<HTMLButtonElement>('[data-recipe="test-craft"]')?.click();

    expect(root.querySelector("#monster-name")?.textContent).toBe("🧵 Crafting: Craft Vest");
    expect((root.querySelector("#monster-bar") as HTMLElement).hidden).toBe(true);
    expect((root.querySelector("#monster-sprite") as HTMLElement).hidden).toBe(true);
  });

  it("logs a feed line and grants Crafting XP (never Smithing) when a craft completes", () => {
    const { engine, root, app } = mountWithHide(1);
    root.querySelector<HTMLButtonElement>('[data-recipe="test-craft"]')?.click();

    for (let i = 0; i < 3; i++) engine.tick(); // test-craft.craftTicks === 3
    app.render();

    expect(root.querySelector("#feed li")?.textContent).toMatch(/crafted.*lucky charm/i);
    expect(engine.snapshot().player.skills.crafting.xp).toBeGreaterThan(0);
    expect(engine.snapshot().player.skills.smithing.xp).toBe(0);
    expect(engine.snapshot().bank.items.find((s) => s.itemId === "lucky-charm")?.qty).toBe(1);
  });
});

describe("Herblore (#118)", () => {
  function mountWithHerb(qty: number, seed = 1) {
    const engine = createEngine(
      fixtureContent,
      seededRng(seed),
      makeSnapshot({ bank: { items: [{ itemId: "herb", qty }] } }),
    );
    const root = document.createElement("main");
    const app = mountApp(engine, root, fixtureContent, noopWindowChrome);
    return { engine, root, app };
  }

  it("renders a Herblore recipe row for the fixture's test-brew Recipe, with level req and owned counts", () => {
    const { root } = mountWithHerb(0);
    root.querySelector<HTMLButtonElement>('[data-tab="herblore"]')?.click();

    const row = root.querySelector('[data-recipe-row="test-brew"]');
    expect(row?.textContent).toContain("Brew Strength Potion");
    expect(row?.textContent).toContain("Lvl 1");
    expect(row?.textContent).toContain("1× Test Herb (have 0)");
  });

  it("disables the Craft button when short on inputs, enables it once inputs are sufficient", () => {
    const short = mountWithHerb(0);
    expect(short.root.querySelector<HTMLButtonElement>('[data-recipe="test-brew"]')?.disabled).toBe(
      true,
    );

    const enough = mountWithHerb(1);
    expect(
      enough.root.querySelector<HTMLButtonElement>('[data-recipe="test-brew"]')?.disabled,
    ).toBe(false);
  });

  it("clicking Craft starts the Recipe, showing the Herblore scene (🧪) and hiding the Monster HP bar/sprite", () => {
    const { root } = mountWithHerb(1);
    root.querySelector<HTMLButtonElement>('[data-recipe="test-brew"]')?.click();

    expect(root.querySelector("#monster-name")?.textContent).toBe(
      "🧪 Herblore: Brew Strength Potion",
    );
    expect((root.querySelector("#monster-bar") as HTMLElement).hidden).toBe(true);
    expect((root.querySelector("#monster-sprite") as HTMLElement).hidden).toBe(true);
  });

  it("shows the cauldron foreground prop while Herblore is active", () => {
    const { root } = mountWithHerb(1);
    root.querySelector<HTMLButtonElement>('[data-recipe="test-brew"]')?.click();

    expect(root.querySelector<HTMLElement>("#activity-prop")?.className).toBe("prop-cauldron");
    expect(root.querySelector<HTMLElement>("#activity-prop")?.hidden).toBe(false);
  });

  it("logs a feed line and grants Herblore XP (never Smithing) when a craft completes, banking a Potion", () => {
    const { engine, root, app } = mountWithHerb(1);
    root.querySelector<HTMLButtonElement>('[data-recipe="test-brew"]')?.click();

    for (let i = 0; i < 3; i++) engine.tick(); // test-brew.craftTicks === 3
    app.render();

    expect(root.querySelector("#feed li")?.textContent).toMatch(/crafted.*strength potion/i);
    expect(engine.snapshot().player.skills.herblore.xp).toBeGreaterThan(0);
    expect(engine.snapshot().player.skills.smithing.xp).toBe(0);
    expect(engine.snapshot().bank.items.find((s) => s.itemId === "strength-potion")?.qty).toBe(1);
  });
});

describe("Potion Slot tile (#118)", () => {
  function potionMount(overrides: Parameters<typeof makeSnapshot>[0] = {}) {
    const engine = createEngine(fixtureContent, seededRng(1), makeSnapshot(overrides));
    const root = document.createElement("main");
    const app = mountApp(engine, root, fixtureContent, noopWindowChrome);
    // The Potion Slot lives on the Character tab panel (#118) — open it, mirroring how a real
    // user would reach it (the panel is hidden by default, #62).
    root.querySelector<HTMLButtonElement>('[data-tab="character"]')?.click();
    return { engine, root, app };
  }

  it("an empty slot shows a [+] that opens a chooser listing only the Bank's Potion stacks", () => {
    const { root } = potionMount({
      bank: {
        items: [
          { itemId: "strength-potion", qty: 5 },
          { itemId: "fishing-potion", qty: 2 },
          { itemId: "meat", qty: 1 }, // Food — must never show up as a Potion choice
          { itemId: "bar", qty: 1 }, // a Material — must never show up as a Potion choice
        ],
      },
    });
    expect(root.querySelector("[data-potion-add]")).not.toBeNull();
    expect(root.querySelector(".potion-slot-chooser")).toBeNull(); // closed by default

    root.querySelector<HTMLButtonElement>("[data-potion-add]")?.click();

    const chooser = root.querySelector(".potion-slot-chooser");
    expect(chooser).not.toBeNull();
    expect(chooser?.querySelector('[data-potion-assign="strength-potion"]')).not.toBeNull();
    expect(chooser?.querySelector('[data-potion-assign="fishing-potion"]')).not.toBeNull();
    expect(chooser?.querySelector('[data-potion-assign="meat"]')).toBeNull();
    expect(chooser?.querySelector('[data-potion-assign="bar"]')).toBeNull();
  });

  it("an empty slot's chooser shows a hint when the Bank has no Potions at all", () => {
    const { root } = potionMount();
    root.querySelector<HTMLButtonElement>("[data-potion-add]")?.click();
    expect(root.querySelector(".potion-slot-chooser .hint")?.textContent).toMatch(/no potions/i);
  });

  it("re-clicking the same [+] dismisses the chooser without assigning", () => {
    const { root } = potionMount({ bank: { items: [{ itemId: "strength-potion", qty: 5 }] } });
    root.querySelector<HTMLButtonElement>("[data-potion-add]")?.click();
    expect(root.querySelector(".potion-slot-chooser")).not.toBeNull();

    root.querySelector<HTMLButtonElement>("[data-potion-add]")?.click();
    expect(root.querySelector(".potion-slot-chooser")).toBeNull();
  });

  it("picking a Potion from the chooser assigns it (moving the whole Bank stock, opening at full charges) and closes the chooser", () => {
    const { engine, root } = potionMount({
      bank: { items: [{ itemId: "strength-potion", qty: 5 }] },
    });
    root.querySelector<HTMLButtonElement>("[data-potion-add]")?.click();
    root.querySelector<HTMLButtonElement>('[data-potion-assign="strength-potion"]')?.click();

    expect(engine.snapshot().player.potionSlot).toEqual({
      itemId: "strength-potion",
      qty: 5,
      charges: 3,
    });
    expect(engine.snapshot().bank.items).toEqual([]);
    expect(root.querySelector(".potion-slot-chooser")).toBeNull(); // closed after picking

    const filledTile = root.querySelector<HTMLElement>(
      '.potion-slot-tile.filled .tile[data-item="strength-potion"]',
    );
    expect(filledTile?.querySelector("img")?.alt).toBe("Test Strength Potion");
    expect(filledTile?.querySelector(".tile-qty")?.textContent).toBe("×5");
    expect(root.querySelector(".potion-slot-charges")?.textContent).toBe("3/3");
  });

  it("clicking ✕ unassigns the slot, consuming the open potion and returning qty-1 to the Bank", () => {
    const { engine, root } = potionMount({
      player: { potionSlot: { itemId: "strength-potion", qty: 3, charges: 2 } },
    });

    root.querySelector<HTMLButtonElement>("[data-potion-unassign]")?.click();

    expect(engine.snapshot().player.potionSlot).toBeNull();
    expect(engine.snapshot().bank.items).toEqual([{ itemId: "strength-potion", qty: 2 }]);
    expect(root.querySelector("[data-potion-add]")).not.toBeNull(); // now renders as empty
  });
});

/** Shared by the Quiver/Rune Pouch/Vendor describe blocks below (#119): mounts on the Character
 * (or, for the Vendor block, the Vendor) tab so the panel under test is actually visible — mirrors
 * potionMount's own "open the panel a real user would" rationale above. */
function ammoMount(
  tab: "character" | "vendor",
  overrides: Parameters<typeof makeSnapshot>[0] = {},
) {
  const engine = createEngine(fixtureContent, seededRng(1), makeSnapshot(overrides));
  const root = document.createElement("main");
  const app = mountApp(engine, root, fixtureContent, noopWindowChrome);
  root.querySelector<HTMLButtonElement>(`[data-tab="${tab}"]`)?.click();
  return { engine, root, app };
}

describe("Quiver tile (#119)", () => {
  it("an empty Quiver shows a [+] that opens a chooser listing only the Bank's arrow stacks", () => {
    const { root } = ammoMount("character", {
      bank: {
        items: [
          { itemId: "arrow", qty: 30 },
          { itemId: "iron-arrow", qty: 5 },
          { itemId: "air-rune", qty: 2 }, // a Rune — must never show up as an arrow choice
          { itemId: "meat", qty: 1 }, // Food — must never show up as an arrow choice
        ],
      },
    });
    const quiverSlot = root.querySelector<HTMLElement>("#quiver-slot");
    expect(quiverSlot?.querySelector("[data-quiver-add]")).not.toBeNull();
    expect(root.querySelector(".potion-slot-chooser")).toBeNull(); // closed by default

    quiverSlot?.querySelector<HTMLButtonElement>("[data-quiver-add]")?.click();

    const chooser = root.querySelector(".potion-slot-chooser");
    expect(chooser).not.toBeNull();
    expect(chooser?.querySelector('[data-quiver-assign="arrow"]')).not.toBeNull();
    expect(chooser?.querySelector('[data-quiver-assign="iron-arrow"]')).not.toBeNull();
    expect(chooser?.querySelector('[data-quiver-assign="air-rune"]')).toBeNull();
    expect(chooser?.querySelector('[data-quiver-assign="meat"]')).toBeNull();
  });

  it("an empty Quiver's chooser shows a hint when the Bank has no arrows at all", () => {
    const { root } = ammoMount("character");
    root.querySelector<HTMLButtonElement>("[data-quiver-add]")?.click();
    expect(root.querySelector("#quiver-slot .hint")?.textContent).toMatch(/no arrows/i);
  });

  it("picking an arrow from the chooser loads it (moving the whole Bank stock) and closes the chooser", () => {
    const { engine, root } = ammoMount("character", {
      bank: { items: [{ itemId: "arrow", qty: 30 }] },
    });
    root.querySelector<HTMLButtonElement>("[data-quiver-add]")?.click();
    root.querySelector<HTMLButtonElement>('[data-quiver-assign="arrow"]')?.click();

    expect(engine.snapshot().player.quiver).toEqual({ itemId: "arrow", qty: 30 });
    expect(engine.snapshot().bank.items).toEqual([]);
    expect(root.querySelector(".potion-slot-chooser")).toBeNull();

    const filledTile = root.querySelector<HTMLElement>('#quiver-slot .tile[data-item="arrow"]');
    expect(filledTile?.querySelector("img")?.alt).toBe("Test Arrow");
    expect(filledTile?.querySelector(".tile-qty")?.textContent).toBe("×30");
  });

  it("clicking ✕ unloads the Quiver, returning the whole stack to the Bank", () => {
    const { engine, root } = ammoMount("character", {
      player: { quiver: { itemId: "arrow", qty: 12 } },
    });
    root.querySelector<HTMLButtonElement>("[data-quiver-unassign]")?.click();

    expect(engine.snapshot().player.quiver).toBeNull();
    expect(engine.snapshot().bank.items).toEqual([{ itemId: "arrow", qty: 12 }]);
    expect(root.querySelector("[data-quiver-add]")).not.toBeNull(); // now renders as empty
  });
});

describe("Rune Pouch panel (#119)", () => {
  it("renders 4 slots, one per Element (air/water/earth/fire), independent of load order", () => {
    const { root } = ammoMount("character", {
      player: {
        runePouch: [
          { itemId: "fire-rune", qty: 5 },
          { itemId: "air-rune", qty: 3 },
        ],
      },
    });
    const slots = [...root.querySelectorAll<HTMLElement>("#rune-pouch [data-element]")];
    expect(slots.map((s) => s.dataset["element"])).toEqual(["air", "water", "earth", "fire"]);
    expect(slots[0]?.classList.contains("filled")).toBe(true); // air, loaded
    expect(slots[1]?.classList.contains("empty")).toBe(true); // water, not loaded
    expect(slots[3]?.classList.contains("filled")).toBe(true); // fire, loaded
  });

  it("loading one Element's rune never displaces another — all four can be loaded simultaneously with zero reload", () => {
    const { engine, root } = ammoMount("character", {
      bank: {
        items: [
          { itemId: "air-rune", qty: 10 },
          { itemId: "water-rune", qty: 8 },
          { itemId: "earth-rune", qty: 6 },
          { itemId: "fire-rune", qty: 4 },
        ],
      },
    });
    for (const itemId of ["air-rune", "water-rune", "earth-rune", "fire-rune"]) {
      root.querySelector<HTMLButtonElement>(`[data-rune-add="${itemId.split("-")[0]}"]`)?.click();
      root.querySelector<HTMLButtonElement>(`[data-rune-assign="${itemId}"]`)?.click();
    }
    const pouch = engine.snapshot().player.runePouch;
    expect(pouch).toHaveLength(4);
    expect(pouch).toEqual(
      expect.arrayContaining([
        { itemId: "air-rune", qty: 10 },
        { itemId: "water-rune", qty: 8 },
        { itemId: "earth-rune", qty: 6 },
        { itemId: "fire-rune", qty: 4 },
      ]),
    );
    expect(engine.snapshot().bank.items).toEqual([]);
  });

  it("an empty Element slot's chooser lists only that Element's own rune stacks, never another Element's", () => {
    const { root } = ammoMount("character", {
      bank: {
        items: [
          { itemId: "air-rune", qty: 5 },
          { itemId: "water-rune", qty: 5 },
        ],
      },
    });
    root
      .querySelector<HTMLElement>('#rune-pouch [data-element="water"]')
      ?.querySelector<HTMLButtonElement>("[data-rune-add]")
      ?.click();
    // Re-query after the click's render() replaced #rune-pouch's innerHTML — the pre-click
    // `waterSlot` reference would otherwise point at a now-detached DOM node.
    const chooser = root
      .querySelector<HTMLElement>('#rune-pouch [data-element="water"]')
      ?.querySelector(".food-slot-chooser");
    expect(chooser).not.toBeNull();
    expect(chooser?.querySelector('[data-rune-assign="water-rune"]')).not.toBeNull();
    expect(chooser?.querySelector('[data-rune-assign="air-rune"]')).toBeNull();
  });

  it("clicking ✕ on a loaded Element returns that stack to the Bank, leaving other Elements untouched", () => {
    const { engine, root } = ammoMount("character", {
      player: {
        runePouch: [
          { itemId: "air-rune", qty: 20 },
          { itemId: "water-rune", qty: 8 },
        ],
      },
    });
    root.querySelector<HTMLButtonElement>('[data-rune-unassign="air-rune"]')?.click();

    expect(engine.snapshot().player.runePouch).toEqual([{ itemId: "water-rune", qty: 8 }]);
    expect(engine.snapshot().bank.items).toEqual([{ itemId: "air-rune", qty: 20 }]);
    const airSlot = root.querySelector<HTMLElement>('#rune-pouch [data-element="air"]');
    expect(airSlot?.classList.contains("empty")).toBe(true);
  });
});

describe("Vendor tab panel (#119)", () => {
  it("lists every vendor entry with its price and how many the player already owns", () => {
    const { root } = ammoMount("vendor", { bank: { items: [{ itemId: "arrow", qty: 7 }] } });
    const arrowRow = root.querySelector<HTMLElement>('[data-vendor-row="arrow"]');
    expect(arrowRow?.textContent).toMatch(/Test Arrow/);
    expect(arrowRow?.textContent).toMatch(/2g/); // fixture vendor price
    expect(arrowRow?.textContent).toMatch(/Owned: 7/);
  });

  it("the Buy button is disabled while gold is short of the price", () => {
    const { root } = ammoMount("vendor", { player: { gold: 1 } });
    const buyBtn = root.querySelector<HTMLButtonElement>('[data-vendor-buy="arrow"]');
    expect(buyBtn?.disabled).toBe(true);
  });

  it("clicking Buy purchases 1 unit, charging gold and adding it to the Bank, logging a feed line", () => {
    const { engine, root } = ammoMount("vendor", { player: { gold: 100 } });
    root.querySelector<HTMLButtonElement>('[data-vendor-buy="arrow"]')?.click();

    expect(engine.snapshot().player.gold).toBe(98); // fixture vendor price 2
    expect(engine.snapshot().bank.items).toEqual([{ itemId: "arrow", qty: 1 }]);
    const feedLine = root.querySelector("#feed li");
    expect(feedLine?.textContent).toMatch(/bought/i);
  });
});

describe("Combat feedback (#4)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Pumps `ticks` engine Ticks without advancing fake timers, so every splat/toast fired along
   * the way is still present in the DOM afterwards for assertions. Splat-only tests deliberately
   * skip `render`: attack events append splats during `tick()` itself, whereas re-rendering the
   * complete workspace 400 times measures unrelated panel markup rather than combat feedback. */
  function pump(
    engine: ReturnType<typeof createEngine>,
    app: { render(): void },
    ticks: number,
    renderEachTick = true,
  ) {
    for (let i = 0; i < ticks; i++) {
      engine.tick();
      if (renderEachTick) app.render();
    }
  }

  it("shows a red hit splat with the damage number over the Monster as the player's attacks land", () => {
    const { engine, root, app } = mount(1);
    root.querySelector<HTMLButtonElement>('[data-monster="dummy"]')?.click();

    // dummy's low defence gives the level-1 player's melee attack ~50% hit chance (worked in the
    // issue investigation from combat.ts's formulas) — 400 Ticks (~100 attacks at speed 4) all but
    // guarantees both a hit and a miss land on both sides.
    pump(engine, app, 400, false);

    const hitSplats = [...root.querySelectorAll("#monster-splats .splat-hit")];
    expect(hitSplats.length).toBeGreaterThan(0);
    expect(hitSplats.every((el) => /^[1-9]\d*$/.test(el.textContent ?? ""))).toBe(true);
  });

  it("shows a blue '0' miss splat over the Monster when the player's attack misses", () => {
    const { engine, root, app } = mount(1);
    root.querySelector<HTMLButtonElement>('[data-monster="dummy"]')?.click();
    pump(engine, app, 400, false);

    const missSplats = [...root.querySelectorAll("#monster-splats .splat-miss")];
    expect(missSplats.length).toBeGreaterThan(0);
    expect(missSplats.every((el) => el.textContent === "0")).toBe(true);
  });

  it("shows both hit and miss splats over the Player as the Monster's attacks land", () => {
    const { engine, root, app } = mount(1);
    root.querySelector<HTMLButtonElement>('[data-monster="dummy"]')?.click();
    pump(engine, app, 400, false);

    expect(root.querySelectorAll("#player-splats .splat-hit").length).toBeGreaterThan(0);
    expect(root.querySelectorAll("#player-splats .splat-miss").length).toBeGreaterThan(0);
  });

  it("splats are driven by the attack event during engine.tick() itself, not by render() (#86)", () => {
    // No cooldown mirror left to keep in lockstep with render() cadence: splats now fire the
    // instant engine.tick() resolves an attack, so pumping many Ticks with a single render() at
    // the very end must still show one splat per resolved swing on each side.
    const { engine, root, app } = mount(1);
    root.querySelector<HTMLButtonElement>('[data-monster="dummy"]')?.click();

    for (let i = 0; i < 20; i++) engine.tick(); // no app.render() in between
    app.render();

    const monsterSplats = root.querySelectorAll("#monster-splats .splat");
    const playerSplats = root.querySelectorAll("#player-splats .splat");
    // dummy attackSpeed === 4, unarmed player speed === 4: 20 Ticks means ~5 swings each side.
    expect(monsterSplats.length).toBeGreaterThan(0);
    expect(playerSplats.length).toBeGreaterThan(0);
  });

  it("fades a damage splat out of the DOM after its animation duration", () => {
    const { engine, root, app } = mount(1);
    root.querySelector<HTMLButtonElement>('[data-monster="dummy"]')?.click();
    pump(engine, app, 20); // enough for at least one attack (dummy attackSpeed === 4)

    const before = root.querySelectorAll("#monster-splats .splat, #player-splats .splat").length;
    expect(before).toBeGreaterThan(0);

    vi.advanceTimersByTime(1000); // > the splat fade duration
    const after = root.querySelectorAll("#monster-splats .splat, #player-splats .splat").length;
    expect(after).toBe(0);
  });

  it("shows a level-up toast on the levelup event that auto-dismisses on its own after a delay", () => {
    const { engine, root, app } = mount(1);
    root.querySelector<HTMLButtonElement>('[data-monster="dummy"]')?.click();
    const startLevel = engine.snapshot().player.skills.strength.level;

    let i = 0;
    for (; i < 5000 && engine.snapshot().player.skills.strength.level === startLevel; i++) {
      engine.tick();
    }
    app.render();
    expect(engine.snapshot().player.skills.strength.level).toBeGreaterThan(startLevel);

    const toast = root.querySelector("#toast-container .toast");
    expect(toast).not.toBeNull();
    expect(toast?.textContent).toMatch(/level/i);

    vi.advanceTimersByTime(5000); // > the toast's auto-dismiss delay
    expect(root.querySelector("#toast-container .toast")).toBeNull();
  });

  it("shows an out-of-ammo toast (#119) when a ranged swing can't resolve, that auto-dismisses on its own", () => {
    const engine = createEngine(
      fixtureContent,
      seededRng(1),
      makeSnapshot({
        player: { equipment: { weapon: "bow" }, quiver: { itemId: "arrow", qty: 0 } },
      }),
    );
    const root = document.createElement("main");
    const app = mountApp(engine, root, fixtureContent, noopWindowChrome);
    root.querySelector<HTMLButtonElement>('[data-monster="dummy"]')?.click();

    for (let i = 0; i < 20; i++) engine.tick();
    app.render();

    const toast = root.querySelector("#toast-container .toast");
    expect(toast).not.toBeNull();
    expect(toast?.textContent).toMatch(/out of arrows/i);

    vi.advanceTimersByTime(5000); // > the toast's auto-dismiss delay
    expect(root.querySelector("#toast-container .toast")).toBeNull();
  });

  it("flashes the screen and highlights the Loot Feed line when a rare Drop lands, then clears", () => {
    const rareDropContent = {
      ...fixtureContent,
      monsters: fixtureContent.monsters.map((m) =>
        m.id === "dummy"
          ? {
              ...m,
              dropTable: [{ itemId: "lucky-charm", qty: 1, chance: 1, band: "rare" as const }],
            }
          : m,
      ),
    };
    const engine = createEngine(rareDropContent, seededRng(1));
    const root = document.createElement("main");
    const app = mountApp(engine, root, rareDropContent, noopWindowChrome);
    root.querySelector<HTMLButtonElement>('[data-monster="dummy"]')?.click();

    let i = 0;
    for (; i < 2000 && !engine.snapshot().lootZone.some((s) => s.itemId === "lucky-charm"); i++) {
      engine.tick();
    }
    app.render();
    expect(engine.snapshot().lootZone.some((s) => s.itemId === "lucky-charm")).toBe(true);

    expect(root.querySelector("#flash-overlay")?.classList.contains("flash-rare")).toBe(true);
    const feedLine = root.querySelector("#feed li.drop-rare");
    expect(feedLine?.textContent).toMatch(/lucky charm/i);

    vi.advanceTimersByTime(1000); // > the flash duration
    expect(root.querySelector("#flash-overlay")?.classList.contains("flash-rare")).toBe(false);
  });
});

describe("Loot Feed band styling (#9)", () => {
  it("gives each Drop's feed line a band-specific CSS class for guaranteed/common/uncommon/rare", () => {
    // fixtureContent's "dummy" already has one entry per band (see the tooltip test above); force
    // every entry's chance to 1 so a single kill deterministically drops all four at once, instead
    // of grinding for the 1/128 rare entry to land on its own.
    const allBandsContent = {
      ...fixtureContent,
      monsters: fixtureContent.monsters.map((m) =>
        m.id === "dummy"
          ? { ...m, dropTable: m.dropTable.map((entry) => ({ ...entry, chance: 1 })) }
          : m,
      ),
    };
    const engine = createEngine(allBandsContent, seededRng(1));
    const root = document.createElement("main");
    mountApp(engine, root, allBandsContent, noopWindowChrome);
    engine.selectMonster("dummy");

    grindFor(engine, "lucky-charm"); // the rarest of the four — waiting for it waits for all four

    // grindFor's own lootAll() sweep (#60) may prepend a "Banked …" feed line ahead of the drop
    // lines — filter down to the drop-* classed lines so this stays about band styling, not sweep
    // timing/wording.
    const feedItems = [...root.querySelectorAll<HTMLLIElement>("#feed li")].filter((li) =>
      li.className.startsWith("drop-"),
    );
    // feedLine prepends, and the Engine emits drop events in dropTable array order (guaranteed,
    // common, uncommon, rare), so the newest-first feed reads rare, uncommon, common, guaranteed.
    expect(feedItems[0]?.className).toBe("drop-rare");
    expect(feedItems[0]?.textContent).toMatch(/lucky charm/i);
    expect(feedItems[1]?.className).toBe("drop-uncommon");
    expect(feedItems[1]?.textContent).toMatch(/bronze sword/i);
    expect(feedItems[2]?.className).toBe("drop-common");
    expect(feedItems[2]?.textContent).toMatch(/cooked meat/i);
    expect(feedItems[3]?.className).toBe("drop-guaranteed");
    expect(feedItems[3]?.textContent).toMatch(/gold/i);
  });
});

describe("Save → remount round-trip (#9)", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", stubLocalStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // Mirrors main.ts's own SAVE_KEY constant and its loadSave()/setInterval save wiring (ADR-0001:
  // the Engine itself has no localStorage access — that wiring lives entirely in main.ts). This
  // test reproduces that shape directly so the assertion is against a real save -> remount cycle,
  // not just the Engine-level Snapshot round-trip already covered in core/engine.test.ts.
  const SAVE_KEY = "sidescape-save-v1";

  it("mount, act, save to localStorage, and remount restores Skills, gold, the Bank, Equipment, and the selected Monster", () => {
    const engine1 = createEngine(fixtureContent, seededRng(1));
    const root1 = document.createElement("main");
    const app1 = mountApp(engine1, root1, fixtureContent, noopWindowChrome);

    engine1.selectMonster("dummy");
    grindFor(engine1, "bronze-sword");
    engine1.equip("bronze-sword");
    app1.render();

    // A little more play after equipping, so more than one Skill carries non-zero XP by save time.
    for (let i = 0; i < 200; i++) engine1.tick();
    app1.render();

    const before = engine1.snapshot();
    expect(before.monster?.id).toBe("dummy");
    expect(before.player.equipment.weapon).toBe("bronze-sword");
    expect(before.bank.items.some((s) => s.itemId === "bronze-sword")).toBe(false); // consumed by equip

    // Save, exactly as main.ts's periodic/close-time save does.
    localStorage.setItem(SAVE_KEY, JSON.stringify(before));

    // Unmount: engine1/root1 are discarded entirely. Remount is a fresh Engine built only from the
    // saved Snapshot, exactly as main.ts's loadSave() -> createEngine(content, rng, saved) does on
    // the next launch — a different seed proves the restored state isn't riding on engine1's Rng.
    const raw = localStorage.getItem(SAVE_KEY);
    expect(raw).not.toBeNull();
    const saved = JSON.parse(raw as string);
    const engine2 = createEngine(fixtureContent, seededRng(2), saved);
    const root2 = document.createElement("main");
    mountApp(engine2, root2, fixtureContent, noopWindowChrome);

    const after = engine2.snapshot();
    expect(after.player.skills).toEqual(before.player.skills);
    expect(after.player.gold).toBe(before.player.gold);
    expect(after.bank.items).toEqual(before.bank.items);
    expect(after.player.equipment).toEqual(before.player.equipment);
    expect(after.monster?.id).toBe("dummy");

    // The fresh mount's DOM already reflects the restored state without any further action.
    expect(root2.querySelector("#monster-name")?.textContent).toBe("Training Dummy");
    const weaponTile = root2.querySelector<HTMLElement>('[data-slot="weapon"]');
    expect(weaponTile?.dataset["item"]).toBe("bronze-sword");
    expect(root2.querySelector('#bank .tile[data-item="bronze-sword"]')).toBeNull();
    const attackXp = Math.floor(after.player.skills.attack.xp);
    expect(root2.querySelector<HTMLElement>('[data-skill="attack"]')?.title).toBe(
      `attack: ${attackXp} xp`,
    );
  });

  it("also restores Food Slots and the Loot Zone across a save round-trip (#60, #61)", () => {
    // Food assigned to a Slot lives in the slot, not the Bank (see FoodSlot in CONTEXT.md), so the
    // seeded state below is self-consistent: an empty Bank plus one filled Food Slot, and a
    // combat Drop still sitting unswept in the Loot Zone.
    const engine1 = createEngine(
      fixtureContent,
      seededRng(1),
      makeSnapshot({
        player: { foodSlots: [{ itemId: "meat", qty: 5 }, null, null] },
        lootZone: [{ itemId: "bar", qty: 2 }],
      }),
    );
    const root1 = document.createElement("main");
    const app1 = mountApp(engine1, root1, fixtureContent, noopWindowChrome);
    app1.render();

    const before = engine1.snapshot();
    expect(before.player.foodSlots[0]).toEqual({ itemId: "meat", qty: 5 });
    expect(before.lootZone).toEqual([{ itemId: "bar", qty: 2 }]);

    localStorage.setItem(SAVE_KEY, JSON.stringify(before));

    const raw = localStorage.getItem(SAVE_KEY);
    expect(raw).not.toBeNull();
    const saved = JSON.parse(raw as string);
    const engine2 = createEngine(fixtureContent, seededRng(2), saved);
    const root2 = document.createElement("main");
    mountApp(engine2, root2, fixtureContent, noopWindowChrome);

    const after = engine2.snapshot();
    expect(after.player.foodSlots).toEqual(before.player.foodSlots);
    expect(after.lootZone).toEqual(before.lootZone);

    // The fresh mount's DOM already reflects the restored Food Slot and Loot Zone without any
    // further action.
    const eatTile = root2.querySelector<HTMLElement>('[data-eat="0"]');
    expect(eatTile?.dataset["item"]).toBe("meat");
    expect(eatTile?.querySelector(".tile-qty")?.textContent).toBe("×5");
    expect(root2.querySelector<HTMLElement>("#loot-strip")?.hidden).toBe(false);
    const chip = root2.querySelector<HTMLLIElement>("#loot-strip-items .loot-chip");
    expect(chip?.dataset["item"]).toBe("bar");
    expect(chip?.querySelector(".tile-qty")?.textContent).toBe("×2");
  });
});
