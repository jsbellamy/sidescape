// @vitest-environment happy-dom
import { LogicalPosition, LogicalSize, PhysicalPosition, PhysicalSize } from "@tauri-apps/api/dpi";
import type { Monitor } from "@tauri-apps/api/window";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createTauriWindowChrome,
  DEFAULT_GEOMETRY,
  GEOMETRY_KEY,
  loadGeometry,
  type NativeWindowPort,
  saveGeometry,
  TAURI_MAX_W,
} from "./window-chrome";
import { MIN_COMPACT_H, MIN_COMPACT_W } from "./window-geometry";
import { boot } from "./boot";
import { fixtureContent } from "../core/fixture-content";
import { seededRng } from "../core/rng";

// happy-dom's localStorage getter doesn't resolve reliably under Vitest's global-population
// timing (same workaround as app.test.ts) — stub a plain in-memory Storage instead.
function stubLocalStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => (store.has(key) ? (store.get(key) as string) : null),
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
}

interface FakePortInit {
  x: number;
  y: number;
  width: number;
  height: number;
  scaleFactor?: number;
  monitor: { x: number; y: number; width: number; height: number; scaleFactor?: number } | null;
}

type FakePort = NativeWindowPort & {
  calls: { setSize: LogicalSize[]; setPosition: LogicalPosition[] };
  setRect(rect: { x?: number; y?: number; width?: number; height?: number }): void;
};

/** A stateful native-window port: applying a logical size/position updates the physical rectangle
 * which the next WorkspaceChrome operation reads, just like a Tauri window does. */
function fakePort(init: FakePortInit): FakePort {
  const scaleFactor = init.scaleFactor ?? 1;
  let rect = { x: init.x, y: init.y, width: init.width, height: init.height };
  const monitor: Monitor | null = init.monitor
    ? {
        name: null,
        position: new PhysicalPosition(init.monitor.x, init.monitor.y),
        size: new PhysicalSize(init.monitor.width, init.monitor.height),
        workArea: {
          position: new PhysicalPosition(init.monitor.x, init.monitor.y),
          size: new PhysicalSize(init.monitor.width, init.monitor.height),
        },
        scaleFactor: init.monitor.scaleFactor ?? scaleFactor,
      }
    : null;
  const calls = { setSize: [] as LogicalSize[], setPosition: [] as LogicalPosition[] };

  return {
    calls,
    scaleFactor: async () => scaleFactor,
    outerPosition: async () => new PhysicalPosition(rect.x, rect.y),
    outerSize: async () => new PhysicalSize(rect.width, rect.height),
    currentMonitor: async () => monitor,
    setSize: async (size) => {
      calls.setSize.push(size);
      rect = { ...rect, width: size.width * scaleFactor, height: size.height * scaleFactor };
    },
    setPosition: async (position) => {
      calls.setPosition.push(position);
      rect = { ...rect, x: position.x * scaleFactor, y: position.y * scaleFactor };
    },
    setRect(next) {
      rect = { ...rect, ...next };
    },
  };
}

function last<T>(values: T[]): T {
  const value = values[values.length - 1];
  if (!value) throw new Error("expected at least one native-window call");
  return value;
}

function root(): HTMLElement {
  return document.createElement("main");
}

beforeEach(() => {
  vi.stubGlobal("localStorage", stubLocalStorage());
  localStorage.clear();
  document.body.replaceChildren();
});

describe("window-chrome module import", () => {
  it("performs no Tauri/DOM work at module scope (import alone must not throw)", async () => {
    // Re-importing here (already imported above for the other tests) is a no-op under the module
    // cache, but this assertion documents and locks in the constraint: under happy-dom with no
    // Tauri runtime present, merely importing window-chrome.ts and boot.ts must not throw.
    await expect(import("./window-chrome")).resolves.toBeDefined();
    await expect(import("./boot")).resolves.toBeDefined();
  });
});

