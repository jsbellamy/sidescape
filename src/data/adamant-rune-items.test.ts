import { describe, expect, it } from "vitest";
import { content } from "./index";

/**
 * Gear Tiers 5/6 (#252): the two new Bar Materials and two new Arrow Ammo the ladder needs beyond
 * what `tier-ladder.ts`'s accessors generate (tier-ladder.ts only builds Equipment/Recipe; Bars
 * and Arrows are content.items/content.vendor entries authored directly in src/data/index.ts, the
 * same way steel-bar/mithril-bar and bronze-/steel-/mithril-arrow were). Values copied verbatim
 * from the issue's own "New items" section, an independent source of truth from index.ts.
 */
describe("adamant/rune Bars and Arrows (#252)", () => {
  it("adamant-bar and rune-bar exist as Materials with the issue's values (180, 360)", () => {
    const adamantBar = content.items.find((i) => i.id === "adamant-bar");
    const runeBar = content.items.find((i) => i.id === "rune-bar");
    expect(adamantBar).toMatchObject({ kind: "material", id: "adamant-bar", value: 180 });
    expect(runeBar).toMatchObject({ kind: "material", id: "rune-bar", value: 360 });
  });

  it("adamant-arrow and rune-arrow exist as Ammo with the issue's rangedStr (14, 18) and value (8, 16)", () => {
    const adamantArrow = content.items.find((i) => i.id === "adamant-arrow");
    const runeArrow = content.items.find((i) => i.id === "rune-arrow");
    expect(adamantArrow).toMatchObject({
      kind: "ammo",
      id: "adamant-arrow",
      ammoType: "arrow",
      rangedStr: 14,
      value: 8,
    });
    expect(runeArrow).toMatchObject({
      kind: "ammo",
      id: "rune-arrow",
      ammoType: "arrow",
      rangedStr: 18,
      value: 16,
    });
  });

  it("both new arrows are sold by the vendor, mirroring the existing arrow entries' pricing shape", () => {
    const vendorIds = content.vendor.map((v) => v.itemId);
    expect(vendorIds).toContain("adamant-arrow");
    expect(vendorIds).toContain("rune-arrow");
    // Every vendor arrow has a positive price, same shape as bronze-/steel-/mithril-arrow above.
    for (const id of ["adamant-arrow", "rune-arrow"]) {
      const entry = content.vendor.find((v) => v.itemId === id)!;
      expect(entry.price).toBeGreaterThan(0);
    }
  });

  it("adamant-bar/rune-bar and adamant-arrow/rune-arrow are appended after every existing item (append-only)", () => {
    const ids = content.items.map((i) => i.id);
    const lastPre252Index = ids.indexOf("mithril-bar");
    for (const id of ["adamant-bar", "rune-bar", "adamant-arrow", "rune-arrow"]) {
      expect(ids.indexOf(id)).toBeGreaterThan(lastPre252Index);
    }
  });
});
