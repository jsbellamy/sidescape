// @vitest-environment happy-dom
/** Tests the mounted `createCharacterHubUi` interface (#326) — shell/placeholders, Character controls,
 * Gear chooser, Settings/UiScale callbacks, level summaries, and disposal. */
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEngine } from "../core/engine";
import { fixtureContent } from "../core/testing/fixture-content";
import { makeSnapshot } from "../core/testing/make-snapshot";
import { SKILL_NAMES } from "../core/types";
import { seededRng } from "../core/rng";
import { resolveContent } from "../core/validate-content";
import { xpForLevel } from "../core/xp";
import { slotSilhouette } from "./icons";
import { createCharacterHubUi } from "./character-hub";
import type { CharacterHubUi } from "./character-hub";
import type { ManagementDestination } from "./app";
import type { UiScale } from "./window-geometry";

const content = resolveContent(fixtureContent);

function mountCharacterHub(
  seed = 1,
  overrides?: Parameters<typeof makeSnapshot>[0],
  scaleState: {
    selected?: UiScale;
    options?: Array<{ value: UiScale; supported: boolean }>;
  } = {},
) {
  const engine = overrides
    ? createEngine(fixtureContent, seededRng(seed), makeSnapshot(overrides))
    : createEngine(fixtureContent, seededRng(seed));
  const host = document.createElement("section");
  host.id = "card-character";
  const commands = {
    setCombatStyle: vi.fn(engine.setCombatStyle.bind(engine)),
    setAutoEatThreshold: vi.fn(engine.setAutoEatThreshold.bind(engine)),
    setAutoSellDuplicates: vi.fn(engine.setAutoSellDuplicates.bind(engine)),
    equip: vi.fn(engine.equip.bind(engine)),
    unequip: vi.fn(engine.unequip.bind(engine)),
  };
  const onChanged = vi.fn();
  const onDestinationRequested = vi.fn();
  const onScaleRequested = vi.fn(async () => {});
  const selected = scaleState.selected ?? 1;
  const options = scaleState.options ?? [
    { value: 1 as const, supported: true },
    { value: 1.5 as const, supported: true },
    { value: 2 as const, supported: true },
  ];
  const getScaleState = vi.fn(async () => ({ selected, options }));
  let ui: CharacterHubUi;
  ui = createCharacterHubUi({
    host,
    content,
    commands,
    onChanged: () => {
      onChanged();
      ui.render(engine.snapshot().player, engine.snapshot().bank.items);
    },
    onDestinationRequested,
    onScaleRequested,
    getScaleState,
  });
  ui.render(engine.snapshot().player, engine.snapshot().bank.items);
  void getScaleState();
  return {
    engine,
    host,
    ui,
    commands,
    onChanged,
    onDestinationRequested,
    onScaleRequested,
    getScaleState,
  };
}

