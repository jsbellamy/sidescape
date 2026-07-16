import { describe, expect, it } from "vitest";
import type { GearSlot } from "../core/types";
import { SKILL_NAMES } from "../core/types";
import { content } from "../data";
import {
  itemIcon,
  registeredIconKeys,
  skillIcon,
  slotSilhouette,
  tabIcon,
  type LoadoutSlotKind,
} from "./icons";

describe("icons registry (#78)", () => {
  it("throws for an icon key nothing in the registry declares", () => {
    expect(() => itemIcon("not-a-real-icon-key")).toThrow(/no entry/);
  });

  // #286: slot silhouettes are a separate registry (see the `slotSilhouette` describe block below)
  // that must never weaken this throw into an implicit fallback branch — a slot type is not a
  // registered `ItemDef.icon` key, so it must still throw here exactly like any other unknown key.
  it("still throws for a Gear/Loadout Slot type — slotSilhouette's keys are not itemIcon fallbacks (#286, no-fallback policy #78)", () => {
    for (const slotType of [
      "weapon",
      "shield",
      "head",
      "body",
      "legs",
      "amulet",
      "ring",
      "food",
      "potion",
      "quiver",
      "rune",
    ]) {
      expect(() => itemIcon(slotType)).toThrow(/no entry/);
    }
  });

  // Not a hard #78 requirement, but two items silently sharing a tile image would likely be a
  // data-entry slip worth catching.
  it("gives every item a distinct icon key", () => {
    const keys = content.items.map((i) => i.icon);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("gives every pet a distinct icon key", () => {
    const keys = content.pets.map((p) => p.icon);
    expect(new Set(keys).size).toBe(keys.length);
  });

  // #360: Bolt/Blast rune icons + iron-arrow registered ahead of their Items (#364/#365).
  it("resolves Wave A (#360) icon keys to distinct non-empty URLs", () => {
    const keys = [
      "air-bolt-rune",
      "water-bolt-rune",
      "earth-bolt-rune",
      "fire-bolt-rune",
      "air-blast-rune",
      "water-blast-rune",
      "earth-blast-rune",
      "fire-blast-rune",
      "iron-arrow",
    ] as const;
    const urls = keys.map((key) => itemIcon(key));
    for (const url of urls) {
      expect(url).toEqual(expect.any(String));
      expect(url.length).toBeGreaterThan(0);
    }
    expect(new Set(urls).size).toBe(urls.length);
    const allUrls = registeredIconKeys().map((key) => itemIcon(key));
    expect(new Set(allUrls).size).toBe(allUrls.length);
  });
});

// UI & Assets wave 1/8 (#131): the eleven Skill icons + six workspace/navigation icons, resolved
// through their own registry functions (not `itemIcon` — a Skill/tab id is not an `ItemDef.icon`
// key). Same discipline as `itemIcon`: a complete Record, loud throw on an unknown key, no
// placeholder/fallback branch.
describe("skillIcon registry (#131)", () => {
  it("resolves every SKILL_NAMES entry to a real, non-empty asset URL", () => {
    for (const skill of SKILL_NAMES) {
      expect(() => skillIcon(skill)).not.toThrow();
      expect(skillIcon(skill)).toEqual(expect.any(String));
      expect(skillIcon(skill).length).toBeGreaterThan(0);
    }
  });

  it("gives every Skill a distinct icon URL", () => {
    const urls = SKILL_NAMES.map((skill) => skillIcon(skill));
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("throws for an unknown Skill key", () => {
    // @ts-expect-error — deliberately passing a key outside SkillName to exercise the runtime guard.
    expect(() => skillIcon("not-a-real-skill")).toThrow(/no entry/);
  });
});

describe("tabIcon registry (#131, widened by #206's two-card redesign)", () => {
  const existingTabIds = [
    "character",
    "bank",
    "vendor",
    "smithing",
    "cooking",
    "crafting",
    "herblore",
    "loot",
    "workshop",
    "activity",
  ];

  it("resolves 'world' plus every other existing tab/destination id to a real, non-empty asset URL", () => {
    for (const tabId of ["world", ...existingTabIds]) {
      expect(() => tabIcon(tabId)).not.toThrow();
      expect(tabIcon(tabId)).toEqual(expect.any(String));
      expect(tabIcon(tabId).length).toBeGreaterThan(0);
    }
  });

  it("throws for an unknown tab id", () => {
    expect(() => tabIcon("not-a-real-tab")).toThrow(/no entry/);
  });

  it("reuses the matching Skill icon for the four production views", () => {
    expect(tabIcon("smithing")).toBe(skillIcon("smithing"));
    expect(tabIcon("cooking")).toBe(skillIcon("cooking"));
    expect(tabIcon("crafting")).toBe(skillIcon("crafting"));
    expect(tabIcon("herblore")).toBe(skillIcon("herblore"));
  });

  it("resolves 'world' to a URL distinct from every reused Skill icon", () => {
    expect(tabIcon("world")).not.toBe(skillIcon("smithing"));
    expect(tabIcon("world")).not.toBe(skillIcon("cooking"));
    expect(tabIcon("world")).not.toBe(skillIcon("crafting"));
    expect(tabIcon("world")).not.toBe(skillIcon("herblore"));
  });
});

// Slot silhouettes (#286): greyed, type-hinting placeholders for empty Gear/Loadout Slots — a
// SEPARATE registry from `itemIcon`, keyed by slot TYPE rather than an `ItemDef.icon` key. Same
// discipline as skillIcon/tabIcon above: a complete Record, loud throw on an unknown key, no
// placeholder/fallback branch (see the itemIcon-still-throws test above for the #78 tie-in).
describe("slotSilhouette registry (#286)", () => {
  const gearSlots: GearSlot[] = ["weapon", "shield", "head", "body", "legs", "amulet", "ring"];
  const loadoutSlotKinds: LoadoutSlotKind[] = ["food", "potion", "quiver", "rune"];

  it("resolves every GearSlot to a real, non-empty asset URL", () => {
    for (const slot of gearSlots) {
      expect(() => slotSilhouette(slot)).not.toThrow();
      expect(slotSilhouette(slot)).toEqual(expect.any(String));
      expect(slotSilhouette(slot).length).toBeGreaterThan(0);
    }
  });

  it("resolves every LoadoutSlotKind to a real, non-empty asset URL", () => {
    for (const kind of loadoutSlotKinds) {
      expect(() => slotSilhouette(kind)).not.toThrow();
      expect(slotSilhouette(kind)).toEqual(expect.any(String));
      expect(slotSilhouette(kind).length).toBeGreaterThan(0);
    }
  });

  it("gives every Gear/Loadout Slot type a distinct silhouette URL", () => {
    const urls = [...gearSlots, ...loadoutSlotKinds].map((slot) => slotSilhouette(slot));
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("throws for an unknown slot type", () => {
    // @ts-expect-error — deliberately passing a key outside GearSlot | LoadoutSlotKind.
    expect(() => slotSilhouette("not-a-real-slot")).toThrow(/no entry/);
  });

  it("never resolves to a URL already used by a real item's itemIcon — a silhouette is a distinct asset, not a recycled item icon", () => {
    const itemIconUrls = new Set(registeredIconKeys().map((key) => itemIcon(key)));
    for (const slot of [...gearSlots, ...loadoutSlotKinds]) {
      expect(itemIconUrls.has(slotSilhouette(slot))).toBe(false);
    }
  });
});
