import type { RuleId } from "./icon-lint";

/** The icon legibility lint's ratcheting exemption baseline (issue #166). Each entry names an
 * icon (by its `src/assets/icons/<name>.png` stem) and the rules it currently fails — generated
 * from running the lint itself against today's assets, never hand-guessed.
 *
 * This list may only shrink:
 * - An icon NOT listed here for a rule must pass that rule.
 * - `icon-assets.test.ts` fails the suite if a listed icon now PASSES the rule it's exempted
 *   from ("stale exemption — delete this entry"), so fixing an icon forces removing its entry
 *   and the list can never silently regrow.
 *
 * Issue #164 emptied the `skill-*`/`tab-*` entries (all 17 icons redrawn to pass every rule);
 * #143/#144 must empty the rest (their bodies say so). No entries should ever be added by hand —
 * only removed as icons are redrawn clean. */
export const ICON_LINT_EXEMPTIONS: Record<string, RuleId[]> = {};
