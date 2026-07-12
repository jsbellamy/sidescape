import { describe, expect, it } from "vitest";
import { SKILL_NAMES } from "../core/types";
import { content } from "../data";
import { itemIcon, registeredIconKeys, skillIcon, tabIcon } from "./icons";

describe("icons registry (#78)", () => {
  it("resolves every icon key declared by the v1 Content's items to a real asset URL", () => {
    for (const item of content.items) {
      expect(() => itemIcon(item.icon)).not.toThrow();
      expect(itemIcon(item.icon)).toEqual(expect.any(String));
      expect(itemIcon(item.icon).length).toBeGreaterThan(0);
    }
  });

  it("throws for an icon key nothing in the registry declares", () => {
    expect(() => itemIcon("not-a-real-icon-key")).toThrow(/no entry/);
  });

  // Not a hard #78 requirement, but two items silently sharing a tile image would likely be a
  // data-entry slip worth catching.
  it("gives every item a distinct icon key", () => {
    const keys = content.items.map((i) => i.icon);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("registeredIconKeys covers at least every key Content uses", () => {
    const registered = new Set(registeredIconKeys());
    for (const item of content.items) {
      expect(registered.has(item.icon)).toBe(true);
    }
  });

  // Pets (#120): PetDef.icon is required + validated through this SAME registry (see PetDef's own
  // doc, core/types.ts) even though a pet isn't an ItemDef — mirrors the item checks above.
  it("resolves every icon key declared by the v1 Content's pets to a real asset URL", () => {
    for (const pet of content.pets) {
      expect(() => itemIcon(pet.icon)).not.toThrow();
      expect(itemIcon(pet.icon)).toEqual(expect.any(String));
      expect(itemIcon(pet.icon).length).toBeGreaterThan(0);
    }
  });

  it("gives every pet a distinct icon key", () => {
    const keys = content.pets.map((p) => p.icon);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("registeredIconKeys covers at least every key Content's pets use", () => {
    const registered = new Set(registeredIconKeys());
    for (const pet of content.pets) {
      expect(registered.has(pet.icon)).toBe(true);
    }
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
