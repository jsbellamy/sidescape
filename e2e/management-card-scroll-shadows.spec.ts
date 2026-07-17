import { expect, test, type Page } from "@playwright/test";
import { PNG } from "pngjs";

/**
 * #133: the scroll-shadow technique is pure CSS (`background-attachment: local` vs `scroll`
 * layers). jsdom/happy-dom don't render backgrounds, so this is verified the same way a manual
 * Tauri check would: render the real card, force overflow, screenshot it at each scroll position,
 * and read back rendered pixel darkness at the top/bottom edge as the end-to-end equivalent of
 * "look at the card and see a shadow."
 *
 * #206 moved the scroll surface (and its scroll-shadow background) off `.management-card` itself
 * — which no longer scrolls as a whole ("Character never page-scrolls") — onto its `.card-scroll`
 * inner wrapper; this spec samples/scrolls that wrapper accordingly, while the opaque
 * fill/border/radius/shadow checks stay on `.management-card` (unchanged by #206).
 *
 * #207 gave the expanded Bank/Vendor destination its own fixed shell (`.bank-page-body`) with two
 * *more* `.card-scroll` surfaces nested inside `#card-management` (the Bank tile grid and the
 * Vendor list), and #208 did the same for World (`.world-page-body`, a non-scrolling progression
 * rail plus its own selected-Area-detail `.card-scroll`).
 *
 * #209 finished the same move for Workshop and Activity, which used to share one generic
 * `#management-scroll` wrapper (removed outright — nothing renders into it any more, since all
 * four Management destinations now own their own fixed shell): Workshop's own scrollport is its
 * recipe body (`#workshop-recipes`), and Activity's own scrollport is the Recent Activity feed
 * (`#feed`). #243 removed Activity's own duplicate Loot Zone grid entirely — the Compact Widget's
 * Loot Zone strip is the sole Loot Zone interface — so Activity is now one full-height Recent
 * Activity feed scrollport, not two independent ones.
 * This spec is parametrized over each destination's own real scrollport id, per the issue's own
 * "update the scroll-shadow E2E away from `.management-card` to the actual Workshop/Activity body
 * scrollports" instruction — `.card-scroll` alone would be ambiguous, since Bank/World's own
 * scrollports are also real, also `.card-scroll`, and could legitimately want their own future
 * spec.
 *
 * #373: Bank's tile grid and Vendor list join the parametrized scroll-shadow cases; three
 * regression tests below encode the Bank/Vendor shell clipping bug directly.
 */

interface Scrollport {
  /** Human-readable name for this case's test titles. */
  name: string;
  /** Which Management destination to open via `[data-destination]` before sampling. */
  destination: "workshop" | "activity" | "bank";
  /** The scrollport's own element selector (never the generic, now-removed `#management-scroll`). */
  scrollId: string;
  /** Extra steps after the destination opens, before overflow is forced. */
  afterOpen?: (page: Page) => Promise<void>;
}

const SCROLLPORTS: Scrollport[] = [
  { name: "Workshop's recipe body", destination: "workshop", scrollId: "#workshop-recipes" },
  { name: "Activity's Recent Activity feed", destination: "activity", scrollId: "#feed" },
  {
    name: "Bank's tile grid",
    destination: "bank",
    scrollId: '[data-bank-page="bank"].card-scroll',
  },
  {
    name: "Vendor's list",
    destination: "bank",
    scrollId: '[data-bank-page="vendor"]',
    afterOpen: (page) => page.locator('[data-bankpage="vendor"]').click(),
  },
];

