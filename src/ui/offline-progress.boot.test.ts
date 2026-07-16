// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEngine } from "../core/engine";
import { fixtureContent } from "../core/testing/fixture-content";
import { makeSnapshot } from "../core/testing/make-snapshot";
import { seededRng } from "../core/rng";
import type { WorkspaceChrome } from "./workspace-chrome";
import { boot, SAVE_KEY, TICK_MS } from "./boot";
import {
  type AwayCardModel,
  buildAwayCard,
  computeOfflineTicks,
  OFFLINE_CAP_TICKS,
  pumpOffline,
} from "./offline-progress";

const noopWindowChrome: WorkspaceChrome = {
  getCapacity: () => Promise.resolve(2),
  setCardCount: () => Promise.resolve(),
};

const runningBoots: Array<{ dispose(): void }> = [];

// happy-dom's localStorage getter doesn't resolve reliably under Vitest's global-population
// timing (same workaround as app.test.ts and window-chrome.test.ts).
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

function bootSavedSnapshot(snapshot: ReturnType<typeof makeSnapshot>, now: number) {
  localStorage.setItem(SAVE_KEY, JSON.stringify(snapshot));
  const root = document.createElement("main");
  const running = boot(root, {
    content: fixtureContent,
    rng: seededRng(1),
    now: () => now,
    createChrome: () => noopWindowChrome,
    closeWindow: async () => {},
    reload: () => {},
    confirm: () => true,
  });
  runningBoots.push(running);
  return { root, engine: running.engine };
}

/** Reads the production-rendered card back into the model that `showAwayCard` received. This keeps
 * the original model equality assertion while production `boot()` remains the only boot seam. */
function displayedAwayCard(root: ParentNode): AwayCardModel | null {
  const card = root.querySelector(".away-card");
  if (!card) return null;
  const heading = card.querySelector(".away-card-heading");
  return {
    heading: heading?.firstChild?.textContent ?? "",
    lines: Array.from(card.querySelectorAll(".away-card-line"), (line) => line.textContent ?? ""),
  };
}

beforeEach(() => {
  vi.stubGlobal("localStorage", stubLocalStorage());
  localStorage.clear();
  document.body.replaceChildren();
});

afterEach(() => {
  runningBoots.splice(0).forEach((running) => running.dispose());
  localStorage.clear();
});

