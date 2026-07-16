// @vitest-environment node
import { describe, expect, it } from "vitest";
import { fixtureContent } from "../core/testing/fixture-content";
import { resolveContent } from "../core/validate-content";
import { itemIcon } from "./icons";
import { createItemPresentation } from "./item-presentation";

const content = resolveContent(fixtureContent);
const items = createItemPresentation(content);

describe("createItemPresentation — name", () => {
  it("returns the Content name for a known Item", () => {
    expect(items.name("meat")).toBe("Cooked Meat");
  });

  it("falls back to the id for an unknown Item", () => {
    expect(items.name("missing-item")).toBe("missing-item");
  });
});

describe("createItemPresentation — sellPrice", () => {
  it("returns undefined for currency", () => {
    expect(items.sellPrice("gold")).toBeUndefined();
  });

  it("returns undefined for an unknown Item", () => {
    expect(items.sellPrice("missing-item")).toBeUndefined();
  });

  it("returns the Item value for sellable non-currency Items", () => {
    expect(items.sellPrice("meat")).toBe(3);
    expect(items.sellPrice("bar")).toBe(5);
  });
});

describe("createItemPresentation — detailLines", () => {
  it("formats Equipment with attack bonuses and Defence Vector", () => {
    expect(items.detailLines("bronze-sword")).toEqual([
      "slash +10 atk +30 str st 0 · sl 0 · cr 0 · rn 0 · mg 0 spd 4t",
    ]);
  });

  it("formats def-only Equipment", () => {
    expect(items.detailLines("lucky-charm")).toEqual(["st 1 · sl 1 · cr 1 · rn 1 · mg 1"]);
  });

  it("formats Food heal and sell value", () => {
    expect(items.detailLines("meat")).toEqual(["Heals 4", "Worth 3g"]);
  });

  it("formats Material sell value", () => {
    expect(items.detailLines("bar")).toEqual(["Worth 5g"]);
  });

  it("returns no lines for currency", () => {
    expect(items.detailLines("gold")).toEqual([]);
  });

  it("returns no lines for an unknown Item", () => {
    expect(items.detailLines("missing-item")).toEqual([]);
  });

  it("formats Potion combat and speed targets", () => {
    expect(items.detailLines("strength-potion")).toEqual([
      "+20% Strength for 3 attacks",
      "Worth 10g",
    ]);
    expect(items.detailLines("fishing-potion")).toEqual([
      "+50% Fishing speed for 3 catches",
      "Worth 10g",
    ]);
    expect(items.detailLines("production-potion")).toEqual([
      "+50% Production speed for 3 crafts",
      "Worth 10g",
    ]);
  });

  it("formats Ammo arrow and rune details", () => {
    expect(items.detailLines("arrow")).toEqual(["+5 ranged str", "Worth 1g"]);
    expect(items.detailLines("air-rune")).toEqual(["Element: air", "Worth 1g"]);
  });
});

describe("createItemPresentation — iconMarkup", () => {
  it("renders the standard icon img with alt text", () => {
    expect(items.iconMarkup("meat")).toBe(
      `<img class="icon pixel" src="${itemIcon("cooked-meat")}" alt="Cooked Meat" />`,
    );
  });

  it("uses the id as alt text for an unknown Item with empty src", () => {
    expect(items.iconMarkup("missing-item")).toBe(
      `<img class="icon pixel" src="" alt="missing-item" />`,
    );
  });
});

describe("createItemPresentation — tileMarkup", () => {
  it("combines icon markup with a formatted quantity badge", () => {
    expect(items.tileMarkup("meat", 3)).toBe(
      `${items.iconMarkup("meat")}<span class="tile-qty">×3</span>`,
    );
  });

  it("formats large quantities through formatQty", () => {
    expect(items.tileMarkup("meat", 12_345)).toBe(
      `${items.iconMarkup("meat")}<span class="tile-qty">×12.3k</span>`,
    );
  });
});

describe("createItemPresentation — bank actions stay out of scope", () => {
  it("does not export Equip/Sell/detail-strip action markup", () => {
    const presentation = createItemPresentation(content) as unknown as Record<string, unknown>;
    expect(presentation).not.toHaveProperty("bankDetailMarkup");
    expect(JSON.stringify(presentation)).not.toMatch(/equip-btn|sell-btn|detail-actions/);
  });
});
