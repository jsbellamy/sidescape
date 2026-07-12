import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MIN_COMPACT_H, MIN_COMPACT_W } from "./window-geometry";

/** #137: the compact widget's progressive-extras hide order is pure CSS height media queries —
 * no JS resize listener, no new persisted mode state. These are string-level assertions against
 * the raw stylesheet text (not computed layout, which needs a real layout engine — see the
 * `npm run tauri dev` manual matrix in the PR for actual clipping verification) so they run in
 * plain Node without a DOM. */
const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

/** Matches a `@media (max-height: Npx) { #selector { display: none; } }` rule, tolerant of the
 * exact whitespace/formatting Prettier applies, and captures its threshold. */
function maxHeightHideRule(selector: string): RegExp {
  return new RegExp(
    `@media\\s*\\(max-height:\\s*(\\d+)px\\)\\s*{\\s*${selector}\\s*{\\s*display:\\s*none;?\\s*}\\s*}`,
  );
}

describe("compact minimum responsive stylesheet (#137)", () => {
  it("hides #loot-strip and #ticker via height media queries, in the pinned shorten order (loot strip first, then ticker)", () => {
    const lootMatch = css.match(maxHeightHideRule("#loot-strip"));
    const tickerMatch = css.match(maxHeightHideRule("#ticker"));
    expect(
      lootMatch,
      "expected an `@media (max-height) { #loot-strip { display: none; } }` rule",
    ).not.toBeNull();
    expect(
      tickerMatch,
      "expected an `@media (max-height) { #ticker { display: none; } }` rule",
    ).not.toBeNull();

    const lootThreshold = Number(lootMatch![1]);
    const tickerThreshold = Number(tickerMatch![1]);

    // Pinned hide order (issue #137 §2): shortening hides the Loot Strip before the ticker, so
    // the Loot Strip's threshold must trigger at a taller (larger) height than the ticker's.
    expect(lootThreshold).toBeGreaterThan(tickerThreshold);

    // Growing reverses the order automatically for free — both rules are plain `max-height`
    // media queries with no companion JS, so the browser itself re-applies/un-applies them as
    // height crosses each threshold; asserting the ordering above is the whole contract.

    // Both thresholds must sit at or above the exported compact floor: at MIN_COMPACT_H, both
    // regions are still hidden (the minimum surface is titlebar + full scene + launcher row
    // only), and neither threshold should ever let progressive extras reappear below the floor.
    expect(tickerThreshold).toBeGreaterThanOrEqual(MIN_COMPACT_H);
    expect(lootThreshold).toBeGreaterThan(tickerThreshold);
  });

  it("still respects `#loot-strip[hidden]` (the state-driven empty-loot-zone rule) alongside the responsive rule — #137 must not refactor it away", () => {
    expect(css).toMatch(/#loot-strip\[hidden\]|\[hidden\]\s*{[^}]*display:\s*none/);
  });

  it("never hides the launcher row at any height (the three-card launcher row from #136 never hides)", () => {
    expect(css).not.toMatch(/@media\s*\([^)]*\)\s*{\s*[^}]*#card-launchers[^}]*display:\s*none/);
    expect(css).not.toMatch(/@media\s*\([^)]*\)\s*{\s*[^}]*\.launcher-row[^}]*display:\s*none/);
  });

  it("never force-closes management cards from a height media query (width capacity/LRU eviction is #136's job, not #137's)", () => {
    expect(css).not.toMatch(
      /@media\s*\(max-height[^)]*\)\s*{\s*[^}]*#management-row[^}]*display:\s*none/,
    );
    expect(css).not.toMatch(
      /@media\s*\(max-height[^)]*\)\s*{\s*[^}]*\.management-card[^}]*display:\s*none/,
    );
  });

  it("keeps #main-column non-scrolling (overflow: hidden), so there is never a main-column scrollbar at the operable floor", () => {
    const mainColumnBlock = css.match(/#main-column\s*{([^}]*)}/);
    expect(mainColumnBlock).not.toBeNull();
    expect(mainColumnBlock![1]).toMatch(/overflow:\s*hidden/);
  });

  it("registers no JS resize listener anywhere in the UI shell (pure CSS media queries only, per #137 §2)", () => {
    const shellFiles = ["app.ts", "window-chrome.ts", "boot.ts", "workspace-chrome.ts"];
    for (const file of shellFiles) {
      const src = readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
      expect(src, `${file} must not register a resize listener`).not.toMatch(
        /addEventListener\(\s*["']resize["']/,
      );
      expect(src, `${file} must not subscribe to Tauri's onResized`).not.toMatch(/onResized\s*\(/);
    }
    const mainSrc = readFileSync(new URL("../main.ts", import.meta.url), "utf8");
    expect(mainSrc).not.toMatch(/addEventListener\(\s*["']resize["']/);
    expect(mainSrc).not.toMatch(/onResized\s*\(/);
  });
});

describe("compact minima agree with the Tauri window floor (#137)", () => {
  it("exports a width floor that fits all three labeled launchers (never narrower than #136's row)", () => {
    // #136 §2's doc comment on `.launcher-row` pins the contract: icon + label must fit at
    // MIN_COMPACT_W. 320px is the value that comment already assumes.
    expect(MIN_COMPACT_W).toBeGreaterThanOrEqual(320);
  });
});