describe("createCharacterHubUi — shell and placeholders (#326)", () => {
  it("paints the Character card shell with Gear, Loadout, tray hosts, and no Pets markup", () => {
    const { host } = mountCharacterHub();
    expect(host.querySelector("#character-nav")).not.toBeNull();
    expect(host.querySelector("#settings-popover")).not.toBeNull();
    expect(host.querySelector("#mute-toggle")).not.toBeNull();
    expect(host.querySelector("#export-save")).not.toBeNull();
    expect(host.querySelector("#import-save")).not.toBeNull();
    for (const slot of ["weapon", "shield", "head", "body", "legs", "amulet", "ring"]) {
      expect(host.querySelector(`[data-slot="${slot}"]`)).not.toBeNull();
    }
    expect(host.querySelector("#character-food-slots")).not.toBeNull();
    expect(host.querySelector("#potion-slot")).not.toBeNull();
    expect(host.querySelector("#quiver-slot")).not.toBeNull();
    expect(host.querySelector("#rune-slot")).not.toBeNull();
    expect(host.querySelector("#character-bank-tray")).not.toBeNull();
    expect(host.querySelector("#character-bank-detail")).not.toBeNull();
    expect(host.querySelector("#expand-bank-btn")).not.toBeNull();
    expect(host.querySelector("#pets-summary")).toBeNull();
    expect(host.querySelector('[data-nav="pets"]')).toBeNull();
  });

  it("leaves the Equipment tray host empty — Character owns no Bank presentation state", () => {
    const engine = createEngine(
      fixtureContent,
      seededRng(1),
      makeSnapshot({ bank: { items: [{ itemId: "bronze-sword", qty: 1 }] } }),
    );
    const host = document.createElement("section");
    const ui = createCharacterHubUi({
      host,
      content,
      commands: engine,
      onChanged: vi.fn(),
      onDestinationRequested: vi.fn(),
      onScaleRequested: vi.fn(),
      getScaleState: async () => ({
        selected: 1,
        options: [
          { value: 1, supported: true },
          { value: 1.5, supported: true },
          { value: 2, supported: true },
        ],
      }),
    });
    ui.render(engine.snapshot().player, engine.snapshot().bank.items);
    expect(host.querySelector("#character-bank-tray")?.innerHTML).toBe("");
    expect(host.querySelector<HTMLElement>("#character-bank-detail")?.hidden).toBe(true);
  });
});

describe("createCharacterHubUi — Combat Style", () => {
  function styleButtons(host: HTMLElement) {
    return [...host.querySelectorAll<HTMLButtonElement>("#style-row button")];
  }

  it("renders melee styles (Accurate/Aggressive/Defensive) when unarmed", () => {
    const { host } = mountCharacterHub();
    const buttons = styleButtons(host);
    expect(buttons).toHaveLength(3);
    expect(buttons.map((b) => b.dataset["style"]).sort()).toEqual([
      "accurate",
      "aggressive",
      "defensive",
    ]);
    expect(buttons.some((b) => b.dataset["style"] === "rapid")).toBe(false);
  });

  it("renders ranged/magic styles (Accurate/Rapid/Defensive) when a bow is equipped", () => {
    const { host } = mountCharacterHub(1, {
      player: { equipment: { weapon: "bow" } },
    });
    const buttons = styleButtons(host);
    expect(buttons).toHaveLength(3);
    expect(buttons.map((b) => b.dataset["style"]).sort()).toEqual([
      "accurate",
      "defensive",
      "rapid",
    ]);
    expect(buttons.some((b) => b.dataset["style"] === "aggressive")).toBe(false);
  });

  it("renders ranged/magic styles (Accurate/Rapid/Defensive) when a staff is equipped", () => {
    const { host } = mountCharacterHub(1, {
      player: { equipment: { weapon: "staff" } },
    });
    const buttons = styleButtons(host);
    expect(buttons).toHaveLength(3);
    expect(buttons.map((b) => b.dataset["style"]).sort()).toEqual([
      "accurate",
      "defensive",
      "rapid",
    ]);
    expect(buttons.some((b) => b.dataset["style"] === "aggressive")).toBe(false);
  });

  it("clicking Rapid dispatches setCombatStyle when a bow is equipped", () => {
    const { engine, host, commands, onChanged } = mountCharacterHub(1, {
      player: { equipment: { weapon: "bow" } },
      bank: { items: [{ itemId: "arrow", qty: 1 }] },
    });
    host.querySelector<HTMLButtonElement>('[data-style="rapid"]')?.click();
    expect(commands.setCombatStyle).toHaveBeenCalledWith("rapid");
    expect(engine.snapshot().player.combatStyle).toBe("rapid");
    expect(onChanged).toHaveBeenCalled();
  });

  it("clicking a melee style dispatches setCombatStyle and calls onChanged", () => {
    const { engine, host, commands, onChanged } = mountCharacterHub();
    host.querySelector<HTMLButtonElement>('[data-style="accurate"]')?.click();
    expect(commands.setCombatStyle).toHaveBeenCalledWith("accurate");
    expect(engine.snapshot().player.combatStyle).toBe("accurate");
    expect(onChanged).toHaveBeenCalled();
    const active = styleButtons(host).filter((b) => b.classList.contains("active"));
    expect(active).toHaveLength(1);
    expect(active[0]?.dataset["style"]).toBe("accurate");
  });
});

