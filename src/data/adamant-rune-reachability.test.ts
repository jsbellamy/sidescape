import { describe, expect, it } from "vitest";
import { GEAR_TIERS } from "./tier-ladder";
import { content } from "./index";

/**
 * Gear Tiers 5/6 (#252): adamant and rune ship here as data + art ONLY. Nothing drops
 * `adamant-bar`/`rune-bar` yet, and no Dungeon Chest contains any adamant/rune Equipment — the
 * whole tier is currently unreachable by design (the issue's own "Interim: this gear is
 * unobtainable when this slice merges" section). #254 is the follow-up that wires the drops onto
 * the 5th Area's Monsters and its Dungeon's Chest once that Area exists; this slice must NOT
 * paper over the gap by sprinkling adamant drops onto EXISTING Monsters (#253/#254 own Monsters/
 * Areas/Dungeons, out of this slice's scope — see AGENTS.md's SCOPE note on the parent issue).
 *
 * This test is the guardrail: it asserts every adamant/rune item id is absent from every
 * dropTable and every chest today, so a future change that accidentally wires one in early (or a
 * regression that silently drops the guardrail once #254 lands) is caught either way — #254 must
 * delete or narrow this test when it makes the tier reachable, not silently leave it green by
 * accident.
 */
describe("Adamant/rune gear is currently unreachable (#252), replaced by #254", () => {
  const newTierIds = new Set(
    content.items
      .filter((i) => i.id.startsWith("adamant-") || i.id.startsWith("rune-"))
      .map((i) => i.id),
  );

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

  it("no Dungeon chest contains any adamant/rune item id", () => {
    const offenders: string[] = [];
    for (const dungeon of content.dungeons) {
      for (const entry of dungeon.chest) {
        if (newTierIds.has(entry.itemId)) {
          offenders.push(`${dungeon.id} chest contains ${entry.itemId}`);
        }
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
