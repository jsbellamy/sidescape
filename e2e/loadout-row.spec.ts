import { expect, test } from "@playwright/test";

/**
 * #224: collapses the Character card's four separate loadout rows (3 stretched Food Slots, the
 * Potion Slot, the Quiver, the Rune Slot) into one `#loadout-row`, every tile at the same 40px
 * chassis #168 gave the gear grid. Two real-geometry claims neither happy-dom (no layout engine —
 * see e2e/icon-sizing.spec.ts's own note) nor a DOM-existence check can prove:
 *
 *   1. a filled Food Slot tile's rendered box is structurally equal to a filled Gear Slot tile's
 *      (the acceptance criterion's own wording) — proving the deleted `.food-slot { flex: 1 }`
 *      stretch cannot silently return.
 *   2. every tile in the row sits on one shared flex line (same top y) rather than stacked rows.
 *
 * Icon-exactness (34px) is already covered generally by icon-sizing.spec.ts's `.tile .icon`
 * assertion; this spec adds the loadout row specifically since it's a new consumer of that shared
 * chassis. The "fits without page-scrolling at 1x/1.5x/2x" claim mirrors
 * settings-popover-scale.spec.ts's own established pattern for `.management-card`.
 */

const SAVE_KEY = "sidescape-save-v1";
const SCALES = [1, 1.5, 2] as const;

/** Seeds a save with all four Loadout Slot kinds filled plus a Gear Slot, so every tile in
 * `#loadout-row` (and the gear grid it's compared against) renders in its filled state. */
async function seedLoadout(page: import("@playwright/test").Page): Promise<void> {
  await page.addInitScript(
    ({ key }) => {
      window.localStorage.setItem(
        key,
        JSON.stringify({
          player: {
            equipment: { weapon: "bronze-dagger" },
            foodSlots: [{ itemId: "cooked-meat", qty: 5 }, null, null],
            potionSlot: { itemId: "strength-potion", qty: 3, charges: 20 },
            quiver: { itemId: "bronze-arrow", qty: 12 },
            runeSlot: { itemId: "air-rune", qty: 8 },
          },
        }),
      );
    },
    { key: SAVE_KEY },
  );
}

test("a filled Food Slot tile's box measures identically to a filled Gear Slot tile's — the flex:1 stretch cannot silently return", async ({
  page,
}) => {
  await seedLoadout(page);
  await page.goto("/");
  await page.locator("#menu-toggle").click();

  const foodTile = page.locator('#loadout-row [data-eat="0"]');
  const gearTile = page.locator("#character-slots .tile[data-item]").first();
  await expect(foodTile).toBeVisible();
  await expect(gearTile).toBeVisible();

  const foodBox = await foodTile.boundingBox();
  const gearBox = await gearTile.boundingBox();
  if (!foodBox || !gearBox) throw new Error("food or gear tile has no box");

  expect(foodBox.width).toBe(gearBox.width);
  expect(foodBox.height).toBe(gearBox.height);
  // Pinned to #168's own chassis arithmetic (34px icon + 2x2px padding + 2x1px border = 40px),
  // not just "equal to each other" — guards against both shrinking together.
  expect(foodBox.width).toBe(40);
  expect(foodBox.height).toBe(40);

  await page.screenshot({ path: "e2e-screenshots/loadout-row.png", fullPage: true });
});

test("every icon inside #loadout-row measures exactly 34x34, per #168's chassis", async ({
  page,
}) => {
  await seedLoadout(page);
  await page.goto("/");
  await page.locator("#menu-toggle").click();

  for (const selector of [
    '[data-eat="0"] .icon', // Food
    '.tile[data-item="strength-potion"] .icon', // Potion
    '.tile[data-item="bronze-arrow"] .icon', // Quiver
    '.tile[data-item="air-rune"] .icon', // Rune Slot
  ]) {
    const icon = page.locator(`#loadout-row ${selector}`);
    await expect(icon).toBeVisible();
    const box = await icon.boundingBox();
    expect(box?.width, selector).toBe(34);
    expect(box?.height, selector).toBe(34);
  }
});

test("all six loadout tiles sit on one shared flex line, not stacked rows", async ({ page }) => {
  await seedLoadout(page);
  await page.goto("/");
  await page.locator("#menu-toggle").click();

  const tops = await Promise.all(
    [
      '[data-eat="0"]',
      '[data-eat="1"], [data-add="1"]',
      '[data-eat="2"], [data-add="2"]',
      '.tile[data-item="strength-potion"], [data-potion-add]',
      '.tile[data-item="bronze-arrow"], [data-quiver-add]',
      '.tile[data-item="air-rune"], [data-rune-add]',
    ].map(async (selector) => {
      const box = await page.locator(`#loadout-row ${selector}`).first().boundingBox();
      if (!box) throw new Error(`${selector} has no box`);
      return box.y;
    }),
  );

  const epsilon = 1;
  for (const y of tops) {
    expect(Math.abs(y - tops[0])).toBeLessThanOrEqual(epsilon);
  }
});

for (const scale of SCALES) {
  test(`the Character card fits the unified Loadout row without page-scrolling at ${scale}x UI scale`, async ({
    page,
  }) => {
    await seedLoadout(page);
    await page.goto("/");
    await page.locator("#menu-toggle").click();

    // Same direct `--ui-scale` seam settings-popover-scale.spec.ts uses — the native monitor-fit
    // gating behind the button click is window-chrome.test.ts's own concern, not this issue's.
    await page.evaluate((value) => {
      document.querySelector<HTMLElement>("#app")!.style.setProperty("--ui-scale", String(value));
    }, scale);
    await expect
      .poll(() => page.evaluate(() => getComputedStyle(document.querySelector("#app")!).zoom))
      .toBe(String(scale));

    await expect(page.locator("#loadout-row")).toBeVisible();

    const card = page.locator("#card-character");
    const cardOverflow = await card.evaluate((el) => el.scrollHeight - el.clientHeight);
    expect(cardOverflow).toBeLessThanOrEqual(0);
    const cardOverflowStyle = await card.evaluate((el) => getComputedStyle(el).overflow);
    expect(cardOverflowStyle).toBe("hidden");

    // The row itself never wraps onto a second line at any scale (zoom scales the whole document
    // together, so the 260px-of-284px-available fit from styles.css's own comment holds at every
    // scale, not just 1x).
    const rowBox = await page.locator("#loadout-row").boundingBox();
    const lastTileBox = await page
      .locator('#loadout-row .tile[data-item="air-rune"]')
      .boundingBox();
    if (!rowBox || !lastTileBox) throw new Error("row or last tile has no box");
    expect(Math.abs(lastTileBox.y - rowBox.y)).toBeLessThanOrEqual(1);
  });
}
