// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import {
  createLoadoutSlotDispatcher,
  loadoutSlotMarkup,
  type LoadoutSlotTileConfig,
} from "./loadout-slot";

/** A representative Food Slot config (indexed, click-to-eat, plain unassign). */
function foodConfig(overrides: Partial<LoadoutSlotTileConfig> = {}): LoadoutSlotTileConfig {
  return {
    wrapperClass: "food-slot",
    keyAttr: 'data-slot="0"',
    filledInner: '<button class="food-slot-eat tile" data-eat="0" data-item="trout">TILE</button>',
    unassignClass: "food-slot-unassign",
    unassignAttr: 'data-unassign="0"',
    unassignTitle: "Unassign",
    addClass: "food-slot-add",
    addAttr: 'data-add="0"',
    chooserClass: "food-slot-chooser",
    chooserOpen: false,
    chooserItems: [],
    assignAttr: (itemId) => `data-assign="0" data-item="${itemId}"`,
    emptyHint: "No Food in Bank",
    ...overrides,
  };
}

describe("loadoutSlotMarkup — filled tile", () => {
  it("renders the wrapper with the filled class, key attribute, and filled-state inner markup", () => {
    const html = loadoutSlotMarkup(foodConfig(), true);
    const div = document.createElement("div");
    div.innerHTML = html;

    const wrapper = div.querySelector(".food-slot.filled");
    expect(wrapper).not.toBeNull();
    expect(wrapper?.getAttribute("data-slot")).toBe("0");
    expect(wrapper?.querySelector('[data-eat="0"][data-item="trout"]')).not.toBeNull();
  });

  it("renders the unassign button with its class, attribute, and title", () => {
    const html = loadoutSlotMarkup(foodConfig(), true);
    const div = document.createElement("div");
    div.innerHTML = html;

    const unassign = div.querySelector(".food-slot-unassign");
    expect(unassign).not.toBeNull();
    expect(unassign?.getAttribute("data-unassign")).toBe("0");
    expect(unassign?.getAttribute("title")).toBe("Unassign");
  });
});

describe("loadoutSlotMarkup — empty tile", () => {
  it("renders only the add button when the chooser is closed", () => {
    const html = loadoutSlotMarkup(foodConfig({ chooserOpen: false }), false);
    const div = document.createElement("div");
    div.innerHTML = html;

    const wrapper = div.querySelector(".food-slot.empty");
    expect(wrapper).not.toBeNull();
    const add = wrapper?.querySelector(".food-slot-add");
    expect(add?.getAttribute("data-add")).toBe("0");
    expect(div.querySelector(".food-slot-chooser")).toBeNull();
  });

  it("renders one chooser button per item, with its label and assign attributes, when open", () => {
    const html = loadoutSlotMarkup(
      foodConfig({
        chooserOpen: true,
        chooserItems: [
          { itemId: "trout", label: "Trout ×5" },
          { itemId: "shrimp", label: "Shrimp ×2" },
        ],
      }),
      false,
    );
    const div = document.createElement("div");
    div.innerHTML = html;

    const chooser = div.querySelector(".food-slot-chooser");
    expect(chooser).not.toBeNull();
    const buttons = [...(chooser?.querySelectorAll("button") ?? [])];
    expect(buttons).toHaveLength(2);
    expect(buttons[0]?.getAttribute("data-assign")).toBe("0");
    expect(buttons[0]?.getAttribute("data-item")).toBe("trout");
    expect(buttons[0]?.textContent).toBe("Trout ×5");
    expect(buttons[1]?.getAttribute("data-item")).toBe("shrimp");
  });

  it("renders the empty-Bank hint instead of buttons when the chooser is open with no items", () => {
    const html = loadoutSlotMarkup(
      foodConfig({ chooserOpen: true, chooserItems: [], emptyHint: "No Food in Bank" }),
      false,
    );
    const div = document.createElement("div");
    div.innerHTML = html;

    const chooser = div.querySelector(".food-slot-chooser");
    expect(chooser?.querySelector("button")).toBeNull();
    expect(chooser?.querySelector(".hint")?.textContent).toBe("No Food in Bank");
  });

  it("omits the key attribute entirely for singular slots (Potion/Quiver)", () => {
    const html = loadoutSlotMarkup(foodConfig({ keyAttr: "" }), false);
    const div = document.createElement("div");
    div.innerHTML = html;
    const wrapper = div.querySelector(".food-slot.empty");
    expect(wrapper?.getAttribute("data-slot")).toBeNull();
  });
});

