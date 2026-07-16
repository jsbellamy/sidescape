// @vitest-environment happy-dom
/** Tests the mounted `createWorldPageUi` interface (#325) — session Area selection, fallback
 * priorities, command dispatch, locked behavior, and disposal. Mounts a minimal dedicated host with
 * explicit Snapshots or a fixture Engine behind command spies, mirroring loadout-slot.test.ts. */
import { describe, expect, it, vi } from "vitest";
import { createEngine } from "../core/engine";
import { fixtureContent } from "../core/fixture-content";
import { makeSnapshot } from "../core/make-snapshot";
import { seededRng } from "../core/rng";
import { xpForLevel } from "../core/xp";
import { resolveContent } from "../core/validate-content";
import { createWorldPageUi } from "./world-page";
import type { WorldPageUi } from "./world-page";

const content = resolveContent(fixtureContent);

/** Clicks an Area's row in the World page's progression rail — session-only presentation
 * selection, never an Engine command. */
function selectAreaRow(host: HTMLElement, areaId: string): HTMLElement | null {
  const row = host.querySelector<HTMLElement>(`[data-area-select="${areaId}"]`);
  row?.click();
  return row;
}

function mountWorld(seed = 1, overrides?: Parameters<typeof makeSnapshot>[0]) {
  const engine = overrides
    ? createEngine(fixtureContent, seededRng(seed), makeSnapshot(overrides))
    : createEngine(fixtureContent, seededRng(seed));
  const host = document.createElement("div");
  host.id = "world-page-host";
  let ui: WorldPageUi;
  const onChanged = vi.fn(() => {
    ui.render(engine.snapshot());
  });
  ui = createWorldPageUi({ host, content, commands: engine, onChanged });
  ui.render(engine.snapshot());
  return { engine, host, ui, onChanged };
}

