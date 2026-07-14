import { describe, expect, it } from "vitest";
import { GEAR_TIERS } from "./tier-ladder";
import { content } from "./index";

/**
 * Gear Tiers 5/6 (#252): adamant and rune shipped as data + art ONLY, unreachable by design (the
 * issue's own "Interim: this gear is unobtainable when this slice merges" section).
 *
 * Shade Crypt (#253) is the first slice that wires adamant in: its Chest is deliberately "the
 * first adamant a player can obtain" (see `bone-crypt.test.ts`'s own reachability test, which
 * proves the positive side — shade-crypt's chest actually contains adamant items). This file keeps
 * the narrower guardrail: adamant/rune stay absent from every Monster dropTable and every OTHER
 * Dungeon's Chest, so nothing quietly wires the tier in a second, earlier place while it's still
 * meant to gate the frozen Area (#254). rune remains fully unreachable — no Chest yields it yet.
 */
describe("Adamant/rune gear reachability (#252/#253)", () => {
  const newTierIds = new Set(
    content.items
      .filter((i) => i.id.startsWith("adamant-") || i.id.startsWith("rune-"))
      .map((i) => i.id),
  );
  const runeIds = new Set(content.items.filter((i) => i.id.startsWith("rune-")).map((i) => i.id));

  it("the new tier actually exists (sanity: this guardrail isn't vacuously true)", () => {
    expect(newTierIds.size).toBeGreaterThanOrEqual(18); // 16 equipment + 2 bars (arrows also match the prefix)
    expect(GEAR_TIERS).toContain("adamant");
    expect(GEAR_TIERS).toContain("rune");
  });

  it("no Monster dropTable contains any adamant/rune item id", () => {
    const offenders: string[] = [];
    for (const monster of content.monsters) {
      for (const entry of monster.dropTable) {
        if (newTierIds.has(entry.itemId)) {
          offenders.push(`${monster.id} drops ${entry.itemId}`);
        }
      }
    }
    expect(offenders, offenders.join("; ")).toEqual([]);
  });

  it("no Dungeon chest other than shade-crypt contains any adamant/rune item id, and shade-crypt contains no rune", () => {
    const offenders: string[] = [];
    for (const dungeon of content.dungeons) {
      for (const entry of dungeon.chest) {
        if (!newTierIds.has(entry.itemId)) continue;
        if (dungeon.id === "shade-crypt" && !runeIds.has(entry.itemId)) continue; // adamant: OK here
        offenders.push(`${dungeon.id} chest contains ${entry.itemId}`);
      }
    }
    expect(offenders, offenders.join("; ")).toEqual([]);
  });

  // adamant-bar/rune-bar are the Smithing input, so even a player who reaches the (currently
  // nonexistent) required Smithing level has no way to acquire the Material to craft with.
  it("adamant-bar and rune-bar specifically are unobtainable: not a Monster drop, not a Fishing catch, not a vendor item", () => {
    for (const barId of ["adamant-bar", "rune-bar"]) {
      expect(content.monsters.some((m) => m.dropTable.some((e) => e.itemId === barId))).toBe(false);
      expect(content.fishingSpots.some((f) => f.itemId === barId)).toBe(false);
      expect(content.vendor.some((v) => v.itemId === barId)).toBe(false);
    }
  });
});
