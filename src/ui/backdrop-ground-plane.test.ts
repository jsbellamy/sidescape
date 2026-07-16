// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// #232: regression from #226 — `#scene` became variable-height (`flex: 1 1 auto`), but the
// `.layer-mid`/`.layer-near` backdrop gradients and `#activity-prop` were still positioned as
// percentages of the scene's own box, so they drifted off the pixel art as the scene grew. The
// ground-plane contract requires every ground-relative position to be expressed in px, keyed to
// the backdrop tile's native 120px height, never a percentage of the variable-height scene.
//
// happy-dom cannot compute box geometry (see e2e/loot-strip.spec.ts's own comment on why its
// placement assertions live in Playwright instead), but it DOES parse a `<style>` tag into a real
// CSSOM, which is all a "no percentage stops" contract needs — precedent for reading rules out of
// the sheet this way: e2e/management-card-scroll-shadows.spec.ts:196-218. Vitest has no browser
// to preview in, so this loads the actual shipped `src/styles.css` text into a `<style>` element
// and inspects the parsed rules directly, instead of re-deriving expectations by hand.

const THEMES = ["meadow", "forest", "sewer", "crypt", "town", "glacier"] as const;

function loadStyleSheet(): CSSStyleSheet {
  const css = readFileSync(join(__dirname, "..", "styles.css"), "utf8");
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);
  const sheet = document.styleSheets[document.styleSheets.length - 1];
  if (!sheet) throw new Error("style tag did not register a CSSOM stylesheet");
  return sheet;
}

function findRule(sheet: CSSStyleSheet, selectorText: string): CSSStyleRule {
  const rules = [...sheet.cssRules].filter(
    (r): r is CSSStyleRule => r instanceof CSSStyleRule && r.selectorText === selectorText,
  );
  if (rules.length === 0) {
    throw new Error(`no rule found for selector ${selectorText}`);
  }
  // Last declaration wins in cascade order, and is the one actually applied.
  return rules[rules.length - 1]!;
}

/** Extract the `linear-gradient(...)` component's argument body out of a `background-image`
 * declaration, by depth-counting parens (it nests `var(--foo)`/`rgba(...)` calls, so a naive
 * non-greedy regex would stop at the first inner `)`). */
function gradientBody(backgroundImage: string): string {
  const start = backgroundImage.indexOf("linear-gradient(");
  if (start === -1) throw new Error(`no linear-gradient found in: ${backgroundImage}`);
  let depth = 0;
  let end = -1;
  for (let i = start + "linear-gradient".length; i < backgroundImage.length; i++) {
    const ch = backgroundImage[i];
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) throw new Error(`unbalanced parens in: ${backgroundImage}`);
  return backgroundImage.slice(start + "linear-gradient(".length, end);
}

/** True if the gradient body has a literal `%` outside a nested `var(...)`/`rgba(...)` call —
 * i.e. an actual percentage gradient stop, not e.g. a `%` living inside an unrelated function
 * argument (this codebase has none, but strips nested calls first for safety). */
function hasLiteralPercentStop(body: string): boolean {
  const withoutNestedCalls = body.replace(/\b\w+\([^()]*\)/g, "");
  return withoutNestedCalls.includes("%");
}

describe("#232 ground-plane contract: backdrop gradients and #activity-prop", () => {
  const sheet = loadStyleSheet();

  for (const theme of THEMES) {
    for (const layer of ["layer-mid", "layer-near"] as const) {
      it(`#backdrop[data-theme="${theme}"] .${layer} has no percentage gradient stops, keyed to --tile-h`, () => {
        const rule = findRule(sheet, `#backdrop[data-theme="${theme}"] .${layer}`);
        const backgroundImage =
          rule.style.backgroundImage || rule.style.getPropertyValue("background-image");
        expect(backgroundImage).toContain("linear-gradient(");
        const body = gradientBody(backgroundImage);
        expect(hasLiteralPercentStop(body)).toBe(false);
        // Proves the assertion above isn't vacuously true because the gradient has no stops at
        // all — it must actually reference the ground-plane contract's px-keyed custom property.
        expect(body).toContain("var(--tile-h)");
      });
    }

    it(`#backdrop[data-theme="${theme}"] .layer-sky keeps its unconverted percentage-style wash (deliberate exception)`, () => {
      const rule = findRule(sheet, `#backdrop[data-theme="${theme}"] .layer-sky`);
      const backgroundImage =
        rule.style.backgroundImage || rule.style.getPropertyValue("background-image");
      expect(backgroundImage).toContain("linear-gradient(");
      const body = gradientBody(backgroundImage);
      // The sky wash is a plain two-stop `linear-gradient(to bottom, colorA, colorB)` with no
      // explicit stop positions at all (implicit 0%/100%) — it must NOT have been converted to
      // the px-keyed ground-plane contract (no --tile-h/--mid-horizon/--near-horizon reference,
      // no px units), since a taller scene showing more sky is intended, not a bug.
      expect(body).not.toContain("var(--tile-h)");
      expect(body).not.toContain("px");
      expect(body).toContain("to bottom");
    });
  }

  it("no backdrop gradient uses the bare `transparent` keyword (black-fringe interpolation trap)", () => {
    const css = readFileSync(join(__dirname, "..", "styles.css"), "utf8");
    const backdropSection = css
      .slice(css.indexOf("#backdrop {"), css.indexOf("@keyframes backdrop-drift"))
      // Strip CSS comments first — the word "transparent" legitimately appears in prose comments
      // (e.g. "Each transparent pixel-art tile...") but must never appear as a live gradient stop.
      .replace(/\/\*[\s\S]*?\*\//g, "");
    const gradientCalls = backdropSection.match(/linear-gradient\([^)]*\)/g) ?? [];
    expect(gradientCalls.length).toBeGreaterThan(0);
    for (const call of gradientCalls) {
      expect(call).not.toMatch(/\btransparent\b/);
    }
  });

  it("#activity-prop's `bottom` is px-based, not a percentage", () => {
    const rule = findRule(sheet, "#activity-prop");
    const bottom = rule.style.bottom;
    expect(bottom).toBeTruthy();
    expect(bottom.trim().endsWith("%")).toBe(false);
  });
});
