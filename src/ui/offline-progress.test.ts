// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEngine } from "../core/engine";
import { fixtureContent } from "../core/testing/fixture-content";
import { makeSnapshot } from "../core/testing/make-snapshot";
import { seededRng } from "../core/rng";
import {
  buildAwayCard,
  computeOfflineTicks,
  formatAwayDuration,
  OFFLINE_CAP_TICKS,
  pumpOffline,
  showAwayCard,
} from "./offline-progress";

const TICK_MS = 600;

describe("computeOfflineTicks", () => {
  it("floors elapsed/tickMs — aged 1h pumps exactly 6 000 Ticks", () => {
    const now = 10_000_000;
    const savedAt = now - 60 * 60 * 1000; // 1h ago
    expect(computeOfflineTicks(savedAt, now, TICK_MS)).toBe(6_000);
  });

  it("clamps to OFFLINE_CAP_TICKS — aged 30h still pumps only 48 000 Ticks", () => {
    const now = 10_000_000_000;
    const savedAt = now - 30 * 60 * 60 * 1000; // 30h ago
    expect(computeOfflineTicks(savedAt, now, TICK_MS)).toBe(OFFLINE_CAP_TICKS);
  });

  it("truncates a partial Tick", () => {
    expect(computeOfflineTicks(0, 650, TICK_MS)).toBe(1); // 650ms / 600ms/Tick -> 1, not 1.08
    expect(computeOfflineTicks(0, 599, TICK_MS)).toBe(0);
  });

  it("pumps zero on a missing savedAt (pre-#69 save) — no error, no pump", () => {
    expect(computeOfflineTicks(undefined, 10_000_000, TICK_MS)).toBe(0);
    expect(computeOfflineTicks(null, 10_000_000, TICK_MS)).toBe(0);
  });

  it("pumps zero rather than a negative amount if the wall clock is behind savedAt", () => {
    expect(computeOfflineTicks(10_000, 5_000, TICK_MS)).toBe(0);
  });

  it("pumps zero when reopened immediately (elapsed under one Tick)", () => {
    expect(computeOfflineTicks(10_000, 10_100, TICK_MS)).toBe(0);
  });
});

describe("pumpOffline", () => {
  function fishingEngine(seed: number) {
    return createEngine(
      fixtureContent,
      seededRng(seed),
      makeSnapshot({ fishing: { spotId: "pond", name: "Test Pond" } }),
    );
  }

  it("ticks the Engine exactly `ticks` times — matches a plain tick() loop bit-for-bit", () => {
    const pumped = fishingEngine(7);
    const manual = fishingEngine(7);

    pumpOffline(pumped, 1_000);
    for (let i = 0; i < 1_000; i++) manual.tick();

    const a = pumped.snapshot();
    const b = manual.snapshot();
    expect(a.player.skills).toEqual(b.player.skills);
    expect(a.player.gold).toBe(b.player.gold);
    expect(a.bank).toEqual(b.bank);
    expect(a.fishing).toEqual(b.fishing);
  });

  it("aggregates gold/XP deltas as a before/after Snapshot diff", () => {
    const engine = fishingEngine(3);
    const before = engine.snapshot();
    const summary = pumpOffline(engine, 300); // 100 Catches at catchTicks 3, xp 10 each
    const after = engine.snapshot();

    expect(summary.ticks).toBe(300);
    expect(summary.xpDelta).toBe(after.player.skills.fishing.xp - before.player.skills.fishing.xp);
    expect(summary.xpDelta).toBeGreaterThan(0);
    expect(summary.goldDelta).toBe(0); // fishing never touches gold
  });

  it("counts kills and deaths from a combat pump, matching a normally-subscribed listener", () => {
    const combatSaved = makeSnapshot({
      monster: { id: "dummy", name: "Training Dummy", hp: 3, maxHp: 3 },
    });
    const counted = createEngine(fixtureContent, seededRng(11), combatSaved);
    let realKills = 0;
    let realDeaths = 0;
    counted.on("kill", () => (realKills += 1));
    counted.on("death", () => (realDeaths += 1));
    for (let i = 0; i < 2_000; i++) counted.tick();

    const pumped = createEngine(fixtureContent, seededRng(11), combatSaved);
    const summary = pumpOffline(pumped, 2_000);

    expect(summary.kills).toBe(realKills);
    expect(summary.deaths).toBe(realDeaths);
    expect(summary.kills).toBeGreaterThan(0); // the Training Dummy dies fast (3 HP) — sanity check
  });

  it("records each levelled-up Skill once, in first-crossed order, with its post-pump level", () => {
    const engine = createEngine(
      fixtureContent,
      seededRng(5),
      makeSnapshot({ fishing: { spotId: "pond", name: "Test Pond" } }),
    );
    const summary = pumpOffline(engine, OFFLINE_CAP_TICKS); // plenty of Catches to level up repeatedly
    expect(summary.levelUps.map(({ skill }) => skill)).toEqual(["fishing"]);
    expect(summary.levelUps).toEqual(
      summary.levelUps.map(({ skill }) => ({
        skill,
        level: engine.snapshot().player.skills[skill].level,
      })),
    );
  });

  it("stops attributing events to the summary once the pump has returned", () => {
    const engine = fishingEngine(9);
    const summary = pumpOffline(engine, 100);
    const ticksAfter = summary.ticks;
    engine.tick(); // a "live" Tick after the pump — must not retroactively change the summary
    expect(summary.ticks).toBe(ticksAfter);
  });

  it("a full 48 000-Tick (8h) pump completes well under a second", () => {
    const engine = createEngine(
      fixtureContent,
      seededRng(1),
      makeSnapshot({ monster: { id: "dummy", name: "Training Dummy", hp: 3, maxHp: 3 } }),
    );
    const start = Date.now();
    const summary = pumpOffline(engine, OFFLINE_CAP_TICKS);
    const elapsed = Date.now() - start;
    expect(summary.ticks).toBe(OFFLINE_CAP_TICKS);
    expect(elapsed).toBeLessThan(1_000);
  });
});

