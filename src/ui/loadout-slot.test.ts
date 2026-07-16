// @vitest-environment happy-dom
/** Tests the mounted `createLoadoutSlotUi` interface (#235) — the deep module that now owns all
 * chooser state, Item eligibility, Rune-level gating, tile markup, DOM listeners, and Engine
 * command dispatch for the four Loadout Slot kinds (Food x3, Potion, Quiver, Rune). Mounts a real
 * Engine (fixtureContent) behind the module, same pattern app.test.ts's own Food/Potion/Quiver/
 * Rune suites use, so command-dispatch assertions read real Snapshot state rather than a mock. */
import { describe, expect, it, vi } from "vitest";
import { createEngine } from "../core/engine";
import { fixtureContent } from "../core/fixture-content";
import { makeSnapshot } from "../core/make-snapshot";
import { seededRng } from "../core/rng";
import { resolveContent } from "../core/validate-content";
import { xpForLevel } from "../core/xp";
import { slotSilhouette } from "./icons";
import { createLoadoutSlotUi } from "./loadout-slot";
import type { LoadoutSlotUi } from "./loadout-slot";

const content = resolveContent(fixtureContent);

function tileMarkup(itemId: string, qty: number): string {
  const def = content.itemsById.get(itemId);
  return `<img class="icon pixel" alt="${def?.name ?? itemId}" /><span class="tile-qty">×${qty}</span>`;
}

/** Mounts a real Engine + a real `createLoadoutSlotUi` instance into a bare root carrying only the
 * four stable DOM roots the module owns — no full `mountApp`. `onChanged` re-renders from the
 * latest Snapshot, mirroring how `mountApp`'s own top-level `render()` will be wired as the real
 * `onChanged` callback. */
function mountLoadoutUi(overrides: Parameters<typeof makeSnapshot>[0] = {}) {
  const engine = createEngine(fixtureContent, seededRng(1), makeSnapshot(overrides));
  const root = document.createElement("main");
  root.innerHTML = `
    <div id="character-food-slots"></div>
    <div id="potion-slot"></div>
    <div id="quiver-slot"></div>
    <div id="rune-slot"></div>
  `;
  let ui: LoadoutSlotUi;
  const onChanged = vi.fn(() => {
    const snap = engine.snapshot();
    ui.render(snap.player, snap.bank.items);
  });
  ui = createLoadoutSlotUi({ root, content, commands: engine, tileMarkup, onChanged });
  const snap = engine.snapshot();
  ui.render(snap.player, snap.bank.items);
  return { engine, root, ui, onChanged };
}

describe("createLoadoutSlotUi — mounting all six tiles", () => {
  it("renders three Food Slot tiles, one Potion tile, one Quiver tile, and one Rune Slot tile into their existing roots", () => {
    const { root } = mountLoadoutUi({
      player: {
        foodSlots: [{ itemId: "meat", qty: 3 }, null, null],
        potionSlot: { itemId: "strength-potion", qty: 3, charges: 2 },
        quiver: { itemId: "arrow", qty: 12 },
        runeSlot: { itemId: "air-rune", qty: 5 },
      },
    });

    expect(root.querySelectorAll("#character-food-slots .food-slot")).toHaveLength(3);
    expect(root.querySelector('#potion-slot .tile[data-item="strength-potion"]')).not.toBeNull();
    expect(root.querySelector('#quiver-slot .tile[data-item="arrow"]')).not.toBeNull();
    expect(root.querySelector('#rune-slot .tile[data-item="air-rune"]')).not.toBeNull();
  });
});

