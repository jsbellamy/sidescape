// @vitest-environment happy-dom
/** Tests the mounted `createBankUi` interface (#327) — dual-host tray + destination, shared
 * presentation, lifecycle, Vendor stable nodes, and disposal. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEngine } from "../core/engine";
import { fixtureContent } from "../core/fixture-content";
import { makeSnapshot } from "../core/make-snapshot";
import { seededRng } from "../core/rng";
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

describe("createBankUi — dual-host presentation (#327)", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", stubLocalStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the Bank header as used/capacity and the next slot price on the buy button", () => {
    const { destinationHost } = mountBank({
      bank: { items: [{ itemId: "meat", qty: 5 }], capacity: 100 },
    });
    expect(destinationHost.querySelector("#bank-header")?.textContent).toBe("Bank 1/100");
    expect(destinationHost.querySelector("#buy-slots-btn")?.textContent).toBe(
      "Buy +10 slots (1000g)",
    );
  });

  it("one shared selection visible in full Bank and tray when each projection contains the Item", () => {
    const { trayHost, destinationHost } = mountBank(mixedBank());
    selectBankTile(destinationHost, "bronze-sword");

    const trayTile = trayHost.querySelector<HTMLButtonElement>(
      '#character-bank-tray [data-item="bronze-sword"]',
    );
    expect(trayTile?.getAttribute("aria-pressed")).toBe("true");
    expect(destinationHost.querySelector<HTMLElement>("#bank-detail")?.hidden).toBe(false);
    expect(trayHost.querySelector<HTMLElement>("#character-bank-detail")?.hidden).toBe(false);
  });

  it("full filter/search does not incorrectly filter the Equipment tray", () => {
    const { trayHost, destinationHost } = mountBank(mixedBank());
    selectBankTile(destinationHost, "bronze-sword");
    clickFilter(destinationHost, "food");
    expect(destinationHost.querySelector<HTMLElement>("#bank-detail")?.hidden).toBe(true);

    const trayDetail = trayHost.querySelector<HTMLElement>("#character-bank-detail");
    expect(trayDetail?.hidden).toBe(false);
    expect(trayDetail?.querySelector('[data-equip="bronze-sword"]')).not.toBeNull();
    expect(trayHost.querySelector('[data-item="meat"]')).toBeNull();
    expect(trayHost.querySelector('[data-item="bronze-sword"]')).not.toBeNull();
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

    const detail = destinationHost.querySelector<HTMLElement>("#bank-detail");
    const sellBtn = detail?.querySelector<HTMLButtonElement>('[data-sell="bronze-sword"]');
    const equipBtn = detail?.querySelector<HTMLButtonElement>('[data-equip="bronze-sword"]');
    expect(sellBtn).not.toBeNull();
    expect(equipBtn).not.toBeNull();

    sellBtn?.click();
    expect(sell).toHaveBeenCalledWith("bronze-sword", 1);
    expect(equip).not.toHaveBeenCalled();
  });

  it("persisted filter/sort and session-only search", () => {
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

  it("Bank/Vendor mode is private module state", () => {
    const { destinationHost } = mountBank(mixedBank());
    clickFilter(destinationHost, "food");
    typeSearch(destinationHost, "meat");
    selectBankTile(destinationHost, "meat");

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

describe("createBankUi — Vendor (#119, #283, #307)", () => {
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

  it("lists vendor entries with price and owned count", () => {
    const { destinationHost } = mountBank({ bank: { items: [{ itemId: "arrow", qty: 7 }] } });
    const arrowRow = destinationHost.querySelector<HTMLElement>('[data-vendor-row="arrow"]');
    expect(arrowRow?.textContent).toMatch(/Test Arrow/);
    expect(arrowRow?.textContent).toMatch(/2g/);
    expect(arrowRow?.textContent).toMatch(/Owned: 7/);
  });

  it("disables Buy when gold is short, full Bank, or invalid qty", () => {
    const short = mountBank({ player: { gold: 1 } });
    expect(buyBtn(short.destinationHost, "arrow").disabled).toBe(true);

    const full = mountBank({
      player: { gold: 100 },
      bank: { items: [{ itemId: "meat", qty: 1 }], capacity: 1 },
    });
    expect(buyBtn(full.destinationHost, "arrow").disabled).toBe(true);

    const { engine, destinationHost } = mountBank({ player: { gold: 100 } });
    typeQty(destinationHost, "arrow", "0");
    expect(buyBtn(destinationHost, "arrow").disabled).toBe(true);
    buyBtn(destinationHost, "arrow").click();
    expect(engine.snapshot().player.gold).toBe(100);
  });

  it("clamps over-affordable qty and purchases via engine.buy", () => {
    const { engine, destinationHost } = mountBank({ player: { gold: 10 } });
    typeQty(destinationHost, "air-rune", "5");
    expect(qtyInput(destinationHost, "air-rune").value).toBe("3");
    buyBtn(destinationHost, "air-rune").click();
    expect(engine.snapshot().player.gold).toBe(1);
    expect(engine.snapshot().bank.items).toEqual([{ itemId: "air-rune", qty: 3 }]);
  });

  it("keeps the focused vendor input node through repeated renders", () => {
    const { engine, destinationHost, ui } = mountBank({ player: { gold: 100 } });
    document.body.append(destinationHost);
    const input = qtyInput(destinationHost, "air-rune");
    input.focus();
    typeQty(destinationHost, "air-rune", "25");
    ui.render(engine.snapshot());
    expect(qtyInput(destinationHost, "air-rune")).toBe(input);
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe("25");
  });
});
