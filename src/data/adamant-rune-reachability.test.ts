import { describe, expect, it } from "vitest";
import { GEAR_TIERS } from "./tier-ladder";
import { content } from "./index";

/**
 * Gear Tiers 5/6 (#252/#253/#254): the full arc this guardrail has tracked across three slices.
 * #252 shipped adamant/rune as data + art ONLY (nothing dropped either). #253 wired in the first
 * adamant source (shade-crypt's own chest). #254 — this slice — is the one the whole arc was
 * building to: Frostspire's three open-world Monsters (frost-wolf/ice-wraith/frost-giant) now
 * drop adamant gear and adamant-bar directly, and the Frost Warden Dungeon's Chest is the ONLY
 * source of rune-bar anywhere in Content (frostspire.test.ts's own "interim retired" test proves
 * every adamant/rune item is reachable end to end; this file keeps the narrower, harder-to-fool
 * guardrail: rune-bar specifically stays impossible to acquire from anywhere except Frost Warden).
 * Narrowed rather than deleted, per #253's own precedent for narrowing this file.
 */
describe("Adamant/rune gear reachability (#252/#253/#254)", () => {
  const newTierIds = new Set(
    content.items
      .filter((i) => i.id.startsWith("adamant-") || i.id.startsWith("rune-"))
      .map((i) => i.id),
  );
  const runeIds = new Set(content.items.filter((i) => i.id.startsWith("rune-")).map((i) => i.id));

  const ADAMANT_OPEN_WORLD_MONSTER_IDS = new Set(["frost-wolf", "ice-wraith", "frost-giant"]);
  const ADAMANT_CHEST_DUNGEON_IDS = new Set(["shade-crypt", "frost-warden"]);

  it("the new tier actually exists (sanity: this guardrail isn't vacuously true)", () => {
    expect(newTierIds.size).toBeGreaterThanOrEqual(18); // 16 equipment + 2 bars (arrows also match the prefix)
    expect(GEAR_TIERS).toContain("adamant");
    expect(GEAR_TIERS).toContain("rune");
  });

  it("no Monster dropTable contains a rune item, and any Monster dropping an adamant item is one of Frostspire's own open-world three", () => {
    const offenders: string[] = [];
    for (const monster of content.monsters) {
      for (const entry of monster.dropTable) {
        if (runeIds.has(entry.itemId)) {
          offenders.push(`${monster.id} drops rune item ${entry.itemId}`);
        } else if (
          newTierIds.has(entry.itemId) &&
          !ADAMANT_OPEN_WORLD_MONSTER_IDS.has(monster.id)
        ) {
          offenders.push(`${monster.id} drops adamant item ${entry.itemId}`);
        }
      }
    }
    expect(offenders, offenders.join("; ")).toEqual([]);
  });

  it("no Dungeon chest other than shade-crypt/frost-warden contains any adamant/rune item id, and only frost-warden's chest contains rune", () => {
    const offenders: string[] = [];
    for (const dungeon of content.dungeons) {
      for (const entry of dungeon.chest) {
        if (!newTierIds.has(entry.itemId)) continue;
        if (!ADAMANT_CHEST_DUNGEON_IDS.has(dungeon.id)) {
          offenders.push(`${dungeon.id} chest contains ${entry.itemId}`);
          continue;
        }
        if (runeIds.has(entry.itemId) && dungeon.id !== "frost-warden") {
          offenders.push(`${dungeon.id} chest contains rune item ${entry.itemId}`);
        }
      }
    }
    expect(offenders, offenders.join("; ")).toEqual([]);
  });

  it("adamant-bar is now obtainable (Frostspire's own open-world three), but rune-bar remains obtainable only via the frost-warden Dungeon Chest", () => {
    expect(content.monsters.some((m) => m.dropTable.some((e) => e.itemId === "adamant-bar"))).toBe(
      true,
    );
    expect(content.fishingSpots.some((f) => f.itemId === "adamant-bar")).toBe(false);
    expect(content.vendor.some((v) => v.itemId === "adamant-bar")).toBe(false);

    expect(content.monsters.some((m) => m.dropTable.some((e) => e.itemId === "rune-bar"))).toBe(
      false,
    );
    expect(content.fishingSpots.some((f) => f.itemId === "rune-bar")).toBe(false);
    expect(content.vendor.some((v) => v.itemId === "rune-bar")).toBe(false);
    for (const dungeon of content.dungeons) {
      const hasRuneBar = dungeon.chest.some((e) => e.itemId === "rune-bar");
      expect(hasRuneBar && dungeon.id !== "frost-warden", dungeon.id).toBe(false);
    }
    expect(
      content.dungeons
        .find((d) => d.id === "frost-warden")
        ?.chest.some((e) => e.itemId === "rune-bar"),
    ).toBe(true);
  });
});