// #286: every empty Loadout Slot (3 Food + Potion + Quiver + Rune) shows the matching greyed
// silhouette in its [+] add button — the 3 Food Slots all share the "food" silhouette (one asset,
// not three) — while the [+] add action itself keeps working (asserted by the existing chooser
// open/close and assign suites elsewhere in this file, which click the very same button).
describe("createLoadoutSlotUi — empty-slot silhouettes (#286)", () => {
  it("renders the food silhouette for every empty Food Slot", () => {
    const { root } = mountLoadoutUi({ player: { foodSlots: [null, null, null] } });
    for (let i = 0; i < 3; i++) {
      const addBtn = root.querySelector<HTMLElement>(`[data-add="${i}"]`);
      const img = addBtn?.querySelector<HTMLImageElement>("img.slot-silhouette");
      expect(img?.getAttribute("src")).toBe(slotSilhouette("food"));
      // #286/#306: the literal "+" badge stays on the empty Loadout add button.
      expect(addBtn?.querySelector(".slot-add-mark")?.textContent).toBe("+");
    }
  });

  it("renders the potion silhouette for the empty Potion Slot", () => {
    const { root } = mountLoadoutUi({ player: { potionSlot: null } });
    const img = root
      .querySelector<HTMLElement>("[data-potion-add]")
      ?.querySelector<HTMLImageElement>("img.slot-silhouette");
    expect(img?.getAttribute("src")).toBe(slotSilhouette("potion"));
  });

  it("renders the quiver silhouette for the empty Quiver", () => {
    const { root } = mountLoadoutUi({ player: { quiver: null } });
    const img = root
      .querySelector<HTMLElement>("[data-quiver-add]")
      ?.querySelector<HTMLImageElement>("img.slot-silhouette");
    expect(img?.getAttribute("src")).toBe(slotSilhouette("quiver"));
  });

  it("renders the rune silhouette for the empty Rune Slot", () => {
    const { root } = mountLoadoutUi({ player: { runeSlot: null } });
    const img = root
      .querySelector<HTMLElement>("[data-rune-add]")
      ?.querySelector<HTMLImageElement>("img.slot-silhouette");
    expect(img?.getAttribute("src")).toBe(slotSilhouette("rune"));
  });

  it("a filled slot renders no silhouette — only the real item icon, unchanged from before #286", () => {
    const { root } = mountLoadoutUi({
      player: {
        foodSlots: [{ itemId: "meat", qty: 3 }, null, null],
        potionSlot: { itemId: "strength-potion", qty: 3, charges: 2 },
      },
    });
    expect(root.querySelector('[data-slot="0"] img.slot-silhouette')).toBeNull();
    expect(root.querySelector("#potion-slot img.slot-silhouette")).toBeNull();
  });

  it("clicking the [+] add button (which now contains a silhouette image) still opens its chooser", () => {
    const { root } = mountLoadoutUi({ bank: { items: [{ itemId: "meat", qty: 5 }] } });
    root.querySelector<HTMLButtonElement>('[data-add="0"]')?.click();
    expect(root.querySelector(".food-slot-chooser")).not.toBeNull();
  });
});

describe("createLoadoutSlotUi — Item eligibility per chooser", () => {
  it("the Food chooser lists only Food stacks", () => {
    const { root } = mountLoadoutUi({
      bank: {
        items: [
          { itemId: "meat", qty: 5 },
          { itemId: "bread", qty: 2 },
          { itemId: "bar", qty: 1 }, // Material — must never show
        ],
      },
    });
    root.querySelector<HTMLButtonElement>('[data-add="0"]')?.click();
    const chooser = root.querySelector(".food-slot-chooser");
    expect(chooser?.querySelector('[data-assign="0"][data-item="meat"]')).not.toBeNull();
    expect(chooser?.querySelector('[data-assign="0"][data-item="bread"]')).not.toBeNull();
    expect(chooser?.querySelector('[data-item="bar"]')).toBeNull();
  });

  it("the Potion chooser lists only Potion stacks", () => {
    const { root } = mountLoadoutUi({
      bank: {
        items: [
          { itemId: "strength-potion", qty: 5 },
          { itemId: "meat", qty: 1 },
        ],
      },
    });
    root.querySelector<HTMLButtonElement>("[data-potion-add]")?.click();
    const chooser = root.querySelector(".potion-slot-chooser");
    expect(chooser?.querySelector('[data-potion-assign="strength-potion"]')).not.toBeNull();
    expect(chooser?.querySelector('[data-potion-assign="meat"]')).toBeNull();
  });

  it("the Quiver chooser lists only arrow stacks", () => {
    const { root } = mountLoadoutUi({
      bank: {
        items: [
          { itemId: "arrow", qty: 30 },
          { itemId: "air-rune", qty: 2 },
        ],
      },
    });
    root.querySelector<HTMLButtonElement>("[data-quiver-add]")?.click();
    const chooser = root.querySelector("#quiver-slot .potion-slot-chooser");
    expect(chooser?.querySelector('[data-quiver-assign="arrow"]')).not.toBeNull();
    expect(chooser?.querySelector('[data-quiver-assign="air-rune"]')).toBeNull();
  });

  it("the Rune chooser lists only rune stacks", () => {
    const { root } = mountLoadoutUi({
      bank: {
        items: [
          { itemId: "air-rune", qty: 10 },
          { itemId: "arrow", qty: 2 },
        ],
      },
    });
    root.querySelector<HTMLButtonElement>("[data-rune-add]")?.click();
    const chooser = root.querySelector("#rune-slot .potion-slot-chooser");
    expect(chooser?.querySelector('[data-rune-assign="air-rune"]')).not.toBeNull();
    expect(chooser?.querySelector('[data-rune-assign="arrow"]')).toBeNull();
  });
});