/**
 * A 3-Area fixture (#208) built specifically to differentiate `resolveSelectedArea`'s priority
 * steps, which fixtureContent's own 2-Area meadow/crypt shape can't cleanly separate.
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
  const resolved = resolveContent(priorityContent);
  const engine = createEngine(priorityContent, seededRng(seed));
  const host = document.createElement("div");
  host.id = "world-page-host";
  let ui: WorldPageUi;
  const onChanged = vi.fn(() => {
    ui.render(engine.snapshot());
  });
  ui = createWorldPageUi({ host, content: resolved, commands: engine, onChanged });
  ui.render(engine.snapshot());
  return { engine, host, ui, onChanged };
}

describe("createWorldPageUi — selected-Area progression rail (#208)", () => {
  it("renders all Areas in the rail, in Snapshot order, with the locked one dimmed", () => {
    const { host } = mountPriority();
    const rows = [...host.querySelectorAll<HTMLButtonElement>("[data-area-select]")];
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

  it("resolves the idle default to the first-unlocked Area (priority step 4)", () => {
    const { host } = mountPriority();
    expect(host.querySelector(".area-name")?.textContent).toBe("Alpha");
    expect(host.querySelector('[data-monster="dummy"]')).not.toBeNull();
  });

  it("an active Fishing Spot resolves its own Area over the first-unlocked fallback (priority step 3)", () => {
    const { engine, host, ui } = mountPriority();
    engine.selectFishingSpot("pond");
    ui.render(engine.snapshot());

    expect(host.querySelector(".area-name")?.textContent).toBe("Beta");
    const pondBtn = host.querySelector<HTMLButtonElement>('[data-spot="pond"]');
    expect(pondBtn?.classList.contains("active")).toBe(true);
  });

  it("an active Dungeon resolves its HOST Area even when the current Wave's Monster belongs to no Area (priority step 2 over step 3)", () => {
    const { engine, host, ui } = mountPriority();
    engine.enterDungeon("gauntlet");
    ui.render(engine.snapshot());

    expect(host.querySelector(".area-name")?.textContent).toBe("Beta");
    expect(engine.snapshot().monster?.id).toBe("boss-dummy");

    const betaRow = host.querySelector<HTMLElement>('[data-area-select="beta"]');
    expect(betaRow?.classList.contains("current")).toBe(true);
    expect(betaRow?.classList.contains("selected")).toBe(true);
  });

  it("selectedAreaId (priority step 1) outranks every Snapshot-driven step, including the active Dungeon's own host Area", () => {
    const { engine, host, ui } = mountPriority();
    engine.enterDungeon("gauntlet");
    ui.render(engine.snapshot());
    expect(host.querySelector(".area-name")?.textContent).toBe("Beta");

    selectAreaRow(host, "gamma");
    expect(host.querySelector(".area-name")?.textContent).toBe("Gamma 🔒 Clear The Gauntlet");

    const betaRow = host.querySelector<HTMLElement>('[data-area-select="beta"]');
    const gammaRow = host.querySelector<HTMLElement>('[data-area-select="gamma"]');
    expect(betaRow?.classList.contains("current")).toBe(true);
    expect(betaRow?.classList.contains("selected")).toBe(false);
    expect(gammaRow?.classList.contains("selected")).toBe(true);
    expect(gammaRow?.classList.contains("current")).toBe(false);

    expect(engine.snapshot().dungeon?.id).toBe("gauntlet");
  });

  it("selecting a different Area replaces the previously-shown selected-detail markup", () => {
    const { host } = mountPriority();
    expect(host.querySelector(".area-name")?.textContent).toBe("Alpha");
    expect(host.querySelector('[data-monster="dummy"]')).not.toBeNull();

    selectAreaRow(host, "beta");
    expect(host.querySelector(".area-name")?.textContent).toBe("Beta");
    expect(host.querySelector('[data-monster="dummy"]')).toBeNull();
    expect(host.querySelector('[data-monster="brute"]')).not.toBeNull();
  });

  it("a locked Area's row is selectable for inspection, but dispatches no command even if its (disabled) button is clicked", () => {
    const { engine, host } = mountPriority();
    const stateOf = () => {
      const { savedAt: _savedAt, ...rest } = engine.snapshot();
      return rest;
    };
    const before = stateOf();

    selectAreaRow(host, "gamma");
    expect(host.querySelector(".area-name")?.textContent).toBe("Gamma 🔒 Clear The Gauntlet");
    expect(stateOf()).toEqual(before);
  });

  it("Area-row selection alone never changes the Snapshot (no command dispatch from the rail)", () => {
    const { engine, host } = mountPriority();
    const stateOf = () => {
      const { savedAt: _savedAt, ...rest } = engine.snapshot();
      return JSON.stringify(rest);
    };
    const before = stateOf();

    selectAreaRow(host, "beta");
    selectAreaRow(host, "gamma");
    selectAreaRow(host, "alpha");

    expect(stateOf()).toBe(before);
  });

  it("the active Monster/Fishing Spot/Dungeon button gets the active accent class, scoped to whichever is actually running", () => {
    const { engine, host, ui } = mountPriority();
    engine.selectMonster("dummy");
    ui.render(engine.snapshot());

    const dummyBtn = host.querySelector<HTMLButtonElement>('[data-monster="dummy"]');
    expect(dummyBtn?.classList.contains("active")).toBe(true);
  });
});

describe("createWorldPageUi — Monster picker Drop Table tooltip", () => {
  it("lists every Drop Table entry with its band and a human-readable chance", () => {
    const { host } = mountWorld(1);
    const dummyBtn = host.querySelector<HTMLButtonElement>('[data-monster="dummy"]');

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
    const { host } = mountWorld(1);
    selectAreaRow(host, "crypt");
    const bruteBtn = host.querySelector<HTMLButtonElement>('[data-monster="brute"]');

    expect(bruteBtn?.title).toBe("Gold ×200 — always");
  });
});

describe("createWorldPageUi — locked Area inspection", () => {
  it("a locked Area can still be inspected from the rail: its Monster buttons render, dimmed/disabled, once selected", () => {
    const { host } = mountWorld(1);
    selectAreaRow(host, "crypt");
    const bruteBtn = host.querySelector<HTMLButtonElement>('[data-monster="brute"]');
    expect(bruteBtn?.textContent).toBe("Crypt Brute");
    expect(bruteBtn?.disabled).toBe(true);
  });

  it("shows a locked Area's selected-detail label as '🔒 Clear <dungeon name>'", () => {
    const { host } = mountWorld(1);
    expect(host.querySelector(".area-name")?.textContent).toBe("Test Meadow");

    selectAreaRow(host, "crypt");
    expect(host.querySelector(".area-name")?.textContent).toBe("Test Crypt 🔒 Clear The Gauntlet");
  });
});

describe("createWorldPageUi — command dispatch", () => {
  it("Monster selection dispatches the exact id and calls onChanged once", () => {
    const commands = {
      selectMonster: vi.fn(),
      selectFishingSpot: vi.fn(),
      enterDungeon: vi.fn(),
    };
    const host = document.createElement("div");
    const onChanged = vi.fn();
    const ui = createWorldPageUi({
      host,
      content,
      commands,
      onChanged,
    });
    ui.render(makeSnapshot());

    host.querySelector<HTMLButtonElement>('[data-monster="dummy"]')?.click();

    expect(commands.selectMonster).toHaveBeenCalledWith("dummy");
    expect(commands.selectMonster).toHaveBeenCalledTimes(1);
    expect(commands.selectFishingSpot).not.toHaveBeenCalled();
    expect(commands.enterDungeon).not.toHaveBeenCalled();
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("Fishing Spot selection dispatches the exact id and calls onChanged once", () => {
    const commands = {
      selectMonster: vi.fn(),
      selectFishingSpot: vi.fn(),
      enterDungeon: vi.fn(),
    };
    const host = document.createElement("div");
    const onChanged = vi.fn();
    const ui = createWorldPageUi({ host, content, commands, onChanged });
    ui.render(makeSnapshot());

    host.querySelector<HTMLButtonElement>('[data-spot="pond"]')?.click();

    expect(commands.selectFishingSpot).toHaveBeenCalledWith("pond");
    expect(commands.selectFishingSpot).toHaveBeenCalledTimes(1);
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("Dungeon entry dispatches the exact id and calls onChanged once", () => {
    const commands = {
      selectMonster: vi.fn(),
      selectFishingSpot: vi.fn(),
      enterDungeon: vi.fn(),
    };
    const host = document.createElement("div");
    const onChanged = vi.fn();
    const ui = createWorldPageUi({ host, content, commands, onChanged });
    ui.render(makeSnapshot());

    host.querySelector<HTMLButtonElement>('[data-dungeon="gauntlet"]')?.click();

    expect(commands.enterDungeon).toHaveBeenCalledWith("gauntlet");
    expect(commands.enterDungeon).toHaveBeenCalledTimes(1);
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("locked activity controls do not dispatch", () => {
    const { engine, host } = mountWorld(1);
    const selectMonster = vi.spyOn(engine, "selectMonster");

    selectAreaRow(host, "crypt");
    const bruteBtn = host.querySelector<HTMLButtonElement>('[data-monster="brute"]');
    expect(bruteBtn?.disabled).toBe(true);
    bruteBtn?.click();

    expect(selectMonster).not.toHaveBeenCalled();
  });
});

describe("createWorldPageUi — Fishing Spot rendering", () => {
  it("renders a 🎣 Fishing Spot button for the selected Area, disabled when that Area is locked", () => {
    const { host } = mountWorld(1);
    const pondBtn = host.querySelector<HTMLButtonElement>('[data-spot="pond"]');
    expect(pondBtn?.textContent).toBe("🎣 Test Pond");
    expect(pondBtn?.disabled).toBe(false);

    selectAreaRow(host, "crypt");
    const deepPondBtn = host.querySelector<HTMLButtonElement>('[data-spot="deep-pond"]');
    expect(deepPondBtn?.disabled).toBe(true);
  });

  it("renders an .action-progress bar under the active Fishing Spot's button, filling toward the next catch (#284)", () => {
    const { engine, host, ui } = mountWorld(1);
    engine.selectFishingSpot("pond");
    ui.render(engine.snapshot());

    const bar = host.querySelector<HTMLElement>('[data-spot="pond"] + .action-progress');
    expect(bar).not.toBeNull();
    expect(bar?.querySelector<HTMLElement>(".fill")?.style.width).toBe("0%");

    engine.tick();
    ui.render(engine.snapshot());

    const fillAfterOneTick = host
      .querySelector('[data-spot="pond"] + .action-progress')
      ?.querySelector<HTMLElement>(".fill");
    expect(fillAfterOneTick?.style.width).toBe(`${(1 / 3) * 100}%`);
  });

  it("rebuilds Fishing-Spot levelReq gates when render receives an updated Snapshot after levelup", () => {
    const { engine, host, ui } = mountWorld(1, {
      player: {
        completedDungeonIds: ["gauntlet"],
        skills: { fishing: { level: 19, xp: xpForLevel(20) - 5 } },
      },
    });
    selectAreaRow(host, "crypt");

    const deepPondBefore = host.querySelector<HTMLButtonElement>('[data-spot="deep-pond"]');
    expect(deepPondBefore?.disabled).toBe(true);

    engine.selectFishingSpot("pond");
    for (let i = 0; i < 3; i++) engine.tick();
    expect(engine.snapshot().player.skills.fishing.level).toBe(20);

    ui.render(engine.snapshot());
    const deepPondAfter = host.querySelector<HTMLButtonElement>('[data-spot="deep-pond"]');
    expect(deepPondAfter?.disabled).toBe(false);
  });
});

describe("createWorldPageUi — Dungeon rendering", () => {
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
    const resolved = resolveContent(lockedDungeonContent);
    const engine = createEngine(lockedDungeonContent, seededRng(1));
    const host = document.createElement("div");
    let ui: WorldPageUi;
    const onChanged = vi.fn(() => {
      ui.render(engine.snapshot());
    });
    ui = createWorldPageUi({ host, content: resolved, commands: engine, onChanged });
    ui.render(engine.snapshot());

    const gauntletBtn = host.querySelector<HTMLButtonElement>('[data-dungeon="gauntlet"]');
    expect(gauntletBtn?.textContent).toBe("⚔ The Gauntlet");
    expect(gauntletBtn?.disabled).toBe(false);

    selectAreaRow(host, "crypt");
    const cryptBtn = host.querySelector<HTMLButtonElement>('[data-dungeon="crypt-dungeon"]');
    expect(cryptBtn?.textContent).toBe("⚔ Crypt Dungeon");
    expect(cryptBtn?.disabled).toBe(true);
  });

  it("rebuilds on dungeon-completed when render receives an updated Snapshot — selected Area persists", () => {
    const { engine, host, ui } = mountWorld(5);
    selectAreaRow(host, "crypt");
    const bruteBefore = host.querySelector<HTMLButtonElement>('[data-monster="brute"]');
    expect(bruteBefore?.disabled).toBe(true);
    expect(host.querySelector(".area-name")?.textContent).toBe("Test Crypt 🔒 Clear The Gauntlet");

    engine.enterDungeon("gauntlet");
    for (let i = 0; i < 5000 && engine.snapshot().player.completedDungeonIds.length === 0; i++) {
      engine.tick();
    }
    expect(engine.snapshot().player.completedDungeonIds).toEqual(["gauntlet"]);

    ui.render(engine.snapshot());
    const bruteAfter = host.querySelector<HTMLButtonElement>('[data-monster="brute"]');
    expect(bruteAfter?.disabled).toBe(false);
    expect(host.querySelector(".area-name")?.textContent).toBe("Test Crypt");
  });
});

describe("createWorldPageUi — disposal", () => {
  it("dispose() is idempotent and prevents later host clicks from dispatching", () => {
    const commands = {
      selectMonster: vi.fn(),
      selectFishingSpot: vi.fn(),
      enterDungeon: vi.fn(),
    };
    const host = document.createElement("div");
    const onChanged = vi.fn();
    const ui = createWorldPageUi({ host, content, commands, onChanged });
    ui.render(makeSnapshot());

    ui.dispose();
    ui.dispose();

    host.querySelector<HTMLButtonElement>('[data-monster="dummy"]')?.click();
    expect(commands.selectMonster).not.toHaveBeenCalled();
    expect(onChanged).not.toHaveBeenCalled();
  });
});