describe("createCharacterHubUi — auto-eat and auto-sell", () => {
  function thresholdButtons(host: HTMLElement) {
    return [...host.querySelectorAll<HTMLButtonElement>("#autoeat-row button")];
  }

  it("clicking a threshold dispatches setAutoEatThreshold and updates the compact indicator", () => {
    const { engine, host, commands, onChanged } = mountCharacterHub();
    host.querySelector<HTMLButtonElement>('[data-nav="settings"]')?.click();
    host.querySelector<HTMLButtonElement>('[data-threshold="0"]')?.click();
    expect(commands.setAutoEatThreshold).toHaveBeenCalledWith(0);
    expect(engine.snapshot().player.autoEatThreshold).toBe(0);
    expect(onChanged).toHaveBeenCalled();
    expect(host.querySelector("#autoeat-indicator")?.textContent).toContain("Off");
    const active = thresholdButtons(host).filter((b) => b.classList.contains("active"));
    expect(active[0]?.dataset["threshold"]).toBe("0");
  });

  it("unchecking auto-sell dispatches setAutoSellDuplicates(false)", () => {
    const { engine, host, commands, onChanged } = mountCharacterHub();
    const input = host.querySelector<HTMLInputElement>("#autosell-duplicates-toggle")!;
    input.checked = false;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    expect(commands.setAutoSellDuplicates).toHaveBeenCalledWith(false);
    expect(engine.snapshot().player.autoSellDuplicates).toBe(false);
    expect(onChanged).toHaveBeenCalled();
  });
});

describe("createCharacterHubUi — Gear Slots and chooser", () => {
  it("filters an empty slot chooser to matching Bank Equipment only", () => {
    const { host } = mountCharacterHub(1, {
      bank: {
        items: [
          { itemId: "bronze-sword", qty: 1 },
          { itemId: "meat", qty: 3 },
        ],
      },
    });
    host.querySelector<HTMLButtonElement>('[data-slot="weapon"] [data-gear-add]')?.click();
    const chooser = host.querySelector(".gear-slot-chooser");
    expect(chooser?.querySelector('[data-gear-assign="bronze-sword"]')).not.toBeNull();
    expect(chooser?.querySelector('[data-gear-assign="meat"]')).toBeNull();
  });

  it("assigning from the chooser equips, closes it, and calls onChanged", () => {
    const { engine, host, commands, onChanged } = mountCharacterHub(1, {
      bank: { items: [{ itemId: "bronze-sword", qty: 1 }] },
    });
    host.querySelector<HTMLButtonElement>('[data-slot="weapon"] [data-gear-add]')?.click();
    host.querySelector<HTMLButtonElement>('[data-gear-assign="bronze-sword"]')?.click();
    expect(commands.equip).toHaveBeenCalledWith("bronze-sword");
    expect(engine.snapshot().player.equipment.weapon).toBe("bronze-sword");
    expect(host.querySelector(".gear-slot-chooser")).toBeNull();
    expect(onChanged).toHaveBeenCalled();
  });

  it("re-clicking the active Gear Slot toggle closes the chooser", () => {
    const { host } = mountCharacterHub(1, {
      bank: { items: [{ itemId: "bronze-sword", qty: 1 }] },
    });
    host.querySelector<HTMLButtonElement>('[data-slot="weapon"] [data-gear-add]')?.click();
    expect(host.querySelector(".gear-slot-chooser")).not.toBeNull();
    host.querySelector<HTMLButtonElement>('[data-slot="weapon"] [data-gear-add]')?.click();
    expect(host.querySelector(".gear-slot-chooser")).toBeNull();
  });
});

