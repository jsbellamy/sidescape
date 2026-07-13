import { expect, test } from "@playwright/test";

/**
 * #223: the auto-eat threshold selector and auto-sell-duplicates checkbox moved from the
 * Character card body into `#settings-popover`, which now holds noticeably more content. The
 * issue calls out two real-geometry claims happy-dom cannot prove (it has no layout engine to
 * measure overflow against — see `management-card-scroll-shadows.spec.ts`'s own note on this):
 *
 *   1. the popover fits within `#card-character` at every UI scale (1x/1.5x/2x, since `#app` uses
 *      `zoom: var(--ui-scale)`) without clipping past the card's bottom/right edge; if it needs to
 *      scroll, IT scrolls, never the card.
 *   2. the Character card itself never page-scrolls as a result of this change (`.management-card`
 *      stays `overflow: hidden` — the "#206 Character never page-scrolls" rule).
 */

const SCALES = [1, 1.5, 2] as const;

// The stock popover content already fits comfortably inside a 600px-tall card, so the "fits at
// every scale" tests above pass even without `.settings-popover`'s own `max-height`/`overflow-y`
// rule — proving the rule is load-bearing needs content that genuinely overflows. This forces that
// with the same filler-injection technique `management-card-scroll-shadows.spec.ts` uses for its
// own scrollports.
test("an overflowing Settings popover scrolls internally instead of clipping past the card's bottom edge", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#menu-toggle").click();
  await page.locator('[data-nav="settings"]').click();
  await expect(page.locator("#settings-popover")).toBeVisible();

  await page.evaluate(() => {
    const popover = document.querySelector("#settings-popover") as HTMLElement;
    const filler = document.createElement("div");
    filler.id = "e2e-settings-overflow-filler";
    filler.style.height = "2000px";
    // `.settings-popover` is `display: flex; flex-direction: column` — an ordinary flex item
    // defaults to `flex-shrink: 1` and would shrink to fit instead of overflowing, defeating the
    // point of this forced-overflow probe.
    filler.style.flexShrink = "0";
    popover.appendChild(filler);
  });

  const card = page.locator("#card-character");
  const popover = page.locator("#settings-popover");
  const cardBox = await card.boundingBox();
  const popoverBox = await popover.boundingBox();
  if (!cardBox || !popoverBox) throw new Error("card or popover has no box");

  // The forced 2000px filler does NOT push the popover's rendered box past the card: `max-height`
  // caps it, and the excess is reachable via internal scroll instead.
  const epsilon = 1;
  expect(popoverBox.y + popoverBox.height).toBeLessThanOrEqual(
    cardBox.y + cardBox.height + epsilon,
  );
  const overflowing = await popover.evaluate((el) => el.scrollHeight > el.clientHeight);
  expect(overflowing).toBe(true);

  // The card itself still reports zero overflow — the popover absorbed it, not the card.
  const cardOverflow = await card.evaluate((el) => el.scrollHeight - el.clientHeight);
  expect(cardOverflow).toBeLessThanOrEqual(0);
});

for (const scale of SCALES) {
  test(`Settings popover fits inside the Character card at ${scale}x UI scale, and the card itself never scrolls`, async ({
    page,
  }) => {
    await page.goto("/");
    await page.locator("#menu-toggle").click();
    await page.locator('[data-nav="settings"]').click();
    await expect(page.locator("#settings-popover")).toBeVisible();

    // Drive `--ui-scale` directly rather than through `[data-ui-scale]`'s click handler: that
    // handler calls `windowChrome.setScale`, which in the real app talks to Tauri's native window
    // APIs (current monitor size, outer position/size) to decide whether the scale even fits the
    // monitor before applying it — those calls reject in a plain browser (the same "Tauri calls
    // reject in a browser, but the UI stays usable" rejection `browser-degraded.spec.ts` already
    // documents), so the button click is a no-op here. `root.style.setProperty("--ui-scale", ...)`
    // in `window-chrome.ts`'s own `apply()` is the actual seam this issue's geometry claim is
    // about — CSS `zoom: var(--ui-scale)` on `#app` — so set it the same way directly. The native
    // monitor-fit gating is `window-chrome.test.ts`'s own concern, not this issue's.
    await page.evaluate((value) => {
      document.querySelector<HTMLElement>("#app")!.style.setProperty("--ui-scale", String(value));
    }, scale);
    await expect
      .poll(() => page.evaluate(() => getComputedStyle(document.querySelector("#app")!).zoom))
      .toBe(String(scale));

    // The popover is still open and unaffected by the scale change.
    await expect(page.locator("#settings-popover")).toBeVisible();
    // The relocated rows are present and visible inside it at every scale.
    await expect(page.locator("#settings-popover #autoeat-row")).toBeVisible();
    await expect(page.locator("#settings-popover #autosell-duplicates-row")).toBeVisible();

    const card = page.locator("#card-character");
    const popover = page.locator("#settings-popover");
    const cardBox = await card.boundingBox();
    const popoverBox = await popover.boundingBox();
    if (!cardBox || !popoverBox) throw new Error("card or popover has no box");

    // Claim 1: the popover's rendered box never extends past the card's own edges — a
    // `position: absolute` child can visually escape its `overflow: hidden` ancestor's clip only
    // if the ancestor's clip is disabled; `.management-card` never disables it, so this also
    // guards against a future regression there. Allow a hairline of sub-pixel rounding.
    const epsilon = 1;
    expect(popoverBox.y).toBeGreaterThanOrEqual(cardBox.y - epsilon);
    expect(popoverBox.x).toBeGreaterThanOrEqual(cardBox.x - epsilon);
    expect(popoverBox.x + popoverBox.width).toBeLessThanOrEqual(
      cardBox.x + cardBox.width + epsilon,
    );
    expect(popoverBox.y + popoverBox.height).toBeLessThanOrEqual(
      cardBox.y + cardBox.height + epsilon,
    );

    // Claim 1b: if the popover's own content doesn't fit its allotted box, IT scrolls internally
    // (`overflow-y: auto` + a `max-height` derived from the card) rather than clipping content
    // invisibly or pushing past the card edge (already ruled out above).
    const popoverOverflow = await popover.evaluate((el) => el.scrollHeight - el.clientHeight);
    if (popoverOverflow > 0) {
      const overflowY = await popover.evaluate((el) => getComputedStyle(el).overflowY);
      expect(overflowY).toBe("auto");
    }

    // Claim 2: the card itself never page-scrolls as a result of this change, at any scale.
    const cardOverflow = await card.evaluate((el) => el.scrollHeight - el.clientHeight);
    expect(cardOverflow).toBeLessThanOrEqual(0);
    const cardOverflowStyle = await card.evaluate((el) => getComputedStyle(el).overflow);
    expect(cardOverflowStyle).toBe("hidden");
  });
}
