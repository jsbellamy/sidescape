import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { COMPACT_H, COMPACT_W } from "./window-geometry";

const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

describe("fixed compact live stage stylesheet", () => {
  it("pins the logical compact dimensions and scales the full app", () => {
    expect(COMPACT_W).toBe(320);
    expect(COMPACT_H).toBe(220);
    expect(css).toMatch(/height:\s*var\(--compact-h, 220px\)/);
    expect(css).toMatch(/zoom:\s*var\(--ui-scale\)/);
  });
  it("provides keyboard focus outlines and keeps cards non-scrolling", () => {
    expect(css).toMatch(/:focus-visible/);
    expect(css.match(/\.management-card\s*{[^}]*overflow:\s*hidden/s)).not.toBeNull();
  });
});
