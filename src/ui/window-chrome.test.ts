// @vitest-environment happy-dom
import { LogicalSize, PhysicalPosition, PhysicalSize } from "@tauri-apps/api/dpi";
import type { Monitor } from "@tauri-apps/api/window";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createTauriWindowChrome,
  loadUiScale,
  saveUiScale,
  type NativeWindowPort,
} from "./window-chrome";
import { UI_SCALE_KEY } from "./window-geometry";

const storage = () => {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => data.set(k, v),
    removeItem: (k: string) => data.delete(k),
    clear: () => data.clear(),
    key: () => null,
    get length() {
      return data.size;
    },
  } as Storage;
};

function fakePort(
  width = 320,
  height = 220,
  monitorWidth = 1920,
  monitorHeight = 1800,
): NativeWindowPort & { sizes: LogicalSize[]; writes: string[] } {
  let rect = { x: 100, y: 100, width, height };
  const sizes: LogicalSize[] = [];
  const writes: string[] = [];
  const monitor: Monitor = {
    name: null,
    position: new PhysicalPosition(0, 0),
    size: new PhysicalSize(monitorWidth, monitorHeight),
    workArea: {
      position: new PhysicalPosition(0, 0),
      size: new PhysicalSize(monitorWidth, monitorHeight),
    },
    scaleFactor: 1,
  };
  return {
    sizes,
    writes,
    scaleFactor: async () => 1,
    outerPosition: async () => new PhysicalPosition(rect.x, rect.y),
    outerSize: async () => new PhysicalSize(rect.width, rect.height),
    currentMonitor: async () => monitor,
    setSize: async (s) => {
      writes.push("size");
      sizes.push(s);
      rect = { ...rect, width: s.width, height: s.height };
    },
    setPosition: async (p) => {
      writes.push("position");
      rect = { ...rect, x: p.x, y: p.y };
    },
  };
}

beforeEach(() => vi.stubGlobal("localStorage", storage()));

describe("local UI scale", () => {
  it("tolerantly defaults invalid values and round-trips valid stops", () => {
    expect(loadUiScale()).toBe(1);
    localStorage.setItem(UI_SCALE_KEY, "1.25");
    expect(loadUiScale()).toBe(1);
    localStorage.setItem(UI_SCALE_KEY, "bad");
    expect(loadUiScale()).toBe(1);
    saveUiScale(1.5);
    expect(loadUiScale()).toBe(1.5);
  });
  it("ignores legacy free-resize geometry", () => {
    localStorage.setItem(
      "sidescape-ui-geometry-v2",
      JSON.stringify({ compact: { width: 900, height: 900 } }),
    );
    expect(loadUiScale()).toBe(1);
  });
});

describe("WorkspaceChrome fixed scale", () => {
  it("boot overrides a restored expanded rect with the scaled compact rect", async () => {
    saveUiScale(1.5);
    const port = fakePort(912, 1242);
    const chrome = createTauriWindowChrome(document.createElement("main"), port);
    chrome.setCardCount(0);
    await chrome.settled();
    expect(port.sizes[port.sizes.length - 1]).toMatchObject({ width: 480, height: 330 });
  });
  it("applies a supported scale to the full workspace", async () => {
    const root = document.createElement("main");
    const port = fakePort();
    const chrome = createTauriWindowChrome(root, port);
    chrome.setScale?.(2);
    await chrome.settled();
    expect(port.sizes[port.sizes.length - 1]).toMatchObject({ width: 640, height: 440 });
    expect(root.style.getPropertyValue("--ui-scale")).toBe("2");
  });
  it("returns a completion promise so Settings can update after scale application", async () => {
    const chrome = createTauriWindowChrome(document.createElement("main"), fakePort());
    const completion = chrome.setScale?.(1.5);
    expect(completion).toBeInstanceOf(Promise);
    await completion;
    expect(chrome.getScale?.()).toBe(1.5);
  });
  it("moves before expanding so an open card never overlays the compact position", async () => {
    const port = fakePort();
    const chrome = createTauriWindowChrome(document.createElement("main"), port);
    chrome.setCardCount(1);
    await chrome.settled();
    expect(port.writes.slice(-2)).toEqual(["position", "size"]);
  });
  it("disables unsupported stops and never silently reduces the selected scale", async () => {
    const port = fakePort(320, 220, 1920, 1000);
    const chrome = createTauriWindowChrome(document.createElement("main"), port);
    await expect(chrome.getScaleOptions?.()).resolves.toEqual([
      { value: 1, supported: true },
      { value: 1.5, supported: false },
      { value: 2, supported: false },
    ]);
    chrome.setScale?.(2);
    await chrome.settled();
    expect(chrome.getScale?.()).toBe(1);
    expect(loadUiScale()).toBe(1);
  });
});
