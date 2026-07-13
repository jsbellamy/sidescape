import { expect, test } from "@playwright/test";

const screenshots = "e2e-screenshots";

test("browser-degraded layout mounts, remains interactive, and records screenshot evidence", async ({
  page,
}) => {
  const pageErrors: Error[] = [];
  page.on("pageerror", (error) => pageErrors.push(error));

  await page.goto("/");

  // Smoke 1: the compact widget still mounts in the plain-browser fallback. Mute/Export/Import
  // moved into the Character hub's Settings popover (#206), so only the always-visible titlebar
  // Quit button and the menu button are checked here.
  await expect(page.locator("#app")).toBeVisible();
  for (const selector of ["#close-btn", "#menu-toggle"]) {
    await expect(page.locator(selector)).toBeVisible();
  }
  await page.screenshot({ path: `${screenshots}/compact.png`, fullPage: true });

  // #206: the menu button opens the Character hub; its own header nav then opens the Management
  // card at the World destination.
  await page.locator("#menu-toggle").click();
  await page.screenshot({ path: `${screenshots}/character-only.png`, fullPage: true });
  await page.locator('[data-destination="world"]').click();

  // Smoke 2: Tauri calls reject in a browser, but the UI stays usable. The expected
  // console.error from that rejected native call is deliberately allowed; page crashes are not.
  await expect(page.locator("#management-row")).toBeVisible();
  await expect(page.locator("#card-character")).toBeVisible();
  await expect(page.locator("#card-management")).toBeVisible();
  await expect(page.locator("#app")).not.toHaveAttribute("data-anchor");
  expect(pageErrors).toEqual([]);

  // #208: the World page's selected-Area progression rail lists every real Area (the shipped
  // Content currently has four), and the Management card fits the rail plus the selected-Area
  // detail with no whole-card scrolling — a real-browser layout check, not just a happy-dom one
  // (happy-dom has no real layout engine to measure overflow against).
  await expect(page.locator("[data-area-select]")).toHaveCount(4);
  const overflow = await page
    .locator("#card-management")
    .evaluate((el) => el.scrollHeight - el.clientHeight);
  expect(overflow).toBeLessThanOrEqual(0);

  await page.screenshot({ path: `${screenshots}/world.png`, fullPage: true });
  await page.locator('[data-destination="bank"]').click();
  await page.screenshot({ path: `${screenshots}/bank.png`, fullPage: true });
  await page.locator('[data-destination="workshop"]').click();
  await page.screenshot({ path: `${screenshots}/workshop.png`, fullPage: true });
  await page.locator('[data-destination="activity"]').click();
  await page.screenshot({ path: `${screenshots}/activity.png`, fullPage: true });

  // #206: workspace state is session-only — no `sidescape-ui-workspace-v2` key is ever written —
  // so both cards deliberately close on a fresh boot/reload with nothing to recover.
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("sidescape-ui-workspace-v2")))
    .toBeNull();
  await page.reload();
  await expect(page.locator("#app")).toBeVisible();
  await expect(page.locator("#management-row")).toBeHidden();
  await expect(page.locator("#card-character")).toBeHidden();
  await expect(page.locator("#card-management")).toBeHidden();
});
