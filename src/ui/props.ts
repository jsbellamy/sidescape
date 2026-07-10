import type { Snapshot } from "../core/types";

/**
 * Foreground-prop registry (#80): which activity gets a prop beside the player sprite, and which
 * one. A prop follows the ACTIVITY (unlike the backdrop Theme, which follows the AREA — see
 * theme.ts), keyed off `production.skill` since #113 made production multi-skill — Smithing gets
 * its anvil, Cooking (#115) gets a range/campfire, Crafting (#116) gets a workbench/tanning rack,
 * Herblore (#118) gets a cauldron. Combat needs no prop (the Monster IS the foreground, per the
 * owner framing); Fishing has no CC0/hand-built prop yet, so it's skipped rather than shipping a
 * placeholder.
 *
 * Returns a `prop-<key>` CSS class suffix (see styles.css), or null for "no prop this activity".
 */
export function resolveProp(snap: Snapshot): string | null {
  if (snap.production?.skill === "smithing") return "anvil";
  if (snap.production?.skill === "cooking") return "cooking";
  if (snap.production?.skill === "crafting") return "crafting";
  if (snap.production?.skill === "herblore") return "cauldron";
  return null;
}
