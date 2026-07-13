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
    void chrome.setCardCount(1);
    await chrome.settled();
    expect(port.writes.slice(-2)).toEqual(["position", "size"]);
  });
  it("issues position and size back-to-back on expansion, not fully sequenced — the second call starts before the first's round trip finishes (#242 follow-up: the 1->2 already-visible-card flash)", async () => {
    // A port whose setPosition round trip is deliberately held open, so this test can observe
    // whether setSize is dispatched while it's still pending (concurrent) or only after it settles
    // (sequential) — the sequential form left a real gap during which the OS had only moved the
    // window, not yet grown it, which read as a visible jump/flash for an already-open card (see
    // the "moves before expanding" doc comment in `apply()` for the pre-existing evidence this must
    // still hold true after the fix: position is still requested first, size still second).
    const base = fakePort();
    let releasePosition!: () => void;
    const positionGate = new Promise<void>((resolve) => {
      releasePosition = resolve;
    });
    const calls: string[] = [];
    const port: NativeWindowPort = {
      ...base,
      setPosition: async (p) => {
        calls.push("position-start");
        await positionGate; // held open until the test releases it
        await base.setPosition(p);
        calls.push("position-end");
      },
      setSize: async (s) => {
        calls.push("size-start");
        await base.setSize(s);
        calls.push("size-end");
      },
    };
    const chrome = createTauriWindowChrome(document.createElement("main"), port);
    const completion = chrome.setCardCount(1); // expansion: position requested, then size

    // setSize must get dispatched — and, since its own round trip is short, even finish — while
    // setPosition's is still pending (`positionGate` is only released below): proof the two are
    // not fully sequenced (no `await` of the whole first round trip before the second is even
    // sent).
    await vi.waitFor(() => expect(calls).toEqual(["position-start", "size-start", "size-end"]));

    releasePosition();
    await completion;
    expect(calls).toEqual(["position-start", "size-start", "size-end", "position-end"]);
  });
  it("setCardCount's returned Promise resolves only after the queued native writes and data-anchor application finish", async () => {
    const root = document.createElement("main");
    const port = fakePort();
    const chrome = createTauriWindowChrome(root, port);
    const completion = chrome.setCardCount(1);
    expect(completion).toBeInstanceOf(Promise);
    // Immediately after calling setCardCount, the queued native work has not run yet.
    expect(port.writes).toEqual([]);
    expect(root.dataset["anchor"]).toBeUndefined();
    await completion;
    // By the time the Promise resolves, both native writes and data-anchor have landed.
    expect(port.writes.slice(-2)).toEqual(["position", "size"]);
    expect(root.dataset["anchor"]).toBeDefined();
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
