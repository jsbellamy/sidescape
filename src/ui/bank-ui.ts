/** The deep, mounted Bank module (#327): owns the Character card's Equipment-only tray and the
 * Bank/Vendor Management destination — one `BankPresentation` instance, shared selection, filter/
 * sort/search rules, detail markup, Equip/Sell dispatch, Vendor stable-node behavior, and
 * `setDestinationOpen` lifecycle. `mountApp` paints only empty hosts and forwards Snapshot plus
 * destination visibility. */

import type { Engine } from "../core/engine";
import type { Snapshot } from "../core/types";
import type { ResolvedContent } from "../core/validate-content";
import { SORT_KEYS } from "./sort";
import type { SortKey } from "./sort";
import { BANK_FILTERS, createBankPresentation } from "./bank-view";
import type { BankFilter } from "./bank-view";
import { createItemPresentation } from "./item-presentation";
import { formatQty } from "./format";

/** Bank filter button labels, in `BANK_FILTERS` order (#207). */
const BANK_FILTER_LABELS: Record<BankFilter, string> = {
  all: "All",
  equipment: "Gear",
  food: "Food",
  material: "Materials",
  potion: "Potions",
  ammo: "Ammo",
};

const BANK_SORT_OPTIONS: readonly { key: SortKey; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "kind", label: "Kind" },
  { key: "value", label: "Value" },
];

type BankMode = "bank" | "vendor";

interface VendorRowElements {
  row: HTMLLIElement;
  owned: HTMLElement;
  quantity: HTMLInputElement;
  buy: HTMLButtonElement;
}

interface VendorBuyState {
  quantity: number | null;
  clampedQuantity: number | null;
  label: string;
  disabled: boolean;
}

export type BankUiCommands = Pick<Engine, "sell" | "equip" | "buy" | "buyBankSlots">;

export interface BankUi {
  render(snap: Snapshot): void;
  setDestinationOpen(open: boolean): void;
  dispose(): void;
}

export interface BankUiOptions {
  trayHost: HTMLElement;
  destinationHost: HTMLElement;
  content: ResolvedContent;
  commands: BankUiCommands;
  onChanged(): void;
}

function destinationShellMarkup(): string {
  return `<div data-management-page="bank" class="bank-page-body">
        <div class="card-fixed">
          <div id="bank-vendor-toggle" class="style-row">
            <button data-bankpage="bank">Bank</button>
            <button data-bankpage="vendor">Vendor</button>
          </div>
          <div data-bank-page="bank">
            <p class="panel-title">
              <span id="bank-header"></span>
              <span id="bank-gold"></span>
            </p>
            <div class="bank-search-row">
              <input
                id="bank-search"
                type="search"
                placeholder="Search"
                aria-label="Search Bank"
                title="Search Bank"
              />
            </div>
            <div id="bank-filter-row" class="bank-filter-row">
              ${BANK_FILTERS.map(
                (filter) =>
                  `<button data-bank-filter="${filter}" aria-pressed="false">${BANK_FILTER_LABELS[filter]}</button>`,
              ).join("")}
            </div>
            <label class="bank-sort-row">
              Sort
              <select id="bank-sort-select" aria-label="Sort Bank" title="Sort Bank">
                ${BANK_SORT_OPTIONS.map(
                  (opt) => `<option value="${opt.key}">${opt.label}</option>`,
                ).join("")}
              </select>
            </label>
          </div>
        </div>
        <div data-bank-page="bank" class="card-scroll">
          <div id="bank" class="tile-grid"></div>
        </div>
        <div data-bank-page="bank" class="card-fixed">
          <div id="bank-detail" class="detail-strip" hidden></div>
          <button id="buy-slots-btn" data-buy-slots class="buy-slots-btn"></button>
        </div>
        <div data-bank-page="vendor" class="card-scroll" hidden>
          <p class="panel-title">Vendor</p>
          <ul id="vendor-list"></ul>
        </div>
      </div>`;
}

