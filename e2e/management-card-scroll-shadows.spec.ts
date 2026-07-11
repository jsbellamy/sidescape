import { expect, test, type Page } from "@playwright/test";
import { PNG } from "pngjs";

/**
 * #133: the scroll-shadow technique is pure CSS (`background-attachment: local` vs `scroll`
 * layers on `.management-card` itself). jsdom/happy-dom don't render backgrounds, so this is
 * verified the same way a manual Tauri check would: render the real card, force overflow,
 * screenshot it at each scroll position, and read back rendered pixel darkness at the top/bottom
 * edge as the end-to-end equivalent of "look at the card and see a shadow."
 */

async function edgePixelIsDark(page: Page, edge: "top" | "bottom"): Promise<boolean> {
  const card = page.locator("#right-panel");
  const box = await card.boundingBox();
  if (!box) throw new Error("#right-panel has no box");

  // Sample a 1px-tall strip a few px in from the sampled edge, centered horizontally. The
  // `farthest-side` radial gradient is a wide, flat ellipse (card-width by shadow-height), so it
  // is darkest at the horizontal center and fades out well before the left/right edges — sampling
  // near an edge (e.g. just past the 6px scrollbar track) would read as fully transparent even
  // when the shadow is genuinely showing. Centering also naturally avoids the scrollbar track on
  // the right.
  const sampleY = edge === "top" ? box.y + 4 : box.y + box.height - 5;
  const clip = {
    x: Math.round(box.x + box.width / 2 - 10),
    y: Math.round(sampleY),
    width: 20,
    height: 1,
  };
  const buffer = await page.screenshot({ clip });
  const png = PNG.sync.read(buffer);

  // Reference: the card's flat `--bg` (#1a1410) fill. The shadow overlay is
  // `rgb(0 0 0 / 40%)` blended on top, which reads visibly darker than the flat fill.
  const bgLuma = 0x1a * 0.299 + 0x14 * 0.587 + 0x10 * 0.114;
  let minLuma = 255;
  for (let x = 0; x < png.width; x++) {
    const i = x * 4;
    const luma = png.data[i]! * 0.299 + png.data[i + 1]! * 0.587 + png.data[i + 2]! * 0.114;
    minLuma = Math.min(minLuma, luma);
  }
  return minLuma < bgLuma - 8;
}

async function openManagementCardWithOverflow(page: Page): Promise<void> {
  await page.goto("/");
  await page.locator('#tab-row [data-tab="bank"]').click();
  await expect(page.locator("#right-panel")).toBeVisible();

  // Force deterministic overflow inside the real `.management-card` scroll surface regardless of
  // current save/bank contents, so the test doesn't depend on gameplay state.
  await page.evaluate(() => {
    const card = document.querySelector("#right-panel") as HTMLElement;
    const filler = document.createElement("div");
    filler.id = "e2e-overflow-filler";
    filler.style.height = "2000px";
    card.appendChild(filler);
  });
}

test("overflowing management card shows only the bottom shadow when scrolled to top", async ({
  page,
}) => {
  await openManagementCardWithOverflow(page);
  await page.locator("#right-panel").evaluate((el) => (el.scrollTop = 0));

  expect(await edgePixelIsDark(page, "top")).toBe(false);
  expect(await edgePixelIsDark(page, "bottom")).toBe(true);
});

test("overflowing management card shows both shadows mid-scroll", async ({ page }) => {
  await openManagementCardWithOverflow(page);
  await page.locator("#right-panel").evaluate((el) => {
    el.scrollTop = (el.scrollHeight - el.clientHeight) / 2;
  });

  expect(await edgePixelIsDark(page, "top")).toBe(true);
  expect(await edgePixelIsDark(page, "bottom")).toBe(true);
});

test("overflowing management card shows only the top shadow when scrolled to bottom", async ({
  page,
}) => {
  await openManagementCardWithOverflow(page);
  await page.locator("#right-panel").evaluate((el) => (el.scrollTop = el.scrollHeight));

  expect(await edgePixelIsDark(page, "top")).toBe(true);
  expect(await edgePixelIsDark(page, "bottom")).toBe(false);
});

test("non-overflowing management card shows neither shadow", async ({ page }) => {
  await page.goto("/");
  await page.locator('#tab-row [data-tab="bank"]').click();
  const card = page.locator("#right-panel");
  await expect(card).toBeVisible();

  const overflowing = await card.evaluate((el) => el.scrollHeight > el.clientHeight);
  expect(overflowing).toBe(false);

  expect(await edgePixelIsDark(page, "top")).toBe(false);
  expect(await edgePixelIsDark(page, "bottom")).toBe(false);
});

test("management card keeps #138's opaque fill, border, radius, and shadow, and gets a themed thin scrollbar", async ({
  page,
}) => {
  await openManagementCardWithOverflow(page);

  const card = page.locator("#right-panel");
  const style = await card.evaluate((el) => {
    const computed = getComputedStyle(el);
    return {
      backgroundColor: computed.backgroundColor,
      borderRadius: computed.borderRadius,
      borderWidth: computed.borderWidth,
      boxShadow: computed.boxShadow,
    };
  });
  // #138's opaque fill/border/radius/shadow must survive the merged multi-layer background.
  expect(style.borderRadius).toBe("10px");
  expect(style.borderWidth).toBe("1px");
  expect(style.boxShadow).not.toBe("none");

  const header = page.locator("#right-panel .management-card-header");
  await expect(header).toBeVisible();
  await expect(header).toHaveAttribute("data-tauri-drag-region", "");

  const barWidth = await card.evaluate((el) => getComputedStyle(el, "::-webkit-scrollbar").width);
  expect(barWidth).toBe("6px");

  // Headless Chromium paints `::-webkit-scrollbar-thumb` as if permanently hovered, so
  // `getComputedStyle(el, "::-webkit-scrollbar-thumb").backgroundColor` always reports the
  // `:hover` color even with no pointer interaction — a rendering-pipeline quirk, not something
  // our CSS controls (confirmed: a headed run of this same page reports the base color
  // correctly). Read the authored CSSOM rules instead, which is deterministic evidence that the
  // thumb is theme-colored in both states without depending on that paint-state quirk.
  const thumbRules = await page.evaluate(() => {
    const found: Record<string, string> = {};
    for (const sheet of document.styleSheets) {
      let rules: CSSRuleList;
      try {
        rules = sheet.cssRules;
      } catch {
        continue;
      }
      for (const rule of rules) {
        if (!(rule instanceof CSSStyleRule)) continue;
        if (rule.selectorText === ".management-card::-webkit-scrollbar-thumb") {
          found.base = rule.style.background || rule.style.backgroundColor;
        }
        if (rule.selectorText === ".management-card::-webkit-scrollbar-thumb:hover") {
          found.hover = rule.style.background || rule.style.backgroundColor;
        }
      }
    }
    return found;
  });
  expect(thumbRules.base).toBe("var(--border)");
  expect(thumbRules.hover).toBe("var(--accent)");
});
