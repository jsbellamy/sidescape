import type { Engine } from "../core/engine";
import { SKILL_NAMES } from "../core/types";
import type { SkillName } from "../core/types";

/**
 * Offline progress cap (#69): the most away-time a reopen will ever simulate, in Ticks. Tuning,
 * not spec — the owner's grilled decision was "full simulation, 8 hours", so this is
 * 8h * 60m * 60s * 1000ms / 600ms-per-Tick = 48_000 Ticks, not a formula derived at runtime.
 */
export const OFFLINE_CAP_TICKS = 48_000;

/**
 * How many real Ticks to pump on reopen, given the Snapshot's `savedAt` and the current wall
 * clock: `floor(elapsed / tickMs)`, capped at OFFLINE_CAP_TICKS. Tolerant of everything a loaded
 * save might (not) have — a missing/non-numeric `savedAt` (pre-#69 save) or a `now` that's
 * somehow behind `savedAt` (clock skew) both yield 0 Ticks, never a throw or a negative pump.
 */
export function computeOfflineTicks(
  savedAt: number | null | undefined,
  now: number,
  tickMs: number,
): number {
  if (typeof savedAt !== "number" || !Number.isFinite(savedAt)) return 0;
  const elapsed = now - savedAt;
  if (elapsed <= 0) return 0;
  return Math.min(Math.floor(elapsed / tickMs), OFFLINE_CAP_TICKS);
}

/** One aggregate "while you were away" tally — everything `buildAwaySummaryToast` needs, and
 * nothing per-event: kills/level-ups/deaths are counted as they happen during the pump, while
 * gold/XP deltas are cleanest as a before/after Snapshot diff (a single pass, immune to
 * intermediate spends like auto-sold duplicates or Smithing material costs). */
export interface OfflineSummary {
  ticks: number;
  kills: number;
  /** Distinct Skills that leveled up at least once during the pump, in the order first crossed —
   * a level-up toast during normal play names the Skill, so the aggregate does too, without
   * spamming one entry per level gained. */
  levelUpSkills: SkillName[];
  deaths: number;
  goldDelta: number;
  xpDelta: number;
}

/**
 * Pumps `engine.tick()` exactly `ticks` times, aggregating what happened instead of letting any
 * per-event UI handler see it — the caller (main.ts) subscribes its normal Loot Feed/toast
 * handlers only AFTER this returns, but this also guards itself: the temporary collector stops
 * counting the moment the pump loop ends, so it never mis-attributes a later, real-time event to
 * the away-summary if it happens to still be subscribed (Engine has no `off`).
 */
export function pumpOffline(engine: Engine, ticks: number): OfflineSummary {
  let kills = 0;
  let deaths = 0;
  const levelUpSkills: SkillName[] = [];
  const seenSkills = new Set<SkillName>();
  let collecting = true;

  engine.on("kill", () => {
    if (collecting) kills += 1;
  });
  engine.on("death", () => {
    if (collecting) deaths += 1;
  });
  engine.on("levelup", (e) => {
    if (!collecting || seenSkills.has(e.skill)) return;
    seenSkills.add(e.skill);
    levelUpSkills.push(e.skill);
  });

  const before = engine.snapshot();
  for (let i = 0; i < ticks; i++) engine.tick();
  const after = engine.snapshot();
  collecting = false;

  const xpDelta = SKILL_NAMES.reduce(
    (sum, skill) => sum + (after.player.skills[skill].xp - before.player.skills[skill].xp),
    0,
  );

  return {
    ticks,
    kills,
    levelUpSkills,
    deaths,
    goldDelta: after.player.gold - before.player.gold,
    xpDelta,
  };
}

/** Humanizes an away duration for the summary toast; `capped` (the pump hit OFFLINE_CAP_TICKS)
 * always renders as "8h+" regardless of how much longer the player was actually away, since the
 * simulation itself stopped at 8h. Otherwise floors to whole minutes ("<1m" below one). */
export function formatAwayDuration(ms: number, capped: boolean): string {
  if (capped) return "8h+";
  const totalMinutes = Math.floor(ms / 60_000);
  if (totalMinutes < 1) return "<1m";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

/** Builds the one terse "while you were away" toast line, or `null` when there's nothing to show
 * (no Ticks pumped, or a pump that happened to do nothing notable — e.g. nothing was selected).
 * Order mirrors the acceptance criteria: duration, kills, level-ups, gold delta, XP delta, deaths
 * last (the rare, notable case). */
export function buildAwaySummaryToast(
  summary: OfflineSummary,
  awayMs: number,
  capped: boolean,
): string | null {
  if (summary.ticks === 0) return null;
  const notable =
    summary.kills > 0 ||
    summary.levelUpSkills.length > 0 ||
    summary.deaths > 0 ||
    summary.goldDelta !== 0 ||
    summary.xpDelta !== 0;
  if (!notable) return null;

  const parts = [`While you were away (${formatAwayDuration(awayMs, capped)}):`];
  if (summary.kills > 0) parts.push(`${summary.kills} kill${summary.kills === 1 ? "" : "s"}`);
  if (summary.levelUpSkills.length > 0) {
    parts.push(`level up: ${summary.levelUpSkills.join(", ")}`);
  }
  if (summary.goldDelta !== 0) {
    parts.push(`${summary.goldDelta > 0 ? "+" : ""}${summary.goldDelta}g`);
  }
  if (summary.xpDelta > 0) parts.push(`+${Math.round(summary.xpDelta)} xp`);
  if (summary.deaths > 0) parts.push(`${summary.deaths} death${summary.deaths === 1 ? "" : "s"}`);
  return parts.join(" · ");
}

/** Appends the away-summary toast to `root`'s `#toast-container`, auto-dismissing after
 * `dismissMs` — mirrors ui/app.ts's own `showLevelUpToast`, duplicated rather than imported since
 * that one is a private closure inside `mountApp`. Called once, after `mountApp` (so the
 * container exists) and after the pump (so this is the only toast the away-time ever produces). */
export function showAwaySummaryToast(root: ParentNode, text: string, dismissMs = 6000): void {
  const container = root.querySelector<HTMLElement>("#toast-container");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = text;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), dismissMs);
}
