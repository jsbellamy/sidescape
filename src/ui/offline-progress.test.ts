import { describe, expect, it } from "vitest";
import { createEngine } from "../core/engine";
import { fixtureContent } from "../core/fixture-content";
import { makeSnapshot } from "../core/make-snapshot";
import { seededRng } from "../core/rng";
import {
  buildAwaySummaryToast,
  computeOfflineTicks,
  formatAwayDuration,
  OFFLINE_CAP_TICKS,
  pumpOffline,
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

  it("records each Skill that leveled up only once, regardless of how many levels it gained", () => {
    const engine = createEngine(
      fixtureContent,
      seededRng(5),
      makeSnapshot({ fishing: { spotId: "pond", name: "Test Pond" } }),
    );
    const summary = pumpOffline(engine, OFFLINE_CAP_TICKS); // plenty of Catches to level up repeatedly
    const fishingCount = summary.levelUpSkills.filter((s) => s === "fishing").length;
    expect(fishingCount).toBeLessThanOrEqual(1);
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

describe("buildAwaySummaryToast", () => {
  it("returns null when zero Ticks were pumped", () => {
    const summary = { ticks: 0, kills: 0, levelUpSkills: [], deaths: 0, goldDelta: 0, xpDelta: 0 };
    expect(buildAwaySummaryToast(summary, 0, false)).toBeNull();
  });

  it("returns null when Ticks pumped but nothing notable happened (nothing was selected)", () => {
    const summary = {
      ticks: 500,
      kills: 0,
      levelUpSkills: [],
      deaths: 0,
      goldDelta: 0,
      xpDelta: 0,
    };
    expect(buildAwaySummaryToast(summary, 300_000, false)).toBeNull();
  });

  it("reports kills, level-ups, gold delta, XP delta, and deaths when notable", () => {
    const summary = {
      ticks: 6_000,
      kills: 12,
      levelUpSkills: ["strength" as const, "hitpoints" as const],
      deaths: 2,
      goldDelta: 60,
      xpDelta: 480,
    };
    const text = buildAwaySummaryToast(summary, 60 * 60_000, false);
    expect(text).toContain("1h");
    expect(text).toContain("12 kill");
    expect(text).toContain("strength, hitpoints");
    expect(text).toContain("+60g");
    expect(text).toContain("+480 xp");
    expect(text).toContain("2 deaths");
  });

  it("is notable on gold/XP delta alone, even with no kills/level-ups/deaths (e.g. Smithing)", () => {
    const summary = {
      ticks: 300,
      kills: 0,
      levelUpSkills: [],
      deaths: 0,
      goldDelta: 0,
      xpDelta: 50,
    };
    expect(buildAwaySummaryToast(summary, 180_000, false)).not.toBeNull();
  });

  it("shows the capped '8h+' duration when the pump hit OFFLINE_CAP_TICKS", () => {
    const summary = {
      ticks: OFFLINE_CAP_TICKS,
      kills: 1,
      levelUpSkills: [],
      deaths: 0,
      goldDelta: 5,
      xpDelta: 12,
    };
    expect(buildAwaySummaryToast(summary, 999_999_999, true)).toContain("8h+");
  });
});
