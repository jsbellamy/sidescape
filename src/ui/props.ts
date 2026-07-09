import type { Snapshot } from "../core/types";

/**
 * Foreground-prop registry (#80): which activity gets a prop beside the player sprite, and which
 * one. A prop follows the ACTIVITY (unlike the backdrop Theme, which follows the AREA — see
 * theme.ts) — this wave only registers Smithing's anvil, per the issue's scope. Combat needs no
 * prop (the Monster IS the foreground, per the owner framing); Fishing has no CC0/hand-built prop
 * yet, so it's skipped rather than shipping a placeholder. #76's production Skills
 * (cooking/crafting/herblore) each add one line here without reworking the scene.
 *
 * Returns a `prop-<key>` CSS class suffix (see styles.css), or null for "no prop this activity".
 */
export function resolveProp(snap: Snapshot): string | null {
  if (snap.smithing) return "anvil";
  return null;
}
