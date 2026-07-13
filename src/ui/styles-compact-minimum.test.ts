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

// #168: happy-dom cannot compute layout, so this string-level pattern (mirroring #137's) is the
// vitest half of the fix — the geometric half (icons actually measuring 34×34 in a real layout
// engine) lives in e2e/icon-sizing.spec.ts instead, per AGENTS.md's UI evidence map rule of
// picking the seam a criterion actually names.
describe("fixed 34px icon chassis (#168)", () => {
  it("sizes `.tile .icon` to an exact, non-fluid 34px — no max-width/max-height scaling left on it", () => {
    const rule = css.match(/\.tile \.icon\s*{([^}]*)}/s);
    expect(rule).not.toBeNull();
    expect(rule![1]).toMatch(/width:\s*34px/);
    expect(rule![1]).toMatch(/height:\s*34px/);
    expect(rule![1]).not.toMatch(/max-width|max-height/);
  });

  it("gives `.tile-grid` a fixed, non-fluid tile track (no minmax(...,1fr) fluid columns)", () => {
    const rule = css.match(/\.tile-grid\s*{([^}]*)}/s);
    expect(rule).not.toBeNull();
    expect(rule![1]).toMatch(/grid-template-columns:\s*repeat\(auto-fill,\s*40px\)/);
    expect(rule![1]).not.toMatch(/minmax|1fr/);
  });

  it("fits at least 5 tiles + gaps per row at the 280px compact-minimum arithmetic the issue calls out", () => {
    const trackMatch = css.match(
      /\.tile-grid\s*{[^}]*grid-template-columns:\s*repeat\(auto-fill,\s*(\d+)px\)[^}]*gap:\s*(\d+)px/s,
    );
    expect(trackMatch).not.toBeNull();
    const tile = Number(trackMatch![1]);
    const gap = Number(trackMatch![2]);
    const fiveTilesWidth = tile * 5 + gap * 4;
    expect(fiveTilesWidth).toBeLessThanOrEqual(280);
  });

  it("audits every other .icon/img consumer named by #168 for a below-34px or fractional size", () => {
    // .loot-chip (was 28px, clipping the fixed 34px icon) must now be exactly 34px.
    const lootChip = css.match(/\.loot-chip\s*{([^}]*)}/s);
    expect(lootChip).not.toBeNull();
    expect(lootChip![1]).toMatch(/width:\s*34px/);
    expect(lootChip![1]).toMatch(/height:\s*34px/);

    // .skill-icon (#xp-row skill chips, was 17px = 0.5x) must now be exactly 34px.
    const skillIcon = css.match(/\.skill-icon\s*{([^}]*)}/s);
    expect(skillIcon).not.toBeNull();
    expect(skillIcon![1]).toMatch(/width:\s*34px/);
    expect(skillIcon![1]).toMatch(/height:\s*34px/);

    // .food-slot-eat and .potion-slot-tile.filled .tile carry .tile (no icon-specific override of
    // their own) so they inherit the fixed `.tile .icon` rule above rather than resizing it.
    expect(css.match(/\.food-slot-eat\s*{([^}]*)}/s)![1]).not.toMatch(
      /\.icon|max-width|max-height/,
    );
    expect(css.match(/\.potion-slot-tile\.filled \.tile\s*{([^}]*)}/s)![1]).not.toMatch(
      /\.icon|max-width|max-height/,
    );
  });
});
