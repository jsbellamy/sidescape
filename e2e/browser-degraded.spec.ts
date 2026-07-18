import { expect, test } from "@playwright/test";

const screenshots = "e2e-screenshots";

test("browser-degraded layout mounts, remains interactive, and records screenshot evidence", async ({
  page,
}) => {
  const pageErrors: Error[] = [];
  page.on("pageerror", (error) => pageErrors.push(error));

  // #308: the compact screenshot needs an actual landed player attack. Alternate a low accuracy
  // roll with a high damage roll before boot so the browser-degraded capture cannot flake on a
  // run of misses or zero-damage hits.
  await page.addInitScript(() => {
    let callCount = 0;
    Math.random = () => {
      callCount++;
      return callCount % 2 === 1 ? 0.1 : 0.9;
    };
  });

  await page.goto("/");

  // Smoke 1: the compact widget still mounts in the plain-browser fallback. Mute/Export/Import
  // moved into the Character hub's Settings popover (#206), so only the always-visible
  // #widget-controls Close button and the Menu button are checked here (#219 replaced the
  // titlebar bar with this floating cluster overlaid on #scene's top-right corner).
  await expect(page.locator("#app")).toBeVisible();
  for (const selector of ["#close-btn", "#menu-toggle"]) {
    await expect(page.locator(selector)).toBeVisible();
  }

  // #308: select an unlocked Monster through the real browser-degraded UI and wait for the
  // caller-pumped Engine to produce a combat-style XP gain. Closing the cards again leaves the
  // compact screenshot as direct visual evidence that the row sits above the player health bar.
  await page.locator("#menu-toggle").click();
  await page.locator('[data-destination="world"]').click();
  await page.locator("[data-monster]").first().click();
  await expect(page.locator("#player-xp-lane .xp-gain")).toBeVisible({ timeout: 10_000 });
  await page.locator("#menu-toggle").click();
  await expect(page.locator("#management-row")).toBeHidden();
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
  // Content has five since Frostspire, #254), and the Management card fits the rail plus the
  // selected-Area detail with no whole-card scrolling — a real-browser layout check, not just a
  // happy-dom one (happy-dom has no real layout engine to measure overflow against).
  await expect(page.locator("[data-area-select]")).toHaveCount(5);
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
  // #222: the fifth Skills destination — a roomy one-row-per-Skill list plus the pets strip,
  // moved off the Character card. `[data-destination="skills"]` also matches the Character card's
  // own `#character-levels-summary` button (both dispatch the same nav path), so this scopes to
  // the Character hub's nav strip specifically, mirroring the other four destination clicks above.
  await page.locator('#character-nav [data-destination="skills"]').click();
  await page.screenshot({ path: `${screenshots}/skills.png`, fullPage: true });

  // #242: re-clicking the currently active Management destination closes Management and leaves
  // Character open (rather than replacing Management's body with itself) — checked here against a
  // real browser layout, not just the happy-dom DOM assertions in app.test.ts.
  await page.locator('#character-nav [data-destination="skills"]').click();
  await expect(page.locator("#card-management")).toBeHidden();
  await expect(page.locator("#card-character")).toBeVisible();
  await expect(page.locator('#character-nav [data-destination="skills"]')).not.toHaveClass(
    /active/,
  );

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

test("activity overlay composition remains player-plane pixel art at every UiScale stop", async ({
  page,
}) => {
  await page.goto("/");
  // Activity selection is covered at the Snapshot/DOM seam. This visual smoke isolates the final
  // player-plane composition and writes inspection screenshots at all supported scale stops.
  await page.locator("#activity-prop").evaluate((element) => {
    element.removeAttribute("hidden");
    element.className = "prop-anvil";
  });
  for (const scale of ["1", "1.5", "2"]) {
    await page
      .locator("#app")
      .evaluate((element, value) => element.style.setProperty("--ui-scale", value), scale);
    await expect(page.locator("#activity-prop")).toBeVisible();
    await page.screenshot({
      path: `${screenshots}/activity-overlay-${scale}x.png`,
      fullPage: true,
    });
  }
});

test("Frostspire Glacier backdrop evidence at native compact scale (#293)", async ({ page }) => {
  // Shade Crypt clear unlocks Frostspire so the real World rail can select glacier Theme combat.
  await page.addInitScript(
    ({ key }) => {
      window.localStorage.setItem(
        key,
        JSON.stringify({
          player: {
            completedDungeonIds: ["darkroot-hollow", "sewer-king", "shade-crypt"],
            skills: {
              attack: { level: 70, xp: 737627 },
              strength: { level: 70, xp: 737627 },
              defence: { level: 70, xp: 737627 },
              hitpoints: { level: 70, xp: 737627 },
            },
            equipment: {
              weapon: "adamant-dagger",
              shield: "adamant-kiteshield",
              body: "adamant-chainbody",
              head: "adamant-full-helm",
            },
            foodSlots: [{ itemId: "cooked-pike", qty: 100 }, null, null],
          },
        }),
      );
    },
    { key: "sidescape-save-v1" },
  );

  await page.goto("/");
  await page.locator("#menu-toggle").click();
  await page.locator('[data-destination="world"]').click();
  await page.locator('[data-area-select="frostspire"]').click();
  await page.locator('[data-monster="frost-wolf"]').click();
  await expect(page.locator("#backdrop")).toHaveAttribute("data-theme", "glacier");
  await page.locator("#menu-toggle").click();
  await expect(page.locator("#management-row")).toBeHidden();
  await page.screenshot({ path: `${screenshots}/glacier-combat.png`, fullPage: true });

  // Non-combat Glacier evidence: Frostspire has no Fishing spot, and Production forces town Theme.
  // After real Frostspire combat, lastAreaId keeps glacier; select a Fishing spot in another Area
  // to compose the native-scale fishing near-layer screenshot without leaving the retained Theme.
  await page.locator("#menu-toggle").click();
  await page.locator('[data-destination="world"]').click();
  await page.locator('[data-area-select="frostspire"]').click();
  await page.locator('[data-spot="glacial-melt"]').click();
  await expect(page.locator("#backdrop")).toHaveAttribute("data-theme", "glacier");
  await expect(page.locator("#backdrop")).toHaveAttribute("data-fishing", "");
  await page.locator("#menu-toggle").click();
  await expect(page.locator("#management-row")).toBeHidden();
  await page.screenshot({ path: `${screenshots}/glacier-activity.png`, fullPage: true });
});