describe("createLoadoutSlotDispatcher", () => {
  function fireClick(
    handlerTarget: HTMLElement,
    clickedSelector: string,
    dispatch: (e: Event) => void,
  ) {
    const clicked = handlerTarget.querySelector<HTMLElement>(clickedSelector) ?? handlerTarget;
    const event = new Event("click", { bubbles: true });
    Object.defineProperty(event, "target", { value: clicked });
    dispatch(event);
  }

  it("calls onUnassign and returns before checking assign/add, when data-unassign is present", () => {
    const container = document.createElement("div");
    container.innerHTML = `<button data-unassign="1" data-add="1"></button>`;
    const onUnassign = vi.fn();
    const onAssign = vi.fn();
    const onAdd = vi.fn();
    const dispatch = createLoadoutSlotDispatcher(
      { unassign: "unassign", assign: "assign", add: "add" },
      { onUnassign, onAssign, onAdd },
    );

    fireClick(container, "button", dispatch);

    expect(onUnassign).toHaveBeenCalledWith("1");
    expect(onAssign).not.toHaveBeenCalled();
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("checks the eat key (when configured) before assign, for Food's click-to-eat", () => {
    const container = document.createElement("div");
    container.innerHTML = `<button data-eat="2" data-item="trout"></button>`;
    const onEat = vi.fn();
    const onAssign = vi.fn();
    const dispatch = createLoadoutSlotDispatcher(
      { unassign: "unassign", eat: "eat", assign: "assign", assignItem: "item", add: "add" },
      { onUnassign: vi.fn(), onEat, onAssign, onAdd: vi.fn() },
    );

    fireClick(container, "button", dispatch);

    expect(onEat).toHaveBeenCalledWith("2");
    expect(onAssign).not.toHaveBeenCalled();
  });

  it("calls onAssign with the keyed value and the itemId from a separate data-item attribute (Food shape)", () => {
    const container = document.createElement("div");
    container.innerHTML = `<button data-assign="0" data-item="trout"></button>`;
    const onAssign = vi.fn();
    const dispatch = createLoadoutSlotDispatcher(
      { unassign: "unassign", assign: "assign", assignItem: "item", add: "add" },
      { onUnassign: vi.fn(), onAssign, onAdd: vi.fn() },
    );

    fireClick(container, "button", dispatch);

    expect(onAssign).toHaveBeenCalledWith("0", "trout");
  });

  it("calls onAssign with the itemId as both arguments when there is no separate assignItem key (Potion/Quiver/Rune shape)", () => {
    const container = document.createElement("div");
    container.innerHTML = `<button data-potion-assign="strength-potion"></button>`;
    const onAssign = vi.fn();
    const dispatch = createLoadoutSlotDispatcher(
      { unassign: "potionUnassign", assign: "potionAssign", add: "potionAdd" },
      { onUnassign: vi.fn(), onAssign, onAdd: vi.fn() },
    );

    fireClick(container, "button", dispatch);

    expect(onAssign).toHaveBeenCalledWith("strength-potion", "strength-potion");
  });

  it("calls onAdd (the [+] toggle) only when nothing else matched", () => {
    const container = document.createElement("div");
    container.innerHTML = `<button data-potion-add></button>`;
    const onAdd = vi.fn();
    const dispatch = createLoadoutSlotDispatcher(
      { unassign: "potionUnassign", assign: "potionAssign", add: "potionAdd" },
      { onUnassign: vi.fn(), onAssign: vi.fn(), onAdd },
    );

    fireClick(container, "button", dispatch);

    expect(onAdd).toHaveBeenCalledWith("");
  });

  it("does nothing when the click target carries none of the configured dataset keys", () => {
    const container = document.createElement("div");
    container.innerHTML = `<div class="food-slot-chooser"></div>`;
    const onUnassign = vi.fn();
    const onAssign = vi.fn();
    const onAdd = vi.fn();
    const dispatch = createLoadoutSlotDispatcher(
      { unassign: "unassign", assign: "assign", add: "add" },
      { onUnassign, onAssign, onAdd },
    );

    fireClick(container, ".food-slot-chooser", dispatch);

    expect(onUnassign).not.toHaveBeenCalled();
    expect(onAssign).not.toHaveBeenCalled();
    expect(onAdd).not.toHaveBeenCalled();
  });
});
