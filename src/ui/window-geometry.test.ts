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
  it("returns compact geometry for zero cards", () =>
    expect(rect(0)).toMatchObject({ width: 320, height: 460, anchor: null }));
  it("lays out one, two, and three cards", () => {
    expect(rect(1).width).toBe(320);
    expect(rect(2).width).toBe(CARD_W * 2 + CARD_GAP);
    expect(rect(3).width).toBe(CARD_W * 3 + CARD_GAP * 2);
  });
  it("selects upper, lower, and deadband anchors", () => {
    expect(rect(1).anchor).toBe("top");
    expect(rect(1, { current: { x: 500, y: 700, width: 320, height: 460 } }).anchor).toBe("bottom");
    expect(rect(1, { current: { x: 500, y: 310, width: 320, height: 460 } }).anchor).toBe("bottom");
  });
  it("keeps an anchor while cards remain open and reverses bottom geometry", () => {
    const opened = rect(1, { current: { x: 500, y: 700, width: 320, height: 460 } });
    const changed = workspaceRect({
      current: opened,
      compact,
      cardHeight: DEFAULT_CARD_H,
      wasCardCount: 1,
      cardCount: 2,
      anchor: opened.anchor,
      monitor,
    });
    const closed = workspaceRect({
      current: changed,
      compact,
      cardHeight: DEFAULT_CARD_H,
      wasCardCount: 2,
      cardCount: 0,
      anchor: changed.anchor,
      monitor,
    });
    expect(changed.anchor).toBe("bottom");
    expect(closed.anchor).toBeNull();
    expect(closed.height).toBe(460);
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