describe("createCharacterHubUi — gear unequip (#375)", () => {
  it("renders a ✕ on filled gear tiles only", () => {
    const { host } = mountCharacterHub(1, {
      player: { equipment: { weapon: "bronze-sword" } },
    });
    expect(host.querySelector('[data-slot="weapon"] [data-gear-unassign]')).not.toBeNull();
    expect(host.querySelector('[data-slot="shield"] [data-gear-unassign]')).toBeNull();
  });

  it("clicking a gear ✕ unequips, returns the tile to empty, and banks the item", () => {
    const { engine, host, commands, onChanged } = mountCharacterHub(1, {
      player: { equipment: { weapon: "bronze-sword" } },
    });
    host.querySelector<HTMLButtonElement>('[data-gear-unassign="weapon"]')?.click();
    expect(commands.unequip).toHaveBeenCalledWith("weapon");
    expect(engine.snapshot().player.equipment.weapon).toBeNull();
    expect(engine.snapshot().bank.items).toEqual([{ itemId: "bronze-sword", qty: 1 }]);
    expect(host.querySelector('[data-slot="weapon"] [data-gear-add]')).not.toBeNull();
    expect(onChanged).toHaveBeenCalled();
  });

  it("right-click on a filled gear tile unequips and calls preventDefault", () => {
    const { engine, host, commands } = mountCharacterHub(1, {
      player: { equipment: { weapon: "bronze-sword" } },
    });
    const tile = host.querySelector<HTMLElement>('[data-slot="weapon"][data-item]')!;
    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    const prevented = !tile.dispatchEvent(event);
    expect(prevented).toBe(true);
    expect(commands.unequip).toHaveBeenCalledWith("weapon");
    expect(engine.snapshot().player.equipment.weapon).toBeNull();
  });

  it("right-click on an empty gear tile does not call preventDefault", () => {
    const { host, commands } = mountCharacterHub();
    const tile = host.querySelector<HTMLElement>('[data-slot="weapon"]')!;
    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    const prevented = !tile.dispatchEvent(event);
    expect(prevented).toBe(false);
    expect(commands.unequip).not.toHaveBeenCalled();
  });

  it("clicking a gear ✕ unequips without opening the slot chooser", () => {
    const { host } = mountCharacterHub(1, {
      player: { equipment: { weapon: "bronze-sword" } },
      bank: { items: [{ itemId: "bow", qty: 1 }] },
    });
    host.querySelector<HTMLButtonElement>('[data-gear-unassign="weapon"]')?.click();
    expect(host.querySelector(".gear-slot-chooser")).toBeNull();
    expect(host.querySelector('[data-slot="weapon"] [data-gear-add]')).not.toBeNull();
  });

  it("dispose() removes the gear contextmenu listener", () => {
    const { host, ui, commands } = mountCharacterHub(1, {
      player: { equipment: { weapon: "bronze-sword" } },
    });
    ui.dispose();
    const tile = host.querySelector<HTMLElement>('[data-slot="weapon"][data-item]')!;
    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    tile.dispatchEvent(event);
    expect(commands.unequip).not.toHaveBeenCalled();
  });
});

