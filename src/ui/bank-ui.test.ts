// @vitest-environment happy-dom
/** Tests the mounted `createBankUi` interface (#327) — dual-host tray + destination, shared
 * presentation, lifecycle, Vendor stable nodes, and disposal. Migrated from app.test.ts Bank/
 * Vendor describes at the bank-ui mounted seam. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEngine } from "../core/engine";
import { fixtureContent } from "../core/fixture-content";
import { makeSnapshot } from "../core/make-snapshot";
import { seededRng } from "../core/rng";
import { xpForLevel } from "../core/xp";
import { resolveContent } from "../core/validate-content";
import { createBankUi } from "./bank-ui";
import type { BankUi } from "./bank-ui";

const content = resolveContent(fixtureContent);

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

function trayShellMarkup(): string {
  return `<div id="character-bank-tray" class="tile-grid"></div>
    <div id="character-bank-detail" class="detail-strip" hidden></div>`;
}

function mountBank(overrides: Parameters<typeof makeSnapshot>[0] = {}) {
  const engine = createEngine(fixtureContent, seededRng(1), makeSnapshot(overrides));
  const trayHost = document.createElement("section");
  trayHost.innerHTML = trayShellMarkup();
  const destinationHost = document.createElement("div");
  let ui: BankUi;
  const onChanged = vi.fn(() => {
    ui.render(engine.snapshot());
  });
  ui = createBankUi({ trayHost, destinationHost, content, commands: engine, onChanged });
  ui.render(engine.snapshot());
  return { engine, trayHost, destinationHost, ui, onChanged };
}

function bankIds(destinationHost: HTMLElement) {
  return [...destinationHost.querySelectorAll<HTMLElement>("#bank .tile")].map(
    (tile) => tile.dataset["item"],
  );
}

function selectBankTile(destinationHost: HTMLElement, itemId: string): void {
  destinationHost.querySelector<HTMLElement>(`#bank .tile[data-item="${itemId}"]`)?.click();
}

function clickFilter(destinationHost: HTMLElement, filter: string): void {
  destinationHost.querySelector<HTMLButtonElement>(`[data-bank-filter="${filter}"]`)?.click();
}

function typeSearch(destinationHost: HTMLElement, text: string): void {
  const input = destinationHost.querySelector<HTMLInputElement>("#bank-search");
  if (!input) throw new Error("#bank-search not found");
  input.value = text;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function setSort(destinationHost: HTMLElement, key: "kind" | "value" | "name"): void {
  const select = destinationHost.querySelector<HTMLSelectElement>("#bank-sort-select");
  if (!select) throw new Error("#bank-sort-select not found");
  select.value = key;
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

function mixedBank() {
  return makeSnapshot({
    player: { gold: 500 },
    bank: {
      items: [
        { itemId: "bronze-sword", qty: 1 },
        { itemId: "meat", qty: 3 },
        { itemId: "bar", qty: 2 },
        { itemId: "strength-potion", qty: 1 },
        { itemId: "arrow", qty: 10 },
      ],
    },
  });
}

describe("createBankUi — Bank operations", () => {
  it("shows the Bank header as used/capacity and the next slot price on the buy button", () => {
    const { destinationHost } = mountBank({
      bank: { items: [{ itemId: "meat", qty: 5 }], capacity: 100 },
    });
    expect(destinationHost.querySelector("#bank-header")?.textContent).toBe("Bank 1/100");
    expect(destinationHost.querySelector("#buy-slots-btn")?.textContent).toBe(
      "Buy +10 slots (1000g)",
    );
  });

  it("disables the buy-slots button when gold is short of the price, enables it when affordable", () => {
    const short = mountBank({ player: { gold: 500 } });
    expect(short.destinationHost.querySelector<HTMLButtonElement>("#buy-slots-btn")?.disabled).toBe(
      true,
    );

    const flush = mountBank({ player: { gold: 1000 } });
    expect(flush.destinationHost.querySelector<HTMLButtonElement>("#buy-slots-btn")?.disabled).toBe(
      false,
    );
  });

  it("clicking Buy +10 slots grows capacity, debits gold, and updates the header/price", () => {
    const { engine, destinationHost } = mountBank({ player: { gold: 1000 } });
    destinationHost.querySelector<HTMLButtonElement>("#buy-slots-btn")?.click();

    expect(engine.snapshot().bank.capacity).toBe(110);
    expect(engine.snapshot().player.gold).toBe(0);
    expect(destinationHost.querySelector("#bank-header")?.textContent).toBe("Bank 0/110");
    expect(destinationHost.querySelector("#buy-slots-btn")?.textContent).toBe(
      "Buy +10 slots (1500g)",
    );
  });

  it("clicking Equip on a Bank row moves the item into its Gear Slot", () => {
    const { engine, destinationHost } = mountBank({
      bank: { items: [{ itemId: "bronze-sword", qty: 1 }] },
    });

    selectBankTile(destinationHost, "bronze-sword");
    const equipBtn = destinationHost.querySelector<HTMLButtonElement>(
      '#bank-detail [data-equip="bronze-sword"]',
    );
    expect(equipBtn).not.toBeNull();
    equipBtn?.click();

    expect(engine.snapshot().player.equipment.weapon).toBe("bronze-sword");
    expect(engine.snapshot().bank.items).toEqual([]);
  });

  it("an Equip button is only shown on equipment rows, not food or material rows", () => {
    const { destinationHost } = mountBank({
      bank: {
        items: [
          { itemId: "meat", qty: 1 },
          { itemId: "bar", qty: 1 },
        ],
      },
    });
    selectBankTile(destinationHost, "meat");
    expect(destinationHost.querySelector("#bank-detail [data-equip]")).toBeNull();
    selectBankTile(destinationHost, "bar");
    expect(destinationHost.querySelector("#bank-detail [data-equip]")).toBeNull();
  });

  it("clicking a Food tile in the Bank (not the Equip/Sell buttons) does nothing — Food is eaten from the Food Slot bar, not the Bank (#61)", () => {
    const { engine, destinationHost } = mountBank({
      player: { hp: 5, maxHp: 10, skills: { hitpoints: { level: 10, xp: xpForLevel(10) } } },
      bank: { items: [{ itemId: "meat", qty: 3 }] },
    });

    selectBankTile(destinationHost, "meat");

    expect(engine.snapshot().player.hp).toBe(5);
    expect(engine.snapshot().bank.items).toEqual([{ itemId: "meat", qty: 3 }]);
  });

  it("sell-before-equip: Sell dispatches before Equip in the detail strip handler", () => {
    const sell = vi.fn();
    const equip = vi.fn();
    const engine = createEngine(
      fixtureContent,
      seededRng(1),
      makeSnapshot({ bank: { items: [{ itemId: "bronze-sword", qty: 1 }] } }),
    );
    const trayHost = document.createElement("section");
    trayHost.innerHTML = trayShellMarkup();
    const destinationHost = document.createElement("div");
    let ui: BankUi;
    ui = createBankUi({
      trayHost,
      destinationHost,
      content,
      commands: {
        sell,
        equip,
        buy: engine.buy.bind(engine),
        buyBankSlots: engine.buyBankSlots.bind(engine),
      },
      onChanged: () => ui.render(engine.snapshot()),
    });
    ui.render(engine.snapshot());
    selectBankTile(destinationHost, "bronze-sword");

    const sellBtn = destinationHost.querySelector<HTMLButtonElement>(
      '#bank-detail [data-sell="bronze-sword"]',
    );
    sellBtn?.click();
    expect(sell).toHaveBeenCalledWith("bronze-sword", 1);
    expect(equip).not.toHaveBeenCalled();
  });

  it("Buy Slots dispatches buyBankSlots and calls onChanged once", () => {
    const buyBankSlots = vi.fn();
    const engine = createEngine(
      fixtureContent,
      seededRng(1),
      makeSnapshot({ player: { gold: 1000 } }),
    );
    const trayHost = document.createElement("section");
    trayHost.innerHTML = trayShellMarkup();
    const destinationHost = document.createElement("div");
    let ui: BankUi;
    const onChanged = vi.fn(() => ui.render(engine.snapshot()));
    ui = createBankUi({
      trayHost,
      destinationHost,
      content,
      commands: {
        sell: engine.sell.bind(engine),
        equip: engine.equip.bind(engine),
        buy: engine.buy.bind(engine),
        buyBankSlots,
      },
      onChanged,
    });
    ui.render(engine.snapshot());

    destinationHost.querySelector<HTMLButtonElement>("#buy-slots-btn")?.click();
    expect(buyBankSlots).toHaveBeenCalledTimes(1);
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("dispose() prevents interactions in both hosts", () => {
    const { engine, trayHost, destinationHost, ui } = mountBank(
      makeSnapshot({ bank: { items: [{ itemId: "bronze-sword", qty: 1 }] } }),
    );
    const goldBefore = engine.snapshot().player.gold;
    ui.dispose();
    ui.dispose();

    destinationHost.querySelector<HTMLButtonElement>("#buy-slots-btn")?.click();
    selectBankTile(destinationHost, "bronze-sword");
    trayHost
      .querySelector<HTMLButtonElement>('#character-bank-tray [data-item="bronze-sword"]')
      ?.click();

    expect(engine.snapshot().player.gold).toBe(goldBefore);
    expect(engine.snapshot().bank.items).toEqual([{ itemId: "bronze-sword", qty: 1 }]);
  });
});

describe("createBankUi — filters, search, and dual-host (#207)", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", stubLocalStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders exactly the six always-visible filter buttons: All, Gear, Food, Materials, Potions, Ammo", () => {
    const { destinationHost } = mountBank();
    const buttons = [
      ...destinationHost.querySelectorAll<HTMLButtonElement>("#bank-filter-row button"),
    ];
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
    const { destinationHost } = mountBank(mixedBank());
    const grid = destinationHost.querySelector("#bank");
    const gridScroll = grid?.closest(".card-scroll");
    expect(gridScroll).not.toBeNull();

    for (const outside of [
      destinationHost.querySelector("#bank-filter-row"),
      destinationHost.querySelector("#bank-search"),
      destinationHost.querySelector("#bank-sort-select"),
      destinationHost.querySelector("#bank-detail"),
      destinationHost.querySelector("#buy-slots-btn"),
    ]) {
      expect(outside).not.toBeNull();
      expect(outside?.closest(".card-scroll")).not.toBe(gridScroll);
    }
  });

  it("filtering to Gear/Food/Materials/Potions/Ammo shows only that kind's stacks", () => {
    const { destinationHost } = mountBank(mixedBank());

    clickFilter(destinationHost, "equipment");
    expect(bankIds(destinationHost)).toEqual(["bronze-sword"]);

    clickFilter(destinationHost, "food");
    expect(bankIds(destinationHost)).toEqual(["meat"]);

    clickFilter(destinationHost, "material");
    expect(bankIds(destinationHost)).toEqual(["bar"]);

    clickFilter(destinationHost, "potion");
    expect(bankIds(destinationHost)).toEqual(["strength-potion"]);

    clickFilter(destinationHost, "ammo");
    expect(bankIds(destinationHost)).toEqual(["arrow"]);

    clickFilter(destinationHost, "all");
    expect(bankIds(destinationHost)).toHaveLength(5);
  });

  it("marks the active filter button, moving `active`/aria-pressed as the filter changes", () => {
    const { destinationHost } = mountBank(mixedBank());
    clickFilter(destinationHost, "food");
    const foodBtn = destinationHost.querySelector<HTMLButtonElement>('[data-bank-filter="food"]');
    const allBtn = destinationHost.querySelector<HTMLButtonElement>('[data-bank-filter="all"]');
    expect(foodBtn?.classList.contains("active")).toBe(true);
    expect(foodBtn?.getAttribute("aria-pressed")).toBe("true");
    expect(allBtn?.classList.contains("active")).toBe(false);
    expect(allBtn?.getAttribute("aria-pressed")).toBe("false");
  });

  it("search matches case-insensitively and trims surrounding whitespace", () => {
    const { destinationHost } = mountBank(mixedBank());

    typeSearch(destinationHost, "SWORD");
    expect(bankIds(destinationHost)).toEqual(["bronze-sword"]);

    typeSearch(destinationHost, "  meat  ");
    expect(bankIds(destinationHost)).toEqual(["meat"]);

    typeSearch(destinationHost, "");
    expect(bankIds(destinationHost)).toHaveLength(5);
  });

  it("composes filter and search — search narrows within the active filter, kind first", () => {
    const { destinationHost } = mountBank(mixedBank());
    clickFilter(destinationHost, "food");
    typeSearch(destinationHost, "sword");

    expect(bankIds(destinationHost)).toEqual([]);
  });

  it("selecting a tile then filtering it out of view hides the detail strip", () => {
    const { destinationHost } = mountBank(mixedBank());
    selectBankTile(destinationHost, "bronze-sword");
    expect(destinationHost.querySelector<HTMLElement>("#bank-detail")?.hidden).toBe(false);

    clickFilter(destinationHost, "food");
    expect(destinationHost.querySelector<HTMLElement>("#bank-detail")?.hidden).toBe(true);
  });

  it("filtering the full Bank grid to hide an Equipment selection does not blank the Character tray's own detail for the same shared selection", () => {
    const { trayHost, destinationHost } = mountBank(mixedBank());
    selectBankTile(destinationHost, "bronze-sword");
    clickFilter(destinationHost, "food");
    expect(destinationHost.querySelector<HTMLElement>("#bank-detail")?.hidden).toBe(true);

    const trayDetail = trayHost.querySelector<HTMLElement>("#character-bank-detail");
    expect(trayDetail?.hidden).toBe(false);
    expect(trayDetail?.querySelector('[data-equip="bronze-sword"]')).not.toBeNull();
  });

  it("selecting a tile in the full Bank grid also selects it in the Character tray (shared selection, #207)", () => {
    const { trayHost, destinationHost } = mountBank(mixedBank());
    selectBankTile(destinationHost, "bronze-sword");

    const trayTile = trayHost.querySelector<HTMLButtonElement>(
      '#character-bank-tray [data-item="bronze-sword"]',
    );
    expect(trayTile?.getAttribute("aria-pressed")).toBe("true");
  });

  it("sort state affects both full Bank and tray projections", () => {
    const { trayHost, destinationHost } = mountBank(mixedBank());
    const nameOrder = bankIds(destinationHost);

    setSort(destinationHost, "value");
    const valueOrder = bankIds(destinationHost);
    expect(valueOrder).not.toEqual(nameOrder);

    const trayIds = [...trayHost.querySelectorAll<HTMLElement>("#character-bank-tray .tile")].map(
      (t) => t.dataset["item"],
    );
    expect(trayIds).toEqual(["bronze-sword"]);
  });

  it("filter and sort persist across a remount; search and selection do not (#207)", () => {
    const engine = createEngine(fixtureContent, seededRng(1), mixedBank());
    const trayHost = document.createElement("section");
    trayHost.innerHTML = trayShellMarkup();
    const destinationHost = document.createElement("div");
    let ui: BankUi;
    ui = createBankUi({
      trayHost,
      destinationHost,
      content,
      commands: engine,
      onChanged: () => ui.render(engine.snapshot()),
    });
    ui.render(engine.snapshot());

    clickFilter(destinationHost, "food");
    typeSearch(destinationHost, "meat");
    selectBankTile(destinationHost, "meat");

    const stored = JSON.parse(localStorage.getItem("sidescape-ui-bank-view-v1") ?? "{}");
    expect(stored).toEqual({ version: 1, filter: "food", sort: "name" });

    const destinationHost2 = document.createElement("div");
    const trayHost2 = document.createElement("section");
    trayHost2.innerHTML = trayShellMarkup();
    let ui2: BankUi;
    ui2 = createBankUi({
      trayHost: trayHost2,
      destinationHost: destinationHost2,
      content,
      commands: engine,
      onChanged: () => ui2.render(engine.snapshot()),
    });
    ui2.render(engine.snapshot());

    expect(
      destinationHost2
        .querySelector<HTMLButtonElement>('[data-bank-filter="food"]')
        ?.classList.contains("active"),
    ).toBe(true);
    expect(destinationHost2.querySelector<HTMLInputElement>("#bank-search")?.value).toBe("");
    expect(destinationHost2.querySelector<HTMLElement>("#bank-detail")?.hidden).toBe(true);
  });

  it("falls back to the default filter/sort when localStorage holds malformed bank-view JSON", () => {
    localStorage.setItem("sidescape-ui-bank-view-v1", "{not json");
    const { destinationHost } = mountBank(mixedBank());
    expect(
      destinationHost
        .querySelector<HTMLButtonElement>('[data-bank-filter="all"]')
        ?.classList.contains("active"),
    ).toBe(true);
    expect(destinationHost.querySelector<HTMLSelectElement>("#bank-sort-select")?.value).toBe(
      "name",
    );
    expect(bankIds(destinationHost)).toHaveLength(5);
  });

  it("setDestinationOpen(true → false) clears search at the module seam", () => {
    const { destinationHost, ui } = mountBank(mixedBank());
    ui.setDestinationOpen(true);
    clickFilter(destinationHost, "food");
    typeSearch(destinationHost, "meat");
    expect(destinationHost.querySelector<HTMLInputElement>("#bank-search")?.value).toBe("meat");

    ui.setDestinationOpen(false);
    expect(destinationHost.querySelector<HTMLInputElement>("#bank-search")?.value).toBe("");

    ui.setDestinationOpen(false);
    expect(destinationHost.querySelector<HTMLInputElement>("#bank-search")?.value).toBe("");
  });

  it("shows Gold alongside the existing used/capacity header text, updating after a slot purchase", () => {
    const { destinationHost, engine } = mountBank({
      player: { gold: 1500 },
      bank: { items: [], capacity: 100 },
    });
    expect(destinationHost.querySelector("#bank-gold")?.textContent).toBe("🪙 1500");
    expect(destinationHost.querySelector("#bank-header")?.textContent).toBe("Bank 0/100");

    destinationHost.querySelector<HTMLButtonElement>("#buy-slots-btn")?.click();
    expect(engine.snapshot().bank.capacity).toBe(110);
    expect(engine.snapshot().player.gold).toBe(500);
    expect(destinationHost.querySelector("#bank-gold")?.textContent).toBe("🪙 500");
    expect(destinationHost.querySelector("#bank-header")?.textContent).toBe("Bank 0/110");
  });

  it("the Bank/Vendor toggle leaves the active filter, search, selection, and game state untouched", () => {
    const { destinationHost, engine } = mountBank(mixedBank());
    clickFilter(destinationHost, "food");
    typeSearch(destinationHost, "meat");
    selectBankTile(destinationHost, "meat");
    const goldBefore = engine.snapshot().player.gold;
    const bankBefore = engine.snapshot().bank.items;

    destinationHost.querySelector<HTMLButtonElement>('[data-bankpage="vendor"]')?.click();
    expect(destinationHost.querySelector<HTMLElement>('[data-bank-page="vendor"]')?.hidden).toBe(
      false,
    );
    destinationHost.querySelector<HTMLButtonElement>('[data-bankpage="bank"]')?.click();

    expect(
      destinationHost
        .querySelector<HTMLButtonElement>('[data-bank-filter="food"]')
        ?.classList.contains("active"),
    ).toBe(true);
    expect(destinationHost.querySelector<HTMLInputElement>("#bank-search")?.value).toBe("meat");
    expect(destinationHost.querySelector<HTMLElement>("#bank-detail")?.hidden).toBe(false);
    expect(engine.snapshot().player.gold).toBe(goldBefore);
    expect(engine.snapshot().bank.items).toEqual(bankBefore);
  });

  it("never mutates the Engine Snapshot's own bank.items array while filtering/searching/sorting", () => {
    const { destinationHost, engine } = mountBank(mixedBank());
    const before = engine.snapshot().bank.items;
    const beforeCopy = JSON.parse(JSON.stringify(before));

    clickFilter(destinationHost, "equipment");
    typeSearch(destinationHost, "sword");
    setSort(destinationHost, "value");

    expect(engine.snapshot().bank.items).toEqual(beforeCopy);
  });
});

describe("createBankUi — Vendor tab panel (#119)", () => {
  it("lists every vendor entry with its price and how many the player already owns", () => {
    const { destinationHost } = mountBank({ bank: { items: [{ itemId: "arrow", qty: 7 }] } });
    const arrowRow = destinationHost.querySelector<HTMLElement>('[data-vendor-row="arrow"]');
    expect(arrowRow?.textContent).toMatch(/Test Arrow/);
    expect(arrowRow?.textContent).toMatch(/2g/);
    expect(arrowRow?.textContent).toMatch(/Owned: 7/);
  });

  it("the Buy button is disabled while gold is short of the price", () => {
    const { destinationHost } = mountBank({ player: { gold: 1 } });
    const buyBtn = destinationHost.querySelector<HTMLButtonElement>('[data-vendor-buy="arrow"]');
    expect(buyBtn?.disabled).toBe(true);
  });

  it("clicking Buy purchases 1 unit, charging gold and adding it to the Bank", () => {
    const { engine, destinationHost } = mountBank({ player: { gold: 100 } });
    const events: { itemId: string; qty: number; gold: number }[] = [];
    engine.on("item-bought", (e) => events.push({ itemId: e.itemId, qty: e.qty, gold: e.gold }));

    destinationHost.querySelector<HTMLButtonElement>('[data-vendor-buy="arrow"]')?.click();

    expect(engine.snapshot().player.gold).toBe(98);
    expect(engine.snapshot().bank.items).toEqual([{ itemId: "arrow", qty: 1 }]);
    expect(events).toEqual([{ itemId: "arrow", qty: 1, gold: 2 }]);
  });
});

describe("createBankUi — Vendor bulk buy (#283, #307)", () => {
  function qtyInput(destinationHost: HTMLElement, itemId: string): HTMLInputElement {
    const input = destinationHost.querySelector<HTMLInputElement>(`[data-vendor-qty="${itemId}"]`);
    if (!input) throw new Error(`no qty input for ${itemId}`);
    return input;
  }

  function typeQty(destinationHost: HTMLElement, itemId: string, value: string): void {
    const input = qtyInput(destinationHost, itemId);
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function buyBtn(destinationHost: HTMLElement, itemId: string): HTMLButtonElement {
    const btn = destinationHost.querySelector<HTMLButtonElement>(`[data-vendor-buy="${itemId}"]`);
    if (!btn) throw new Error(`no buy button for ${itemId}`);
    return btn;
  }

  it("gives each vendor row an integer qty field with min=1 defaulting to 1", () => {
    const { destinationHost } = mountBank({ player: { gold: 100 } });
    const input = qtyInput(destinationHost, "arrow");
    expect(input.type).toBe("number");
    expect(input.min).toBe("1");
    expect(input.step).toBe("1");
    expect(input.value).toBe("1");
  });

  it("labels the Buy button with the live total cost = price × qty", () => {
    const { destinationHost } = mountBank({ player: { gold: 100 } });
    expect(buyBtn(destinationHost, "arrow").textContent).toMatch(/Buy \(2g\)/);

    typeQty(destinationHost, "arrow", "5");
    expect(buyBtn(destinationHost, "arrow").textContent).toMatch(/Buy \(10g\)/);
  });

  it("buys exactly qty via engine.buy(itemId, qty): qty 5 of a 3g item costs 15g, adds 5, one item-bought event", () => {
    const { engine, destinationHost } = mountBank({ player: { gold: 100 } });
    const events: { itemId: string; qty: number; gold: number }[] = [];
    engine.on("item-bought", (e) => events.push({ itemId: e.itemId, qty: e.qty, gold: e.gold }));

    typeQty(destinationHost, "air-rune", "5");
    buyBtn(destinationHost, "air-rune").click();

    expect(engine.snapshot().player.gold).toBe(85);
    expect(engine.snapshot().bank.items).toEqual([{ itemId: "air-rune", qty: 5 }]);
    expect(events).toEqual([{ itemId: "air-rune", qty: 5, gold: 15 }]);
  });

  it("disables Buy when the total cost would exceed gold", () => {
    const { destinationHost } = mountBank({ player: { gold: 2 } });
    expect(buyBtn(destinationHost, "air-rune").disabled).toBe(true);
  });

  it("clamps an over-affordable qty down to floor(gold/price) instead of overspending", () => {
    const { engine, destinationHost } = mountBank({ player: { gold: 10 } });
    typeQty(destinationHost, "air-rune", "5");

    expect(qtyInput(destinationHost, "air-rune").value).toBe("3");
    expect(buyBtn(destinationHost, "air-rune").textContent).toMatch(/Buy \(9g\)/);
    expect(buyBtn(destinationHost, "air-rune").disabled).toBe(false);

    buyBtn(destinationHost, "air-rune").click();
    expect(engine.snapshot().player.gold).toBe(1);
    expect(engine.snapshot().bank.items).toEqual([{ itemId: "air-rune", qty: 3 }]);
  });

  it("disables Buy when the Bank has no room for the resulting new stack", () => {
    const { destinationHost } = mountBank({
      player: { gold: 100 },
      bank: { items: [{ itemId: "meat", qty: 1 }], capacity: 1 },
    });
    expect(buyBtn(destinationHost, "arrow").disabled).toBe(true);
  });

  it("treats a non-integer or < 1 qty as invalid: Buy is disabled and a click cannot purchase", () => {
    const { engine, destinationHost } = mountBank({ player: { gold: 100 } });

    typeQty(destinationHost, "arrow", "0");
    expect(buyBtn(destinationHost, "arrow").disabled).toBe(true);
    expect(qtyInput(destinationHost, "arrow").value).toBe("");

    typeQty(destinationHost, "arrow", "-1");
    expect(buyBtn(destinationHost, "arrow").disabled).toBe(true);
    expect(qtyInput(destinationHost, "arrow").value).toBe("");

    typeQty(destinationHost, "arrow", "");
    expect(buyBtn(destinationHost, "arrow").disabled).toBe(true);

    buyBtn(destinationHost, "arrow").click();
    expect(engine.snapshot().player.gold).toBe(100);
    expect(engine.snapshot().bank.items).toEqual([]);
  });

  it("blocks non-numeric quantity keys and clears non-numeric pasted values", () => {
    const { destinationHost } = mountBank({ player: { gold: 100 } });
    const input = qtyInput(destinationHost, "arrow");
    const minus = new KeyboardEvent("keydown", { key: "-", bubbles: true, cancelable: true });
    const decimal = new KeyboardEvent("keydown", { key: ".", bubbles: true, cancelable: true });

    input.dispatchEvent(minus);
    input.dispatchEvent(decimal);
    expect(minus.defaultPrevented).toBe(true);
    expect(decimal.defaultPrevented).toBe(true);

    typeQty(destinationHost, "arrow", "1.5");
    expect(input.value).toBe("");
  });

  it("keeps the exact focused input through repeated Tick renders while keyboard editing", () => {
    const { engine, destinationHost, ui } = mountBank({ player: { gold: 100 } });
    document.body.append(destinationHost);
    const input = qtyInput(destinationHost, "air-rune");
    input.focus();
    expect(document.activeElement).toBe(input);

    typeQty(destinationHost, "air-rune", "");
    ui.render(engine.snapshot());
    expect(qtyInput(destinationHost, "air-rune")).toBe(input);
    expect(input.isConnected).toBe(true);
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe("");

    typeQty(destinationHost, "air-rune", "2");
    engine.tick();
    ui.render(engine.snapshot());
    typeQty(destinationHost, "air-rune", "25");
    ui.render(engine.snapshot());

    expect(qtyInput(destinationHost, "air-rune")).toBe(input);
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe("25");
    expect(buyBtn(destinationHost, "air-rune").textContent).toMatch(/Buy \(75g\)/);
  });

  it("updates live ownership and affordability on the same focused input", () => {
    const { engine, destinationHost, ui } = mountBank({ player: { gold: 100 } });
    document.body.append(destinationHost);
    const input = qtyInput(destinationHost, "arrow");
    typeQty(destinationHost, "arrow", "40");
    input.focus();
    engine.buy("air-rune", 30);
    engine.tick();
    ui.render(engine.snapshot());

    expect(qtyInput(destinationHost, "arrow")).toBe(input);
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe("5");
    expect(buyBtn(destinationHost, "arrow").textContent).toMatch(/Buy \(10g\)/);
    expect(
      destinationHost.querySelector('[data-vendor-row="air-rune"] .recipe-inputs')?.textContent,
    ).toBe("Owned: 30");
  });

  it("strictly rejects malformed quantities without purchasing", () => {
    const { engine, destinationHost } = mountBank({ player: { gold: 100 } });
    for (const value of ["", "0", "-1", "1.5", "1e2", " 2", "2 ", "+2", "9007199254740992"]) {
      typeQty(destinationHost, "arrow", value);
      expect(buyBtn(destinationHost, "arrow").disabled, value).toBe(true);
      buyBtn(destinationHost, "arrow").click();
    }
    expect(engine.snapshot().player.gold).toBe(100);
    expect(engine.snapshot().bank.items).toEqual([]);
  });

  it("keeps valid existing stacks eligible in a full Bank and returns focus after Buy", () => {
    const { engine, destinationHost } = mountBank({
      player: { gold: 100 },
      bank: { items: [{ itemId: "arrow", qty: 1 }], capacity: 1 },
    });
    document.body.append(destinationHost);
    const input = qtyInput(destinationHost, "arrow");
    typeQty(destinationHost, "arrow", "5");
    input.focus();
    buyBtn(destinationHost, "arrow").click();

    expect(engine.snapshot().player.gold).toBe(90);
    expect(engine.snapshot().bank.items).toEqual([{ itemId: "arrow", qty: 6 }]);
    expect(qtyInput(destinationHost, "arrow")).toBe(input);
    expect(input.value).toBe("5");
    expect(document.activeElement).toBe(input);
  });

  it("reconciles Vendor rows in Content order without duplicate rows after rerenders", () => {
    const { engine, destinationHost, ui } = mountBank({ player: { gold: 100 } });
    const expected = fixtureContent.vendor.map((entry) => entry.itemId);
    ui.render(engine.snapshot());
    ui.render(engine.snapshot());
    expect(
      [...destinationHost.querySelectorAll<HTMLElement>("[data-vendor-row]")].map(
        (row) => row.dataset["vendorRow"],
      ),
    ).toEqual(expected);
  });
});
