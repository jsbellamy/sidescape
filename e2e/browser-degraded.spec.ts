import { expect, test } from "@playwright/test";

const screenshots = "e2e-screenshots";

test("browser-degraded layout mounts, remains interactive, and records screenshot evidence", async ({
  page,
}) => {
  const pageErrors: Error[] = [];
  page.on("pageerror", (error) => pageErrors.push(error));

  await page.goto("/");

  // Smoke 1: the compact widget still mounts in the plain-browser fallback.
  await expect(page.locator("#app")).toBeVisible();
  for (const selector of ["#mute-toggle", "#close-btn", "#export-save", "#import-save"]) {
    await expect(page.locator(selector)).toBeVisible();
  }
  await page.screenshot({ path: `${screenshots}/compact.png`, fullPage: true });

  // #136 will replace the navigation DOM. Update this open-a-card step with that change.
  await page.locator('#tab-row [data-tab="bank"]').click();

  // Smoke 2: Tauri calls reject in a browser, but the UI stays usable. The expected
  // console.error from that rejected native call is deliberately allowed; page crashes are not.
  await expect(page.locator("#management-row")).toBeVisible();
  await expect(page.locator("#right-panel")).toBeVisible();
  await expect(page.locator("#app")).not.toHaveAttribute("data-anchor");
  expect(pageErrors).toEqual([]);
  await page.screenshot({ path: `${screenshots}/panel-open.png`, fullPage: true });

  // #154 deliberately closes cards on a fresh boot while retaining the saved tab preference under
  // `sidescape-ui-panels`. The maintainer authorized this as the #155 reload-open-card exception.
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("sidescape-ui-panels")))
    .toBe(JSON.stringify({ left: false, tab: "bank" }));
  await page.reload();
  await expect(page.locator("#app")).toBeVisible();
  await expect(page.locator("#management-row")).toBeHidden();
  await expect(page.locator("#right-panel")).toBeHidden();
});