describe("createCharacterHubUi — gear level gating (#377)", () => {
  it("disables gear above the player's level with an Lv N badge", () => {
    const { host } = mountCharacterHub(1, {
      bank: {
        items: [
          { itemId: "bronze-sword", qty: 1 },
          { itemId: "high-sword", qty: 1 },
        ],
      },
    });
    host.querySelector<HTMLButtonElement>('[data-slot="weapon"] [data-gear-add]')?.click();
    const gatedBtn = host.querySelector<HTMLButtonElement>('[data-gear-assign="high-sword"]');
    const plainBtn = host.querySelector<HTMLButtonElement>('[data-gear-assign="bronze-sword"]');
    expect(gatedBtn?.disabled).toBe(true);
    expect(gatedBtn?.querySelector(".slot-req")?.textContent).toBe("Lv 40");
    expect(plainBtn?.disabled).toBe(false);
  });

  it("enables gated gear at the exact required level and equips on click", () => {
    const { engine, host } = mountCharacterHub(1, {
      player: { skills: { attack: { level: 40, xp: xpForLevel(40) } } },
      bank: { items: [{ itemId: "high-sword", qty: 1 }] },
    });
    host.querySelector<HTMLButtonElement>('[data-slot="weapon"] [data-gear-add]')?.click();
    const gatedBtn = host.querySelector<HTMLButtonElement>('[data-gear-assign="high-sword"]');
    expect(gatedBtn?.disabled).toBe(false);
    gatedBtn?.click();
    expect(engine.snapshot().player.equipment.weapon).toBe("high-sword");
  });

  it("disables multi-skill gear when either requirement is unmet", () => {
    const metAttackOnly = mountCharacterHub(1, {
      player: {
        skills: {
          attack: { level: 10, xp: xpForLevel(10) },
          defence: { level: 9, xp: xpForLevel(9) },
        },
      },
      bank: { items: [{ itemId: "dual-req-ring", qty: 1 }] },
    });
    metAttackOnly.host
      .querySelector<HTMLButtonElement>('[data-slot="ring"] [data-gear-add]')
      ?.click();
    expect(
      metAttackOnly.host.querySelector<HTMLButtonElement>('[data-gear-assign="dual-req-ring"]')
        ?.disabled,
    ).toBe(true);

    const bothMet = mountCharacterHub(2, {
      player: {
        skills: {
          attack: { level: 10, xp: xpForLevel(10) },
          defence: { level: 10, xp: xpForLevel(10) },
        },
      },
      bank: { items: [{ itemId: "dual-req-ring", qty: 1 }] },
    });
    bothMet.host.querySelector<HTMLButtonElement>('[data-slot="ring"] [data-gear-add]')?.click();
    const ringBtn = bothMet.host.querySelector<HTMLButtonElement>(
      '[data-gear-assign="dual-req-ring"]',
    );
    expect(ringBtn?.disabled).toBe(false);
    ringBtn?.click();
    expect(bothMet.engine.snapshot().player.equipment.ring).toBe("dual-req-ring");
  });

  it("the Engine still throws when equip is called below levelReq", () => {
    const { engine } = mountCharacterHub(1, {
      bank: { items: [{ itemId: "high-sword", qty: 1 }] },
    });
    expect(() => engine.equip("high-sword")).toThrow("attack level too low: need 40");
  });
});

