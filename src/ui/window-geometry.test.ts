import { describe, expect, it } from "vitest";
import {
  CARD_GAP,
  CARD_W,
  DEFAULT_CARD_H,
  DEFAULT_COMPACT_H,
  DEFAULT_COMPACT_W,
  workspaceCapacity,
  workspaceRect,
} from "./window-geometry";

const compact = { width: DEFAULT_COMPACT_W, height: DEFAULT_COMPACT_H };
const monitor = { x: 0, y: 0, width: 1920, height: 1080 };
const rect = (cardCount: number, overrides = {}) =>
  workspaceRect({
    current: { x: 500, y: 100, width: 320, height: 460 },
    compact,
    cardHeight: DEFAULT_CARD_H,
    wasCardCount: 0,
    cardCount,
    anchor: null,
    monitor,
    ...overrides,
  });

describe("workspace capacity", () => {
  it("supports narrow, medium, and wide work areas", () => {
    expect(workspaceCapacity(307)).toBe(1);
    expect(workspaceCapacity(616)).toBe(2);
    expect(workspaceCapacity(924)).toBe(3);
  });
});

describe("workspaceRect", () => {
  // A monitor taller than the tallest union so the vertical monitor clamp never fires — lets the
  // worked examples below assert exact x/y/width/height instead of clamp-mangled numbers.
  const tall = { x: 0, y: 0, width: 1920, height: 2000 };
  const worked = (cardCount: number, overrides = {}) =>
    workspaceRect({
      current: { x: 500, y: 200, width: 320, height: 460 },
      compact,
      cardHeight: DEFAULT_CARD_H,
      wasCardCount: 0,
      cardCount,
      anchor: null,
      monitor: tall,
      ...overrides,
    });

  it("returns compact geometry for zero cards", () =>
    expect(rect(0)).toEqual({
      x: 500,
      y: 100,
      width: 320,
      height: 460,
      anchor: null,
      capacity: 3,
    }));

  it("lays out one, two, and three cards with the compact widget centered over the card row", () => {
    // compactVisibleH(460) + CARD_GAP(8) + cardHeight(600) = 1068; top anchor keeps y at 200.
    expect(worked(1)).toEqual({
      x: 500,
      y: 200,
      width: 320,
      height: 1068,
      anchor: "top",
      capacity: 3,
    });
    // width = 2*300 + 8 = 608; x centers the 320 compact over the 608 row: 500 - (608-320)/2 = 356.
    expect(worked(2)).toEqual({
      x: 356,
      y: 200,
      width: 608,
      height: 1068,
      anchor: "top",
      capacity: 3,
    });
    // width = 3*300 + 2*8 = 916; x = 500 - (916-320)/2 = 202.
    expect(worked(3)).toEqual({
      x: 202,
      y: 200,
      width: 916,
      height: 1068,
      anchor: "top",
      capacity: 3,
    });
    expect(worked(2).width).toBe(CARD_W * 2 + CARD_GAP);
    expect(worked(3).width).toBe(CARD_W * 3 + CARD_GAP * 2);
  });

  it("selects upper, lower, and deadband anchors", () => {
    expect(rect(1).anchor).toBe("top");
    expect(rect(1, { current: { x: 500, y: 700, width: 320, height: 460 } }).anchor).toBe("bottom");
    // center 540 sits exactly on the midpoint — a symmetric deadband tie resolves to "bottom".
    expect(rect(1, { current: { x: 500, y: 310, width: 320, height: 460 } }).anchor).toBe("bottom");
  });

  it("breaks an asymmetric deadband tie toward the side with more room to grow (#151 §5)", () => {
    // center = 300 + 230 = 530: within ±50 of the 540 midpoint (deadband), but with more space
    // below (550) than above (530). Cards should grow downward, so the anchor is "top".
    expect(rect(1, { current: { x: 500, y: 300, width: 320, height: 460 } }).anchor).toBe("top");
    // Mirror: center 550, within deadband, more space above (550) than below (530) -> "bottom".
    expect(rect(1, { current: { x: 500, y: 320, width: 320, height: 460 } }).anchor).toBe("bottom");
  });

  it("keeps an anchor while cards remain open and reverses bottom geometry (inverse transition)", () => {
    // Lower-half open: the compact widget's bottom-center screen point (y+height = 1400+460 = 1860)
    // is preserved as the union grows upward.
    const opened = worked(1, { current: { x: 500, y: 1400, width: 320, height: 460 } });
    expect(opened).toEqual({
      x: 500,
      y: 792,
      width: 320,
      height: 1068,
      anchor: "bottom",
      capacity: 3,
    });
    expect(opened.y + opened.height).toBe(1860); // bottom point unmoved

    const changed = workspaceRect({
      current: opened,
      compact,
      cardHeight: DEFAULT_CARD_H,
      wasCardCount: 1,
      cardCount: 2,
      anchor: opened.anchor,
      monitor: tall,
    });
    expect(changed.anchor).toBe("bottom"); // never flips while a card is open

    const closed = workspaceRect({
      current: changed,
      compact,
      cardHeight: DEFAULT_CARD_H,
      wasCardCount: 2,
      cardCount: 0,
      anchor: changed.anchor,
      monitor: tall,
    });
    // Closing restores the original compact rect exactly and clears the anchor.
    expect(closed).toEqual({ x: 500, y: 1400, width: 320, height: 460, anchor: null, capacity: 3 });
  });

  it("restores a user-widened / -heightened compact size into the union", () => {
    const big = { width: 400, height: 520 };
    const r = workspaceRect({
      current: { x: 500, y: 200, width: 400, height: 520 },
      compact: big,
      cardHeight: DEFAULT_CARD_H,
      wasCardCount: 0,
      cardCount: 1,
      anchor: null,
      monitor: tall,
    });
    // A 400px compact widths is wider than a single 300px card, so the union keeps the 400 width.
    expect(r.width).toBe(400);
    // compactVisibleH = max(MIN_COMPACT_H, 520) = 520; union = 520 + 8 + 600 = 1128.
    expect(r.height).toBe(520 + CARD_GAP + DEFAULT_CARD_H);
  });

  it("clamps card height to the monitor's available vertical space", () => {
    const short = { x: 0, y: 0, width: 1920, height: 800 };
    const r = workspaceRect({
      current: { x: 500, y: 0, width: 320, height: 460 },
      compact,
      cardHeight: 5000, // absurdly tall preference
      wasCardCount: 0,
      cardCount: 1,
      anchor: null,
      monitor: short,
    });
    // availableCardH = 800 - max(MIN_COMPACT_H,460)(=460) - 8 = 332; union = 460 + 8 + 332 = 800.
    expect(r.height).toBe(800);
    expect(r.height).toBeLessThanOrEqual(short.height);
  });

  it("clamps card height and negative-origin monitor rectangles", () => {
    const small = workspaceRect({
      current: { x: -1900, y: 0, width: 320, height: 460 },
      compact,
      cardHeight: 600,
      wasCardCount: 0,
      cardCount: 3,
      anchor: null,
      monitor: { x: -1920, y: 0, width: 500, height: 700 },
    });
    expect(small.capacity).toBe(1);
    expect(small.x).toBeGreaterThanOrEqual(-1920);
    expect(small.height).toBeLessThanOrEqual(700);
  });
});
