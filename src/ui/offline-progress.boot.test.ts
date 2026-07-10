// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { createEngine } from "../core/engine";
import { fixtureContent } from "../core/fixture-content";
import { makeSnapshot } from "../core/make-snapshot";
import { seededRng } from "../core/rng";
import { mountApp } from "./app";
import type { WindowChrome } from "./app";
import {
  buildAwayCard,
  computeOfflineTicks,
  OFFLINE_CAP_TICKS,
  pumpOffline,
  showAwayCard,
} from "./offline-progress";

const TICK_MS = 600;
const noopWindowChrome: WindowChrome = { setPanels: () => {} };

/**
 * Replays main.ts's own boot order (#69) without importing main.ts itself — main.ts also wires up
 * real Tauri window APIs at module scope, which don't run under this DOM test harness. This
 * mirrors app.test.ts's own `mount()` helper: the UI surface under test is `mountApp`, driven the
 * same way the real boot path drives it — compute the pump BEFORE mounting, mount (which is the
 * "first render" plus every per-event subscription), then show the one summary toast after.
 */
function bootWithOfflinePump(
  engine: ReturnType<typeof createEngine>,
  savedAt: number | undefined,
  now: number,
) {
  const root = document.createElement("main");
  const ticks = computeOfflineTicks(savedAt, now, TICK_MS);
  let awayCard = null;
  if (ticks > 0) {
    const capped = ticks >= OFFLINE_CAP_TICKS;
    const summary = pumpOffline(engine, ticks);
    awayCard = buildAwayCard(summary, now - (savedAt as number), capped);
  }
  const app = mountApp(engine, root, fixtureContent, noopWindowChrome);
  if (awayCard) showAwayCard(root, awayCard);
  return { root, app, ticks, awayCard };
}

describe("offline-progress boot wiring", () => {
  it("produces zero per-event Loot Feed lines from the pump — mountApp only subscribes after it", () => {
    const now = 10_000_000_000;
    const savedAt = now - 60 * 60 * 1000; // 1h ago -> 6 000 Ticks fishing, many fish-caught events
    const engine = createEngine(fixtureContent, seededRng(1), {
      ...makeSnapshot({ fishing: { spotId: "pond", name: "Test Pond" } }),
      savedAt,
    });

    const { root, ticks } = bootWithOfflinePump(engine, savedAt, now);

    expect(ticks).toBe(6_000);
    // The pump ran 2 000 Catches worth of Ticks — if a single one leaked to the feed, this would
    // fail; mountApp's engine.on("fish-caught", ...) subscription only exists after mount, i.e.
    // after the pump already finished.
    expect(root.querySelector("#feed")?.children.length ?? 0).toBe(0);
    expect(root.querySelector("#ticker")?.textContent).toBe("");
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

    const engine = createEngine(fixtureContent, seededRng(1), savedSnap);
    const { root, awayCard } = bootWithOfflinePump(engine, savedAt, now);

    expect(expectedCard).not.toBeNull();
    expect(awayCard).toEqual(expectedCard);
    const cards = root.querySelectorAll("#toast-container .away-card");
    expect(cards.length).toBe(1);
    expect(cards[0]?.textContent).toContain(expectedCard?.heading);
  });

  it("shows no toast when reopened with no elapsed time (savedAt just now)", () => {
    const now = 10_000_000_000;
    const engine = createEngine(fixtureContent, seededRng(1), {
      ...makeSnapshot({ fishing: { spotId: "pond", name: "Test Pond" } }),
      savedAt: now,
    });

    const { root, ticks, awayCard } = bootWithOfflinePump(engine, now, now);

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
    const engine = createEngine(fixtureContent, seededRng(1), legacySave as never);

    const { root, ticks, awayCard } = bootWithOfflinePump(engine, undefined, now);

    expect(ticks).toBe(0);
    expect(awayCard).toBeNull();
    expect(root.querySelectorAll("#toast-container .away-card").length).toBe(0);
  });

  it("clamps a very long absence to the 8h cap and labels it '8h+'", () => {
    const now = 10_000_000_000;
    const savedAt = now - 30 * 60 * 60 * 1000; // 30h ago
    const engine = createEngine(fixtureContent, seededRng(1), {
      ...makeSnapshot({ monster: { id: "dummy", name: "Training Dummy", hp: 3, maxHp: 3 } }),
      savedAt,
    });

    const { awayCard, ticks } = bootWithOfflinePump(engine, savedAt, now);

    expect(ticks).toBe(OFFLINE_CAP_TICKS);
    expect(awayCard?.heading).toContain("8h+");
  });
});
