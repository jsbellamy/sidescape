import { expect, test } from "@playwright/test";

// #232: regression from #226 — #scene gained `flex: 1 1 auto` so its height became variable, but
// #sprite-row (its only in-flow child) was never anchored to the bottom, so it sat at the TOP of
// the scene's content box instead, ~56px above the grass. e2e/loot-strip.spec.ts already proves
// #scene + #loot-strip together fill #main-column (occupancy), but never that #sprite-row lands
// in the right place WITHIN #scene (placement) — this spec is the placement guard the issue calls
// for. happy-dom cannot compute box geometry (see loot-strip.spec.ts's own comment), so this lives
// in Playwright next to it.

// Measuring point: #player-sprite-wrap (`.sprite-wrap`), the flex item `align-items: flex-end`
// actually bottom-aligns within #sprite-row — not the `<img id="player-sprite">` itself. A plain
// `<img>` is inline by default, so it sits on `.sprite-wrap`'s text baseline with a few px of
// descender space below it; that's an unrelated, pre-existing CSS quirk (present before and after
// #226 alike, since neither touched `.sprite-wrap`/`.sprite` display), not part of the
// ground-plane contract this issue fixes. #player-sprite-wrap is always rendered (unlike its
// monster counterpart, hidden outside combat), so it's the stable measuring point in every scene
// state.
async function spriteWrapGapAboveBackdropBottom(
  page: import("@playwright/test").Page,
): Promise<number> {
  return page.evaluate(() => {
    const wrapRect = document.querySelector("#player-sprite-wrap")!.getBoundingClientRect();
    const backdropRect = document.querySelector("#backdrop")!.getBoundingClientRect();
    return backdropRect.bottom - wrapRect.bottom;
  });
}

test("the player sprite stands 20px above #backdrop's bottom edge — the pre-#226 ground position", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#sprite-row")).toBeVisible();

  // 10px #sprite-row bottom padding + 10px #scene padding — see styles.css's ground-plane
  // contract comment on #scene.
  const gap = await spriteWrapGapAboveBackdropBottom(page);
  expect(Math.round(gap)).toBe(20);
});

test("that 20px gap is invariant to #scene's height — the #226 regression guard", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#sprite-row")).toBeVisible();

  const baseline = await spriteWrapGapAboveBackdropBottom(page);

  // Force #scene materially taller by shrinking its flex sibling #loot-strip, and materially
  // shorter by growing it — both via inline style overriding the flex-basis, which stays legal
  // CSS the browser must still lay out. A top-aligned #sprite-row would move by the same amount
  // #scene's height changes; a bottom-anchored one must not move at all. This is exactly the
  // #226 failure mode: it passed a single-height occupancy check by luck.
  const taller = await page.evaluate(() => {
    const strip = document.querySelector("#loot-strip") as HTMLElement;
    strip.style.setProperty("flex", "0 0 8px", "important");
    strip.style.setProperty("height", "8px", "important");
    const wrapRect = document.querySelector("#player-sprite-wrap")!.getBoundingClientRect();
    const backdropRect = document.querySelector("#backdrop")!.getBoundingClientRect();
    return backdropRect.bottom - wrapRect.bottom;
  });

  const shorter = await page.evaluate(() => {
    const strip = document.querySelector("#loot-strip") as HTMLElement;
    strip.style.setProperty("flex", "0 0 90px", "important");
    strip.style.setProperty("height", "90px", "important");
    const wrapRect = document.querySelector("#player-sprite-wrap")!.getBoundingClientRect();
    const backdropRect = document.querySelector("#backdrop")!.getBoundingClientRect();
    return backdropRect.bottom - wrapRect.bottom;
  });

  expect(Math.round(taller)).toBe(Math.round(baseline));
  expect(Math.round(shorter)).toBe(Math.round(baseline));
});

test("#activity-prop's computed `bottom` is px-based, not a percentage of the variable-height scene", async ({
  page,
}) => {
  await page.goto("/");

  // #activity-prop is `[hidden]` outside an active non-combat activity; its `bottom` declaration
  // still applies (display:none only from the [hidden] rule, not removed from the box model
  // computation of the authored property), so no activity needs to be started to read it.
  const bottom = await page.locator("#activity-prop").evaluate((el) => getComputedStyle(el).bottom);

  expect(bottom.endsWith("%")).toBe(false);
});
