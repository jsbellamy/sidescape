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
  await page.locator('[data-destination="world"]').click();

  // Smoke 2: Tauri calls reject in a browser, but the UI stays usable. The expected
  // console.error from that rejected native call is deliberately allowed; page crashes are not.
  await expect(page.locator("#management-row")).toBeVisible();
  await expect(page.locator("#card-character")).toBeVisible();
  await expect(page.locator("#card-management")).toBeVisible();
  await expect(page.locator("#app")).not.toHaveAttribute("data-anchor");
  expect(pageErrors).toEqual([]);
  await page.screenshot({ path: `${screenshots}/panel-open.png`, fullPage: true });

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
