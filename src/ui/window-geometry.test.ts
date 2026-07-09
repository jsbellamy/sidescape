import { describe, expect, it } from "vitest";
import { BASE_H, BASE_W, PANEL_W, panelWindowRect } from "./window-geometry";
import type { MonitorRect } from "./window-geometry";

// BASE_W=320, PANEL_W=300 — sanity-check the constants worked examples below assume.
describe("panelWindowRect constants", () => {
  it("exposes the tuned window-sizing constants", () => {
    expect(BASE_W).toBe(320);
    expect(BASE_H).toBe(460);
    expect(PANEL_W).toBe(300);
  });
});

describe("panelWindowRect", () => {
  it("opening the left panel widens by PANEL_W and shifts x left by PANEL_W", () => {
    const result = panelWindowRect({
      currentX: 100,
      wasLeftOpen: false,
      left: true,
      right: false,
      monitor: null,
    });
    expect(result).toEqual({ width: BASE_W + PANEL_W, x: 100 - PANEL_W });
  });

  it("closing the left panel narrows by PANEL_W and shifts x right by PANEL_W", () => {
    const result = panelWindowRect({
      currentX: 100 - PANEL_W,
      wasLeftOpen: true,
      left: false,
      right: false,
      monitor: null,
    });
    expect(result).toEqual({ width: BASE_W, x: 100 });
  });

  it("toggling the right panel widens the window but never moves x", () => {
    const opened = panelWindowRect({
      currentX: 50,
      wasLeftOpen: false,
      left: false,
      right: true,
      monitor: null,
    });
    expect(opened).toEqual({ width: BASE_W + PANEL_W, x: 50 });

    const closed = panelWindowRect({
      currentX: 50,
      wasLeftOpen: false,
      left: false,
      right: false,
      monitor: null,
    });
    expect(closed).toEqual({ width: BASE_W, x: 50 });
  });

  it("re-applying the same left-panel state leaves x unchanged", () => {
    const stillOpen = panelWindowRect({
      currentX: 42,
      wasLeftOpen: true,
      left: true,
      right: false,
      monitor: null,
    });
    expect(stillOpen).toEqual({ width: BASE_W + PANEL_W, x: 42 });

    const stillClosed = panelWindowRect({
      currentX: 42,
      wasLeftOpen: false,
      left: false,
      right: false,
      monitor: null,
    });
    expect(stillClosed).toEqual({ width: BASE_W, x: 42 });
  });

  it("clamps x at the left edge of the monitor", () => {
    const monitor: MonitorRect = { x: 0, y: 0, width: 1920, height: 1080 };
    // currentX=10, opening LEFT would shift to 10 - 300 = -290, below the monitor's x=0.
    const result = panelWindowRect({
      currentX: 10,
      wasLeftOpen: false,
      left: true,
      right: false,
      monitor,
    });
    expect(result.x).toBe(0);
  });

  it("clamps x at the right edge of the monitor", () => {
    const monitor: MonitorRect = { x: 0, y: 0, width: 1000, height: 1080 };
    const width = BASE_W + PANEL_W; // 620
    // currentX=900 would put the window's right edge at 900+620=1520, past the monitor's
    // right edge at 1000; expect it pinned so the window's right edge sits at the monitor edge.
    const result = panelWindowRect({
      currentX: 900,
      wasLeftOpen: true,
      left: true,
      right: false,
      monitor,
    });
    expect(result.x).toBe(monitor.x + monitor.width - width);
  });

  it("clamps correctly on a monitor with a negative origin (secondary display left of primary)", () => {
    const monitor: MonitorRect = { x: -1920, y: 0, width: 1920, height: 1080 };
    const width = BASE_W; // no panels open
    // Below the left edge: should clamp up to monitor.x.
    const belowEdge = panelWindowRect({
      currentX: -2000,
      wasLeftOpen: false,
      left: false,
      right: false,
      monitor,
    });
    expect(belowEdge.x).toBe(-1920);

    // Past the right edge: should clamp down to monitor.x + monitor.width - width.
    const pastEdge = panelWindowRect({
      currentX: 0,
      wasLeftOpen: false,
      left: false,
      right: false,
      monitor,
    });
    expect(pastEdge.x).toBe(-1920 + 1920 - width);
  });

  it("pins x to monitor.x when the window is wider than the monitor", () => {
    const monitor: MonitorRect = { x: 100, y: 0, width: 500, height: 1080 };
    const width = BASE_W + PANEL_W + PANEL_W; // 920, wider than the 500-wide monitor
    const result = panelWindowRect({
      currentX: 250,
      wasLeftOpen: false,
      left: true,
      right: true,
      monitor,
    });
    expect(result.width).toBe(width);
    expect(result.x).toBe(monitor.x);
  });

  it("performs no clamping when monitor is null, even far off-screen", () => {
    const result = panelWindowRect({
      currentX: -5000,
      wasLeftOpen: false,
      left: false,
      right: false,
      monitor: null,
    });
    expect(result.x).toBe(-5000);
  });
});
