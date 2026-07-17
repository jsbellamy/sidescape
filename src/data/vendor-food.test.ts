import { describe, expect, it } from "vitest";
import type { FoodDef } from "../core/types";
import { content } from "./index";

/**
 * Issue #437: OSRS-style safety-net food — cooked-shrimp is the only Food the Vendor sells,
 * premium-priced (4× sell value) so Fishing stays the real food source.
 */
describe("vendor food (#437)", () => {
  it("stocks cooked-shrimp at 8g as the last vendor entry", () => {
    const last = content.vendor[content.vendor.length - 1];
    expect(last).toEqual({ itemId: "cooked-shrimp", price: 8 });
  });

  it("stocks cooked-shrimp as the only Food on the vendor", () => {
    const vendorFoodIds = content.vendor
      .map((entry) => content.items.find((item) => item.id === entry.itemId))
      .filter((item): item is FoodDef => item?.kind === "food")
      .map((food) => food.id);

    expect(vendorFoodIds).toEqual(["cooked-shrimp"]);
  });

  it("prices cooked-shrimp at least 2× its sell value (vendor-spread economy invariant)", () => {
    const entry = content.vendor.find((v) => v.itemId === "cooked-shrimp");
    const shrimp = content.items.find((i) => i.id === "cooked-shrimp");
    expect(entry?.price).toBe(8);
    expect(shrimp?.kind).toBe("food");
    if (shrimp?.kind !== "food" || shrimp.value === undefined) return;
    expect(entry!.price).toBeGreaterThanOrEqual(2 * shrimp.value);
  });
});
