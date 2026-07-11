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
export const ICON_LINT_EXEMPTIONS: Record<string, RuleId[]> = {
  "attack-potion": ["binary-alpha"],
  "bronze-arrow": ["margin"],
  "bronze-dagger": ["color-budget"],
  "bronze-shield": ["color-budget"],
  "bronze-sword": ["color-budget"],
  "cooked-meat": ["color-budget", "binary-alpha", "connected"],
  "cooked-pike": ["color-budget", "margin"],
  "cooked-shrimp": ["color-budget", "margin"],
  "cooked-trout": ["color-budget", "margin"],
  emerald: ["fill"],
  "emerald-amulet": ["connected"],
  "emerald-ring": ["fill"],
  "fishing-frog": ["color-budget", "fill", "connected"],
  "fishing-potion": ["binary-alpha"],
  "goblin-charm": ["margin"],
  "guam-herb": ["fill"],
  "harralander-herb": ["fill"],
  "iron-chainbody": ["color-budget"],
  "iron-dagger": ["color-budget"],
  "iron-kiteshield": ["color-budget"],
  "iron-shortbow": ["color-budget"],
  "iron-staff": ["margin"],
  "iron-sword": ["margin"],
  "kiln-cat": ["color-budget", "connected"],
  "marrentill-herb": ["fill"],
  "mithril-arrow": ["margin"],
  "mithril-chainbody": ["color-budget", "margin"],
  "mithril-dagger": ["color-budget", "fill"],
  "mithril-full-helm": ["color-budget", "margin"],
  "mithril-kiteshield": ["color-budget"],
  "mithril-shortbow": ["color-budget", "margin"],
  "mithril-staff": ["color-budget", "margin"],
  "mithril-sword": ["margin"],
  "production-potion": ["binary-alpha"],
  "raw-shrimp": ["connected"],
  "raw-trout": ["fill"],
  ruby: ["fill"],
  "ruby-amulet": ["connected"],
  "ruby-ring": ["fill"],
  sapphire: ["fill"],
  "sapphire-amulet": ["connected"],
  "sapphire-ring": ["fill"],
  "shade-blade": ["color-budget", "connected"],
  "shade-wisp": ["color-budget", "binary-alpha", "fill"],
  shortbow: ["color-budget"],
  "steel-arrow": ["margin"],
  "steel-chainbody": ["color-budget"],
  "steel-dagger": ["color-budget", "fill"],
  "steel-full-helm": ["color-budget"],
  "steel-kiteshield": ["color-budget"],
  "steel-shortbow": ["color-budget"],
  "steel-staff": ["color-budget", "margin"],
  "steel-sword": ["margin"],
  "strength-potion": ["binary-alpha"],
  "tarromin-herb": ["fill"],
};
