// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { createEngine } from "../core/engine";
import { fixtureContent } from "../core/fixture-content";
import { makeSnapshot } from "../core/make-snapshot";
import { seededRng } from "../core/rng";
import { resolveContent } from "../core/validate-content";
import { mountApp } from "./app";
import type { WorkspaceChrome } from "./workspace-chrome";

const resolvedFixtureContent = resolveContent(fixtureContent);

const noopWindowChrome: WorkspaceChrome = {
  getCapacity: () => Promise.resolve(2),
  setCardCount: () => Promise.resolve(),
};

function mountWith(overrides: Parameters<typeof makeSnapshot>[0] = {}) {
  const engine = createEngine(fixtureContent, seededRng(1), makeSnapshot(overrides));
  const root = document.createElement("main");
  const app = mountApp(engine, root, resolvedFixtureContent, noopWindowChrome);
  return { engine, root, app };
}

/** Dispatches a bubbling mouseover on `el`, mirroring app.test.ts's own helper — #78's hover
 * panel is wired with delegation on the mount root, so a real bubbling DOM event is what the app
 * actually reacts to. */
function hover(el: Element): void {
  el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
}

describe("Bank icon grid (#78)", () => {
  it("renders #bank as a tile-grid of icon+qty buttons, not a text list", () => {
    const { root } = mountWith({ bank: { items: [{ itemId: "meat", qty: 3 }] } });
    const bank = root.querySelector<HTMLElement>("#bank");
    expect(bank?.classList.contains("tile-grid")).toBe(true);

    const tile = bank?.querySelector<HTMLButtonElement>('.tile[data-item="meat"]');
    expect(tile?.tagName).toBe("BUTTON");
    const img = tile?.querySelector("img");
    expect(img?.classList.contains("pixel")).toBe(true);
    expect(img?.alt).toBe("Cooked Meat");
    expect(tile?.querySelector(".tile-qty")?.textContent).toBe("×3");
  });

  it("the detail strip is hidden until a tile is selected, then shows name + Sell", () => {
    const { root } = mountWith({ bank: { items: [{ itemId: "meat", qty: 3 }] } });
    expect(root.querySelector<HTMLElement>("#bank-detail")?.hidden).toBe(true);

    root.querySelector<HTMLButtonElement>('#bank .tile[data-item="meat"]')?.click();

    const detail = root.querySelector<HTMLElement>("#bank-detail");
    expect(detail?.hidden).toBe(false);
    expect(detail?.querySelector(".detail-name")?.textContent).toBe("Cooked Meat ×3");
    expect(detail?.querySelector('[data-sell="meat"]')?.textContent).toBe("Sell 3g");
  });

  it("re-clicking the selected tile deselects it, hiding the detail strip again", () => {
    const { root } = mountWith({ bank: { items: [{ itemId: "meat", qty: 3 }] } });
    root.querySelector<HTMLButtonElement>('[data-tab="bank"]')?.click();
    const tileSelector = '#bank .tile[data-item="meat"]';

    root.querySelector<HTMLButtonElement>(tileSelector)?.click();
    expect(root.querySelector<HTMLElement>("#bank-detail")?.hidden).toBe(false);

    // render() rebuilds #bank's innerHTML on every click, so the tile must be re-queried rather
    // than reusing the element reference from before the first click (which is now detached).
    root.querySelector<HTMLButtonElement>(tileSelector)?.click();
    expect(root.querySelector<HTMLElement>("#bank-detail")?.hidden).toBe(true);
  });

  it("selecting a different tile switches the strip's contents without needing to deselect first", () => {
    const { root } = mountWith({
      bank: {
        items: [
          { itemId: "meat", qty: 1 },
          { itemId: "bar", qty: 4 },
        ],
      },
    });
    root.querySelector<HTMLButtonElement>('#bank .tile[data-item="meat"]')?.click();
    expect(root.querySelector("#bank-detail .detail-name")?.textContent).toBe("Cooked Meat ×1");

    root.querySelector<HTMLButtonElement>('#bank .tile[data-item="bar"]')?.click();
    expect(root.querySelector("#bank-detail .detail-name")?.textContent).toBe("Test Bar ×4");
  });
});