async function edgePixelIsDark(
  page: Page,
  scrollId: string,
  edge: "top" | "bottom",
): Promise<boolean> {
  const scroll = page.locator(scrollId);
  const box = await scroll.boundingBox();
  if (!box) throw new Error(`${scrollId} has no box`);

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

async function openManagementCardWithOverflow(
  page: Page,
  destination: Scrollport["destination"],
  scrollId: string,
  afterOpen?: (page: Page) => Promise<void>,
): Promise<void> {
  await page.goto("/");
  await page.locator("#menu-toggle").click();
  await page.locator(`[data-destination="${destination}"]`).click();
  await expect(page.locator("#card-management")).toBeVisible();

  if (afterOpen) await afterOpen(page);

  // Force deterministic overflow inside the real scrollport regardless of current save/bank
  // contents, so the test doesn't depend on gameplay state.
  await page.evaluate((id) => {
    const scroll = document.querySelector(id) as HTMLElement;
    const filler = document.createElement("div");
    filler.id = "e2e-overflow-filler";
    filler.style.height = "2000px";
    scroll.appendChild(filler);
  }, scrollId);
}

async function openBankDestination(page: Page): Promise<void> {
  await page.goto("/");
  await page.locator("#menu-toggle").click();
  await page.locator('[data-destination="bank"]').click();
  await expect(page.locator("#card-management")).toBeVisible();
}

async function openBankVendor(page: Page): Promise<void> {
  await openBankDestination(page);
  await page.locator('[data-bankpage="vendor"]').click();
}

async function forceBankTileOverflow(page: Page, tileCount = 60): Promise<void> {
  await page.evaluate((count) => {
    const bank = document.querySelector("#bank") as HTMLElement;
    while (bank.querySelectorAll(".tile").length < count) {
      const tile = document.createElement("button");
      tile.className = "tile";
      tile.style.height = "40px";
      bank.appendChild(tile);
    }
  }, tileCount);
}

function rectContains(
  outer: { top: number; left: number; bottom: number; right: number },
  inner: { top: number; left: number; bottom: number; right: number },
): boolean {
  return (
    inner.top >= outer.top &&
    inner.left >= outer.left &&
    inner.bottom <= outer.bottom &&
    inner.right <= outer.right
  );
}

for (const { name, destination, scrollId, afterOpen } of SCROLLPORTS) {
  test.describe(`${name} (${scrollId})`, () => {
    test("overflowing scrollport shows only the bottom shadow when scrolled to top", async ({
      page,
    }) => {
      await openManagementCardWithOverflow(page, destination, scrollId, afterOpen);
      await page.locator(scrollId).evaluate((el) => (el.scrollTop = 0));

      expect(await edgePixelIsDark(page, scrollId, "top")).toBe(false);
      expect(await edgePixelIsDark(page, scrollId, "bottom")).toBe(true);
    });

    test("overflowing scrollport shows both shadows mid-scroll", async ({ page }) => {
      await openManagementCardWithOverflow(page, destination, scrollId, afterOpen);
      await page.locator(scrollId).evaluate((el) => {
        el.scrollTop = (el.scrollHeight - el.clientHeight) / 2;
      });

      expect(await edgePixelIsDark(page, scrollId, "top")).toBe(true);
      expect(await edgePixelIsDark(page, scrollId, "bottom")).toBe(true);
    });

    test("overflowing scrollport shows only the top shadow when scrolled to bottom", async ({
      page,
    }) => {
      await openManagementCardWithOverflow(page, destination, scrollId, afterOpen);
      await page.locator(scrollId).evaluate((el) => (el.scrollTop = el.scrollHeight));

      expect(await edgePixelIsDark(page, scrollId, "top")).toBe(true);
      expect(await edgePixelIsDark(page, scrollId, "bottom")).toBe(false);
    });
  });
}

// "Non-overflowing scrollport shows neither shadow" only holds for Activity's feed: a fresh save
// starts with zero feed entries, but Workshop's own Smithing recipe body has several real
// (non-fixture) recipes that already overflow a 300px card's fixed height on a stock boot — the
// technique itself (`.card-scroll`, the same shared class both scrollports use) is already proven
// by the three forced-overflow cases above, so this empty-state case is only meaningful — and only
// true — for Activity.
test("Activity's Recent Activity feed shows neither shadow on a fresh, empty boot", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#menu-toggle").click();
  await page.locator('[data-destination="activity"]').click();
  const scroll = page.locator("#feed");
  await expect(page.locator("#card-management")).toBeVisible();

  const overflowing = await scroll.evaluate((el) => el.scrollHeight > el.clientHeight);
  expect(overflowing).toBe(false);

  expect(await edgePixelIsDark(page, "#feed", "top")).toBe(false);
  expect(await edgePixelIsDark(page, "#feed", "bottom")).toBe(false);
});