describe("loadGeometry", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", stubLocalStorage());
  });

  it("returns defaults when the key is missing", () => {
    expect(loadGeometry()).toEqual(DEFAULT_GEOMETRY);
  });

  it("returns defaults when the stored value is unparseable JSON", () => {
    localStorage.setItem(GEOMETRY_KEY, "{not json");
    expect(loadGeometry()).toEqual(DEFAULT_GEOMETRY);
  });

  it("returns defaults when the stored value is not an object", () => {
    localStorage.setItem(GEOMETRY_KEY, JSON.stringify("a string"));
    expect(loadGeometry()).toEqual(DEFAULT_GEOMETRY);
  });

  it("returns defaults when the stored value is null", () => {
    localStorage.setItem(GEOMETRY_KEY, JSON.stringify(null));
    expect(loadGeometry()).toEqual(DEFAULT_GEOMETRY);
  });

  it("falls back per-field when compact width/height are non-finite", () => {
    localStorage.setItem(
      GEOMETRY_KEY,
      JSON.stringify({ compact: { width: Infinity, height: NaN }, cardHeight: 500 }),
    );
    expect(loadGeometry()).toEqual({
      compact: { width: DEFAULT_GEOMETRY.compact.width, height: DEFAULT_GEOMETRY.compact.height },
      cardHeight: 500,
    });
  });

  it("falls back per-field when compact width/height are non-positive", () => {
    localStorage.setItem(
      GEOMETRY_KEY,
      JSON.stringify({ compact: { width: 0, height: -10 }, cardHeight: 500 }),
    );
    expect(loadGeometry()).toEqual({
      compact: { width: DEFAULT_GEOMETRY.compact.width, height: DEFAULT_GEOMETRY.compact.height },
      cardHeight: 500,
    });
  });

  it("falls back cardHeight when non-finite or non-positive", () => {
    localStorage.setItem(
      GEOMETRY_KEY,
      JSON.stringify({ compact: { width: 400, height: 500 }, cardHeight: -1 }),
    );
    expect(loadGeometry().cardHeight).toBe(DEFAULT_GEOMETRY.cardHeight);
  });

  it("clamps compact width into [MIN_COMPACT_W, TAURI_MAX_W]", () => {
    localStorage.setItem(
      GEOMETRY_KEY,
      JSON.stringify({ compact: { width: 10, height: 500 }, cardHeight: 500 }),
    );
    expect(loadGeometry().compact.width).toBe(MIN_COMPACT_W);

    localStorage.setItem(
      GEOMETRY_KEY,
      JSON.stringify({ compact: { width: 5000, height: 500 }, cardHeight: 500 }),
    );
    expect(loadGeometry().compact.width).toBe(TAURI_MAX_W);
  });

  it("clamps compact height to a floor of MIN_COMPACT_H (no upper clamp here)", () => {
    localStorage.setItem(
      GEOMETRY_KEY,
      JSON.stringify({ compact: { width: 400, height: 10 }, cardHeight: 500 }),
    );
    expect(loadGeometry().compact.height).toBe(MIN_COMPACT_H);
  });

  it("round-trips a valid geometry via saveGeometry", () => {
    const geometry = { compact: { width: 400, height: 500 }, cardHeight: 700 };
    saveGeometry(geometry);
    expect(loadGeometry()).toEqual(geometry);
  });
});

