// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEngine } from "../core/engine";
import { fixtureContent } from "../core/fixture-content";
import { makeSnapshot } from "../core/make-snapshot";
import { xpForLevel } from "../core/xp";
import { SKILL_NAMES } from "../core/types";
import { seededRng } from "../core/rng";
import { resolveContent } from "../core/validate-content";
import { mountApp } from "./app";
import { PRODUCTION_SKILLS } from "./production";
import type { WorkspaceChrome } from "./workspace-chrome";

/** A do-nothing WorkspaceChrome for tests that don't care about window resize/position (the vast
 * majority) — mirrors main.ts's real Tauri adapter's `.catch(console.error)`-guarded contract
 * without any Tauri API access, same shape as the browser-degrade path `npm run dev` uses. Tests
 * that specifically exercise the card-count seam (see "Workspace cards" below) pass their own spy
 * instead, to assert `setCardCount` is called with the right open-card count. */
const noopWindowChrome: WorkspaceChrome = {
  getCapacity: () => Promise.resolve(2),
  setCardCount: () => {},
};

/** A WorkspaceChrome spy (#206): records every `setCardCount` call in order, with a fixed capacity
 * (2 unless overridden) for `getCapacity()`. Shared by every describe block below that needs to
 * assert on the open-card count reported to WorkspaceChrome. */
function spyWindowChrome(capacity: 1 | 2 = 2) {
  const calls: number[] = [];
  const chrome: WorkspaceChrome = {
    getCapacity: () => Promise.resolve(capacity),
    setCardCount: (count) => {
      calls.push(count);
    },
  };
  return { chrome, calls };
}

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
  const app = mountApp(engine, root, resolveContent(fixtureContent), noopWindowChrome);
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

/** Clicks an Area's row in the World page's progression rail (#208) — session-only presentation
 * selection, never an Engine command, mirroring `selectBankTile`'s own "click and return the
 * element" shape. */
function selectAreaRow(root: HTMLElement, areaId: string): HTMLElement | null {
  const row = root.querySelector<HTMLElement>(`[data-area-select="${areaId}"]`);
  row?.click();
  return row;
}