describe("createCharacterHubUi — chooser dismissal", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  function mountWithOpenChooser() {
    document.body.innerHTML = "";
    const host = document.createElement("section");
    host.id = "card-character";
    document.body.appendChild(host);
    const engine = createEngine(
      fixtureContent,
      seededRng(1),
      makeSnapshot({ bank: { items: [{ itemId: "bronze-sword", qty: 1 }] } }),
    );
    let ui: CharacterHubUi;
    ui = createCharacterHubUi({
      host,
      content,
      commands: engine,
      onChanged: () => ui.render(engine.snapshot().player, engine.snapshot().bank.items),
      onDestinationRequested: vi.fn(),
      onScaleRequested: vi.fn(),
      getScaleState: async () => ({
        selected: 1,
        options: [
          { value: 1, supported: true },
          { value: 1.5, supported: true },
          { value: 2, supported: true },
        ],
      }),
    });
    ui.render(engine.snapshot().player, engine.snapshot().bank.items);
    host.querySelector<HTMLButtonElement>('[data-slot="weapon"] [data-gear-add]')?.click();
    return { engine, host, ui };
  }

  it("outside-document click closes the chooser", () => {
    const { host } = mountWithOpenChooser();
    host
      .querySelector<HTMLElement>("#character-totals")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(host.querySelector(".gear-slot-chooser")).toBeNull();
  });

  it("window blur closes the chooser", () => {
    const { host } = mountWithOpenChooser();
    window.dispatchEvent(new Event("blur"));
    expect(host.querySelector(".gear-slot-chooser")).toBeNull();
  });

  it("dispose() removes document/window listeners so a disposed host ignores later blur", () => {
    const { host, ui } = mountWithOpenChooser();
    ui.dispose();
    window.dispatchEvent(new Event("blur"));
    expect(host.querySelector(".gear-slot-chooser")).not.toBeNull();

    const engine2 = createEngine(
      fixtureContent,
      seededRng(2),
      makeSnapshot({ bank: { items: [{ itemId: "bronze-sword", qty: 1 }] } }),
    );
    const host2 = document.createElement("section");
    document.body.appendChild(host2);
    let ui2: CharacterHubUi;
    ui2 = createCharacterHubUi({
      host: host2,
      content,
      commands: engine2,
      onChanged: () => ui2.render(engine2.snapshot().player, engine2.snapshot().bank.items),
      onDestinationRequested: vi.fn(),
      onScaleRequested: vi.fn(),
      getScaleState: async () => ({
        selected: 1,
        options: [
          { value: 1, supported: true },
          { value: 1.5, supported: true },
          { value: 2, supported: true },
        ],
      }),
    });
    ui2.render(engine2.snapshot().player, engine2.snapshot().bank.items);
    host2.querySelector<HTMLButtonElement>('[data-slot="weapon"] [data-gear-add]')?.click();
    expect(host2.querySelector(".gear-slot-chooser")).not.toBeNull();

    window.dispatchEvent(new Event("blur"));
    expect(host2.querySelector(".gear-slot-chooser")).toBeNull();
    ui2.dispose();
  });
});

describe("createCharacterHubUi — level summaries", () => {
  it("renders combat and total level summaries from the player slice", () => {
    const { engine, host, ui } = mountCharacterHub();
    const total = SKILL_NAMES.reduce(
      (sum, skill) => sum + engine.snapshot().player.skills[skill].level,
      0,
    );
    expect(host.querySelector("#summary-combat-level")?.textContent).toBe(
      String(engine.snapshot().player.combatLevel),
    );
    expect(host.querySelector("#summary-total-level")?.textContent).toBe(String(total));

    engine.tick();
    ui.render(engine.snapshot().player, engine.snapshot().bank.items);
    expect(host.querySelector("#summary-combat-level")?.textContent).toBe(
      String(engine.snapshot().player.combatLevel),
    );
  });
});

describe("createCharacterHubUi — Settings and destination callbacks", () => {
  it("toggles Settings visibility and aria-expanded without calling onChanged", () => {
    const { host, onChanged } = mountCharacterHub();
    const settingsBtn = host.querySelector<HTMLButtonElement>('[data-nav="settings"]');
    expect(host.querySelector<HTMLElement>("#settings-popover")?.hidden).toBe(true);
    expect(settingsBtn?.getAttribute("aria-expanded")).toBe("false");

    settingsBtn?.click();
    expect(host.querySelector<HTMLElement>("#settings-popover")?.hidden).toBe(false);
    expect(settingsBtn?.getAttribute("aria-expanded")).toBe("true");
    expect(onChanged).not.toHaveBeenCalled();

    settingsBtn?.click();
    expect(host.querySelector<HTMLElement>("#settings-popover")?.hidden).toBe(true);
  });

  it("destination buttons call onDestinationRequested with the right ids", () => {
    const destinations: ManagementDestination[] = [
      "world",
      "workshop",
      "activity",
      "skills",
      "bank",
    ];
    for (const destination of destinations) {
      const { host, onDestinationRequested } = mountCharacterHub();
      const launcher =
        destination === "bank"
          ? host.querySelector<HTMLButtonElement>("#expand-bank-btn")
          : destination === "skills"
            ? host.querySelector<HTMLButtonElement>("#character-levels-summary")
            : host.querySelector<HTMLButtonElement>(`[data-destination="${destination}"]`);
      launcher?.click();
      expect(onDestinationRequested).toHaveBeenCalledWith(destination);
    }
  });
});