describe("manual-check: upper-half", () => {
  it.each([
    { scaleFactor: 1, multiplier: 1 },
    { scaleFactor: 2, multiplier: 2 },
  ])(
    "keeps the compact top edge and uses logical dimensions at $scaleFactor×",
    async ({ scaleFactor, multiplier }) => {
      localStorage.setItem(
        GEOMETRY_KEY,
        JSON.stringify({ compact: { width: 320, height: 460 }, cardHeight: 400 }),
      );
      const port = fakePort({
        x: 200 * multiplier,
        y: 100 * multiplier,
        width: 320 * multiplier,
        height: 460 * multiplier,
        scaleFactor,
        monitor: { x: 0, y: 0, width: 1920 * multiplier, height: 1200 * multiplier, scaleFactor },
      });
      const appRoot = root();
      const chrome = createTauriWindowChrome(appRoot, port);

      chrome.setCardCount(1);
      await chrome.settled();

      expect(appRoot.dataset["anchor"]).toBe("top");
      expect(appRoot.style.getPropertyValue("--card-h")).toBe("400px");
      expect(last(port.calls.setSize)).toMatchObject({ width: 320, height: 868 });
      expect(last(port.calls.setPosition)).toMatchObject({ x: 200, y: 100 });
    },
  );
});

describe("manual-check: lower-half", () => {
  it("grows upward and preserves the compact widget's bottom edge", async () => {
    localStorage.setItem(
      GEOMETRY_KEY,
      JSON.stringify({ compact: { width: 320, height: 460 }, cardHeight: 400 }),
    );
    const port = fakePort({
      x: 200,
      y: 700,
      width: 320,
      height: 460,
      monitor: { x: 0, y: 0, width: 1920, height: 1200 },
    });
    const appRoot = root();
    const chrome = createTauriWindowChrome(appRoot, port);

    chrome.setCardCount(1);
    await chrome.settled();

    expect(appRoot.dataset["anchor"]).toBe("bottom");
    expect(last(port.calls.setSize)).toMatchObject({ width: 320, height: 868 });
    expect(last(port.calls.setPosition)).toMatchObject({ x: 200, y: 292 });
    expect(last(port.calls.setPosition).y + last(port.calls.setSize).height).toBe(1160);
  });
});

