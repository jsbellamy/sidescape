import { describe, expect, it } from "vitest";
import {
  CARD_GAP,
  CARD_H,
  CARD_W,
  COMPACT_H,
  COMPACT_W,
  scaleFitsMonitorHeight,
  scaled,
  workspaceCapacity,
  workspaceRect,
} from "./window-geometry";

const monitor = { x: 0, y: 0, width: 1920, height: 1600 };
const rect = (scale: 1 | 1.5 | 2, cardCount = 0, overrides = {}) =>
  workspaceRect({
    current: { x: 500, y: 100, width: scaled(COMPACT_W, scale), height: scaled(COMPACT_H, scale) },
    scale,
    wasCardCount: 0,
    cardCount,
    anchor: null,
    monitor,
    ...overrides,
  });

describe("fixed scalable workspace geometry", () => {
  it.each([
    [1, 320, 220],
    [1.5, 480, 330],
    [2, 640, 440],
  ] as const)("pins the compact rect at %sx", (scale, width, height) =>
    expect(rect(scale)).toMatchObject({ width, height }),
  );

  it("scales cards and gaps with the complete workspace", () => {
    expect(rect(1, 2)).toMatchObject({
      width: 2 * CARD_W + CARD_GAP,
      height: COMPACT_H + CARD_GAP + CARD_H,
    });
    expect(rect(2, 2)).toMatchObject({ width: 1216, height: 1656 });
  });

  it("reports scale support from the full fixed vertical workspace", () => {
    expect(scaleFitsMonitorHeight(827, 1)).toBe(false);
    expect(scaleFitsMonitorHeight(828, 1)).toBe(true);
    expect(scaleFitsMonitorHeight(1655, 2)).toBe(false);
    expect(scaleFitsMonitorHeight(1656, 2)).toBe(true);
  });

  describe("manual-check: narrow-monitor", () => {
    it("derives capacity from scaled card widths", () => {
      expect(workspaceCapacity(607, 1)).toBe(1);
      expect(workspaceCapacity(608, 1)).toBe(2);
      expect(workspaceCapacity(911, 1.5)).toBe(1);
      expect(workspaceCapacity(912, 1.5)).toBe(2);
    });

    it("clamps workspace width on a narrow monitor without reducing scale", () => {
      const constrained = rect(2, 2, { monitor: { x: 0, y: 0, width: 1000, height: 1000 } });
      expect(constrained).toMatchObject({ width: 640, height: 1656, capacity: 1 });
    });
  });

  describe("manual-check: upper-half", () => {
    it("resolves top-positioned rects to a top anchor", () => {
      expect(rect(1, 1).anchor).toBe("top");
    });
  });

  describe("manual-check: lower-half", () => {
    it("resolves lower-positioned rects to a bottom anchor", () => {
      const lower = rect(1, 1, { current: { x: 500, y: 1200, width: 320, height: 220 } });
      expect(lower.anchor).toBe("bottom");
      expect(lower.height).toBe(828);
    });
  });
});