describe("Shared #item-tooltip hover panel (#78)", () => {
  it("is hidden by default and not the native title attribute anywhere on a tile", () => {
    const { root } = mountWith({ bank: { items: [{ itemId: "meat", qty: 1 }] } });
    expect(root.querySelector<HTMLElement>("#item-tooltip")?.hidden).toBe(true);
    const tile = root.querySelector<HTMLElement>('#bank .tile[data-item="meat"]');
    expect(tile?.title).toBe("");
  });

  it("fills and shows on a Bank tile's mouseover, hides on mouseout", () => {
    const { root } = mountWith({ bank: { items: [{ itemId: "meat", qty: 5 }] } });
    const tile = root.querySelector<HTMLElement>('#bank .tile[data-item="meat"]');
    hover(tile as Element);

    const tooltip = root.querySelector<HTMLElement>("#item-tooltip");
    expect(tooltip?.hidden).toBe(false);
    expect(tooltip?.querySelector(".tooltip-name")?.textContent).toBe("Cooked Meat");
    const statLines = [...tooltip!.querySelectorAll(".tooltip-stat")].map((p) => p.textContent);
    expect(statLines).toEqual(["Heals 4", "Worth 3g"]);

    tile?.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
    expect(tooltip?.hidden).toBe(true);
  });

  it("works the same way on a Food Slot tile", () => {
    const { root } = mountWith({ player: { foodSlots: [{ itemId: "meat", qty: 2 }, null, null] } });

    const tile = root.querySelector<HTMLElement>('[data-eat="0"]');
    hover(tile as Element);

    const tooltip = root.querySelector<HTMLElement>("#item-tooltip");
    expect(tooltip?.hidden).toBe(false);
    expect(tooltip?.querySelector(".tooltip-name")?.textContent).toBe("Cooked Meat");
  });

  it("works the same way on a compact Loot Zone strip tile", () => {
    const { root } = mountWith({ lootZone: [{ itemId: "bar", qty: 7 }] });

    const chip = root.querySelector<HTMLElement>("#loot-strip-items .loot-chip");
    hover(chip as Element);

    const tooltip = root.querySelector<HTMLElement>("#item-tooltip");
    expect(tooltip?.hidden).toBe(false);
    expect(tooltip?.querySelector(".tooltip-name")?.textContent).toBe("Test Bar");
    expect(tooltip?.querySelector(".tooltip-stat")?.textContent).toBe("Worth 5g");
  });

  it("clamps its position inside the viewport rather than letting it spill off-screen", () => {
    const { root } = mountWith({ bank: { items: [{ itemId: "meat", qty: 1 }] } });
    const originalW = window.innerWidth;
    const originalH = window.innerHeight;
    Object.defineProperty(window, "innerWidth", { value: 320, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: 640, configurable: true });

    try {
      const tile = root.querySelector<HTMLElement>('#bank .tile[data-item="meat"]');
      // Anchor sits right at the viewport's bottom-right corner — an unclamped tooltip placed
      // "below-right" of it would spill off both edges.
      tile!.getBoundingClientRect = () =>
        ({ left: 310, right: 320, top: 630, bottom: 640, width: 10, height: 10 }) as DOMRect;

      hover(tile as Element);
      const tooltip = root.querySelector<HTMLElement>("#item-tooltip");
      const left = parseFloat(tooltip!.style.left);
      const top = parseFloat(tooltip!.style.top);

      expect(left).toBeGreaterThanOrEqual(0);
      expect(left).toBeLessThanOrEqual(320);
      expect(top).toBeGreaterThanOrEqual(0);
      expect(top).toBeLessThanOrEqual(640);
    } finally {
      Object.defineProperty(window, "innerWidth", { value: originalW, configurable: true });
      Object.defineProperty(window, "innerHeight", { value: originalH, configurable: true });
    }
  });
});

describe("Food Slots and Loot strip render icon+qty tiles (#78)", () => {
  it("an empty Food Slot keeps its [+] assign affordance rather than an icon tile", () => {
    const { root } = mountWith();
    const emptySlot = root.querySelector('[data-slot="1"]');
    expect(emptySlot?.querySelector('[data-add="1"]')).not.toBeNull();
    expect(emptySlot?.querySelector(".tile")).toBeNull();
  });

  it("a filled Food Slot shows an icon + qty badge instead of a text row", () => {
    const { root } = mountWith({ player: { foodSlots: [{ itemId: "meat", qty: 9 }, null, null] } });
    const tile = root.querySelector<HTMLElement>('[data-eat="0"]');
    expect(tile?.classList.contains("tile")).toBe(true);
    expect(tile?.querySelector("img.pixel")).not.toBeNull();
    expect(tile?.querySelector(".tile-qty")?.textContent).toBe("×9");
  });

  it("compact Loot Zone strip chips are icon+qty tiles", () => {
    const { root } = mountWith({ lootZone: [{ itemId: "meat", qty: 12 }] });
    const chip = root.querySelector<HTMLElement>("#loot-strip-items .loot-chip");
    expect(chip?.classList.contains("tile")).toBe(true);
    expect(chip?.querySelector("img.pixel")).not.toBeNull();
    expect(chip?.querySelector(".tile-qty")?.textContent).toBe("×12");
  });
});
