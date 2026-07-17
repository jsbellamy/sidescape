import { expect, test } from "@playwright/test";

const screenshots = "e2e-screenshots";
const SAVE_KEY = "sidescape-save-v1";

/** Visual evidence for #433: Smithing prop left, player right, at native 1× scale. */
test("prop-active Smithing scene records dedicated screenshot evidence (#433)", async ({
  page,
}) => {
  await page.addInitScript(
    ({ key }) => {
      window.localStorage.setItem(
        key,
        JSON.stringify({
          bank: { items: [{ itemId: "bronze-bar", qty: 5 }] },
        }),
      );
    },
    { key: SAVE_KEY },
  );

  await page.goto("/");
  await page.locator("#menu-toggle").click();
  await page.locator('[data-destination="workshop"]').click();
  await page.locator('[data-recipe="bronze-dagger"]').click();

  await expect(page.locator("#scene")).toHaveClass(/prop-active/);
  await expect(page.locator("#activity-prop")).toHaveClass(/prop-anvil/);
  await expect(page.locator("#backdrop")).toHaveAttribute("data-theme", "workshop");

  await page.locator("#menu-toggle").click();
  await expect(page.locator("#management-row")).toBeHidden();
  await page.screenshot({ path: `${screenshots}/prop-scene-separation.png`, fullPage: true });
});

test("prop-active while fishing uses the same separation path (#433)", async ({ page }) => {
  await page.goto("/");
  await page.locator("#menu-toggle").click();
  await page.locator('[data-destination="world"]').click();
  await page.locator('[data-spot="shrimp-pool"]').click();

  await expect(page.locator("#scene")).toHaveClass(/prop-active/);
  await expect(page.locator("#activity-prop")).toHaveClass(/prop-fishing-meadow/);
  await expect(page.locator("#backdrop")).toHaveAttribute("data-theme", "meadow");

  await page.locator("#menu-toggle").click();
  await expect(page.locator("#management-row")).toBeHidden();
  await page.screenshot({ path: `${screenshots}/fishing-meadow.png`, fullPage: true });
});