describe("createCharacterHubUi — UiScale", () => {
  it("reflects supported and unsupported scale options from getScaleState", async () => {
    const { host, getScaleState } = mountCharacterHub(1, undefined, {
      selected: 1,
      options: [
        { value: 1, supported: true },
        { value: 1.5, supported: false },
        { value: 2, supported: true },
      ],
    });
    host.querySelector<HTMLButtonElement>('[data-nav="settings"]')?.click();
    await vi.waitFor(() => expect(getScaleState).toHaveBeenCalled());
    const buttons = [...host.querySelectorAll<HTMLButtonElement>("[data-ui-scale]")];
    expect(buttons.find((b) => b.dataset["uiScale"] === "1.5")?.disabled).toBe(true);
    expect(buttons.find((b) => b.dataset["uiScale"] === "1")?.getAttribute("aria-pressed")).toBe(
      "true",
    );
  });

  it("clicking a supported scale button calls onScaleRequested", async () => {
    const { host, onScaleRequested } = mountCharacterHub();
    host.querySelector<HTMLButtonElement>('[data-nav="settings"]')?.click();
    await host.querySelector<HTMLButtonElement>('[data-ui-scale="1.5"]')?.click();
    expect(onScaleRequested).toHaveBeenCalledWith(1.5);
  });
});

describe("createCharacterHubUi — Gear Slot presentation", () => {
  const ZERO_DEF_VECTOR = "st 0 · sl 0 · cr 0 · rn 0 · mg 0";

  it("shows empty Gear Slot silhouettes wired to their slot add buttons", () => {
    const { host } = mountCharacterHub();
    for (const slot of ["weapon", "shield", "head", "body", "legs", "amulet", "ring"] as const) {
      const tile = host.querySelector<HTMLElement>(`[data-slot="${slot}"]`);
      const img = tile?.querySelector<HTMLImageElement>("img.slot-silhouette");
      expect(img?.getAttribute("src")).toBe(slotSilhouette(slot));
      expect(tile?.querySelector<HTMLButtonElement>(`[data-gear-add="${slot}"]`)).not.toBeNull();
    }
  });

  it("renders equipped bonus totals from the player slice", () => {
    const { host } = mountCharacterHub();
    expect(host.querySelector("#character-totals")?.textContent).toBe(
      `+0 atk +0 str ${ZERO_DEF_VECTOR} spd 4t`,
    );
  });

  it("pins .slot-silhouette opacity at 0.65 with pointer-events: none (#306)", () => {
    const css = readFileSync("src/styles.css", "utf8");
    expect(css).toMatch(/\.slot-silhouette\s*\{[^}]*opacity:\s*0\.65;/s);
    expect(css).toMatch(/\.slot-silhouette\s*\{[^}]*pointer-events:\s*none;/s);
  });
});

describe("createCharacterHubUi — disposal", () => {
  it("dispose() is idempotent and prevents later host clicks from dispatching commands", () => {
    const commands = {
      setCombatStyle: vi.fn(),
      setAutoEatThreshold: vi.fn(),
      setAutoSellDuplicates: vi.fn(),
      equip: vi.fn(),
      unequip: vi.fn(),
    };
    const host = document.createElement("section");
    const ui = createCharacterHubUi({
      host,
      content,
      commands,
      onChanged: vi.fn(),
      onDestinationRequested: vi.fn(),
      onScaleRequested: vi.fn(),
      getScaleState: async () => ({
        selected: 1,
        options: [
          { value: 1, supported: true },
          { value: 1.5, supported: true },
          { value: 2, supported: true },
        ],
      }),
    });
    ui.render(makeSnapshot().player, makeSnapshot().bank.items);
    ui.dispose();
    ui.dispose();

    host.querySelector<HTMLButtonElement>('[data-style="accurate"]')?.click();
    expect(commands.setCombatStyle).not.toHaveBeenCalled();
  });
});