test("the Vendor list scrolls inside the card instead of overflowing it", async ({ page }) => {
  await openBankVendor(page);

  const card = page.locator("#card-management");
  expect(await card.evaluate((el) => el.scrollHeight <= el.clientHeight)).toBe(true);

  const port = page.locator('[data-bank-page="vendor"]');
  expect(await port.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  expect(await port.evaluate((el) => getComputedStyle(el).overflowY)).toBe("auto");
});

test("every Vendor row is reachable by scrolling", async ({ page }) => {
  await openBankVendor(page);

  const card = page.locator("#card-management");
  const port = page.locator('[data-bank-page="vendor"]');
  const lastRow = page.locator("[data-vendor-row]").last();

  await port.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });

  const cardRect = await card.boundingBox();
  const rowRect = await lastRow.boundingBox();
  if (!cardRect || !rowRect) throw new Error("missing bounding box");

  expect(
    rectContains(
      {
        top: cardRect.y,
        left: cardRect.x,
        bottom: cardRect.y + cardRect.height,
        right: cardRect.x + cardRect.width,
      },
      {
        top: rowRect.y,
        left: rowRect.x,
        bottom: rowRect.y + rowRect.height,
        right: rowRect.x + rowRect.width,
      },
    ),
  ).toBe(true);
});

test("Buy Bank Slots stays inside the card with a full Bank", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("sidescape-save-v1", JSON.stringify({ player: { gold: 10_000 } }));
  });
  await openBankDestination(page);
  await forceBankTileOverflow(page);

  const card = page.locator("#card-management");
  const buySlots = page.locator("#buy-slots-btn");

  const cardRect = await card.boundingBox();
  const buttonRect = await buySlots.boundingBox();
  if (!cardRect || !buttonRect) throw new Error("missing bounding box");

  expect(
    rectContains(
      {
        top: cardRect.y,
        left: cardRect.x,
        bottom: cardRect.y + cardRect.height,
        right: cardRect.x + cardRect.width,
      },
      {
        top: buttonRect.y,
        left: buttonRect.x,
        bottom: buttonRect.y + buttonRect.height,
        right: buttonRect.x + buttonRect.width,
      },
    ),
  ).toBe(true);

  await expect(buySlots).toBeEnabled();
  await buySlots.click();
});

test("management card keeps #138's opaque fill, border, radius, and shadow, and its scroll surfaces get a themed thin scrollbar", async ({
  page,
}) => {
  await openManagementCardWithOverflow(page, "activity", "#feed");

  const card = page.locator("#card-management");
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

  const header = page.locator("#card-management .management-card-header");
  await expect(header).toBeVisible();
  // #219 de-chromed card headers: no drag region (dragging lives solely on #compact-widget now).
  await expect(header).not.toHaveAttribute("data-tauri-drag-region");

  const scroll = page.locator("#feed");
  const barWidth = await scroll.evaluate((el) => getComputedStyle(el, "::-webkit-scrollbar").width);
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
        if (rule.selectorText === ".card-scroll::-webkit-scrollbar-thumb") {
          found.base = rule.style.background || rule.style.backgroundColor;
        }
        if (rule.selectorText === ".card-scroll::-webkit-scrollbar-thumb:hover") {
          found.hover = rule.style.background || rule.style.backgroundColor;
        }
      }
    }
    return found;
  });
  expect(thumbRules.base).toBe("var(--border)");
  expect(thumbRules.hover).toBe("var(--accent)");
});
