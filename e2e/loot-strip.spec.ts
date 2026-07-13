import { expect, test } from "@playwright/test";

// #220: geometry claims (no dead area; a full Loot Zone scrolls rather than wrapping/widening)
// need a real layout engine — happy-dom (used by the Vitest DOM integration tests in
// src/ui/app.test.ts) cannot compute box sizes, so these assertions live here instead, matching
// AGENTS.md's UI evidence map rule to pick the seam a criterion actually names.

const SAVE_KEY = "sidescape-save-v1";

// Ten distinct real Item ids (src/data/index.ts) — a full LOOT_ZONE_CAPACITY (#220's "10 stacks"
// acceptance criterion), each a normal qty-1 stack so this only exercises chip count/width, not
// quantity-badge formatting.
const TEN_ITEM_IDS = [
  "cooked-meat",
  "bronze-dagger",
  "bronze-sword",
  "bronze-mace",
  "leather-body",
  "bronze-shield",
  "goblin-charm",
  "cooked-trout",
  "iron-dagger",
  "iron-chainbody",
];

/** Seeds localStorage with a save carrying the given Loot Zone before the app boots, exactly as
 * `loadSave()` (src/ui/boot.ts) reads it on the next launch — `loadState` (src/core/engine.ts) is
 * tolerant of a save containing only the fields under test (see app.test.ts's own save round-trip
 * tests), so a bare `{ lootZone }` is a legitimate save. */
async function seedLootZone(
  page: import("@playwright/test").Page,
  itemIds: string[],
): Promise<void> {
  await page.addInitScript(
    ({ key, itemIds: ids }) => {
      window.localStorage.setItem(
        key,
        JSON.stringify({ lootZone: ids.map((itemId) => ({ itemId, qty: 1 })) }),
      );
    },
    { key: SAVE_KEY, itemIds },
  );
}

test("empty Loot Zone: #scene and #loot-strip together fill #main-column's content box — no dead background region", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#loot-strip")).toBeVisible();

  const boxes = await page.evaluate(() => {
    const rect = (id: string) => document.querySelector(id)!.getBoundingClientRect();
    return {
      widget: rect("#compact-widget"),
      mainColumn: rect("#main-column"),
      scene: rect("#scene"),
      strip: rect("#loot-strip"),
    };
  });

  // #main-column is #compact-widget's sole flex child (flex: 1 1 auto) with no siblings, so it
  // fills the widget's whole content box — no dead space at that outer level. #compact-widget
  // carries a 1px border (styles.css), which its own bounding rect includes but its content box
  // (what #main-column fills) does not.
  const widgetBorder = 2; // 1px top + 1px bottom
  expect(
    Math.abs(boxes.mainColumn.height - (boxes.widget.height - widgetBorder)),
  ).toBeLessThanOrEqual(1);

  // #main-column is a flex column with 8px padding top/bottom and an 8px gap between its two
  // children (#scene, #loot-strip): its content height must be entirely spent on those two
  // children plus that padding/gap — nothing left over as empty background (the bug #220 fixes).
  const spent =
    boxes.scene.height + boxes.strip.height + 8 /* top pad */ + 8 /* gap */ + 8; /* bottom pad */
  expect(Math.abs(spent - boxes.mainColumn.height)).toBeLessThanOrEqual(1);

  // The window itself stays 320x220 (COMPACT_W/COMPACT_H, unchanged by this issue).
  expect(Math.round(boxes.widget.width)).toBe(320);
  expect(Math.round(boxes.widget.height)).toBe(220);
});

test("a full Loot Zone (10 stacks) scrolls horizontally within 320px without widening the widget, wrapping, or shrinking the scene", async ({
  page,
}) => {
  await seedLootZone(page, TEN_ITEM_IDS);
  await page.goto("/");
  await expect(page.locator("#loot-strip")).toBeVisible();

  const chips = page.locator("#loot-strip-items .loot-chip");
  await expect(chips).toHaveCount(10);
  await expect(page.locator("#loot-strip-count")).toHaveText("10/10");
  await expect(page.locator("#loot-strip-all-btn")).toBeEnabled();

  const geometry = await page.evaluate(() => {
    const items = document.querySelector("#loot-strip-items") as HTMLElement;
    const chipTops = [...items.querySelectorAll(".loot-chip")].map(
      (el) => el.getBoundingClientRect().top,
    );
    return {
      widgetWidth: document.querySelector("#compact-widget")!.getBoundingClientRect().width,
      sceneHeight: document.querySelector("#scene")!.getBoundingClientRect().height,
      scrollWidth: items.scrollWidth,
      clientWidth: items.clientWidth,
      chipTops,
    };
  });

  // Ten 28px chips plus gaps overflow 320px, so the strip must scroll rather than grow.
  expect(geometry.scrollWidth).toBeGreaterThan(geometry.clientWidth);
  // The widget itself never widens to accommodate them.
  expect(Math.round(geometry.widgetWidth)).toBe(320);
  // No wrap: every chip sits on the same row (equal top offset), which is also what keeps #scene
  // from being squeezed by a second strip row.
  const [firstTop, ...restTops] = geometry.chipTops;
  for (const top of restTops) expect(Math.abs(top - firstTop!)).toBeLessThanOrEqual(1);
  // #scene keeps the same height as the empty-zone case (a fixed-height strip never eats into it).
  expect(Math.round(geometry.sceneHeight)).toBeGreaterThan(0);
});