describe("offline-progress boot wiring", () => {
  it("produces zero per-event Loot Feed lines from the pump — mountApp only subscribes after it", () => {
    const now = 10_000_000_000;
    const savedAt = now - 60 * 60 * 1000; // 1h ago -> 6 000 Ticks fishing, many fish-caught events
    const savedSnap = {
      ...makeSnapshot({ fishing: { spotId: "pond", name: "Test Pond" } }),
      savedAt,
    };

    const { root } = bootSavedSnapshot(savedSnap, now);
    const ticks = computeOfflineTicks(savedAt, now, TICK_MS);

    expect(ticks).toBe(6_000);
    // The pump ran 2 000 Catches worth of Ticks — if a single one leaked to the feed, this would
    // fail; mountApp's engine.on("fish-caught", ...) subscription only exists after mount, i.e.
    // after the pump already finished.
    expect(root.querySelector("#feed")?.children.length ?? 0).toBe(0);
    expect(root.querySelector("#ticker")).toBeNull();
  });

  it("shows exactly one card whose content matches buildAwayCard's own output", () => {
    const now = 10_000_000_000;
    const savedAt = now - 60 * 60 * 1000; // 1h ago
    const savedSnap = {
      ...makeSnapshot({ fishing: { spotId: "pond", name: "Test Pond" } }),
      savedAt,
    };
    // Compute the expected text independently, off a twin engine ticked the same way, so this
    // test doesn't hand-derive (and risk drifting from) the aggregation logic under test.
    const twin = createEngine(fixtureContent, seededRng(1), savedSnap);
    const ticks = computeOfflineTicks(savedAt, now, TICK_MS);
    const expectedSummary = pumpOffline(twin, ticks);
    const expectedCard = buildAwayCard(expectedSummary, now - savedAt, false);

    const { root } = bootSavedSnapshot(savedSnap, now);
    const awayCard = displayedAwayCard(root);

    expect(expectedCard).not.toBeNull();
    expect(awayCard).toEqual(expectedCard);
    const cards = root.querySelectorAll("#toast-container .away-card");
    expect(cards.length).toBe(1);
    expect(cards[0]?.textContent).toContain(expectedCard?.heading);
  });

  it("shows no toast when reopened with no elapsed time (savedAt just now)", () => {
    const now = 10_000_000_000;
    const savedSnap = {
      ...makeSnapshot({ fishing: { spotId: "pond", name: "Test Pond" } }),
      savedAt: now,
    };

    const { root } = bootSavedSnapshot(savedSnap, now);
    const ticks = computeOfflineTicks(now, now, TICK_MS);
    const awayCard = displayedAwayCard(root);

    expect(ticks).toBe(0);
    expect(awayCard).toBeNull();
    expect(root.querySelectorAll("#toast-container .away-card").length).toBe(0);
  });

  it("shows no toast for a pre-#69 save with no savedAt at all", () => {
    const now = 10_000_000_000;
    const legacySave = makeSnapshot({
      fishing: { spotId: "pond", name: "Test Pond" },
    }) as unknown as Record<string, unknown>;
    delete legacySave["savedAt"];

    const { root } = bootSavedSnapshot(legacySave as never, now);
    const ticks = computeOfflineTicks(undefined, now, TICK_MS);
    const awayCard = displayedAwayCard(root);

    expect(ticks).toBe(0);
    expect(awayCard).toBeNull();
    expect(root.querySelectorAll("#toast-container .away-card").length).toBe(0);
  });

  it("clamps a very long absence to the 8h cap and labels it '8h+'", () => {
    const now = 10_000_000_000;
    const savedAt = now - 30 * 60 * 60 * 1000; // 30h ago
    const savedSnap = {
      ...makeSnapshot({ monster: { id: "dummy", name: "Training Dummy", hp: 3, maxHp: 3 } }),
      savedAt,
    };

    const { root } = bootSavedSnapshot(savedSnap, now);
    const ticks = computeOfflineTicks(savedAt, now, TICK_MS);
    const awayCard = displayedAwayCard(root);

    expect(ticks).toBe(OFFLINE_CAP_TICKS);
    expect(awayCard?.heading).toContain("8h+");
  });
});

describe("close-btn save persistence (#219 chrome pass: #close-btn moved into #widget-controls, but must keep writing SAVE_KEY exactly like it did inside the deleted #titlebar)", () => {
  it("writes the current Snapshot to SAVE_KEY before closing the window", () => {
    const now = 10_000_000_000;
    const savedSnap = { ...makeSnapshot({ player: { gold: 42 } }), savedAt: now };
    const { root, engine } = bootSavedSnapshot(savedSnap, now);

    expect(localStorage.getItem(SAVE_KEY)).not.toBeNull();
    localStorage.removeItem(SAVE_KEY); // prove the click itself writes it, not just the boot-time load
    expect(localStorage.getItem(SAVE_KEY)).toBeNull();

    root.querySelector<HTMLButtonElement>("#close-btn")?.click();

    const raw = localStorage.getItem(SAVE_KEY);
    expect(raw).not.toBeNull();
    const saved = JSON.parse(raw as string);
    expect(saved.player.gold).toBe(engine.snapshot().player.gold);
  });
});

describe("boot disposal (#325)", () => {
  it("dispose() clears tick/autosave intervals and reaches mountApp so World clicks no longer dispatch", () => {
    const now = 10_000_000_000;
    const root = document.createElement("main");
    const running = boot(root, {
      content: fixtureContent,
      rng: seededRng(1),
      now: () => now,
      createChrome: () => noopWindowChrome,
      closeWindow: async () => {},
      reload: () => {},
      confirm: () => true,
    });
    runningBoots.push(running);

    const monsterBefore = running.engine.snapshot().monster?.id ?? null;
    running.dispose();
    running.dispose();

    root.querySelector<HTMLButtonElement>('#world-page-host [data-monster="dummy"]')?.click();

    expect(running.engine.snapshot().monster?.id ?? null).toBe(monsterBefore);
  });
});
