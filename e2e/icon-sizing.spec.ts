import { expect, test } from "@playwright/test";

// #168: happy-dom cannot compute real layout, so the vitest half of this fix (in
// src/ui/styles-compact-minimum.test.ts) only asserts the stylesheet's own rule text. This spec
// is the real-layout half — it proves the fixed 34px icon chassis actually measures 34×34 in a
// real browser, at both the shared `.tile .icon` seam and the two audited consumers (#220's
// `.loot-chip` and the Skills page's `.skill-icon`, formerly `#xp-row`'s, moved by #222) that used
// to render below 34px.

const SAVE_KEY = "sidescape-save-v1";

/** Seeds a save with a Bank stack and a Loot Zone stack before boot, mirroring
 * e2e/loot-strip.spec.ts's seedLootZone helper. `loadState` (src/core/engine.ts) tolerates a
 * save carrying only the fields under test. */
async function seedBankAndLoot(page: import("@playwright/test").Page): Promise<void> {
  await page.addInitScript(
    ({ key }) => {
      window.localStorage.setItem(
        key,
        JSON.stringify({
          bank: { items: [{ itemId: "bronze-dagger", qty: 1 }] },
          lootZone: [{ itemId: "cooked-meat", qty: 1 }],
        }),
      );
    },
    { key: SAVE_KEY },
  );
}

test("`.tile .icon` boxes measure exactly 34x34 in the Bank grid, the Loot Strip chip, and the Skills page's skill icon", async ({
  page,
}) => {
  await seedBankAndLoot(page);
  await page.goto("/");

  // Loot Strip chip (compact widget, `.loot-chip` — was 28px, clipped the icon).
  const lootChipIcon = page.locator("#loot-strip-items .loot-chip .icon").first();
  await expect(lootChipIcon).toBeVisible();
  const lootBox = await lootChipIcon.boundingBox();
  expect(lootBox?.width).toBe(34);
  expect(lootBox?.height).toBe(34);

  // Bank tile grid (management card, `.tile .icon` — was fluid max-width/max-height).
  await page.locator("#menu-toggle").click();
  await page.locator('[data-destination="bank"]').click();
  const bankTileIcon = page.locator("#bank .tile .icon").first();
  await expect(bankTileIcon).toBeVisible();
  const bankBox = await bankTileIcon.boundingBox();
  expect(bankBox?.width).toBe(34);
  expect(bankBox?.height).toBe(34);

  // Skills page skill row icon (Management card's `skills` destination, `.skill-icon` — was
  // 17px on the Character card's old #xp-row, a 0.5x downscale, before #222 moved it here).
  await page.locator('#character-nav [data-destination="skills"]').click();
  const skillIcon = page.locator("#skills-list .skill-icon").first();
  await expect(skillIcon).toBeVisible();
  const skillBox = await skillIcon.boundingBox();
  expect(skillBox?.width).toBe(34);
  expect(skillBox?.height).toBe(34);

  await page.screenshot({ path: "e2e-screenshots/icon-sizing.png", fullPage: true });
});
