// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_GEOMETRY,
  GEOMETRY_KEY,
  loadGeometry,
  saveGeometry,
  TAURI_MAX_W,
} from "./window-chrome";
import { MIN_COMPACT_H, MIN_COMPACT_W } from "./window-geometry";

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
