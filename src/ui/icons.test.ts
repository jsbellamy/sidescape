import { describe, expect, it } from "vitest";
import { content } from "../data";
import { itemIcon, registeredIconKeys } from "./icons";

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
});