describe("createLoadoutSlotUi — Rune-level gating", () => {
  it("a rune above the player's Magic level renders disabled with a 'Lv N' badge", () => {
    const { root } = mountLoadoutUi({
      bank: { items: [{ itemId: "fire-rune", qty: 5 }] }, // levelReq 13, player Magic level 1
    });
    root.querySelector<HTMLButtonElement>("[data-rune-add]")?.click();
    const fireBtn = root.querySelector<HTMLButtonElement>('[data-rune-assign="fire-rune"]');
    expect(fireBtn?.disabled).toBe(true);
    expect(fireBtn?.querySelector(".rune-req")?.textContent).toBe("Lv 13");
  });

  it("a rune the player is high enough level to cast renders enabled with no badge, and clicking it loads it", () => {
    const { engine, root } = mountLoadoutUi({
      player: { skills: { magic: { level: 13, xp: xpForLevel(13) } } },
      bank: { items: [{ itemId: "fire-rune", qty: 5 }] },
    });
    root.querySelector<HTMLButtonElement>("[data-rune-add]")?.click();
    const fireBtn = root.querySelector<HTMLButtonElement>('[data-rune-assign="fire-rune"]');
    expect(fireBtn?.disabled).toBe(false);
    expect(fireBtn?.querySelector(".rune-req")).toBeNull();

    fireBtn?.click();
    expect(engine.snapshot().player.runeSlot).toEqual({ itemId: "fire-rune", qty: 5 });
  });

  it("a disabled gated chooser row never dispatches a click — clicking it is a no-op", () => {
    const { engine, root, onChanged } = mountLoadoutUi({
      bank: { items: [{ itemId: "fire-rune", qty: 5 }] },
    });
    root.querySelector<HTMLButtonElement>("[data-rune-add]")?.click();
    onChanged.mockClear();
    const fireBtn = root.querySelector<HTMLButtonElement>('[data-rune-assign="fire-rune"]');
    fireBtn?.click();
    expect(engine.snapshot().player.runeSlot).toBeNull();
    expect(onChanged).not.toHaveBeenCalled();
  });
});