describe("manual-check: narrow-monitor", () => {
  it("converts monitor widths to logical capacity and clamps an over-ask to one card", async () => {
    const single = createTauriWindowChrome(
      root(),
      fakePort({
        x: 0,
        y: 0,
        width: 320,
        height: 460,
        monitor: { x: 0, y: 0, width: 600, height: 1200 },
      }),
    );
    const doubled = createTauriWindowChrome(
      root(),
      fakePort({
        x: 0,
        y: 0,
        width: 640,
        height: 920,
        scaleFactor: 2,
        monitor: { x: 0, y: 0, width: 1280, height: 2400, scaleFactor: 2 },
      }),
    );
    const noMonitor = createTauriWindowChrome(
      root(),
      fakePort({ x: 0, y: 0, width: 320, height: 460, monitor: null }),
    );

    await expect(single.getCapacity()).resolves.toBe(1);
    await expect(doubled.getCapacity()).resolves.toBe(2);
    await expect(noMonitor.getCapacity()).resolves.toBe(3);

    const port = fakePort({
      x: 0,
      y: 0,
      width: 320,
      height: 460,
      monitor: { x: 0, y: 0, width: 600, height: 1200 },
    });
    const chrome = createTauriWindowChrome(root(), port);
    chrome.setCardCount(3);
    await chrome.settled();
    expect(last(port.calls.setSize)).toMatchObject({ width: 320 });
  });

  it("resolves capacity 3 instead of rejecting when the native call fails (#136: browser-degraded getCapacity() caller)", async () => {
    // Mirrors setCardCount's own `.catch(console.error)` resilience: `npm run dev`'s plain-browser
    // fallback has no `__TAURI_INTERNALS__`, so every Tauri API call rejects there. #136's launcher
    // click handler awaits getCapacity() directly (no try/catch of its own), so the adapter itself
    // must not leave that promise rejecting uncaught.
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const rejectingPort: NativeWindowPort = {
      scaleFactor: () => Promise.reject(new Error("no Tauri backend")),
      outerPosition: () => Promise.reject(new Error("no Tauri backend")),
      outerSize: () => Promise.reject(new Error("no Tauri backend")),
      currentMonitor: () => Promise.reject(new Error("no Tauri backend")),
      setSize: () => Promise.reject(new Error("no Tauri backend")),
      setPosition: () => Promise.reject(new Error("no Tauri backend")),
    };
    const chrome = createTauriWindowChrome(root(), rejectingPort);

    await expect(chrome.getCapacity()).resolves.toBe(3);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

describe("manual-check: resize", () => {
  it("persists a closed resize and re-derives card height from an open resize", async () => {
    const closedPort = fakePort({
      x: 200,
      y: 100,
      width: 400,
      height: 500,
      monitor: { x: 0, y: 0, width: 1920, height: 1200 },
    });
    const closedChrome = createTauriWindowChrome(root(), closedPort);
    closedChrome.setCardCount(1);
    await closedChrome.settled();
    expect(loadGeometry().compact).toEqual({ width: 400, height: 500 });

    localStorage.clear();
    localStorage.setItem(
      GEOMETRY_KEY,
      JSON.stringify({ compact: { width: 320, height: 460 }, cardHeight: 400 }),
    );
    const openPort = fakePort({
      x: 200,
      y: 100,
      width: 320,
      height: 460,
      monitor: { x: 0, y: 0, width: 1920, height: 1200 },
    });
    const openChrome = createTauriWindowChrome(root(), openPort);
    openChrome.setCardCount(1);
    await openChrome.settled();
    openPort.setRect({ height: 1000 });
    openChrome.setCardCount(2);
    await openChrome.settled();
    expect(loadGeometry().cardHeight).toBe(532);
  });
});

describe("manual-check: close/reopen", () => {
  it.each([
    { name: "top", y: 100 },
    { name: "bottom", y: 700 },
  ])(
    "restores compact geometry and recomputes the $name anchor from the live position",
    async ({ y, name }) => {
      localStorage.setItem(
        GEOMETRY_KEY,
        JSON.stringify({ compact: { width: 320, height: 460 }, cardHeight: 400 }),
      );
      const port = fakePort({
        x: 200,
        y,
        width: 320,
        height: 460,
        monitor: { x: 0, y: 0, width: 1920, height: 1200 },
      });
      const appRoot = root();
      const chrome = createTauriWindowChrome(appRoot, port);

      chrome.setCardCount(1);
      await chrome.settled();
      expect(appRoot.dataset["anchor"]).toBe(name);

      chrome.setCardCount(0);
      await chrome.settled();
      expect(last(port.calls.setSize)).toMatchObject({ width: 320, height: 460 });
      expect(appRoot.dataset["anchor"]).toBeUndefined();

      chrome.setCardCount(1);
      await chrome.settled();
      expect(appRoot.dataset["anchor"]).toBe(name);
    },
  );
});

describe("manual-check: relaunch", () => {
  it("starts closed at stored compact geometry despite an expanded plugin-restored rect", async () => {
    localStorage.setItem(
      GEOMETRY_KEY,
      JSON.stringify({ compact: { width: 340, height: 480 }, cardHeight: 520 }),
    );
    const port = fakePort({
      x: 200,
      y: 100,
      width: 920,
      height: 1100,
      monitor: { x: 0, y: 0, width: 1920, height: 1200 },
    });
    const appRoot = root();
    let chrome: ReturnType<typeof createTauriWindowChrome> | undefined;
    const running = boot(appRoot, {
      content: fixtureContent,
      rng: seededRng(1),
      now: () => 0,
      createChrome: (mountedRoot) => {
        chrome = createTauriWindowChrome(mountedRoot, port);
        return chrome;
      },
      closeWindow: async () => {},
      reload: () => {},
      confirm: () => true,
    });

    await chrome?.settled();

    expect(last(port.calls.setSize)).toMatchObject({ width: 340, height: 480 });
    expect(appRoot.querySelector<HTMLElement>("#management-row")?.hidden).toBe(true);
    expect(appRoot.dataset["anchor"]).toBeUndefined();
    running.dispose();
  });
});
