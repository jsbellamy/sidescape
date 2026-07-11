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
  "cooked-meat": ["binary-alpha", "connected"],
  "cooked-pike": ["margin"],
  "cooked-shrimp": ["margin"],
  "cooked-trout": ["margin"],
  emerald: ["fill"],
  "emerald-amulet": ["connected"],
  "emerald-ring": ["fill"],
  "fishing-frog": ["fill", "connected"],
  "fishing-potion": ["binary-alpha"],
  "goblin-charm": ["margin"],
  "guam-herb": ["fill"],
  "harralander-herb": ["fill"],
  "iron-staff": ["margin"],
  "iron-sword": ["margin"],
  "kiln-cat": ["connected"],
  "marrentill-herb": ["fill"],
  "mithril-arrow": ["margin"],
  "mithril-chainbody": ["margin"],
  "mithril-dagger": ["fill"],
  "mithril-full-helm": ["margin"],
  "mithril-shortbow": ["margin"],
  "mithril-staff": ["margin"],
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
  "shade-blade": ["connected"],
  "shade-wisp": ["binary-alpha", "fill"],
  "steel-arrow": ["margin"],
  "steel-dagger": ["fill"],
  "steel-staff": ["margin"],
  "steel-sword": ["margin"],
  "strength-potion": ["binary-alpha"],
  "tarromin-herb": ["fill"],
};