describe("createLoadoutSlotUi — Food click-to-eat vs unassign", () => {
  it("clicking a filled Food tile eats one", () => {
    const { engine, root } = mountLoadoutUi({
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
  });

  it("clicking a filled Food tile's ✕ only unassigns, never also eats", () => {
    const { engine, root } = mountLoadoutUi({
      player: {
        hp: 5,
        maxHp: 10,
        skills: { hitpoints: { level: 10, xp: xpForLevel(10) } },
        foodSlots: [{ itemId: "meat", qty: 3 }, null, null],
      },
    });
    root.querySelector<HTMLButtonElement>('[data-unassign="0"]')?.click();
    expect(engine.snapshot().player.hp).toBe(5);
    expect(engine.snapshot().player.foodSlots[0]).toBeNull();
    expect(engine.snapshot().bank.items).toEqual([{ itemId: "meat", qty: 3 }]);
  });
});

describe("createLoadoutSlotUi — exact command arguments", () => {
  it("assignFoodSlot receives the exact slot index and itemId", () => {
    const { engine, root } = mountLoadoutUi({ bank: { items: [{ itemId: "meat", qty: 5 }] } });
    root.querySelector<HTMLButtonElement>('[data-add="1"]')?.click();
    root.querySelector<HTMLButtonElement>('[data-assign="1"][data-item="meat"]')?.click();
    expect(engine.snapshot().player.foodSlots[1]).toEqual({ itemId: "meat", qty: 5 });
  });

  it("unassignFoodSlot receives the exact slot index", () => {
    const { engine, root } = mountLoadoutUi({
      player: { foodSlots: [null, { itemId: "meat", qty: 3 }, null] },
    });
    root.querySelector<HTMLButtonElement>('[data-unassign="1"]')?.click();
    expect(engine.snapshot().player.foodSlots[1]).toBeNull();
  });

  it("eatFromSlot receives the exact slot index", () => {
    const { engine, root } = mountLoadoutUi({
      player: {
        skills: { hitpoints: { level: 10, xp: xpForLevel(10) } },
        hp: 5,
        maxHp: 10,
        foodSlots: [null, { itemId: "meat", qty: 3 }, null],
      },
    });
    root.querySelector<HTMLButtonElement>('[data-eat="1"]')?.click();
    expect(engine.snapshot().player.foodSlots[1]).toEqual({ itemId: "meat", qty: 2 });
  });

  it("assignPotionSlot/unassignPotionSlot receive the exact itemId and no args", () => {
    const { engine, root } = mountLoadoutUi({
      bank: { items: [{ itemId: "strength-potion", qty: 5 }] },
    });
    root.querySelector<HTMLButtonElement>("[data-potion-add]")?.click();
    root.querySelector<HTMLButtonElement>('[data-potion-assign="strength-potion"]')?.click();
    expect(engine.snapshot().player.potionSlot).toEqual({
      itemId: "strength-potion",
      qty: 5,
      charges: 3,
    });

    root.querySelector<HTMLButtonElement>("[data-potion-unassign]")?.click();
    expect(engine.snapshot().player.potionSlot).toBeNull();
  });

  it("loadQuiver/unloadQuiver receive the exact itemId and no args", () => {
    const { engine, root } = mountLoadoutUi({ bank: { items: [{ itemId: "arrow", qty: 30 }] } });
    root.querySelector<HTMLButtonElement>("[data-quiver-add]")?.click();
    root.querySelector<HTMLButtonElement>('[data-quiver-assign="arrow"]')?.click();
    expect(engine.snapshot().player.quiver).toEqual({ itemId: "arrow", qty: 30 });

    root.querySelector<HTMLButtonElement>("[data-quiver-unassign]")?.click();
    expect(engine.snapshot().player.quiver).toBeNull();
  });

  it("loadRuneSlot/unloadRuneSlot receive the exact itemId and no args", () => {
    const { engine, root } = mountLoadoutUi({ bank: { items: [{ itemId: "air-rune", qty: 10 }] } });
    root.querySelector<HTMLButtonElement>("[data-rune-add]")?.click();
    root.querySelector<HTMLButtonElement>('[data-rune-assign="air-rune"]')?.click();
    expect(engine.snapshot().player.runeSlot).toEqual({ itemId: "air-rune", qty: 10 });

    root.querySelector<HTMLButtonElement>("[data-rune-unassign]")?.click();
    expect(engine.snapshot().player.runeSlot).toBeNull();
  });
});

describe("createLoadoutSlotUi — at most one chooser open at a time", () => {
  it("assigning closes the active chooser", () => {
    const { root } = mountLoadoutUi({ bank: { items: [{ itemId: "meat", qty: 5 }] } });
    root.querySelector<HTMLButtonElement>('[data-add="0"]')?.click();
    root.querySelector<HTMLButtonElement>('[data-assign="0"][data-item="meat"]')?.click();
    expect(root.querySelector(".food-slot-chooser")).toBeNull();
  });

  it("re-clicking the same [+] closes it", () => {
    const { root } = mountLoadoutUi({ bank: { items: [{ itemId: "meat", qty: 5 }] } });
    root.querySelector<HTMLButtonElement>('[data-add="0"]')?.click();
    expect(root.querySelector(".food-slot-chooser")).not.toBeNull();
    root.querySelector<HTMLButtonElement>('[data-add="0"]')?.click();
    expect(root.querySelector(".food-slot-chooser")).toBeNull();
  });

  it("opening a different Loadout chooser closes the first — no rendered state contains two open chooser panels", () => {
    const { root } = mountLoadoutUi({
      bank: {
        items: [
          { itemId: "meat", qty: 5 },
          { itemId: "strength-potion", qty: 2 },
        ],
      },
    });
    root.querySelector<HTMLButtonElement>('[data-add="0"]')?.click();
    expect(root.querySelector(".food-slot-chooser")).not.toBeNull();

    root.querySelector<HTMLButtonElement>("[data-potion-add]")?.click();
    expect(root.querySelector(".food-slot-chooser")).toBeNull();
    expect(root.querySelector(".potion-slot-chooser")).not.toBeNull();
  });

  it("opening a second Food Slot's chooser closes the first Food Slot's own chooser", () => {
    const { root } = mountLoadoutUi({ bank: { items: [{ itemId: "meat", qty: 5 }] } });
    root.querySelector<HTMLButtonElement>('[data-add="0"]')?.click();
    root.querySelector<HTMLButtonElement>('[data-add="1"]')?.click();

    // Exactly one chooser panel exists across the whole row, and it belongs to slot 1.
    const choosers = [...root.querySelectorAll(".food-slot-chooser")];
    expect(choosers).toHaveLength(1);
    expect(choosers[0]?.closest("[data-slot]")?.getAttribute("data-slot")).toBe("1");
  });
});

describe("createLoadoutSlotUi — onChanged call discipline", () => {
  it("fires exactly once for an assign action", () => {
    const { root, onChanged } = mountLoadoutUi({ bank: { items: [{ itemId: "meat", qty: 5 }] } });
    root.querySelector<HTMLButtonElement>('[data-add="0"]')?.click();
    onChanged.mockClear();
    root.querySelector<HTMLButtonElement>('[data-assign="0"][data-item="meat"]')?.click();
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("fires exactly once for an unassign action", () => {
    const { root, onChanged } = mountLoadoutUi({
      player: { foodSlots: [{ itemId: "meat", qty: 3 }, null, null] },
    });
    root.querySelector<HTMLButtonElement>('[data-unassign="0"]')?.click();
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("fires exactly once for a chooser open/close toggle", () => {
    const { root, onChanged } = mountLoadoutUi();
    root.querySelector<HTMLButtonElement>('[data-add="0"]')?.click();
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("never fires for an irrelevant click", () => {
    const { root, onChanged } = mountLoadoutUi();
    root.querySelector<HTMLElement>("#character-food-slots")?.click();
    expect(onChanged).not.toHaveBeenCalled();
  });
});

describe("createLoadoutSlotUi — per-instance locality", () => {
  it("two mounted instances have independent chooser state", () => {
    const a = mountLoadoutUi({ bank: { items: [{ itemId: "meat", qty: 5 }] } });
    const b = mountLoadoutUi({ bank: { items: [{ itemId: "meat", qty: 5 }] } });

    a.root.querySelector<HTMLButtonElement>('[data-add="0"]')?.click();

    expect(a.root.querySelector(".food-slot-chooser")).not.toBeNull();
    expect(b.root.querySelector(".food-slot-chooser")).toBeNull();
  });
});