describe("mountApp", () => {
  it("renders the Monster picker for the selected (default-idle: first-unlocked) Area only, its Monster buttons enabled", () => {
    const { root } = mount(1);
    const dummyBtn = root.querySelector<HTMLButtonElement>('[data-monster="dummy"]');
    expect(dummyBtn?.textContent).toBe("Training Dummy");
    expect(dummyBtn?.disabled).toBe(false);
    // "brute" lives in the locked Test Crypt, not the default-selected (first-unlocked) Test
    // Meadow — its detail isn't rendered until that Area's own rail row is selected (#208).
    expect(root.querySelector('[data-monster="brute"]')).toBeNull();
  });

  it("a locked Area can still be inspected from the rail: its Monster buttons render, dimmed/disabled, once selected", () => {
    const { root } = mount(1);
    selectAreaRow(root, "crypt");
    const bruteBtn = root.querySelector<HTMLButtonElement>('[data-monster="brute"]');
    expect(bruteBtn?.textContent).toBe("Crypt Brute");
    expect(bruteBtn?.disabled).toBe(true); // Test Crypt is locked until "gauntlet" is cleared
  });

  it("shows a locked Area's selected-detail label as '🔒 Clear <dungeon name>'", () => {
    const { root } = mount(1);
    const meadowLabel = root.querySelector(".area-name");
    expect(meadowLabel?.textContent).toBe("Test Meadow"); // unlocked from the start, no lock suffix

    selectAreaRow(root, "crypt");
    const cryptLabel = root.querySelector(".area-name");
    expect(cryptLabel?.textContent).toBe("Test Crypt 🔒 Clear The Gauntlet");
  });

  it("selecting a Monster renders a non-numeric HP bar", () => {
    const { root } = mount(1);
    root.querySelector<HTMLButtonElement>('[data-monster="dummy"]')?.click();

    expect(root.querySelector("#monster-name")).toBeNull();
    expect((root.querySelector("#monster-hp-fill") as HTMLElement).style.width).toBe("100%");
    expect(root.querySelector("#monster-hp-text")).toBeNull();
  });

  it("pumping Ticks visibly reduces the selected Monster's HP", () => {
    const { engine, root, app } = mount(99);
    root.querySelector<HTMLButtonElement>('[data-monster="dummy"]')?.click();
    expect((root.querySelector("#monster-hp-fill") as HTMLElement).style.width).toBe("100%");

    for (let i = 0; i < 4; i++) {
      engine.tick();
      app.render();
    }

    expect(root.querySelector("#monster-hp-text")).toBeNull();
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
    mountApp(engine, root, resolveContent(noValueContent), noopWindowChrome);

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
    expect(root.querySelector("#gold")).toBeNull();
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

/**
 * A 3-Area fixture (#208) built specifically to differentiate `resolveSelectedArea`'s priority
 * steps, which fixtureContent's own 2-Area meadow/crypt shape can't cleanly separate:
 * - "alpha": unlocked, first in Snapshot order, hosts "dummy" — the step-5 (first-unlocked)
 *   fallback target.
 * - "beta": unlocked, hosts "brute" and the (reused) "pond" Fishing Spot, AND hosts "gauntlet" — a
 *   single-Wave Dungeon whose one Wave/Boss ("boss-dummy") is NOT a member of any Area's
 *   `monsterIds`. That absence is deliberate: it's what makes the dungeon-host priority step
 *   (step 2) load-bearing rather than redundant with the monster-containment step (step 3), the
 *   same reasoning `resolveTheme` documents for its own identical dungeon-first check.
 * - "gamma": locked (gated by "gauntlet", hosted in "beta" — not itself), no Monsters, so it only
 *   exercises rail inspection/gate-copy, never activity dispatch.
 */
const priorityContent = {
  ...fixtureContent,
  areas: [
    { id: "alpha", name: "Alpha", monsterIds: ["dummy"], theme: "meadow" as const },
    {
      id: "beta",
      name: "Beta",
      monsterIds: ["brute"],
      fishingSpotIds: ["pond"],
      theme: "forest" as const,
    },
    {
      id: "gamma",
      name: "Gamma",
      unlockedByDungeonId: "gauntlet",
      monsterIds: [],
      theme: "crypt" as const,
    },
  ],
  dungeons: [
    {
      id: "gauntlet",
      name: "The Gauntlet",
      areaId: "beta",
      waves: ["boss-dummy"],
      chest: [{ itemId: "gold", qty: 1, chance: 1, band: "guaranteed" as const }],
    },
  ],
};

function mountPriority(seed = 1) {
  const engine = createEngine(priorityContent, seededRng(seed));
  const root = document.createElement("main");
  const app = mountApp(engine, root, resolveContent(priorityContent), noopWindowChrome);
  return { engine, root, app };
}

describe("World page — selected-Area progression rail (#208)", () => {
  it("renders all Areas in the rail, in Snapshot order, with the locked one dimmed", () => {
    const { root } = mountPriority();
    const rows = [...root.querySelectorAll<HTMLButtonElement>("[data-area-select]")];
    expect(rows.map((r) => r.dataset["areaSelect"])).toEqual(["alpha", "beta", "gamma"]);
    expect(rows.map((r) => r.textContent?.trim().startsWith("Gamma"))).toEqual([
      false,
      false,
      true,
    ]);
    expect(rows[2]?.classList.contains("locked")).toBe(true);
    expect(rows[0]?.classList.contains("locked")).toBe(false);
    expect(rows[1]?.classList.contains("locked")).toBe(false);
  });

  it("resolves the idle default to the first-unlocked Area (priority step 5)", () => {
    const { root } = mountPriority();
    expect(root.querySelector(".area-name")?.textContent).toBe("Alpha");
    expect(root.querySelector('[data-monster="dummy"]')).not.toBeNull();
  });

  it("an active Fishing Spot resolves its own Area over the first-unlocked fallback (priority step 4)", () => {
    const { engine, root, app } = mountPriority();
    engine.selectFishingSpot("pond"); // hosted in "beta", not the first-unlocked "alpha"
    app.render();

    expect(root.querySelector(".area-name")?.textContent).toBe("Beta");
    const pondBtn = root.querySelector<HTMLButtonElement>('[data-spot="pond"]');
    expect(pondBtn?.classList.contains("active")).toBe(true);
  });

  it("an active Dungeon resolves its HOST Area even when the current Wave's Monster belongs to no Area (priority step 2 over step 3)", () => {
    const { engine, root, app } = mountPriority();
    engine.enterDungeon("gauntlet"); // hosted in "beta"; its only Wave is "boss-dummy"
    app.render();

    // "boss-dummy" is a member of no Area's monsterIds — the monster-containment step (3) alone
    // would fail to resolve any Area here, falling through to "alpha" (first-unlocked). The
    // dungeon-host step (2) must run first for this to show "beta" instead.
    expect(root.querySelector(".area-name")?.textContent).toBe("Beta");
    expect(engine.snapshot().monster?.id).toBe("boss-dummy");

    const betaRow = root.querySelector<HTMLElement>('[data-area-select="beta"]');
    expect(betaRow?.classList.contains("current")).toBe(true); // active-Dungeon accent
    expect(betaRow?.classList.contains("selected")).toBe(true); // also the shown detail
  });

  it("selectedAreaId (priority step 1) outranks every Snapshot-driven step, including the active Dungeon's own host Area", () => {
    const { engine, root, app } = mountPriority();
    engine.enterDungeon("gauntlet"); // host: "beta"
    app.render();
    expect(root.querySelector(".area-name")?.textContent).toBe("Beta");

    selectAreaRow(root, "gamma"); // locked, hosts no activity — pure inspection
    expect(root.querySelector(".area-name")?.textContent).toBe("Gamma 🔒 Clear The Gauntlet");

    // The active Dungeon's host keeps its own accent even while a different Area is selected —
    // "current" (activity) and "selected" (inspected) are independent concepts (#208).
    const betaRow = root.querySelector<HTMLElement>('[data-area-select="beta"]');
    const gammaRow = root.querySelector<HTMLElement>('[data-area-select="gamma"]');
    expect(betaRow?.classList.contains("current")).toBe(true);
    expect(betaRow?.classList.contains("selected")).toBe(false);
    expect(gammaRow?.classList.contains("selected")).toBe(true);
    expect(gammaRow?.classList.contains("current")).toBe(false);

    // Locked Gamma has no Monsters/Fishing Spots/Dungeon of its own — nothing to dispatch, but the
    // Snapshot proves the Dungeon run kept going untouched by merely inspecting it.
    expect(engine.snapshot().dungeon?.id).toBe("gauntlet");
  });

  it("selecting a different Area replaces the previously-shown selected-detail markup", () => {
    const { root } = mountPriority();
    expect(root.querySelector(".area-name")?.textContent).toBe("Alpha");
    expect(root.querySelector('[data-monster="dummy"]')).not.toBeNull();

    selectAreaRow(root, "beta");
    expect(root.querySelector(".area-name")?.textContent).toBe("Beta");
    expect(root.querySelector('[data-monster="dummy"]')).toBeNull(); // Alpha's detail is gone
    expect(root.querySelector('[data-monster="brute"]')).not.toBeNull();
  });

  it("a locked Area's row is selectable for inspection, but dispatches no command even if its (disabled) button is clicked", () => {
    const { engine, root } = mountPriority();
    // `savedAt` is re-stamped on every snapshot() call (#134), so drop it before comparing state.
    const stateOf = () => {
      const { savedAt: _savedAt, ...rest } = engine.snapshot();
      return rest;
    };
    const before = stateOf();

    selectAreaRow(root, "gamma");
    expect(root.querySelector(".area-name")?.textContent).toBe("Gamma 🔒 Clear The Gauntlet");
    // Gamma has no Monsters, but Beta (still locked-irrelevant here) demonstrates the general
    // disabled-button-never-fires-click rule already covered by the fixtureContent-based tests
    // above (e.g. "a locked Area can still be inspected..."); this test's own job is proving the
    // rail selection itself is inert on the Snapshot.
    expect(stateOf()).toEqual(before);
  });

  it("Area-row selection alone never changes the Snapshot (no command dispatch from the rail)", () => {
    const { engine, root } = mountPriority();
    const stateOf = () => {
      const { savedAt: _savedAt, ...rest } = engine.snapshot();
      return JSON.stringify(rest);
    };
    const before = stateOf();

    selectAreaRow(root, "beta");
    selectAreaRow(root, "gamma");
    selectAreaRow(root, "alpha");

    expect(stateOf()).toBe(before);
  });

  it("the active Monster/Fishing Spot/Dungeon button gets the active accent class, scoped to whichever is actually running", () => {
    const { engine, root, app } = mountPriority();
    engine.selectMonster("dummy");
    app.render();

    const dummyBtn = root.querySelector<HTMLButtonElement>('[data-monster="dummy"]');
    expect(dummyBtn?.classList.contains("active")).toBe(true);
  });
});

describe.skip("Monster stats line (removed from Compact Widget by #210)", () => {
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
    mountApp(engine, root, resolveContent(fixtureContent), noopWindowChrome);
    selectAreaRow(root, "crypt"); // #208: brute's detail only renders once Test Crypt is selected
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
    mountApp(engine, root, resolveContent(weakToSlashWithFire), noopWindowChrome);
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

  it("gives each Monster its own tooltip, keyed off its Drop Table — even a locked Area's, once inspected", () => {
    const { root } = mount(1);
    selectAreaRow(root, "crypt"); // #208: locked Areas stay inspectable, tooltip included
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
    mountApp(engine, root, resolveContent(fixtureContent), noopWindowChrome);

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
    mountApp(engine, root, resolveContent(fixtureContent), noopWindowChrome);

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
    mountApp(engine, root, resolveContent(fixtureContent), noopWindowChrome);

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
    mountApp(engine, root, resolveContent(fixtureContent), noopWindowChrome);

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
    mountApp(engine, root, resolveContent(fixtureContent), noopWindowChrome);

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

  it("shows capitalized name, level, exact XP, and percent-to-next in a tooltip on the Skill cell (#135)", () => {
    // Boundary xp (exactly at level 10's floor) is an independent worked example for 0% — same
    // pattern the bar-fill tests above use — so the expected tooltip string needs no re-derivation
    // of skillProgress's own math.
    const engine = createEngine(
      fixtureContent,
      seededRng(1),
      makeSnapshot({
        player: {
          hp: 10,
          maxHp: 10,
          skills: { attack: { level: 10, xp: xpForLevel(10) } },
        },
      }),
    );
    const root = document.createElement("main");
    mountApp(engine, root, resolveContent(fixtureContent), noopWindowChrome);

    const attackSkill = root.querySelector<HTMLElement>('[data-skill="attack"]');
    expect(attackSkill?.title).toBe(`Attack: level 10 · ${xpForLevel(10)} xp · 0% to 11`);
  });
});

describe("Skills page (#222: replaces the Character card's abbreviation-chip xp-row)", () => {
  it("renders 12 rows: all 11 SKILL_NAMES in order via data-skill, then the Total row last", () => {
    const { root } = mount(1);
    const rows = [...root.querySelectorAll<HTMLElement>("#skills-list .skill")];
    expect(rows).toHaveLength(12);
    expect(rows.map((c) => c.dataset["skill"])).toEqual([...SKILL_NAMES, undefined]);
    expect(rows[11]?.classList.contains("skill-total")).toBe(true);
  });

  it("gives every Skill row's icon a non-empty src, sized by the shared 34px .skill-icon chassis (#168)", () => {
    const { root } = mount(1);
    const imgs = [
      ...root.querySelectorAll<HTMLImageElement>("#skills-list .skill[data-skill] img"),
    ];
    expect(imgs).toHaveLength(11);
    for (const img of imgs) {
      expect(img.getAttribute("src")).toBeTruthy();
      expect(img.classList.contains("skill-icon")).toBe(true); // styles.css fixes this class at 34px
    }
  });

  it("shows each row's Skill name alongside its level and XP-to-next", () => {
    const { root } = mount(1);
    const attackRow = root.querySelector<HTMLElement>('#skills-list [data-skill="attack"]');
    expect(attackRow?.querySelector(".skill-name")?.textContent).toMatch(/^Attack/);
    expect(attackRow?.querySelector(".skill-level")?.textContent).toBe("1");
    expect(attackRow?.querySelector(".skill-xp-next")?.textContent).toMatch(/to next/i);
  });

  it("shows the Total row as the sum of all 11 Skill levels, and updates it after a level-up Tick", () => {
    const engine = createEngine(
      fixtureContent,
      seededRng(1),
      makeSnapshot({
        player: {
          hp: 10,
          maxHp: 10,
          skills: { attack: { level: 1, xp: xpForLevel(2) - 1 } },
        },
      }),
    );
    const root = document.createElement("main");
    const app = mountApp(engine, root, resolveContent(fixtureContent), noopWindowChrome);

    const before = engine.snapshot().player.skills;
    const expectedBefore = SKILL_NAMES.reduce((sum, s) => sum + before[s].level, 0);
    const totalCell = root.querySelector<HTMLElement>("#skills-list .skill-total .skill-level");
    expect(totalCell?.textContent).toBe(String(expectedBefore));
    // The same Total also drives the Character card's one-line summary (#222).
    expect(root.querySelector("#summary-total-level")?.textContent).toBe(String(expectedBefore));

    root.querySelector<HTMLButtonElement>('[data-monster="dummy"]')?.click();
    for (let i = 0; i < 20; i++) engine.tick();
    app.render();

    const after = engine.snapshot().player.skills;
    const expectedAfter = SKILL_NAMES.reduce((sum, s) => sum + after[s].level, 0);
    expect(after.attack.level).toBeGreaterThan(before.attack.level); // sanity: a level-up did occur
    expect(
      root.querySelector<HTMLElement>("#skills-list .skill-total .skill-level")?.textContent,
    ).toBe(String(expectedAfter));
    expect(root.querySelector("#summary-total-level")?.textContent).toBe(String(expectedAfter));
    expect(expectedAfter).toBeGreaterThan(expectedBefore);
  });

  it("#xp-row no longer exists on the Character card", () => {
    const { root } = mount(1);
    expect(root.querySelector("#xp-row")).toBeNull();
  });
});

describe("Character card levels summary (#222)", () => {
  it("is a button that shows the live Combat level and Total level, and dispatches the skills destination", async () => {
    const { root } = mount(1);
    const summary = root.querySelector<HTMLButtonElement>("#character-levels-summary");
    expect(summary?.tagName).toBe("BUTTON");
    expect(summary?.dataset["destination"]).toBe("skills");
    expect(root.querySelector("#summary-combat-level")?.textContent).not.toBe("");
    expect(root.querySelector("#summary-total-level")?.textContent).not.toBe("");

    summary?.click();
    await vi.waitFor(() =>
      expect(root.querySelector<HTMLElement>('[data-management-page="skills"]')?.hidden).toBe(
        false,
      ),
    );
    expect(root.querySelector<HTMLElement>("#card-management")?.hidden).toBe(false);
  });

  it("shows the exact Combat level from the Snapshot", () => {
    const engine = createEngine(fixtureContent, seededRng(1));
    const root = document.createElement("main");
    mountApp(engine, root, resolveContent(fixtureContent), noopWindowChrome);
    expect(root.querySelector("#summary-combat-level")?.textContent).toBe(
      String(engine.snapshot().player.combatLevel),
    );
  });
});

describe("Character hub destination nav (#206: World/Workshop/Activity nav buttons and Expand Bank)", () => {
  function mountWithChrome(chrome: WorkspaceChrome) {
    const engine = createEngine(fixtureContent, seededRng(1));
    const root = document.createElement("main");
    const app = mountApp(engine, root, resolveContent(fixtureContent), chrome);
    return { engine, root, app };
  }

  function destinationBtn(root: HTMLElement, destination: string) {
    return root.querySelector<HTMLButtonElement>(`[data-destination="${destination}"]`);
  }

  function cardHidden(root: HTMLElement, id: string): boolean | undefined {
    return root.querySelector<HTMLElement>(`#${id}`)?.hidden;
  }

  function pageHidden(root: HTMLElement, destination: string): boolean | undefined {
    return root.querySelector<HTMLElement>(`[data-management-page="${destination}"]`)?.hidden;
  }

  it("both cards are closed on a fresh mount", () => {
    const { root } = mountWithChrome(noopWindowChrome);
    expect(cardHidden(root, "card-character")).toBe(true);
    expect(cardHidden(root, "card-management")).toBe(true);
    expect(root.querySelector<HTMLElement>("#management-row")?.hidden).toBe(true);
  });

  it("boot sync requests zero cards exactly once when starting closed", () => {
    const { chrome, calls } = spyWindowChrome();
    mountWithChrome(chrome);
    expect(calls).toEqual([0]);
  });

  it("the menu button opens Character alone; pressing it again while either card is visible closes both", async () => {
    const { chrome, calls } = spyWindowChrome();
    const { root } = mountWithChrome(chrome);
    calls.length = 0; // ignore the initial boot-sync call
    const menu = root.querySelector<HTMLButtonElement>("#menu-toggle");

    menu?.click();
    expect(cardHidden(root, "card-character")).toBe(false);
    expect(cardHidden(root, "card-management")).toBe(true);
    expect(calls).toEqual([1]);
    expect(menu?.classList.contains("active")).toBe(true);

    // Open a destination too, then confirm one more menu click closes both cards at once.
    destinationBtn(root, "world")?.click();
    await vi.waitFor(() => expect(cardHidden(root, "card-management")).toBe(false));

    menu?.click();
    expect(cardHidden(root, "card-character")).toBe(true);
    expect(cardHidden(root, "card-management")).toBe(true);
    expect(menu?.classList.contains("active")).toBe(false);
  });

  it("a destination click opens the Management card alongside Character at capacity 2 (nested-icon clicks resolve via closest())", async () => {
    const { root } = mountWithChrome(noopWindowChrome); // noop chrome resolves capacity 2
    root.querySelector<HTMLImageElement>('[data-destination="world"] img')?.click();

    await vi.waitFor(() => expect(cardHidden(root, "card-management")).toBe(false));
    expect(cardHidden(root, "card-character")).toBe(false); // both coexist at capacity 2
    expect(pageHidden(root, "world")).toBe(false);
    expect(pageHidden(root, "bank")).toBe(true);
    expect(pageHidden(root, "workshop")).toBe(true);
    expect(pageHidden(root, "activity")).toBe(true);
    expect(pageHidden(root, "skills")).toBe(true);
    expect(destinationBtn(root, "world")?.classList.contains("active")).toBe(true);
  });

  it("the Skills destination (#222) behaves identically to the other four: opens alongside Character at capacity 2, and its nav button reuses an existing icon", async () => {
    const { root } = mountWithChrome(noopWindowChrome);
    destinationBtn(root, "skills")?.click();

    await vi.waitFor(() => expect(cardHidden(root, "card-management")).toBe(false));
    expect(cardHidden(root, "card-character")).toBe(false);
    expect(pageHidden(root, "skills")).toBe(false);
    expect(pageHidden(root, "world")).toBe(true);
    expect(destinationBtn(root, "skills")?.classList.contains("active")).toBe(true);
    const icon = destinationBtn(root, "skills")?.querySelector<HTMLImageElement>("img.tab-icon");
    expect(icon?.getAttribute("src")).toBeTruthy();

    root.querySelector<HTMLButtonElement>("[data-management-back]")?.click();
    expect(cardHidden(root, "card-management")).toBe(true);
    expect(cardHidden(root, "card-character")).toBe(false);
  });

  it("at capacity 1, the Skills destination replaces Character outright, and Back restores it (mirrors the other four destinations)", async () => {
    const { chrome } = spyWindowChrome(1);
    const { root } = mountWithChrome(chrome);
    root.querySelector<HTMLButtonElement>("#menu-toggle")?.click();
    expect(cardHidden(root, "card-character")).toBe(false);

    destinationBtn(root, "skills")?.click();
    await vi.waitFor(() => expect(cardHidden(root, "card-management")).toBe(false));
    expect(cardHidden(root, "card-character")).toBe(true);

    root.querySelector<HTMLButtonElement>("[data-management-back]")?.click();
    expect(cardHidden(root, "card-character")).toBe(false);
    expect(cardHidden(root, "card-management")).toBe(true);
  });

  it("selecting another destination replaces the Management card's body, without touching Character", async () => {
    const { root } = mountWithChrome(noopWindowChrome);
    destinationBtn(root, "world")?.click();
    await vi.waitFor(() => expect(pageHidden(root, "world")).toBe(false));

    root.querySelector<HTMLElement>('[data-destination="workshop"] span')?.click();
    await vi.waitFor(() => expect(pageHidden(root, "workshop")).toBe(false));

    expect(pageHidden(root, "world")).toBe(true);
    expect(cardHidden(root, "card-character")).toBe(false); // still open, untouched
    expect(destinationBtn(root, "workshop")?.classList.contains("active")).toBe(true);
  });

  it("at capacity 1, a destination click replaces Character outright, and Back restores it", async () => {
    const { chrome } = spyWindowChrome(1);
    const { root } = mountWithChrome(chrome);
    root.querySelector<HTMLButtonElement>("#menu-toggle")?.click();
    expect(cardHidden(root, "card-character")).toBe(false);

    destinationBtn(root, "activity")?.click();
    await vi.waitFor(() => expect(cardHidden(root, "card-management")).toBe(false));
    expect(cardHidden(root, "card-character")).toBe(true); // replaced, not coexisting

    root.querySelector<HTMLButtonElement>("[data-management-back]")?.click();
    expect(cardHidden(root, "card-character")).toBe(false);
    expect(cardHidden(root, "card-management")).toBe(true);
  });

  it("the Management card's Back control also closes it when both cards were open (second-card close)", async () => {
    const { root } = mountWithChrome(noopWindowChrome);
    destinationBtn(root, "world")?.click();
    await vi.waitFor(() => expect(cardHidden(root, "card-management")).toBe(false));

    root.querySelector<HTMLButtonElement>("[data-management-back]")?.click();
    expect(cardHidden(root, "card-management")).toBe(true);
    expect(cardHidden(root, "card-character")).toBe(false); // Character remains
  });

  it('"Expand Bank" dispatches the bank destination', async () => {
    const { root } = mountWithChrome(noopWindowChrome);
    root.querySelector<HTMLButtonElement>("#menu-toggle")?.click();

    root.querySelector<HTMLButtonElement>("#expand-bank-btn")?.click();
    await vi.waitFor(() => expect(pageHidden(root, "bank")).toBe(false));
    // #219 deleted the Management card's own `#management-title` chrome; the bank page's own
    // `#bank-header` (rendered by the bank page itself) is now the "where am I" cue instead.
    expect(root.querySelector<HTMLElement>("#bank-header")?.textContent).toMatch(/^Bank /);
  });

  it("switching destinations reports the same card count exactly once (one geometry sync per action)", async () => {
    const { chrome, calls } = spyWindowChrome();
    const { root } = mountWithChrome(chrome);
    destinationBtn(root, "world")?.click();
    await vi.waitFor(() => expect(pageHidden(root, "world")).toBe(false));
    calls.length = 0;

    destinationBtn(root, "workshop")?.click();
    await vi.waitFor(() => expect(pageHidden(root, "workshop")).toBe(false));

    expect(calls).toEqual([2]); // still Character + Management, unchanged count
  });

  it("stable canonical Character -> Management DOM order, regardless of which is open", async () => {
    const { root } = mountWithChrome(noopWindowChrome);
    const domOrder = () =>
      [...root.querySelectorAll<HTMLElement>(".management-card")].map((c) => c.id);
    expect(domOrder()).toEqual(["card-character", "card-management"]);

    destinationBtn(root, "world")?.click();
    await vi.waitFor(() => expect(pageHidden(root, "world")).toBe(false));
    expect(domOrder()).toEqual(["card-character", "card-management"]); // order never changes
  });

  it("the picker, XP row, and style/auto-eat controls still work from the Character hub / World destination", async () => {
    const { engine, root } = mountWithChrome(noopWindowChrome);
    root.querySelector<HTMLButtonElement>("#menu-toggle")?.click();
    destinationBtn(root, "world")?.click();
    await vi.waitFor(() => expect(pageHidden(root, "world")).toBe(false));

    root.querySelector<HTMLButtonElement>('[data-monster="dummy"]')?.click();
    expect(engine.snapshot().monster?.id).toBe("dummy");
    expect(root.querySelector("#monster-name")).toBeNull();

    root.querySelector<HTMLButtonElement>('[data-style="accurate"]')?.click();
    expect(engine.snapshot().player.combatStyle).toBe("accurate");
    root.querySelector<HTMLButtonElement>('[data-threshold="0"]')?.click();
    expect(engine.snapshot().player.autoEatThreshold).toBe(0);

    expect(root.querySelector('[data-skill="attack"]')).not.toBeNull();
  });

  it("the Bank|Vendor toggle switches the Management card's bank-destination body", async () => {
    const { root } = mountWithChrome(noopWindowChrome);
    root.querySelector<HTMLButtonElement>("#menu-toggle")?.click();
    root.querySelector<HTMLButtonElement>("#expand-bank-btn")?.click();
    await vi.waitFor(() => expect(pageHidden(root, "bank")).toBe(false));

    expect(root.querySelector<HTMLElement>('[data-bank-page="bank"]')?.hidden).toBe(false);
    expect(root.querySelector<HTMLElement>('[data-bank-page="vendor"]')?.hidden).toBe(true);

    root.querySelector<HTMLButtonElement>('[data-bankpage="vendor"]')?.click();
    expect(root.querySelector<HTMLElement>('[data-bank-page="vendor"]')?.hidden).toBe(false);
    expect(root.querySelector<HTMLElement>('[data-bank-page="bank"]')?.hidden).toBe(true);
    expect(root.querySelector("#vendor-list")).not.toBeNull();
  });
});

describe("Workspace state is session-only (#206: stale sidescape-ui-workspace-v2/-panels keys are ignored)", () => {
  function mountFresh() {
    const engine = createEngine(fixtureContent, seededRng(1));
    const root = document.createElement("main");
    mountApp(engine, root, resolveContent(fixtureContent), noopWindowChrome);
    return { engine, root };
  }

  it("never writes sidescape-ui-workspace-v2 any more", () => {
    vi.stubGlobal("localStorage", stubLocalStorage());
    try {
      const { root } = mountFresh();
      root.querySelector<HTMLButtonElement>("#menu-toggle")?.click();
      expect(localStorage.getItem("sidescape-ui-workspace-v2")).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("ignores a stale v2 value left by a pre-#206 build — both cards still start closed", () => {
    vi.stubGlobal("localStorage", stubLocalStorage());
    try {
      localStorage.setItem(
        "sidescape-ui-workspace-v2",
        JSON.stringify({ version: 2, characterTab: "skills", resourceTab: "vendor" }),
      );
      const { root } = mountFresh();
      expect(root.querySelector<HTMLElement>("#card-character")?.hidden).toBe(true);
      expect(root.querySelector<HTMLElement>("#card-management")?.hidden).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("ignores a stale legacy sidescape-ui-panels value too", () => {
    vi.stubGlobal("localStorage", stubLocalStorage());
    try {
      localStorage.setItem("sidescape-ui-panels", JSON.stringify({ left: true, tab: "skills" }));
      const { root } = mountFresh();
      expect(root.querySelector<HTMLElement>("#card-character")?.hidden).toBe(true);
      expect(root.querySelector<HTMLElement>("#card-management")?.hidden).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("a remount always restarts with both cards closed, even after opening them pre-remount", () => {
    vi.stubGlobal("localStorage", stubLocalStorage());
    try {
      const engine = createEngine(fixtureContent, seededRng(1));
      const root1 = document.createElement("main");
      mountApp(engine, root1, resolveContent(fixtureContent), noopWindowChrome);
      root1.querySelector<HTMLButtonElement>("#menu-toggle")?.click();
      expect(root1.querySelector<HTMLElement>("#card-character")?.hidden).toBe(false);

      const root2 = document.createElement("main");
      mountApp(engine, root2, resolveContent(fixtureContent), noopWindowChrome);
      expect(root2.querySelector<HTMLElement>("#card-character")?.hidden).toBe(true);
      expect(root2.querySelector<HTMLElement>("#card-management")?.hidden).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("never touches the Engine Snapshot/save", () => {
    vi.stubGlobal("localStorage", stubLocalStorage());
    try {
      const { engine, root } = mountFresh();
      root.querySelector<HTMLButtonElement>("#menu-toggle")?.click();
      expect(JSON.stringify(engine.snapshot())).not.toMatch(/workspace/i);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("Vertical cards-on-glass composition (#151 §1/§2, #206)", () => {
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

  it("nests the floating widget-controls cluster and its close control, plus the Settings popover's export/import/mute controls, inside the compact/Character cards (#219 replaced the titlebar with an overlaid cluster; #206 moved Mute/Export/Import into the Settings popover)", () => {
    const { root } = mount(1);
    const compact = root.querySelector<HTMLElement>("#compact-widget");
    const character = root.querySelector<HTMLElement>("#card-character");
    expect(root.querySelector("#widget-controls")?.closest("#compact-widget")).toBe(compact);
    expect(root.querySelector("#close-btn")?.closest("#widget-controls")).not.toBeNull();
    expect(root.querySelector("#close-btn")?.closest("#compact-widget")).toBe(compact);
    for (const id of ["#export-save", "#import-save", "#mute-toggle"]) {
      expect(root.querySelector(id)?.closest("#card-character")).toBe(character);
    }
  });

  it("collapses the management row while both cards are closed, and reveals it once one opens", async () => {
    const { root } = mount(1);
    expect(root.querySelector<HTMLElement>("#management-row")?.hidden).toBe(true);

    root.querySelector<HTMLButtonElement>("#menu-toggle")?.click();
    await vi.waitFor(() =>
      expect(root.querySelector<HTMLElement>("#management-row")?.hidden).toBe(false),
    );

    root.querySelector<HTMLButtonElement>("#menu-toggle")?.click();
    expect(root.querySelector<HTMLElement>("#management-row")?.hidden).toBe(true);
  });
});

describe("Cards on glass — close interactions, drag regions, and Escape (#206)", () => {
  it("clicking the transparent glass (document.body itself) closes both cards", async () => {
    const engine = createEngine(fixtureContent, seededRng(1));
    // Mount into document.body so the body-level glass-click handler has a real body to fire on.
    document.body.innerHTML = "";
    const root = document.createElement("main");
    document.body.appendChild(root);
    try {
      mountApp(engine, root, resolveContent(fixtureContent), noopWindowChrome);
      root.querySelector<HTMLButtonElement>("#menu-toggle")?.click();
      root.querySelector<HTMLButtonElement>('[data-destination="world"]')?.click();
      await vi.waitFor(() =>
        expect(root.querySelector<HTMLElement>("#card-management")?.hidden).toBe(false),
      );

      document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }));

      expect(root.querySelector<HTMLElement>("#card-character")?.hidden).toBe(true);
      expect(root.querySelector<HTMLElement>("#card-management")?.hidden).toBe(true);
    } finally {
      document.body.innerHTML = "";
    }
  });

  it("Escape closes the Management card back to Character first, then closes Character — a no-op once both are closed", async () => {
    const { root } = mount(1);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(root.querySelector<HTMLElement>("#card-character")?.hidden).toBe(true);
    expect(root.querySelector<HTMLElement>("#card-management")?.hidden).toBe(true);

    root.querySelector<HTMLButtonElement>('[data-destination="world"]')?.click();
    await vi.waitFor(() =>
      expect(root.querySelector<HTMLElement>("#card-management")?.hidden).toBe(false),
    );
    expect(root.querySelector<HTMLElement>("#card-character")?.hidden).toBe(false);

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(root.querySelector<HTMLElement>("#card-management")?.hidden).toBe(true);
    expect(root.querySelector<HTMLElement>("#card-character")?.hidden).toBe(false); // Back step first

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(root.querySelector<HTMLElement>("#card-character")?.hidden).toBe(true); // then Character
  });

  it("card headers carry no drag region, background, or title text — only their nav icons/back arrow survive de-chroming (#219)", () => {
    const { root } = mount(1);
    const characterHeader = root.querySelector<HTMLElement>(
      "#card-character .management-card-header",
    );
    expect(characterHeader?.hasAttribute("data-tauri-drag-region")).toBe(false);
    // The "Character" title span is gone entirely; only the nav (destination buttons + settings
    // gear) remains inside the header.
    expect(characterHeader?.querySelector(".card-nav-title")).toBeNull();
    expect(characterHeader?.querySelector("#character-nav")).not.toBeNull();
    expect(
      characterHeader?.querySelector<HTMLElement>("button[data-destination], button[data-nav]"),
    ).not.toBeNull();

    const managementHeader = root.querySelector<HTMLElement>(
      "#card-management .management-card-header",
    );
    expect(managementHeader?.hasAttribute("data-tauri-drag-region")).toBe(false);
    // The old `#management-title` "World"/"Workshop"/"Bank"/"Activity" label is deleted, not
    // just hidden — de-chroming removes the header's only text content.
    expect(root.querySelector("#management-title")).toBeNull();
    const backBtn = managementHeader?.querySelector<HTMLElement>("[data-management-back]");
    expect(backBtn).not.toBeNull();
    expect(backBtn?.hasAttribute("data-tauri-drag-region")).toBe(false);
  });

  it('`data-tauri-drag-region` appears exactly once in the whole document, on #compact-widget, with value "deep" (#219)', () => {
    const { root } = mount(1);
    const tagged = [...root.querySelectorAll("[data-tauri-drag-region]")];
    expect(tagged.map((el) => el.id)).toEqual(["compact-widget"]);
    expect(tagged[0]?.getAttribute("data-tauri-drag-region")).toBe("deep");
  });

  it("every interactive element inside #compact-widget's subtree is a natively-clickable tag, or explicitly opts out with data-tauri-drag-region=\"false\" — the regression guard for #219's deep drag region: it must fail the moment a future <div onclick> OR a delegated <li data-item>/<div data-slot> tile lands inside the widget", () => {
    const { root } = mount(1);
    const widget = root.querySelector<HTMLElement>("#compact-widget");
    expect(widget).not.toBeNull();

    // Tauri 2.11's drag.js exempts these tags from a `deep` drag region for free; anything else
    // inside the widget becomes a drag surface, and mousedown on it gets preventDefault() +
    // stopImmediatePropagation() before any listener runs — the click is handed to the OS and
    // silently lost.
    const NATIVE_CLICKABLE_TAGS = new Set(["BUTTON", "INPUT", "SELECT", "A", "TEXTAREA", "LABEL"]);
    const CLICKABLE_ROLES = new Set([
      "button",
      "link",
      "menuitem",
      "tab",
      "checkbox",
      "radio",
      "switch",
      "option",
    ]);

    // SideScape does NOT mostly dispatch clicks via `onclick`/`tabindex`/`role` — its dominant
    // idiom is DELEGATION on plain <div>/<li> keyed by a `data-*` attribute, resolved with
    // `closest(...)`/`event.target.dataset` on an ancestor listener (see app.ts's
    // `addEventListener("click", …)` handlers: `.tile[data-item]` on #bank/#character-bank-tray,
    // `[data-item]` on the loadout dispatchers, `[data-gear-assign]`/`[data-gear-add]` on
    // #character-slots, `[data-area-select]`, `[data-destination]`, and the four
    // `createLoadoutSlotDispatcher` key sets). Such an element carries NONE of the four
    // attributes above, so a check that only looked for those would miss exactly the bug this
    // guard exists to prevent: a `<li class="loot-chip" data-item="…">` (what wave 2/6 adds to
    // this widget) would sail through while losing every click to the OS drag. So a delegation
    // hook counts as "interactive" here, and inside the widget it must be a natively-clickable
    // tag. Derived from app.ts's click listeners, not guessed:
    const DELEGATION_HOOKS = new Set([
      "data-item",
      "data-slot",
      "data-style",
      "data-threshold",
      "data-monster",
      "data-spot",
      "data-dungeon",
      "data-sell",
      "data-equip",
      "data-recipe",
      "data-vendor-buy",
      "data-area-select",
      "data-destination",
      "data-nav",
      "data-menu",
      "data-management-back",
      "data-gear-assign",
      "data-gear-add",
      "data-bankpage",
      "data-bank-filter",
      "data-production-skill",
      "data-ui-scale",
      "data-loot-all",
      "data-buy-slots",
      "data-eat",
      "data-unassign",
      "data-assign",
      "data-add",
      "data-potion-unassign",
      "data-potion-assign",
      "data-potion-add",
      "data-quiver-unassign",
      "data-quiver-assign",
      "data-quiver-add",
      "data-rune-unassign",
      "data-rune-assign",
      "data-rune-add",
    ]);

    // Fail-closed backstop against hook drift: a NEW delegated `data-*` hook invented by a future
    // issue wouldn't be in the set above, so any `data-*` attribute inside the widget that isn't
    // on this short, deliberately-inert allowlist is treated as an offender too. Widening the
    // allowlist is a conscious "this really is inert" decision, which is the point.
    const INERT_DATA_ATTRS = new Set(["data-theme", "data-tauri-drag-region"]);

    const offenders = [...(widget as HTMLElement).querySelectorAll<HTMLElement>("*")]
      .filter((el) => {
        if (NATIVE_CLICKABLE_TAGS.has(el.tagName)) return false;
        if (el.getAttribute("data-tauri-drag-region") === "false") return false;
        if (el.hasAttribute("onclick")) return true;
        if (el.hasAttribute("contenteditable")) return true;
        const tabindex = el.getAttribute("tabindex");
        if (tabindex !== null && tabindex !== "-1") return true;
        const role = el.getAttribute("role");
        if (role && CLICKABLE_ROLES.has(role)) return true;
        return el
          .getAttributeNames()
          .some(
            (name) =>
              name.startsWith("data-") &&
              (DELEGATION_HOOKS.has(name) || !INERT_DATA_ATTRS.has(name)),
          );
      })
      .map((el) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}.${el.className}`);

    expect(offenders).toEqual([]);
  });

  it("each of the four Management destinations still identifies itself via its own content heading now that #management-title's chrome is gone (#219)", () => {
    const { root } = mount(1);
    root.querySelector<HTMLButtonElement>("#menu-toggle")?.click();

    // World: no literal "World" text, but the progression rail lists Area names and the detail
    // pane shows the selected Area's own name — self-identifying content, same as pre-#219.
    root.querySelector<HTMLButtonElement>('[data-destination="world"]')?.click();
    expect(root.querySelectorAll("#area-rail .area-rail-name").length).toBeGreaterThan(0);
    expect(root.querySelector(".area-name")?.textContent).toBeTruthy();

    // Workshop: the selected Production Skill's own name/level heading.
    root.querySelector<HTMLButtonElement>('[data-destination="workshop"]')?.click();
    expect(root.querySelector("#workshop-skill-name")?.textContent).toBeTruthy();

    // Activity: "Recent Activity" is a plain (non-bar) content heading, unaffected by the
    // deleted card-header title.
    root.querySelector<HTMLButtonElement>('[data-destination="activity"]')?.click();
    const activityHeadings = [
      ...root.querySelectorAll("[data-management-page='activity'] .panel-title"),
    ].map((p) => p.textContent);
    expect(activityHeadings.some((t) => t?.includes("Recent Activity"))).toBe(true);

    // Bank: reached via Expand Bank from the Character hub's embedded tray; `#bank-header` shows
    // "Bank <used>/<capacity>".
    root.querySelector<HTMLButtonElement>("#expand-bank-btn")?.click();
    expect(root.querySelector("#bank-header")?.textContent).toMatch(/^Bank /);
  });

  it("opening, switching, and closing cards never mutates the Engine's Snapshot (presentation-only)", async () => {
    const { engine, root } = mount(1);
    // `savedAt` is re-stamped on every snapshot() call, so drop it before comparing state.
    const stateOf = () => {
      const { savedAt: _savedAt, ...rest } = engine.snapshot();
      return JSON.stringify(rest);
    };
    const before = stateOf();

    root.querySelector<HTMLButtonElement>("#menu-toggle")?.click();
    root.querySelector<HTMLButtonElement>('[data-destination="world"]')?.click();
    await vi.waitFor(() =>
      expect(root.querySelector<HTMLElement>("#card-management")?.hidden).toBe(false),
    );
    root.querySelector<HTMLButtonElement>('[data-destination="workshop"]')?.click();
    root.querySelector<HTMLButtonElement>("[data-management-back]")?.click();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

    expect(stateOf()).toEqual(before);
  });
});

describe("Hidden pages keep rendering every Tick (#206: visibility never stales gameplay-derived content)", () => {
  it("the full Bank grid still populates on every Tick while the Management card and its bank destination have never been opened", () => {
    const { engine, root, app } = mount(1);
    expect(root.querySelector<HTMLElement>("#card-management")?.hidden).toBe(true);
    expect(root.querySelector<HTMLElement>('[data-management-page="bank"]')?.hidden).toBe(true);

    root.querySelector<HTMLButtonElement>('[data-monster="dummy"]')?.click();
    grindFor(engine, "bronze-sword");
    app.render();

    expect(root.querySelector<HTMLElement>('#bank .tile[data-item="bronze-sword"]')).not.toBeNull();
    expect(root.querySelector<HTMLElement>("#card-management")?.hidden).toBe(true); // still closed
  });

  it("the Skills icon grid and Equipment Bank tray still populate every Tick while Character has never been opened", () => {
    const { engine, root, app } = mount(1);
    expect(root.querySelector<HTMLElement>("#card-character")?.hidden).toBe(true);

    root.querySelector<HTMLButtonElement>('[data-monster="dummy"]')?.click();
    for (let i = 0; i < 4; i++) {
      engine.tick();
      app.render();
    }

    const attackCell = root.querySelector<HTMLElement>('[data-skill="attack"]');
    expect(attackCell).not.toBeNull();
    expect(attackCell?.querySelector(".skill-level")?.textContent).not.toBe("");
    expect(root.querySelector<HTMLElement>("#card-character")?.hidden).toBe(true); // still closed
  });

  it("the Workshop and Activity destination pages keep rendering while never selected", () => {
    const { engine, root, app } = mount(1);
    engine.tick();
    app.render();
    expect(root.querySelector("#workshop-recipes")).not.toBeNull();
    expect(root.querySelector("#feed")).not.toBeNull();
    expect(root.querySelector<HTMLElement>('[data-management-page="workshop"]')?.hidden).toBe(true);
    expect(root.querySelector<HTMLElement>('[data-management-page="activity"]')?.hidden).toBe(true);
  });
});

describe("Character hub layout (#206: fixed dashboard, only the Equipment Bank tray scrolls)", () => {
  it("every seven Gear Slots, the Loadout Slot grid, the levels summary, compact controls, and the Equipment Bank tray are all present with no player portrait", () => {
    const { root } = mount(1);
    for (const slot of ["weapon", "shield", "head", "body", "legs", "amulet", "ring"]) {
      expect(root.querySelector(`[data-slot="${slot}"]`)).not.toBeNull();
    }
    expect(root.querySelector("#character-food-slots")).not.toBeNull();
    expect(root.querySelector("#potion-slot")).not.toBeNull();
    expect(root.querySelector("#quiver-slot")).not.toBeNull();
    expect(root.querySelector("#rune-slot")).not.toBeNull();
    expect(root.querySelector("#casting-readout")).not.toBeNull();
    expect(root.querySelector("#character-levels-summary")).not.toBeNull(); // #222: replaces #xp-row
    expect(root.querySelector("#style-row")).not.toBeNull();
    // #223: auto-eat threshold and auto-sell-duplicates are set-once preferences — they moved off
    // the always-visible card body into the Settings popover, not deleted.
    expect(root.querySelector(".card-fixed #autoeat-row")).toBeNull();
    expect(root.querySelector(".card-fixed #autosell-duplicates-row")).toBeNull();
    // #222: Pets moved to the Skills page — still present in the DOM (see the Skills page describe
    // block below), just no longer inside `#card-character`.
    expect(root.querySelector("#card-character #pets-summary")).toBeNull();
    expect(root.querySelector("#character-bank-tray")).not.toBeNull();
    expect(root.querySelector("#expand-bank-btn")).not.toBeNull();
    expect(root.querySelector("img.player-portrait, .portrait, [data-portrait]")).toBeNull();
  });

  it("the Character/Skills tab pair and the seven-tab Resources strip are both gone — no horizontal tab scrolling markup remains", () => {
    const { root } = mount(1);
    expect(root.querySelector("#character-tab-strip")).toBeNull();
    expect(root.querySelector("#resource-tab-strip")).toBeNull();
    expect(root.querySelector(".card-tab-strip")).toBeNull();
    expect(root.querySelector('[data-tab-panel="skills"]')).toBeNull();
  });

  it("only the Equipment Bank tray sits inside a scrolling container; the fixed dashboard content does not", () => {
    const { root } = mount(1);
    const tray = root.querySelector("#character-bank-tray");
    expect(tray?.closest(".card-scroll")).not.toBeNull();
    const gearGrid = root.querySelector("#character-slots");
    expect(gearGrid?.closest(".card-scroll")).toBeNull();
    const summary = root.querySelector("#character-levels-summary");
    expect(summary?.closest(".card-scroll")).toBeNull();
  });

  it("the embedded Bank tray shows only Equipment items from the same Bank, sorted the same way as the full Bank page", () => {
    const engine = createEngine(
      fixtureContent,
      seededRng(1),
      makeSnapshot({
        bank: {
          items: [
            { itemId: "bronze-sword", qty: 1 },
            { itemId: "meat", qty: 3 },
          ],
        },
      }),
    );
    const root = document.createElement("main");
    mountApp(engine, root, resolveContent(fixtureContent), noopWindowChrome);

    const tray = root.querySelector<HTMLElement>("#character-bank-tray");
    expect(tray?.querySelector('[data-item="bronze-sword"]')).not.toBeNull();
    expect(tray?.querySelector('[data-item="meat"]')).toBeNull(); // Food excluded, equipment only

    const fullBank = root.querySelector<HTMLElement>("#bank");
    expect(fullBank?.querySelector('[data-item="bronze-sword"]')).not.toBeNull();
    expect(fullBank?.querySelector('[data-item="meat"]')).not.toBeNull(); // full Bank keeps Food
  });

  it("selecting a tile in the embedded tray shows the same Equip/Sell detail strip as the full Bank, sharing the same selection (#207)", () => {
    const engine = createEngine(
      fixtureContent,
      seededRng(1),
      makeSnapshot({ bank: { items: [{ itemId: "bronze-sword", qty: 1 }] } }),
    );
    const root = document.createElement("main");
    mountApp(engine, root, resolveContent(fixtureContent), noopWindowChrome);

    root
      .querySelector<HTMLButtonElement>('#character-bank-tray [data-item="bronze-sword"]')
      ?.click();
    const trayDetail = root.querySelector<HTMLElement>("#character-bank-detail");
    expect(trayDetail?.hidden).toBe(false);
    expect(trayDetail?.querySelector('[data-equip="bronze-sword"]')).not.toBeNull();
    // #207: the full Bank page's own detail strip shares the selection — it's one Bank, not two.
    const bankDetail = root.querySelector<HTMLElement>("#bank-detail");
    expect(bankDetail?.hidden).toBe(false);
    expect(bankDetail?.querySelector('[data-equip="bronze-sword"]')).not.toBeNull();
  });

  it("clicking Equip in the embedded tray equips the item via the same Engine command as the full Bank", () => {
    const engine = createEngine(
      fixtureContent,
      seededRng(1),
      makeSnapshot({ bank: { items: [{ itemId: "bronze-sword", qty: 1 }] } }),
    );
    const root = document.createElement("main");
    mountApp(engine, root, resolveContent(fixtureContent), noopWindowChrome);

    root
      .querySelector<HTMLButtonElement>('#character-bank-tray [data-item="bronze-sword"]')
      ?.click();
    root
      .querySelector<HTMLButtonElement>('#character-bank-detail [data-equip="bronze-sword"]')
      ?.click();

    expect(engine.snapshot().player.equipment.weapon).toBe("bronze-sword");
  });

  it("an empty Gear Slot's [+] opens an anchored chooser of matching Bank Equipment; picking one equips it", () => {
    const engine = createEngine(
      fixtureContent,
      seededRng(1),
      makeSnapshot({ bank: { items: [{ itemId: "bronze-sword", qty: 1 }] } }),
    );
    const root = document.createElement("main");
    mountApp(engine, root, resolveContent(fixtureContent), noopWindowChrome);

    expect(root.querySelector('[data-slot="weapon"] [data-gear-add]')).not.toBeNull();
    root.querySelector<HTMLButtonElement>('[data-slot="weapon"] [data-gear-add]')?.click();

    const assignBtn = root.querySelector<HTMLButtonElement>(
      '[data-slot="weapon"] [data-gear-assign="bronze-sword"]',
    );
    expect(assignBtn).not.toBeNull();
    assignBtn?.click();

    expect(engine.snapshot().player.equipment.weapon).toBe("bronze-sword");
    // The chooser closes after picking.
    expect(root.querySelector('[data-slot="weapon"] [data-gear-assign]')).toBeNull();
  });

  it("the Pets summary shows a compact owned/total count, with the full roster grid behind its own popover", () => {
    const { root } = mount(1);
    const count = root.querySelector<HTMLElement>("#pets-summary-count");
    expect(count?.textContent).toMatch(/^\d+\/\d+$/);
    expect(root.querySelector<HTMLElement>("#pets-popover")?.hidden).toBe(true);

    root.querySelector<HTMLButtonElement>('[data-nav="pets"]')?.click();
    expect(root.querySelector<HTMLElement>("#pets-popover")?.hidden).toBe(false);
    expect(root.querySelector("#pets-grid [data-pet]")).not.toBeNull();
  });

  it("the Settings popover is closed by default and toggles Mute/Export/Import visibility without changing card height markup", () => {
    const { root } = mount(1);
    expect(root.querySelector<HTMLElement>("#settings-popover")?.hidden).toBe(true);

    root.querySelector<HTMLButtonElement>('[data-nav="settings"]')?.click();
    const popover = root.querySelector<HTMLElement>("#settings-popover");
    expect(popover?.hidden).toBe(false);
    expect(popover?.querySelector("#mute-toggle")).not.toBeNull();
    expect(popover?.querySelector("#export-save")).not.toBeNull();
    expect(popover?.querySelector("#import-save")).not.toBeNull();
    // #223: the auto-eat threshold selector and auto-sell-duplicates checkbox — set-once
    // preferences — now live inside the Settings popover, following the fieldset+legend idiom
    // #ui-scale-selector already used.
    expect(popover?.querySelector("#autoeat-row")).not.toBeNull();
    expect(popover?.querySelector("#autosell-duplicates-row")).not.toBeNull();

    root.querySelector<HTMLButtonElement>('[data-nav="settings"]')?.click();
    expect(root.querySelector<HTMLElement>("#settings-popover")?.hidden).toBe(true);
  });
});

describe("Auto-eat compact indicator (#223: stays legible without opening Settings)", () => {
  it("shows the current auto-eat threshold on the Character card without opening the Settings popover", () => {
    const { root } = mount(1);
    expect(root.querySelector<HTMLElement>("#settings-popover")?.hidden).toBe(true);
    expect(root.querySelector("#autoeat-indicator")?.textContent).toContain("50%");
  });

  it("updates immediately when a new threshold is picked from the popover", () => {
    const { engine, root } = mount(1);
    root.querySelector<HTMLButtonElement>('[data-nav="settings"]')?.click();
    root.querySelector<HTMLButtonElement>('[data-threshold="0"]')?.click();

    expect(engine.snapshot().player.autoEatThreshold).toBe(0);
    expect(root.querySelector("#autoeat-indicator")?.textContent).toContain("Off");
  });

  it("reflects a non-default threshold restored from a saved Snapshot", () => {
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
    mountApp(engine, root, resolveContent(fixtureContent), noopWindowChrome);

    expect(root.querySelector("#autoeat-indicator")?.textContent).toContain("25%");
  });
});

describe.skip("Event ticker (moved to Activity by #210)", () => {
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
    mountApp(engine, root, resolveContent(rareDropContent), noopWindowChrome);
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
    const app = mountApp(engine, root, resolveContent(fixtureContent), noopWindowChrome);
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
    mountApp(engine, root, resolveContent(content), noopWindowChrome);
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
    mountApp(engine, root, resolveContent(noValueContent), noopWindowChrome);
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
    mountApp(engine, root, resolveContent(guaranteedSwordDropContent), noopWindowChrome);
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

describe("Expanded Bank filters, search, and Vendor mode (#207)", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", stubLocalStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function mixedBank() {
    return makeSnapshot({
      player: { gold: 500 },
      bank: {
        items: [
          { itemId: "bronze-sword", qty: 1 }, // equipment
          { itemId: "meat", qty: 3 }, // food
          { itemId: "bar", qty: 2 }, // material
          { itemId: "strength-potion", qty: 1 }, // potion
          { itemId: "arrow", qty: 10 }, // ammo
        ],
      },
    });
  }

  function bankMount(overrides: Parameters<typeof makeSnapshot>[0] = {}) {
    const engine = createEngine(fixtureContent, seededRng(1), makeSnapshot(overrides));
    const root = document.createElement("main");
    const app = mountApp(engine, root, resolveContent(fixtureContent), noopWindowChrome);
    return { engine, root, app };
  }

  function bankIds(root: HTMLElement) {
    return [...root.querySelectorAll<HTMLElement>("#bank .tile")].map(
      (tile) => tile.dataset["item"],
    );
  }

  function clickFilter(root: HTMLElement, filter: string) {
    root.querySelector<HTMLButtonElement>(`[data-bank-filter="${filter}"]`)?.click();
  }

  function typeSearch(root: HTMLElement, text: string) {
    const input = root.querySelector<HTMLInputElement>("#bank-search");
    if (!input) throw new Error("#bank-search not found");
    input.value = text;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function setSort(root: HTMLElement, key: "kind" | "value" | "name") {
    const select = root.querySelector<HTMLSelectElement>("#bank-sort-select");
    if (!select) throw new Error("#bank-sort-select not found");
    select.value = key;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }

  it("renders exactly the six always-visible filter buttons: All, Gear, Food, Materials, Potions, Ammo", () => {
    const { root } = bankMount();
    const buttons = [...root.querySelectorAll<HTMLButtonElement>("#bank-filter-row button")];
    expect(buttons.map((b) => b.textContent)).toEqual([
      "All",
      "Gear",
      "Food",
      "Materials",
      "Potions",
      "Ammo",
    ]);
  });

  it("the six filter buttons, the search input, the sort select, and the sticky detail/buy-slots footer all sit outside the grid's own scrolling container", () => {
    const { root } = bankMount(mixedBank());
    const grid = root.querySelector("#bank");
    const gridScroll = grid?.closest(".card-scroll");
    expect(gridScroll).not.toBeNull();

    for (const outside of [
      root.querySelector("#bank-filter-row"),
      root.querySelector("#bank-search"),
      root.querySelector("#bank-sort-select"),
      root.querySelector("#bank-detail"),
      root.querySelector("#buy-slots-btn"),
    ]) {
      expect(outside).not.toBeNull();
      // None of these fixed-shell controls sit inside the same scrolling grid container.
      expect(outside?.closest(".card-scroll")).not.toBe(gridScroll);
    }
  });

  it("filtering to Gear/Food/Materials/Potions/Ammo shows only that kind's stacks", () => {
    const { root } = bankMount(mixedBank());

    clickFilter(root, "equipment");
    expect(bankIds(root)).toEqual(["bronze-sword"]);

    clickFilter(root, "food");
    expect(bankIds(root)).toEqual(["meat"]);

    clickFilter(root, "material");
    expect(bankIds(root)).toEqual(["bar"]);

    clickFilter(root, "potion");
    expect(bankIds(root)).toEqual(["strength-potion"]);

    clickFilter(root, "ammo");
    expect(bankIds(root)).toEqual(["arrow"]);

    clickFilter(root, "all");
    expect(bankIds(root)).toHaveLength(5);
  });

  it("marks the active filter button, moving `active`/aria-pressed as the filter changes", () => {
    const { root } = bankMount(mixedBank());
    clickFilter(root, "food");
    const foodBtn = root.querySelector<HTMLButtonElement>('[data-bank-filter="food"]');
    const allBtn = root.querySelector<HTMLButtonElement>('[data-bank-filter="all"]');
    expect(foodBtn?.classList.contains("active")).toBe(true);
    expect(foodBtn?.getAttribute("aria-pressed")).toBe("true");
    expect(allBtn?.classList.contains("active")).toBe(false);
    expect(allBtn?.getAttribute("aria-pressed")).toBe("false");
  });

  it("search matches case-insensitively and trims surrounding whitespace", () => {
    const { root } = bankMount(mixedBank());

    typeSearch(root, "SWORD");
    expect(bankIds(root)).toEqual(["bronze-sword"]);

    typeSearch(root, "  meat  ");
    expect(bankIds(root)).toEqual(["meat"]);

    typeSearch(root, "");
    expect(bankIds(root)).toHaveLength(5);
  });

  it("composes filter and search — search narrows within the active filter, kind first", () => {
    const { root } = bankMount(mixedBank());
    clickFilter(root, "food");
    typeSearch(root, "sword"); // matches an Equipment item's name, but filter is Food

    expect(bankIds(root)).toEqual([]);
  });

  it("selecting a tile then filtering it out of view hides the detail strip", () => {
    const { root } = bankMount(mixedBank());
    selectBankTile(root, "bronze-sword");
    expect(root.querySelector<HTMLElement>("#bank-detail")?.hidden).toBe(false);

    clickFilter(root, "food"); // hides the Equipment tile currently selected
    expect(root.querySelector<HTMLElement>("#bank-detail")?.hidden).toBe(true);
  });

  it("filtering the full Bank grid to hide an Equipment selection does not blank the Character tray's own detail for the same shared selection", () => {
    const { root } = bankMount(mixedBank());
    // Select via the full Bank grid, then filter the Bank page to Food only.
    selectBankTile(root, "bronze-sword");
    clickFilter(root, "food");
    expect(root.querySelector<HTMLElement>("#bank-detail")?.hidden).toBe(true);

    // The Character tray is always Equipment-only regardless of the Bank page's own filter, so its
    // detail strip for the same shared selection must still show (#207).
    const trayDetail = root.querySelector<HTMLElement>("#character-bank-detail");
    expect(trayDetail?.hidden).toBe(false);
    expect(trayDetail?.querySelector('[data-item], [data-equip="bronze-sword"]')).not.toBeNull();
  });

  it("selecting a tile in the full Bank grid also selects it in the Character tray (shared selection, #207)", () => {
    const { root } = bankMount(mixedBank());
    selectBankTile(root, "bronze-sword");

    const trayTile = root.querySelector<HTMLButtonElement>(
      '#character-bank-tray [data-item="bronze-sword"]',
    );
    expect(trayTile?.getAttribute("aria-pressed")).toBe("true");
  });

  it("filter and sort persist across a remount; search and selection do not (#207)", () => {
    const engine = createEngine(fixtureContent, seededRng(1), mixedBank());
    const root = document.createElement("main");
    mountApp(engine, root, resolveContent(fixtureContent), noopWindowChrome);

    clickFilter(root, "food");
    typeSearch(root, "meat");
    selectBankTile(root, "meat");

    const stored = JSON.parse(localStorage.getItem("sidescape-ui-bank-view-v1") ?? "{}");
    expect(stored).toEqual({ version: 1, filter: "food", sort: "name" });

    const root2 = document.createElement("main");
    mountApp(engine, root2, resolveContent(fixtureContent), noopWindowChrome);

    // Filter persisted...
    expect(
      root2
        .querySelector<HTMLButtonElement>('[data-bank-filter="food"]')
        ?.classList.contains("active"),
    ).toBe(true);
    // ...but search and selection are session-only, so a fresh mount starts blank/deselected.
    expect(root2.querySelector<HTMLInputElement>("#bank-search")?.value).toBe("");
    expect(root2.querySelector<HTMLElement>("#bank-detail")?.hidden).toBe(true);
  });

  it("falls back to the default filter/sort when localStorage holds malformed bank-view JSON", () => {
    localStorage.setItem("sidescape-ui-bank-view-v1", "{not json");
    const { root } = bankMount(mixedBank());
    expect(
      root
        .querySelector<HTMLButtonElement>('[data-bank-filter="all"]')
        ?.classList.contains("active"),
    ).toBe(true);
    expect(root.querySelector<HTMLSelectElement>("#bank-sort-select")?.value).toBe("name");
    expect(bankIds(root)).toHaveLength(5); // mounts cleanly rather than throwing
  });

  it("search clears once the Bank Management destination closes, but the filter choice does not", async () => {
    const engine = createEngine(fixtureContent, seededRng(1), mixedBank());
    const root = document.createElement("main");
    mountApp(engine, root, resolveContent(fixtureContent), noopWindowChrome);

    root.querySelector<HTMLButtonElement>("#menu-toggle")?.click();
    root.querySelector<HTMLButtonElement>("#expand-bank-btn")?.click();
    await vi.waitFor(() =>
      expect(root.querySelector<HTMLElement>('[data-management-page="bank"]')?.hidden).toBe(false),
    );

    clickFilter(root, "food");
    typeSearch(root, "meat");
    expect(root.querySelector<HTMLInputElement>("#bank-search")?.value).toBe("meat");

    root.querySelector<HTMLButtonElement>("[data-management-back]")?.click();
    expect(root.querySelector<HTMLInputElement>("#bank-search")?.value).toBe("");

    root.querySelector<HTMLButtonElement>("#expand-bank-btn")?.click();
    await vi.waitFor(() =>
      expect(root.querySelector<HTMLElement>('[data-management-page="bank"]')?.hidden).toBe(false),
    );
    // The filter choice is locally persisted, not session-only, so it survives the round trip.
    expect(
      root
        .querySelector<HTMLButtonElement>('[data-bank-filter="food"]')
        ?.classList.contains("active"),
    ).toBe(true);
    expect(bankIds(root)).toEqual(["meat"]);
  });

  it("shows Gold alongside the existing used/capacity header text, updating after a slot purchase", () => {
    const { root, engine } = bankMount({
      player: { gold: 1500 },
      bank: { items: [], capacity: 100 },
    });
    expect(root.querySelector("#bank-gold")?.textContent).toBe("🪙 1500");
    expect(root.querySelector("#bank-header")?.textContent).toBe("Bank 0/100");

    root.querySelector<HTMLButtonElement>("#buy-slots-btn")?.click(); // price 1000 at capacity 100
    expect(engine.snapshot().bank.capacity).toBe(110);
    expect(engine.snapshot().player.gold).toBe(500);
    expect(root.querySelector("#bank-gold")?.textContent).toBe("🪙 500");
    expect(root.querySelector("#bank-header")?.textContent).toBe("Bank 0/110");
  });

  it("the Bank/Vendor toggle leaves the active filter, search, selection, and game state untouched", () => {
    const { root, engine } = bankMount(mixedBank());
    clickFilter(root, "food");
    typeSearch(root, "meat");
    selectBankTile(root, "meat");
    const goldBefore = engine.snapshot().player.gold;
    const bankBefore = engine.snapshot().bank.items;

    root.querySelector<HTMLButtonElement>('[data-bankpage="vendor"]')?.click();
    expect(root.querySelector<HTMLElement>('[data-bank-page="vendor"]')?.hidden).toBe(false);
    root.querySelector<HTMLButtonElement>('[data-bankpage="bank"]')?.click();

    expect(
      root
        .querySelector<HTMLButtonElement>('[data-bank-filter="food"]')
        ?.classList.contains("active"),
    ).toBe(true);
    expect(root.querySelector<HTMLInputElement>("#bank-search")?.value).toBe("meat");
    expect(root.querySelector<HTMLElement>("#bank-detail")?.hidden).toBe(false);
    expect(engine.snapshot().player.gold).toBe(goldBefore);
    expect(engine.snapshot().bank.items).toEqual(bankBefore);
  });

  it("never mutates the Engine Snapshot's own bank.items array while filtering/searching/sorting", () => {
    const { root, engine } = bankMount(mixedBank());
    const before = engine.snapshot().bank.items;
    const beforeCopy = JSON.parse(JSON.stringify(before));

    clickFilter(root, "equipment");
    typeSearch(root, "sword");
    setSort(root, "value");

    expect(engine.snapshot().bank.items).toEqual(beforeCopy);
  });
});

describe("Food Slot bar (#61)", () => {
  function foodMount(overrides: Parameters<typeof makeSnapshot>[0] = {}) {
    const engine = createEngine(fixtureContent, seededRng(1), makeSnapshot(overrides));
    const root = document.createElement("main");
    const app = mountApp(engine, root, resolveContent(fixtureContent), noopWindowChrome);
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

describe("Compact widget Loot strip (#220)", () => {
  it("shows a fixed-height strip on a fresh mount with an empty Loot Zone: 0/10 count, no chips, Loot all disabled", () => {
    const { root } = mount(1);
    expect(root.querySelector<HTMLElement>("#loot-strip")).not.toBeNull();
    expect(root.querySelector("#loot-strip-count")?.textContent).toBe("0/10");
    expect(root.querySelectorAll("#loot-strip-items .loot-chip").length).toBe(0);
    expect(root.querySelector<HTMLButtonElement>("#loot-strip-all-btn")?.disabled).toBe(true);
  });

  it("renders zone stacks as button chips (icon + qty) and updates the n/10 count as Drops land", () => {
    const { engine, root, app } = mount(1);
    root.querySelector<HTMLButtonElement>('[data-monster="dummy"]')?.click();

    for (let i = 0; i < 2000 && engine.snapshot().lootZone.length === 0; i++) engine.tick();
    app.render();

    const chip = root.querySelector<HTMLButtonElement>("#loot-strip-items .loot-chip");
    expect(chip).not.toBeNull();
    // Must be a real <button>, not a <li>/<div> — #compact-widget carries a deep Tauri drag
    // region (#219), which treats anything else as a drag surface that swallows its own click
    // (see the natively-clickable guard test above).
    expect(chip?.tagName).toBe("BUTTON");
    const zoneEntry = engine.snapshot().lootZone[0]!;
    expect(chip?.textContent).toContain(`×${zoneEntry.qty}`);
    expect(root.querySelector("#loot-strip-count")?.textContent).toBe(
      `${engine.snapshot().lootZone.length}/10`,
    );
    expect(root.querySelector<HTMLButtonElement>("#loot-strip-all-btn")?.disabled).toBe(false);
  });

  it("clicking Loot all sweeps the zone into the Bank, empties the strip, disables the button again, and logs a Banked feed line", () => {
    const engine = createEngine(
      fixtureContent,
      seededRng(1),
      makeSnapshot({ lootZone: [{ itemId: "meat", qty: 3 }] }),
    );
    const root = document.createElement("main");
    mountApp(engine, root, resolveContent(fixtureContent), noopWindowChrome);
    expect(root.querySelector<HTMLButtonElement>("#loot-strip-all-btn")?.disabled).toBe(false);

    root.querySelector<HTMLButtonElement>("#loot-strip-all-btn")?.click();

    expect(engine.snapshot().lootZone).toEqual([]);
    expect(engine.snapshot().bank.items).toEqual([{ itemId: "meat", qty: 3 }]);
    expect(root.querySelector<HTMLElement>("#loot-strip")).not.toBeNull(); // strip itself never disappears
    expect(root.querySelectorAll("#loot-strip-items .loot-chip").length).toBe(0);
    expect(root.querySelector<HTMLButtonElement>("#loot-strip-all-btn")?.disabled).toBe(true);
    expect(root.querySelector("#feed li")?.textContent).toMatch(/banked.*meat/i);
  });

  it("a sweep that leaves a stack behind (full Bank) logs a 'Bank full — loot left behind' feed line and keeps the chip/button live", () => {
    const engine = createEngine(
      fixtureContent,
      seededRng(1),
      makeSnapshot({
        bank: { items: [{ itemId: "bar", qty: 1 }], capacity: 1 },
        lootZone: [{ itemId: "meat", qty: 3 }],
      }),
    );
    const root = document.createElement("main");
    mountApp(engine, root, resolveContent(fixtureContent), noopWindowChrome);

    root.querySelector<HTMLButtonElement>("#loot-strip-all-btn")?.click();

    expect(engine.snapshot().lootZone).toEqual([{ itemId: "meat", qty: 3 }]); // couldn't fit
    expect(root.querySelectorAll("#loot-strip-items .loot-chip").length).toBe(1);
    expect(root.querySelector<HTMLButtonElement>("#loot-strip-all-btn")?.disabled).toBe(false);
    expect(root.querySelector("#feed li")?.textContent).toMatch(/bank full.*left behind/i);
  });

  it("Loot all shares one implementation with the Activity page's own button — clicking either sweeps the identical Loot Zone", () => {
    const engine = createEngine(
      fixtureContent,
      seededRng(1),
      makeSnapshot({ lootZone: [{ itemId: "meat", qty: 3 }] }),
    );
    const root = document.createElement("main");
    mountApp(engine, root, resolveContent(fixtureContent), noopWindowChrome);

    root.querySelector<HTMLButtonElement>("#activity-loot-all-btn")?.click();

    expect(engine.snapshot().lootZone).toEqual([]);
    expect(root.querySelector<HTMLButtonElement>("#loot-strip-all-btn")?.disabled).toBe(true);
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
    mountApp(engine, root, resolveContent(lethalDungeonContent), noopWindowChrome);
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
  it("renders a 🎣 Fishing Spot button for the selected Area, disabled when that Area is locked", () => {
    const { root } = mount(1);
    const pondBtn = root.querySelector<HTMLButtonElement>('[data-spot="pond"]');
    expect(pondBtn?.textContent).toBe("🎣 Test Pond");
    expect(pondBtn?.disabled).toBe(false);

    selectAreaRow(root, "crypt"); // #208: deep-pond's detail only renders once Test Crypt is selected
    const deepPondBtn = root.querySelector<HTMLButtonElement>('[data-spot="deep-pond"]');
    expect(deepPondBtn?.disabled).toBe(true); // behind the Test Crypt's Dungeon-completion gate
  });

  it("Skills page shows all 11 Skill rows in order, including one for Fishing (#135, #222)", () => {
    const { root } = mount(1);
    const skills = [...root.querySelectorAll<HTMLElement>("#skills-list .skill[data-skill]")].map(
      (el) => el.dataset["skill"],
    );
    expect(skills).toEqual([
      "attack",
      "strength",
      "defence",
      "hitpoints",
      "fishing",
      "smithing",
      "ranged",
      "magic",
      "cooking",
      "crafting",
      "herblore",
    ]);
  });

  it("selecting a Fishing Spot shows the fishing scene, hiding the Monster HP bar and sprite", () => {
    const { root } = mount(1);
    root.querySelector<HTMLButtonElement>('[data-spot="pond"]')?.click();

    expect(root.querySelector("#monster-name")).toBeNull();
    expect((root.querySelector("#monster-bar") as HTMLElement).hidden).toBe(true);
    expect((root.querySelector("#monster-sprite") as HTMLElement).hidden).toBe(true);
  });

  it("selecting a Monster afterwards restores the normal combat scene", () => {
    const { root } = mount(1);
    root.querySelector<HTMLButtonElement>('[data-spot="pond"]')?.click();
    root.querySelector<HTMLButtonElement>('[data-monster="dummy"]')?.click();

    expect(root.querySelector("#monster-name")).toBeNull();
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

  it("World page still rebuilds on levelup: Fishing-Spot levelReq gates are level-driven, independent of dungeon-completed", () => {
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
    mountApp(engine, root, resolveContent(fixtureContent), noopWindowChrome);
    selectAreaRow(root, "crypt"); // #208: deep-pond's detail only renders once Test Crypt is selected

    const deepPondBefore = root.querySelector<HTMLButtonElement>('[data-spot="deep-pond"]');
    expect(deepPondBefore?.disabled).toBe(true); // Area open, but Fishing level 19 < levelReq 20

    engine.selectFishingSpot("pond"); // pond: catchChance 1, xp 10 per Catch (fixtureContent)
    for (let i = 0; i < 3; i++) engine.tick(); // pond.catchTicks === 3: exactly one Catch lands
    expect(engine.snapshot().player.skills.fishing.level).toBe(20);

    // renderWorldPage runs off the levelup event itself — no explicit render() call here.
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
    const app = mountApp(engine, root, resolveContent(fixtureContent), noopWindowChrome);
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

describe("Spell picker: #spell-row is fully removed (#221)", () => {
  it("#spell-row is gone from the DOM", () => {
    const { root } = mount(1);
    expect(root.querySelector("#spell-row")).toBeNull();
  });
});

describe("Casting readout (#221)", () => {
  it("shows the no-rune-loaded state on a fresh engine (empty Rune Slot)", () => {
    const { root } = mount(1);
    expect(root.querySelector("#casting-readout")?.textContent).toMatch(/no rune loaded/i);
  });

  it("shows 'Casting: {spell.name}' once a rune is loaded", () => {
    const engine = createEngine(
      fixtureContent,
      seededRng(1),
      makeSnapshot({ bank: { items: [{ itemId: "air-rune", qty: 10 }] } }),
    );
    const root = document.createElement("main");
    const app = mountApp(engine, root, resolveContent(fixtureContent), noopWindowChrome);
    engine.loadRuneSlot("air-rune");
    app.render();
    expect(root.querySelector("#casting-readout")?.textContent).toBe("Casting: Test Spark");
  });

  it("reverts to the no-rune state once the Rune Slot is unloaded", () => {
    const engine = createEngine(
      fixtureContent,
      seededRng(1),
      makeSnapshot({ player: { runeSlot: { itemId: "air-rune", qty: 10 } } }),
    );
    const root = document.createElement("main");
    const app = mountApp(engine, root, resolveContent(fixtureContent), noopWindowChrome);
    expect(root.querySelector("#casting-readout")?.textContent).toBe("Casting: Test Spark");
    engine.unloadRuneSlot();
    app.render();
    expect(root.querySelector("#casting-readout")?.textContent).toMatch(/no rune loaded/i);
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

  /** Chooses `key` on the expanded Bank's sort `<select>` (#207: replaced the old Kind|Value|Name
   * `#sort-row` button row) by dispatching the same `change` event a real user pick fires. */
  function setSort(root: HTMLElement, key: "kind" | "value" | "name") {
    const select = root.querySelector<HTMLSelectElement>("#bank-sort-select");
    if (!select) throw new Error("#bank-sort-select not found");
    select.value = key;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }

  it("renders a Name | Kind | Value sort select above the Bank list", () => {
    const engine = createEngine(fixtureContent, seededRng(1));
    const root = document.createElement("main");
    mountApp(engine, root, resolveContent(fixtureContent), noopWindowChrome);

    const options = [...root.querySelectorAll<HTMLOptionElement>("#bank-sort-select option")];
    expect(options.map((o) => o.textContent)).toEqual(["Name", "Kind", "Value"]);
  });

  it("sorting by Value orders the Bank by def.value descending, ties broken by name", () => {
    const engine = createEngine(fixtureContent, seededRng(1), seededBank());
    const root = document.createElement("main");
    mountApp(engine, root, resolveContent(fixtureContent), noopWindowChrome);

    setSort(root, "value");

    // lucky-charm 100g, bronze-sword 20g, meat 3g (gold is never a Bank stack, #59).
    expect(bankIds(root)).toEqual(["lucky-charm", "bronze-sword", "meat"]);
  });

  it("sorting by Kind groups equipment before food, ties broken by name", () => {
    const engine = createEngine(fixtureContent, seededRng(1), seededBank());
    const root = document.createElement("main");
    mountApp(engine, root, resolveContent(fixtureContent), noopWindowChrome);

    setSort(root, "kind");

    // equipment (Bronze Sword, Lucky Charm — alphabetical) before food (Cooked Meat).
    expect(bankIds(root)).toEqual(["bronze-sword", "lucky-charm", "meat"]);
  });

  it("sorting by Name orders the Bank alphabetically by display name", () => {
    const engine = createEngine(fixtureContent, seededRng(1), seededBank());
    const root = document.createElement("main");
    mountApp(engine, root, resolveContent(fixtureContent), noopWindowChrome);

    setSort(root, "name");

    // Bronze Sword, Cooked Meat, Lucky Charm — alphabetical.
    expect(bankIds(root)).toEqual(["bronze-sword", "meat", "lucky-charm"]);
  });

  it("the sort choice survives a remount via localStorage (bundled with filter, #207) and is never written into the save", () => {
    const engine = createEngine(fixtureContent, seededRng(1), seededBank());
    const root = document.createElement("main");
    mountApp(engine, root, resolveContent(fixtureContent), noopWindowChrome);

    setSort(root, "value");
    expect(JSON.parse(localStorage.getItem("sidescape-ui-bank-view-v1") ?? "{}")).toEqual({
      version: 1,
      filter: "all",
      sort: "value",
    });

    // Simulate an app restart: a fresh mount against the same Engine reads the persisted choice.
    const root2 = document.createElement("main");
    mountApp(engine, root2, resolveContent(fixtureContent), noopWindowChrome);
    expect(bankIds(root2)).toEqual(["lucky-charm", "bronze-sword", "meat"]);

    // Presentation-only: never part of the Snapshot/save (same boundary as the SFX mute, #20).
    expect(JSON.stringify(engine.snapshot())).not.toMatch(/sort/i);
  });

  it("sell/equip click handling still targets the right item after sorting (data attributes, not row index)", () => {
    const engine = createEngine(fixtureContent, seededRng(1), seededBank());
    const root = document.createElement("main");
    mountApp(engine, root, resolveContent(fixtureContent), noopWindowChrome);

    setSort(root, "value");
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
    mountApp(engine, root, resolveContent(lockedDungeonContent), noopWindowChrome);

    const gauntletBtn = root.querySelector<HTMLButtonElement>('[data-dungeon="gauntlet"]');
    expect(gauntletBtn?.textContent).toBe("⚔ The Gauntlet");
    expect(gauntletBtn?.disabled).toBe(false); // meadow is unlocked

    selectAreaRow(root, "crypt"); // #208: crypt-dungeon's detail only renders once Test Crypt is selected
    const cryptBtn = root.querySelector<HTMLButtonElement>('[data-dungeon="crypt-dungeon"]');
    expect(cryptBtn?.textContent).toBe("⚔ Crypt Dungeon");
    expect(cryptBtn?.disabled).toBe(true); // Test Crypt is locked until "gauntlet" is cleared
  });

  it.skip("the removed compact dungeon header is absent outside a run", () => {
    const { root } = mount(1);
    const header = root.querySelector<HTMLElement>("#dungeon-header");
    expect(header?.hidden).toBe(true);
    expect(header?.textContent).toBe("");
  });

  it.skip("clicking a dungeon button enters it and shows the removed compact wave header", () => {
    const { root } = mount(1);
    root.querySelector<HTMLButtonElement>('[data-dungeon="gauntlet"]')?.click();

    const header = root.querySelector<HTMLElement>("#dungeon-header");
    expect(header?.hidden).toBe(false);
    expect(header?.textContent).toBe("⚔ The Gauntlet — Wave 1/3");
    expect(root.querySelector("#monster-name")?.textContent).toBe("Training Dummy");
  });

  it.skip("logs a 'Wave i/N cleared' feed line as each wave advances (legacy header assertion)", () => {
    const { engine, root, app } = mount(5);
    root.querySelector<HTMLButtonElement>('[data-dungeon="gauntlet"]')?.click();

    for (let i = 0; i < 5000 && engine.snapshot().dungeon?.wave !== 2; i++) engine.tick();
    app.render();

    expect(root.querySelector("#dungeon-header")?.textContent).toBe("⚔ The Gauntlet — Wave 2/3");
    const feedTexts = [...root.querySelectorAll("#feed li")].map((li) => li.textContent);
    expect(feedTexts).toContain("Wave 1/3 cleared");
  });

  it.skip("logs dungeon completion (legacy compact label assertion)", () => {
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

  it("World page rebuilds on dungeon-completed, unlocking the Crypt gate immediately with no levelup involved — while Test Crypt stays the selected Area throughout (#208: selectedAreaId outranks the dungeon-host priority step)", () => {
    const { engine, root } = mount(5); // seed 5 completes "gauntlet" within 5000 Ticks (see core/engine.test.ts)
    selectAreaRow(root, "crypt");
    const bruteBefore = root.querySelector<HTMLButtonElement>('[data-monster="brute"]');
    expect(bruteBefore?.disabled).toBe(true);
    const cryptLabelBefore = root.querySelector(".area-name");
    expect(cryptLabelBefore?.textContent).toBe("Test Crypt 🔒 Clear The Gauntlet");

    // Dispatched directly on the Engine (mirrors other tests' `engine.enterDungeon` calls) since
    // "gauntlet" is hosted in Test Meadow, not the currently-selected Test Crypt — its own detail
    // button isn't even rendered right now, but selectedAreaId is independent of which Area hosts
    // whatever Dungeon happens to be running.
    engine.enterDungeon("gauntlet");
    for (let i = 0; i < 5000 && engine.snapshot().player.completedDungeonIds.length === 0; i++) {
      engine.tick();
    }
    expect(engine.snapshot().player.completedDungeonIds).toEqual(["gauntlet"]);

    // renderWorldPage runs off the dungeon-completed event itself — no explicit render() call
    // here. Test Crypt is still the selected Area (selectedAreaId persists across the unrelated
    // Engine command), so it's still Test Crypt's own gate label/brute button that update.
    const bruteAfter = root.querySelector<HTMLButtonElement>('[data-monster="brute"]');
    expect(bruteAfter?.disabled).toBe(false);
    const cryptLabelAfter = root.querySelector(".area-name");
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
    const app = mountApp(engine, root, resolveContent(fixtureContent), noopWindowChrome);
    return { engine, root, app };
  }

  it("Skills page shows a row for Smithing, alongside the other ten (#135, #222)", () => {
    const { root } = mount(1);
    const skills = [...root.querySelectorAll<HTMLElement>("#skills-list .skill[data-skill]")].map(
      (el) => el.dataset["skill"],
    );
    expect(skills).toHaveLength(11);
    expect(skills).toContain("smithing");
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

  it.skip("legacy Smithing activity-label assertion", () => {
    const { root } = mountWithBars(5);
    root.querySelector<HTMLButtonElement>('[data-recipe="test-sword"]')?.click();

    expect(root.querySelector("#monster-name")?.textContent).toBe("🔨 Smithing: Test Sword");
    expect((root.querySelector("#monster-bar") as HTMLElement).hidden).toBe(true);
    expect((root.querySelector("#monster-sprite") as HTMLElement).hidden).toBe(true);
  });

  it.skip("legacy production activity-label assertion", () => {
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
    const app = mountApp(engine, root, resolveContent(fixtureContent), noopWindowChrome);
    // Workshop's four-button selector (#209) defaults to Smithing — select Cooking's own tab so
    // this describe block's recipe-row assertions have something to find in #workshop-recipes.
    root.querySelector<HTMLButtonElement>('[data-production-skill="cooking"]')?.click();
    return { engine, root, app };
  }

  it("renders a Cooking recipe row for the fixture's test-cook Recipe, with level req and owned counts", () => {
    const { root } = mountWithRawFish(0);

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

  it.skip("legacy Cooking activity-label assertion", () => {
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
    const app = mountApp(engine, root, resolveContent(fixtureContent), noopWindowChrome);
    // Workshop's four-button selector (#209) defaults to Smithing — select Crafting's own tab.
    root.querySelector<HTMLButtonElement>('[data-production-skill="crafting"]')?.click();
    return { engine, root, app };
  }

  it("renders a Crafting recipe row for the fixture's test-craft Recipe, with level req and owned counts", () => {
    const { root } = mountWithHide(0);

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

  it.skip("legacy Crafting activity-label assertion", () => {
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
    const app = mountApp(engine, root, resolveContent(fixtureContent), noopWindowChrome);
    // Workshop's four-button selector (#209) defaults to Smithing — select Herblore's own tab.
    root.querySelector<HTMLButtonElement>('[data-production-skill="herblore"]')?.click();
    return { engine, root, app };
  }

  it("renders a Herblore recipe row for the fixture's test-brew Recipe, with level req and owned counts", () => {
    const { root } = mountWithHerb(0);

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

  it.skip("legacy Herblore activity-label assertion", () => {
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

describe("Workshop destination — all-visible Production Skill selector (#209)", () => {
  function skillBtn(root: HTMLElement, skill: string) {
    return root.querySelector<HTMLButtonElement>(
      `#workshop-skill-row [data-production-skill="${skill}"]`,
    );
  }

  it("renders exactly four always-visible buttons, in PRODUCTION_SKILLS order, each with an icon and an accessible title", () => {
    const { root } = mount(1);
    const buttons = [...root.querySelectorAll<HTMLButtonElement>("#workshop-skill-row button")];
    expect(buttons.map((b) => b.dataset["productionSkill"])).toEqual(
      PRODUCTION_SKILLS.map((d) => d.skill),
    );
    for (const btn of buttons) {
      expect(btn.title.length).toBeGreaterThan(0);
      expect(btn.querySelector("img")).not.toBeNull();
    }
  });

  it("defaults to Smithing selected/active on a fresh mount, with Smithing's own recipes showing", () => {
    const { root } = mount(1);
    expect(skillBtn(root, "smithing")?.classList.contains("active")).toBe(true);
    expect(skillBtn(root, "cooking")?.classList.contains("active")).toBe(false);
    expect(root.querySelector("#workshop-skill-name")?.textContent).toBe("Smithing");
    expect(root.querySelector("#workshop-skill-level")?.textContent).toBe("Lvl 1");
    expect(root.querySelector('#workshop-recipes [data-recipe-row="test-sword"]')).not.toBeNull();
  });

  it("clicking a Skill button switches the active button, the name/Level header, and the recipe body — never a page-reload of the whole card", () => {
    const { root } = mount(1);
    skillBtn(root, "cooking")?.click();

    expect(skillBtn(root, "cooking")?.classList.contains("active")).toBe(true);
    expect(skillBtn(root, "smithing")?.classList.contains("active")).toBe(false);
    expect(root.querySelector("#workshop-skill-name")?.textContent).toBe("Cooking");
    expect(root.querySelector('#workshop-recipes [data-recipe-row="test-cook"]')).not.toBeNull();
    expect(root.querySelector('#workshop-recipes [data-recipe-row="test-sword"]')).toBeNull();
  });

  it("preserves recipe gating, owned-input counts, and selectRecipe() dispatch after switching Skills", () => {
    const engine = createEngine(
      fixtureContent,
      seededRng(1),
      makeSnapshot({ bank: { items: [{ itemId: "raw-fish", qty: 1 }] } }),
    );
    const root = document.createElement("main");
    mountApp(engine, root, resolveContent(fixtureContent), noopWindowChrome);
    skillBtn(root, "cooking")?.click();

    const row = root.querySelector('#workshop-recipes [data-recipe-row="test-cook"]');
    expect(row?.textContent).toContain("1× Raw Fish (have 1)");
    const craftBtn = root.querySelector<HTMLButtonElement>(
      '#workshop-recipes [data-recipe="test-cook"]',
    );
    expect(craftBtn?.disabled).toBe(false);

    craftBtn?.click();
    expect(engine.snapshot().production?.skill).toBe("cooking");
  });

  it("opening the Workshop destination selects whichever Production Skill is currently active in the Engine", async () => {
    const engine = createEngine(
      fixtureContent,
      seededRng(1),
      makeSnapshot({
        // loadProduction (engine.ts) only resumes a saved production activity when the Bank still
        // covers the recipe's own inputs — seed enough raw-fish or the resumed activity silently
        // drops back to idle (tolerant load, same as an unknown monster/fishing id).
        bank: { items: [{ itemId: "raw-fish", qty: 5 }] },
        production: { recipeId: "test-cook", name: "Cook Fish", skill: "cooking" },
      }),
    );
    const root = document.createElement("main");
    mountApp(engine, root, resolveContent(fixtureContent), noopWindowChrome);

    root.querySelector<HTMLButtonElement>("#menu-toggle")?.click();
    root.querySelector<HTMLButtonElement>('[data-destination="workshop"]')?.click();
    await vi.waitFor(() =>
      expect(root.querySelector<HTMLElement>('[data-management-page="workshop"]')?.hidden).toBe(
        false,
      ),
    );

    expect(skillBtn(root, "cooking")?.classList.contains("active")).toBe(true);
  });

  it("opening Workshop while no Production Skill is active retains the prior session selection instead of resetting to Smithing", async () => {
    const { root, engine } = mount(1);
    root.querySelector<HTMLButtonElement>("#menu-toggle")?.click();
    root.querySelector<HTMLButtonElement>('[data-destination="workshop"]')?.click();
    await vi.waitFor(() =>
      expect(root.querySelector<HTMLElement>('[data-management-page="workshop"]')?.hidden).toBe(
        false,
      ),
    );
    skillBtn(root, "herblore")?.click(); // session pick, away from the Smithing default

    root.querySelector<HTMLButtonElement>('[data-destination="world"]')?.click(); // navigate away
    engine.selectMonster("dummy"); // no Production Skill active at all
    root.querySelector<HTMLButtonElement>('[data-destination="workshop"]')?.click(); // reopen

    expect(skillBtn(root, "herblore")?.classList.contains("active")).toBe(true);
  });

  it("the four-button selector and the skill/Level header sit in the fixed (non-scrolling) region; only the recipe body scrolls", () => {
    const { root } = mount(1);
    const skillRow = root.querySelector("#workshop-skill-row");
    expect(skillRow?.closest(".card-scroll")).toBeNull();
    expect(skillRow?.closest(".card-fixed")).not.toBeNull();
    const recipes = root.querySelector("#workshop-recipes");
    expect(recipes?.classList.contains("card-scroll")).toBe(true);
  });
});

describe("Activity destination — fixed Loot Zone header, independent scrollports (#209)", () => {
  it("shows a fixed Loot Zone used/10 header and Loot all button that never sit inside a scrollport", () => {
    const { root } = mount(1);
    expect(root.querySelector("#activity-loot-count")?.textContent).toBe("Loot Zone 0/10");
    const lootAllBtn = root.querySelector("#activity-loot-all-btn");
    expect(lootAllBtn?.closest(".card-scroll")).toBeNull();
    expect(root.querySelector("#activity-loot-count")?.closest(".card-scroll")).toBeNull();
  });

  it("the Loot Zone grid and the Recent Activity feed are two independent scrollports, not a shared wrapper", () => {
    const { root } = mount(1);
    const lootGrid = root.querySelector("#activity-loot-items");
    const feed = root.querySelector("#feed");
    expect(lootGrid?.classList.contains("card-scroll")).toBe(true);
    expect(feed?.classList.contains("card-scroll")).toBe(true);
    expect(lootGrid?.contains(feed as Node)).toBe(false);
    expect(feed?.contains(lootGrid as Node)).toBe(false);
    expect(lootGrid?.closest(".card-scroll")).toBe(lootGrid);
    expect(feed?.closest(".card-scroll")).toBe(feed);
  });

  it("the header count tracks the Loot Zone as combat Drops land in it, from empty through full (10/10)", () => {
    // Ten distinct real fixture item ids (never "junk-N" placeholders): loadLootZone (engine.ts)
    // drops any saved Loot Zone entry whose itemId isn't in Content, so a real Snapshot round-trip
    // needs real ids to actually land all 10 stacks.
    const tenItemIds = [
      "meat",
      "bread",
      "bronze-sword",
      "lucky-charm",
      "bar",
      "raw-fish",
      "hide",
      "bow",
      "staff",
      "herb",
    ];
    const engine = createEngine(
      fixtureContent,
      seededRng(1),
      makeSnapshot({ lootZone: tenItemIds.map((itemId) => ({ itemId, qty: 1 })) }),
    );
    const root = document.createElement("main");
    mountApp(engine, root, resolveContent(fixtureContent), noopWindowChrome);
    expect(engine.snapshot().lootZone).toHaveLength(10); // sanity: all 10 really landed
    expect(root.querySelector("#activity-loot-count")?.textContent).toBe("Loot Zone 10/10");
  });

  it("clicking Loot all inside the Activity page sweeps the zone into the Bank, same as the compact Loot Strip button", () => {
    const engine = createEngine(
      fixtureContent,
      seededRng(1),
      makeSnapshot({ lootZone: [{ itemId: "meat", qty: 3 }] }),
    );
    const root = document.createElement("main");
    mountApp(engine, root, resolveContent(fixtureContent), noopWindowChrome);
    expect(root.querySelector("#activity-loot-count")?.textContent).toBe("Loot Zone 1/10");

    root.querySelector<HTMLButtonElement>("#activity-loot-all-btn")?.click();

    expect(engine.snapshot().lootZone).toEqual([]);
    expect(engine.snapshot().bank.items).toEqual([{ itemId: "meat", qty: 3 }]);
    expect(root.querySelector("#activity-loot-count")?.textContent).toBe("Loot Zone 0/10");
    expect(root.querySelector("#feed li")?.textContent).toMatch(/banked.*meat/i);
  });

  it("each kill event still yields exactly one 'Killed' Loot Feed line now that the panel lives solely in the Activity page", () => {
    // A single Tick can carry several distinct Engine events (kill, drop, loot, levelup), each
    // rightly producing its own feed line — so the invariant to prove isn't "one Tick, one line",
    // it's "one kill event, one 'Killed' line": moving the panel to Activity reused the existing
    // feedLine() call site rather than adding a second subscription that would double (or, if
    // mis-wired, drop) that count.
    const { engine, root } = mount(1);
    let kills = 0;
    engine.on("kill", () => {
      kills += 1;
    });
    root.querySelector<HTMLButtonElement>('[data-monster="dummy"]')?.click();
    for (let i = 0; i < 3000 && kills < 5; i++) engine.tick();
    expect(kills).toBeGreaterThanOrEqual(5);

    const killLines = [...root.querySelectorAll("#feed li")].filter((li) =>
      /^Killed /.test(li.textContent ?? ""),
    );
    expect(killLines.length).toBe(kills);
  });
});

describe("Potion Slot tile (#118)", () => {
  function potionMount(overrides: Parameters<typeof makeSnapshot>[0] = {}) {
    const engine = createEngine(fixtureContent, seededRng(1), makeSnapshot(overrides));
    const root = document.createElement("main");
    const app = mountApp(engine, root, resolveContent(fixtureContent), noopWindowChrome);
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

/** Shared by the Quiver/Rune Pouch/Vendor describe blocks below (#119): mounts a fresh engine —
 * every panel renders regardless of Character/Management card visibility (#206), so there is no
 * panel to open first any more. */
function ammoMount(overrides: Parameters<typeof makeSnapshot>[0] = {}) {
  const engine = createEngine(fixtureContent, seededRng(1), makeSnapshot(overrides));
  const root = document.createElement("main");
  const app = mountApp(engine, root, resolveContent(fixtureContent), noopWindowChrome);
  return { engine, root, app };
}

describe("Quiver tile (#119)", () => {
  it("an empty Quiver shows a [+] that opens a chooser listing only the Bank's arrow stacks", () => {
    const { root } = ammoMount({
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
    const { root } = ammoMount();
    root.querySelector<HTMLButtonElement>("[data-quiver-add]")?.click();
    expect(root.querySelector("#quiver-slot .hint")?.textContent).toMatch(/no arrows/i);
  });

  it("picking an arrow from the chooser loads it (moving the whole Bank stock) and closes the chooser", () => {
    const { engine, root } = ammoMount({
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
    const { engine, root } = ammoMount({
      player: { quiver: { itemId: "arrow", qty: 12 } },
    });
    root.querySelector<HTMLButtonElement>("[data-quiver-unassign]")?.click();

    expect(engine.snapshot().player.quiver).toBeNull();
    expect(engine.snapshot().bank.items).toEqual([{ itemId: "arrow", qty: 12 }]);
    expect(root.querySelector("[data-quiver-add]")).not.toBeNull(); // now renders as empty
  });
});

describe("Rune Slot tile (#221) — collapses the pre-#221 four-Element Rune Pouch to one slot", () => {
  it("an empty Rune Slot shows a [+] that opens a chooser listing every rune the player owns", () => {
    const { root } = ammoMount({
      bank: {
        items: [
          { itemId: "air-rune", qty: 10 },
          { itemId: "water-rune", qty: 5 },
          { itemId: "arrow", qty: 2 }, // an arrow — must never show up as a rune choice
          { itemId: "meat", qty: 1 }, // Food — must never show up as a rune choice
        ],
      },
    });
    const runeSlot = root.querySelector<HTMLElement>("#rune-slot");
    expect(runeSlot?.querySelector("[data-rune-add]")).not.toBeNull();
    expect(root.querySelector(".potion-slot-chooser")).toBeNull(); // closed by default

    runeSlot?.querySelector<HTMLButtonElement>("[data-rune-add]")?.click();

    const chooser = root.querySelector(".potion-slot-chooser");
    expect(chooser).not.toBeNull();
    expect(chooser?.querySelector('[data-rune-assign="air-rune"]')).not.toBeNull();
    expect(chooser?.querySelector('[data-rune-assign="water-rune"]')).not.toBeNull();
    expect(chooser?.querySelector('[data-rune-assign="arrow"]')).toBeNull();
    expect(chooser?.querySelector('[data-rune-assign="meat"]')).toBeNull();
  });

  it("an empty Rune Slot's chooser shows a hint when the Bank has no runes at all", () => {
    const { root } = ammoMount();
    root.querySelector<HTMLButtonElement>("[data-rune-add]")?.click();
    expect(root.querySelector("#rune-slot .hint")?.textContent).toMatch(/no runes/i);
  });

  it("picking a rune from the chooser loads it (moving the whole Bank stock), closes the chooser, and updates the Casting readout", () => {
    const { engine, root } = ammoMount({ bank: { items: [{ itemId: "air-rune", qty: 10 }] } });
    root.querySelector<HTMLButtonElement>("[data-rune-add]")?.click();
    root.querySelector<HTMLButtonElement>('[data-rune-assign="air-rune"]')?.click();

    expect(engine.snapshot().player.runeSlot).toEqual({ itemId: "air-rune", qty: 10 });
    expect(engine.snapshot().bank.items).toEqual([]);
    expect(root.querySelector(".potion-slot-chooser")).toBeNull();

    const filledTile = root.querySelector<HTMLElement>('#rune-slot .tile[data-item="air-rune"]');
    expect(filledTile?.querySelector("img")?.alt).toBe("Test Air Rune");
    expect(filledTile?.querySelector(".tile-qty")?.textContent).toBe("×10");
    expect(root.querySelector("#casting-readout")?.textContent).toBe("Casting: Test Spark");
  });

  it("clicking ✕ unloads the Rune Slot, returning the whole stack to the Bank", () => {
    const { engine, root } = ammoMount({
      player: { runeSlot: { itemId: "air-rune", qty: 12 } },
    });
    root.querySelector<HTMLButtonElement>("[data-rune-unassign]")?.click();

    expect(engine.snapshot().player.runeSlot).toBeNull();
    expect(engine.snapshot().bank.items).toEqual([{ itemId: "air-rune", qty: 12 }]);
    expect(root.querySelector("[data-rune-add]")).not.toBeNull(); // now renders as empty
  });

  it("a rune whose Spell is above the player's Magic level renders disabled with a 'Lv N' badge in the chooser", () => {
    const { root } = ammoMount({
      bank: { items: [{ itemId: "fire-rune", qty: 5 }] }, // test-inferno, levelReq 13; player is Magic level 1
    });
    root.querySelector<HTMLButtonElement>("[data-rune-add]")?.click();
    const fireBtn = root.querySelector<HTMLButtonElement>('[data-rune-assign="fire-rune"]');
    expect(fireBtn?.disabled).toBe(true);
    expect(fireBtn?.querySelector(".rune-req")?.textContent).toBe("Lv 13");
  });

  it("clicking a gated (disabled) chooser row does nothing — it cannot be loaded by clicking", () => {
    const { engine, root } = ammoMount({
      bank: { items: [{ itemId: "fire-rune", qty: 5 }] },
    });
    root.querySelector<HTMLButtonElement>("[data-rune-add]")?.click();
    const fireBtn = root.querySelector<HTMLButtonElement>('[data-rune-assign="fire-rune"]');
    expect(() => fireBtn?.click()).not.toThrow();
    expect(engine.snapshot().player.runeSlot).toBeNull();
    expect(engine.snapshot().bank.items).toEqual([{ itemId: "fire-rune", qty: 5 }]);
  });

  it("a rune the player is high enough level to cast renders enabled, with no badge", () => {
    const { root } = ammoMount({
      player: { skills: { magic: { level: 13, xp: xpForLevel(13) } } },
      bank: { items: [{ itemId: "fire-rune", qty: 5 }] },
    });
    root.querySelector<HTMLButtonElement>("[data-rune-add]")?.click();
    const fireBtn = root.querySelector<HTMLButtonElement>('[data-rune-assign="fire-rune"]');
    expect(fireBtn?.disabled).toBe(false);
    expect(fireBtn?.querySelector(".rune-req")).toBeNull();
  });
});

describe("Vendor tab panel (#119)", () => {
  it("lists every vendor entry with its price and how many the player already owns", () => {
    const { root } = ammoMount({ bank: { items: [{ itemId: "arrow", qty: 7 }] } });
    const arrowRow = root.querySelector<HTMLElement>('[data-vendor-row="arrow"]');
    expect(arrowRow?.textContent).toMatch(/Test Arrow/);
    expect(arrowRow?.textContent).toMatch(/2g/); // fixture vendor price
    expect(arrowRow?.textContent).toMatch(/Owned: 7/);
  });

  it("the Buy button is disabled while gold is short of the price", () => {
    const { root } = ammoMount({ player: { gold: 1 } });
    const buyBtn = root.querySelector<HTMLButtonElement>('[data-vendor-buy="arrow"]');
    expect(buyBtn?.disabled).toBe(true);
  });

  it("clicking Buy purchases 1 unit, charging gold and adding it to the Bank, logging a feed line", () => {
    const { engine, root } = ammoMount({ player: { gold: 100 } });
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
    const app = mountApp(engine, root, resolveContent(fixtureContent), noopWindowChrome);
    root.querySelector<HTMLButtonElement>('[data-monster="dummy"]')?.click();

    for (let i = 0; i < 20; i++) engine.tick();
    app.render();

    const toast = root.querySelector("#toast-container .toast");
    expect(toast).not.toBeNull();
    expect(toast?.textContent).toMatch(/out of arrows/i);

    vi.advanceTimersByTime(5000); // > the toast's auto-dismiss delay
    expect(root.querySelector("#toast-container .toast")).toBeNull();
  });

  it("shows a Spell-agnostic out-of-ammo toast (#221) when the Rune Slot is completely EMPTY (no Spell to name)", () => {
    const engine = createEngine(
      fixtureContent,
      seededRng(1),
      makeSnapshot({ player: { equipment: { weapon: "staff" }, runeSlot: null } }),
    );
    const root = document.createElement("main");
    const app = mountApp(engine, root, resolveContent(fixtureContent), noopWindowChrome);
    root.querySelector<HTMLButtonElement>('[data-monster="dummy"]')?.click();

    for (let i = 0; i < 20; i++) engine.tick();
    app.render();

    const toast = root.querySelector("#toast-container .toast");
    expect(toast).not.toBeNull();
    expect(toast?.textContent).not.toMatch(/undefined/i);
    expect(toast?.textContent).toMatch(/no rune loaded/i);
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
    const app = mountApp(engine, root, resolveContent(rareDropContent), noopWindowChrome);
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
    mountApp(engine, root, resolveContent(allBandsContent), noopWindowChrome);
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
    const app1 = mountApp(engine1, root1, resolveContent(fixtureContent), noopWindowChrome);

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
    mountApp(engine2, root2, resolveContent(fixtureContent), noopWindowChrome);

    const after = engine2.snapshot();
    expect(after.player.skills).toEqual(before.player.skills);
    expect(after.player.gold).toBe(before.player.gold);
    expect(after.bank.items).toEqual(before.bank.items);
    expect(after.player.equipment).toEqual(before.player.equipment);
    expect(after.monster?.id).toBe("dummy");

    // The fresh mount's DOM already reflects the restored state without any further action.
    expect(root2.querySelector("#monster-name")).toBeNull();
    expect(root2.querySelector<HTMLElement>("#monster-bar")?.hidden).toBe(false);
    const weaponTile = root2.querySelector<HTMLElement>('[data-slot="weapon"]');
    expect(weaponTile?.dataset["item"]).toBe("bronze-sword");
    expect(root2.querySelector('#bank .tile[data-item="bronze-sword"]')).toBeNull();
    // Persistence-focused: proves the restored level/xp feed the new tooltip format, not a
    // re-derivation of skillProgress's own percent math (covered independently above).
    const attack = after.player.skills.attack;
    const attackXp = Math.floor(attack.xp);
    expect(root2.querySelector<HTMLElement>('[data-skill="attack"]')?.title).toMatch(
      new RegExp(`^Attack: level ${attack.level} · ${attackXp} xp · \\d+% to ${attack.level + 1}$`),
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
    const app1 = mountApp(engine1, root1, resolveContent(fixtureContent), noopWindowChrome);
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
    mountApp(engine2, root2, resolveContent(fixtureContent), noopWindowChrome);

    const after = engine2.snapshot();
    expect(after.player.foodSlots).toEqual(before.player.foodSlots);
    expect(after.lootZone).toEqual(before.lootZone);

    // The fresh mount's DOM already reflects the restored Food Slot and Loot Zone without any
    // further action.
    const eatTile = root2.querySelector<HTMLElement>('[data-eat="0"]');
    expect(eatTile?.dataset["item"]).toBe("meat");
    expect(eatTile?.querySelector(".tile-qty")?.textContent).toBe("×5");
    // Both Loot Zone views restore from the same Snapshot field (#220: the compact widget's own
    // strip, plus the pre-existing Activity page grid).
    const stripChip = root2.querySelector<HTMLButtonElement>("#loot-strip-items .loot-chip");
    expect(stripChip?.dataset["item"]).toBe("bar");
    expect(stripChip?.querySelector(".tile-qty")?.textContent).toBe("×2");
    const chip = root2.querySelector<HTMLLIElement>("#activity-loot-items .loot-chip");
    expect(chip?.dataset["item"]).toBe("bar");
    expect(chip?.querySelector(".tile-qty")?.textContent).toBe("×2");
  });
});

describe("fixed compact live stage (#210)", () => {
  it("contains only the floating Menu/Close controls and no portrait or moved information — no titlebar chrome (#219)", () => {
    const { root } = mount(1);
    expect(root.querySelector("#titlebar")).toBeNull();
    expect(
      [...root.querySelectorAll("#widget-controls > *")].map((node) => node.id || node.textContent),
    ).toEqual(["menu-toggle", "close-btn"]);
    for (const selector of [
      "#gold",
      "#food-slots",
      "#ticker",
      "#monster-name",
      "#monster-stats",
      "#player-hp-text",
      "#monster-hp-text",
      "#player-portrait",
    ]) {
      expect(root.querySelector(selector), selector).toBeNull();
    }
    // #220: #loot-strip is the live Loot Zone strip this issue adds below #scene — it must exist,
    // unlike the still-dead selectors above.
    expect(root.querySelector("#loot-strip")).not.toBeNull();
  });

  it("shows sprite-attached non-numeric HP bars and a zero-Food warning only in combat", () => {
    const { root } = mount(1);
    expect(root.querySelector<HTMLElement>("#no-food-warning")?.hidden).toBe(true);
    root.querySelector<HTMLButtonElement>('[data-monster="dummy"]')?.click();
    expect(root.querySelector<HTMLElement>("#player-bar")?.hidden).toBe(false);
    expect(root.querySelector<HTMLElement>("#monster-bar")?.hidden).toBe(false);
    expect(root.querySelector<HTMLElement>("#no-food-warning")?.hidden).toBe(false);
    expect(root.querySelector("#no-food-warning")?.textContent).toBe("No active Food");
    expect(root.querySelector("#monster-sprite-wrap > #monster-bar")).not.toBeNull();
    expect(root.querySelector("#player-sprite-wrap > #player-bar")).not.toBeNull();
  });

  it("keeps Mute, transfer controls, and all three scale stops in Character Settings", async () => {
    const { root } = mount(1);
    root.querySelector<HTMLButtonElement>("#menu-toggle")?.click();
    root.querySelector<HTMLButtonElement>('[data-nav="settings"]')?.click();
    const settings = root.querySelector("#settings-popover");
    expect(settings?.querySelector("#mute-toggle")).not.toBeNull();
    expect(settings?.querySelector("#export-save")).not.toBeNull();
    expect(settings?.querySelector("#import-save")).not.toBeNull();
    expect(settings?.querySelectorAll("[data-ui-scale]")).toHaveLength(3);
  });
});