export function createBankUi(options: BankUiOptions): BankUi {
  const { trayHost, destinationHost, content, commands, onChanged } = options;
  const items = createItemPresentation(content);
  const bankPresentation = createBankPresentation(content);

  destinationHost.innerHTML = destinationShellMarkup();

  let bankMode: BankMode = "bank";
  let destinationOpen = false;
  let disposed = false;

  const vendorRows = new Map<string, VendorRowElements>();

  function trayEl<T extends HTMLElement>(selector: string): T {
    return trayHost.querySelector(selector) as T;
  }

  function destEl<T extends HTMLElement>(selector: string): T {
    return destinationHost.querySelector(selector) as T;
  }

  function bankDetailMarkup(stack: { itemId: string; qty: number }): string {
    const def = content.itemsById.get(stack.itemId);
    const price = items.sellPrice(stack.itemId);
    const sellBtn =
      price !== undefined
        ? `<button class="sell-btn" data-sell="${stack.itemId}">Sell ${price}g</button>`
        : "";
    const equipBtn =
      def?.kind === "equipment"
        ? `<button class="equip-btn" data-equip="${stack.itemId}">Equip</button>`
        : "";
    return `<p class="detail-name">${items.name(stack.itemId)} ×${formatQty(stack.qty)}</p>
      ${items
        .detailLines(stack.itemId)
        .map((line) => `<p class="detail-stat">${line}</p>`)
        .join("")}
      <div class="detail-actions">${equipBtn}${sellBtn}</div>`;
  }

  function renderBankDetail(selected: { itemId: string; qty: number } | null): void {
    const detail = destEl<HTMLElement>("#bank-detail");
    if (!selected) {
      detail.hidden = true;
      detail.innerHTML = "";
      return;
    }
    detail.hidden = false;
    detail.innerHTML = bankDetailMarkup(selected);
  }

  function renderEquipmentTray(bank: Snapshot["bank"]): void {
    const presented = bankPresentation.equipment(bank.items);

    trayEl("#character-bank-tray").innerHTML = presented.stacks
      .map(
        (s) =>
          `<button class="tile" data-item="${s.itemId}" aria-pressed="${s.itemId === presented.selected?.itemId}">
             ${items.tileMarkup(s.itemId, s.qty)}
           </button>`,
      )
      .join("");

    const detail = trayEl<HTMLElement>("#character-bank-detail");
    if (!presented.selected) {
      detail.hidden = true;
      detail.innerHTML = "";
      return;
    }
    detail.hidden = false;
    detail.innerHTML = bankDetailMarkup(presented.selected);
  }

  function renderBank(bank: Snapshot["bank"], gold: number): void {
    const state = bankPresentation.state();
    destinationHost
      .querySelectorAll<HTMLButtonElement>("#bank-filter-row button")
      .forEach((btn) => {
        const active = btn.dataset["bankFilter"] === state.filter;
        btn.classList.toggle("active", active);
        btn.setAttribute("aria-pressed", String(active));
      });
    destEl<HTMLSelectElement>("#bank-sort-select").value = state.sort;

    const used = bank.items.length;
    destEl("#bank-header").textContent = `Bank ${used}/${bank.capacity}`;
    destEl("#bank-gold").textContent = `🪙 ${gold}`;
    const buySlotsBtn = destEl<HTMLButtonElement>("#buy-slots-btn");
    buySlotsBtn.textContent = `Buy +10 slots (${bank.nextSlotsPrice}g)`;
    buySlotsBtn.disabled = gold < bank.nextSlotsPrice;

    const presented = bankPresentation.full(bank.items);

    destEl("#bank").innerHTML = presented.stacks
      .map(
        (s) =>
          `<button class="tile" data-item="${s.itemId}" aria-pressed="${s.itemId === presented.selected?.itemId}">
             ${items.tileMarkup(s.itemId, s.qty)}
           </button>`,
      )
      .join("");

    renderBankDetail(presented.selected);
  }

  function bankHasRoom(bank: Snapshot["bank"], itemId: string): boolean {
    if (bank.items.some((s) => s.itemId === itemId)) return true;
    return bank.items.length < bank.capacity;
  }

  function parseVendorQuantity(raw: string): number | null {
    if (!/^[1-9]\d*$/.test(raw)) return null;
    const quantity = Number(raw);
    return Number.isSafeInteger(quantity) ? quantity : null;
  }

  function vendorBuyState(
    price: number,
    rawQty: string,
    gold: number,
    hasRoom: boolean,
  ): VendorBuyState {
    const quantity = parseVendorQuantity(rawQty);
    if (quantity === null)
      return { label: "Buy", disabled: true, quantity: null, clampedQuantity: null };

    const maxAffordable = Math.floor(gold / price);
    const clampedQuantity = quantity > maxAffordable && maxAffordable >= 1 ? maxAffordable : null;
    const effectiveQuantity = clampedQuantity ?? quantity;
    const total = price * effectiveQuantity;
    if (!Number.isSafeInteger(total)) {
      return { label: "Buy", disabled: true, quantity, clampedQuantity: null };
    }
    return {
      label: `Buy (${total}g)`,
      disabled: !hasRoom || total > gold,
      quantity,
      clampedQuantity,
    };
  }

  function updateVendorRow(
    elements: VendorRowElements,
    price: number,
    bank: Snapshot["bank"],
    gold: number,
    itemId: string,
  ): VendorBuyState {
    if (!/^\d*$/.test(elements.quantity.value) || elements.quantity.value === "0") {
      elements.quantity.value = "";
    }
    elements.owned.textContent = `Owned: ${bank.items.find((s) => s.itemId === itemId)?.qty ?? 0}`;
    let state = vendorBuyState(price, elements.quantity.value, gold, bankHasRoom(bank, itemId));
    if (state.clampedQuantity !== null) {
      elements.quantity.value = String(state.clampedQuantity);
      state = vendorBuyState(price, elements.quantity.value, gold, bankHasRoom(bank, itemId));
    }
    elements.buy.textContent = state.label;
    elements.buy.disabled = state.disabled;
    return state;
  }

  function renderVendor(bank: Snapshot["bank"], gold: number): void {
    const listEl = destEl<HTMLUListElement>("#vendor-list");
    const vendorIds = new Set(content.vendor.map((entry) => entry.itemId));
    for (const [itemId, elements] of vendorRows) {
      if (!vendorIds.has(itemId)) {
        elements.row.remove();
        vendorRows.delete(itemId);
      }
    }

    for (const [index, entry] of content.vendor.entries()) {
      let elements = vendorRows.get(entry.itemId);
      if (!elements) {
        const row = document.createElement("li");
        row.dataset["vendorRow"] = entry.itemId;
        const name = document.createElement("p");
        name.className = "recipe-name";
        name.append(items.name(entry.itemId), " ");
        const price = document.createElement("span");
        price.className = "recipe-level";
        price.textContent = `${entry.price}g`;
        name.append(price);
        const owned = document.createElement("p");
        owned.className = "recipe-inputs";
        const quantity = document.createElement("input");
        quantity.className = "vendor-qty";
        quantity.type = "number";
        quantity.min = "1";
        quantity.step = "1";
        quantity.value = "1";
        quantity.dataset["vendorQty"] = entry.itemId;
        const buy = document.createElement("button");
        buy.className = "craft-btn";
        buy.dataset["vendorBuy"] = entry.itemId;
        row.append(name, owned, quantity, buy);
        elements = { row, owned, quantity, buy };
        vendorRows.set(entry.itemId, elements);
      }

      if (listEl.children[index] !== elements.row) listEl.append(elements.row);
      updateVendorRow(elements, entry.price, bank, gold, entry.itemId);
    }
  }

  function syncBankModeVisibility(): void {
    destinationHost.querySelectorAll<HTMLElement>("[data-bank-page]").forEach((page) => {
      page.hidden = page.dataset["bankPage"] !== bankMode;
    });
    destinationHost
      .querySelectorAll<HTMLButtonElement>("#bank-vendor-toggle button[data-bankpage]")
      .forEach((btn) => {
        btn.classList.toggle("active", btn.dataset["bankpage"] === bankMode);
      });
  }

  function dispatchDetailAction(event: Event): void {
    const target = event.target as HTMLElement;
    const sellId = target.dataset["sell"];
    if (sellId) {
      commands.sell(sellId, 1);
      onChanged();
      return;
    }

    const equipId = target.dataset["equip"];
    if (equipId) {
      commands.equip(equipId);
      onChanged();
    }
  }

  const onFilterClick = (event: Event): void => {
    const filter = (event.target as HTMLElement).closest<HTMLElement>("[data-bank-filter]")
      ?.dataset["bankFilter"];
    if (!filter || !(BANK_FILTERS as readonly string[]).includes(filter)) return;
    bankPresentation.setFilter(filter as BankFilter);
    onChanged();
  };

  const onSearchInput = (event: Event): void => {
    bankPresentation.setSearch((event.target as HTMLInputElement).value);
    onChanged();
  };

  const onSortChange = (event: Event): void => {
    const value = (event.target as HTMLSelectElement).value;
    if (!(SORT_KEYS as readonly string[]).includes(value)) return;
    bankPresentation.setSort(value as SortKey);
    onChanged();
  };

  const onBankVendorToggle = (event: Event): void => {
    const page = (event.target as HTMLElement).closest<HTMLElement>("[data-bankpage]")?.dataset[
      "bankpage"
    ];
    if (page !== "bank" && page !== "vendor") return;
    bankMode = page;
    syncBankModeVisibility();
  };

  const onBankGridClick = (event: Event): void => {
    const tile = (event.target as HTMLElement).closest<HTMLElement>(".tile[data-item]");
    if (!tile) return;
    const itemId = tile.dataset["item"];
    if (!itemId) return;
    bankPresentation.toggleSelection(itemId);
    onChanged();
  };

  const onTrayGridClick = (event: Event): void => {
    const tile = (event.target as HTMLElement).closest<HTMLElement>(".tile[data-item]");
    if (!tile) return;
    const itemId = tile.dataset["item"];
    if (!itemId) return;
    bankPresentation.toggleSelection(itemId);
    onChanged();
  };

  const onBuySlotsClick = (): void => {
    commands.buyBankSlots();
    onChanged();
  };

  const onVendorKeydown = (event: Event): void => {
    const input = (event.target as HTMLElement).closest<HTMLInputElement>("[data-vendor-qty]");
    if (!input) return;
    if (["-", "+", "e", "E", "."].includes((event as KeyboardEvent).key)) event.preventDefault();
  };

  let lastSnap: Snapshot | null = null;

  const onVendorInputWithSnap = (event: Event): void => {
    const input = (event.target as HTMLElement).closest<HTMLInputElement>("[data-vendor-qty]");
    if (!input || !lastSnap) return;
    const itemId = input.dataset["vendorQty"];
    if (!itemId) return;
    const entry = content.vendor.find((v) => v.itemId === itemId);
    if (!entry) return;
    const elements = vendorRows.get(itemId);
    if (!elements || elements.quantity !== input) return;
    updateVendorRow(elements, entry.price, lastSnap.bank, lastSnap.player.gold, itemId);
  };

  const onVendorListClickWithSnap = (event: Event): void => {
    const buy = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-vendor-buy]");
    const itemId = buy?.dataset["vendorBuy"];
    if (!itemId || !lastSnap) return;
    const entry = content.vendor.find((vendor) => vendor.itemId === itemId);
    const elements = vendorRows.get(itemId);
    if (!entry || !elements || elements.buy !== buy) return;
    const state = updateVendorRow(
      elements,
      entry.price,
      lastSnap.bank,
      lastSnap.player.gold,
      itemId,
    );
    const quantity = state.clampedQuantity ?? state.quantity;
    if (state.disabled || quantity === null) return;
    commands.buy(itemId, quantity);
    onChanged();
    elements.quantity.focus({ preventScroll: true });
  };

  destEl("#bank-filter-row").addEventListener("click", onFilterClick);
  destEl<HTMLInputElement>("#bank-search").addEventListener("input", onSearchInput);
  destEl<HTMLSelectElement>("#bank-sort-select").addEventListener("change", onSortChange);
  destEl("#bank-vendor-toggle").addEventListener("click", onBankVendorToggle);
  destEl("#bank").addEventListener("click", onBankGridClick);
  destEl("#bank-detail").addEventListener("click", dispatchDetailAction);
  trayEl("#character-bank-tray").addEventListener("click", onTrayGridClick);
  trayEl("#character-bank-detail").addEventListener("click", dispatchDetailAction);
  destEl("#buy-slots-btn").addEventListener("click", onBuySlotsClick);

  const vendorListEl = destEl("#vendor-list");
  vendorListEl.addEventListener("keydown", onVendorKeydown);
  vendorListEl.addEventListener("input", onVendorInputWithSnap);
  vendorListEl.addEventListener("click", onVendorListClickWithSnap);

  return {
    render(snap: Snapshot): void {
      lastSnap = snap;
      renderBank(snap.bank, snap.player.gold);
      renderEquipmentTray(snap.bank);
      renderVendor(snap.bank, snap.player.gold);
      syncBankModeVisibility();
    },

    setDestinationOpen(open: boolean): void {
      if (open === destinationOpen) return;
      destinationOpen = open;
      if (!open) {
        bankPresentation.clearSearch();
        const searchInput = destEl<HTMLInputElement>("#bank-search");
        if (searchInput) searchInput.value = "";
        if (lastSnap) {
          renderBank(lastSnap.bank, lastSnap.player.gold);
        }
      }
    },

    dispose(): void {
      if (disposed) return;
      disposed = true;

      destEl("#bank-filter-row").removeEventListener("click", onFilterClick);
      destEl<HTMLInputElement>("#bank-search").removeEventListener("input", onSearchInput);
      destEl<HTMLSelectElement>("#bank-sort-select").removeEventListener("change", onSortChange);
      destEl("#bank-vendor-toggle").removeEventListener("click", onBankVendorToggle);
      destEl("#bank").removeEventListener("click", onBankGridClick);
      destEl("#bank-detail").removeEventListener("click", dispatchDetailAction);
      trayEl("#character-bank-tray").removeEventListener("click", onTrayGridClick);
      trayEl("#character-bank-detail").removeEventListener("click", dispatchDetailAction);
      destEl("#buy-slots-btn").removeEventListener("click", onBuySlotsClick);
      vendorListEl.removeEventListener("keydown", onVendorKeydown);
      vendorListEl.removeEventListener("input", onVendorInputWithSnap);
      vendorListEl.removeEventListener("click", onVendorListClickWithSnap);

      for (const elements of vendorRows.values()) {
        elements.row.remove();
      }
      vendorRows.clear();
      lastSnap = null;
    },
  };
}
