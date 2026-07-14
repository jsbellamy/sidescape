// @vitest-environment happy-dom
import { LogicalSize, PhysicalPosition, PhysicalSize } from "@tauri-apps/api/dpi";
import type { Monitor } from "@tauri-apps/api/window";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createTauriWindowChrome,
  loadUiScale,
  saveUiScale,
  type NativeWindowPort,
  type WebviewLayoutPort,
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

type FakeWindowPort = NativeWindowPort & {
  sizes: LogicalSize[];
  writes: string[];
  layout: WebviewLayoutPort;
};

function fakePort(
  width = 320,
  height = 220,
  monitorWidth = 1920,
  monitorHeight = 1800,
): FakeWindowPort {
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
  const layout: WebviewLayoutPort = {
    viewportSize: () => ({ width: rect.width, height: rect.height }),
    nextFrame: () => Promise.resolve(),
  };
  return {
    sizes,
    writes,
    layout,
    scaleFactor: async () => 1,
    outerPosition: async () => new PhysicalPosition(rect.x, rect.y),
    outerSize: async () => new PhysicalSize(rect.width, rect.height),
    currentMonitor: async () => monitor,
    beginTransition: async () => {
      writes.push("begin-transition");
    },
    setFrame: async (frame) => {
      writes.push("frame");
      sizes.push(new LogicalSize(frame.width, frame.height));
      rect = { ...frame };
    },
    endTransition: async () => {
      writes.push("end-transition");
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
    const chrome = createTauriWindowChrome(document.createElement("main"), port, port.layout);
    chrome.setCardCount(0);
    await chrome.settled();
    expect(port.sizes[port.sizes.length - 1]).toMatchObject({ width: 480, height: 330 });
  });
  it("applies a supported scale to the full workspace", async () => {
    const root = document.createElement("main");
    const port = fakePort();
    const chrome = createTauriWindowChrome(root, port, port.layout);
    chrome.setScale?.(2);
    await chrome.settled();
    expect(port.sizes[port.sizes.length - 1]).toMatchObject({ width: 640, height: 440 });
    expect(root.style.getPropertyValue("--ui-scale")).toBe("2");
  });
  it("returns a completion promise so Settings can update after scale application", async () => {
    const port = fakePort();
    const chrome = createTauriWindowChrome(document.createElement("main"), port, port.layout);
    const completion = chrome.setScale?.(1.5);
    expect(completion).toBeInstanceOf(Promise);
    await completion;
    expect(chrome.getScale?.()).toBe(1.5);
  });
  it("applies expansion as one native frame write so no position-only or size-only state can paint", async () => {
    const port = fakePort();
    const chrome = createTauriWindowChrome(document.createElement("main"), port, port.layout);
    void chrome.setCardCount(1);
    await chrome.settled();
    expect(port.writes.slice(-2)).toEqual(["end-transition", "frame"]);
  });
  it("setCardCount's returned Promise resolves only after native writes, data-anchor, and webview layout finish", async () => {
    const root = document.createElement("main");
    const port = fakePort();
    const chrome = createTauriWindowChrome(root, port, port.layout);
    const completion = chrome.setCardCount(1);
    expect(completion).toBeInstanceOf(Promise);
    // Immediately after calling setCardCount, the queued native work has not run yet.
    expect(port.writes).toEqual([]);
    expect(root.dataset["anchor"]).toBeUndefined();
    await completion;
    // By the time the Promise resolves, the native frame write, data-anchor, and the fake webview's
    // two consecutive matching layout frames have landed.
    expect(port.writes.slice(-2)).toEqual(["end-transition", "frame"]);
    expect(root.dataset["anchor"]).toBeDefined();
  });
  it("keeps 1->2 completion pending until the webview reaches the two-card viewport and lays it out for one more frame", async () => {
    let viewport = { width: 320, height: 828 };
    const frameResolvers: Array<() => void> = [];
    const layout: WebviewLayoutPort = {
      viewportSize: () => viewport,
      nextFrame: () =>
        new Promise<void>((resolve) => {
          frameResolvers.push(resolve);
        }),
    };
    const advanceFrame = async (next = viewport) => {
      viewport = next;
      await vi.waitFor(() => expect(frameResolvers.length).toBeGreaterThan(0));
      frameResolvers.shift()?.();
      await Promise.resolve();
    };
    const chrome = createTauriWindowChrome(
      document.createElement("main"),
      fakePort(320, 828),
      layout,
    );

    const oneCard = chrome.setCardCount(1);
    await advanceFrame();
    await advanceFrame();
    await oneCard;

    let resolved = false;
    const twoCards = chrome.setCardCount(2).then(() => {
      resolved = true;
    });
    await advanceFrame(); // native IPC may be done, but the webview is still 320px wide
    expect(resolved).toBe(false);

    await advanceFrame({ width: 608, height: 828 }); // target width observed
    expect(resolved).toBe(false); // one final layout frame is still required
    await advanceFrame();
    await twoCards;
    expect(resolved).toBe(true);
  });
  it("covers both 1->2 and 2->1 until two paints after the caller renders the destination state", async () => {
    const port = fakePort();
    let presentationFrames = 0;
    const nextFrame = port.layout.nextFrame;
    port.layout.nextFrame = async () => {
      presentationFrames++;
      await nextFrame();
    };
    const chrome = createTauriWindowChrome(document.createElement("main"), port, port.layout);

    await chrome.setCardCount(1);
    expect(port.writes).not.toContain("begin-transition");

    await chrome.setCardCount(2);
    expect(port.writes.slice(-3)).toEqual(["end-transition", "begin-transition", "frame"]);

    presentationFrames = 0;
    await chrome.present();
    expect(presentationFrames).toBe(2);
    expect(port.writes[port.writes.length - 1]).toBe("end-transition");

    await chrome.setCardCount(1);
    expect(port.writes.slice(-3)).toEqual(["end-transition", "begin-transition", "frame"]);
  });
  it("disables unsupported stops and never silently reduces the selected scale", async () => {
    const port = fakePort(320, 220, 1920, 1000);
    const chrome = createTauriWindowChrome(document.createElement("main"), port, port.layout);
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