describe("formatAwayDuration", () => {
  it("renders capped pumps as '8h+' regardless of the actual elapsed ms", () => {
    expect(formatAwayDuration(999_999_999, true)).toBe("8h+");
  });

  it("renders under a minute as '<1m'", () => {
    expect(formatAwayDuration(30_000, false)).toBe("<1m");
  });

  it("renders whole minutes under an hour", () => {
    expect(formatAwayDuration(90_000, false)).toBe("1m");
    expect(formatAwayDuration(59 * 60_000, false)).toBe("59m");
  });

  it("renders hours, with minutes only when non-zero", () => {
    expect(formatAwayDuration(60 * 60_000, false)).toBe("1h");
    expect(formatAwayDuration(90 * 60_000, false)).toBe("1h 30m");
  });
});

describe("buildAwayCard", () => {
  it("returns null when zero Ticks were pumped", () => {
    const summary = { ticks: 0, kills: 0, levelUps: [], deaths: 0, goldDelta: 0, xpDelta: 0 };
    expect(buildAwayCard(summary, 0, false)).toBeNull();
  });

  it("returns null when Ticks pumped but nothing notable happened (nothing was selected)", () => {
    const summary = {
      ticks: 500,
      kills: 0,
      levelUps: [],
      deaths: 0,
      goldDelta: 0,
      xpDelta: 0,
    };
    expect(buildAwayCard(summary, 300_000, false)).toBeNull();
  });

  it("builds ordered lines for kills, levels, gold, XP, and deaths when notable", () => {
    const summary = {
      ticks: 6_000,
      kills: 12,
      levelUps: [
        { skill: "strength" as const, level: 43 },
        { skill: "hitpoints" as const, level: 11 },
      ],
      deaths: 2,
      goldDelta: 60,
      xpDelta: 480,
    };
    expect(buildAwayCard(summary, 60 * 60_000, false)).toEqual({
      heading: "While you were away (1h)",
      lines: [
        "⚔ 12 kills",
        "⭐ Strength → 43 · Hitpoints → 11",
        "🪙 +60g",
        "✨ +480 xp",
        "💀 2 deaths",
      ],
    });
  });

  it("is notable on gold/XP delta alone, even with no kills/level-ups/deaths (e.g. Smithing)", () => {
    const summary = {
      ticks: 300,
      kills: 0,
      levelUps: [],
      deaths: 0,
      goldDelta: 0,
      xpDelta: 50,
    };
    expect(buildAwayCard(summary, 180_000, false)).not.toBeNull();
  });

  it("shows the capped '8h+' duration when the pump hit OFFLINE_CAP_TICKS", () => {
    const summary = {
      ticks: OFFLINE_CAP_TICKS,
      kills: 1,
      levelUps: [],
      deaths: 0,
      goldDelta: 5,
      xpDelta: 12,
    };
    expect(buildAwayCard(summary, 999_999_999, true)?.heading).toContain("8h+");
  });
});

describe("showAwayCard", () => {
  afterEach(() => vi.useRealTimers());

  function rootWithToastContainer(): HTMLElement {
    const root = document.createElement("main");
    root.innerHTML = '<div id="toast-container"></div>';
    return root;
  }

  const model = {
    heading: "While you were away (6h 12m)",
    lines: ["⚔ 45 kills", "⭐ Attack → 43 · Magic → 11", "🪙 +1240g", "✨ +5020 xp", "💀 2 deaths"],
  };

  it("renders the heading, dismiss button, and a paragraph for every line", () => {
    const root = rootWithToastContainer();
    showAwayCard(root, model);

    const card = root.querySelector<HTMLElement>(".away-card");
    expect(card).not.toBeNull();
    expect(card?.querySelector(".away-card-heading")?.textContent).toContain(model.heading);
    expect(card?.querySelector<HTMLButtonElement>(".away-card-dismiss")?.title).toBe("Dismiss");
    expect(
      [...(card?.querySelectorAll(".away-card-line") ?? [])].map((line) => line.textContent),
    ).toEqual(model.lines);
  });

  it("removes the card immediately on click and clears its pending timer", () => {
    vi.useFakeTimers();
    const root = rootWithToastContainer();
    showAwayCard(root, model);
    const card = root.querySelector<HTMLElement>(".away-card");
    card?.click();
    expect(root.querySelector(".away-card")).toBeNull();
    expect(() => vi.advanceTimersByTime(15_000)).not.toThrow();
  });

  it("auto-dismisses after the configured delay and tolerates a subsequent click", () => {
    vi.useFakeTimers();
    const root = rootWithToastContainer();
    showAwayCard(root, model, 15_000);
    const card = root.querySelector<HTMLElement>(".away-card");
    vi.advanceTimersByTime(15_000);
    expect(root.querySelector(".away-card")).toBeNull();
    expect(() => card?.click()).not.toThrow();
  });
});
