/** Human-readable palette source for all generated original art. */
export const masterPalette = [
  ["bg", "#1a1410"],
  ["bg-panel", "#262019"],
  ["border", "#3d332a"],
  ["text", "#e8dcc8"],
  ["text-dim", "#9a8a72"],
  ["accent", "#d4a017"],
  ["ink", "#110d0a"],
  ["outline", "#292017"],
  ["shadow", "#4b3828"],
  ["umber", "#70503a"],
  ["parchment", "#f5ebcf"],
  ["cream", "#e6d4aa"],
  ["sand", "#c6ad79"],
  ["glint", "#fff8df"],
];
export const zonePalettes = {
  meadow: ["#86b6d8", "#cfe6a8", "#5f8a4f", "#3f6b3b", "#2c4a26", "#e7c65a"],
  forest: ["#233b39", "#3f5f50", "#567b5b", "#78945d", "#172b24", "#a7bf71"],
  sewer: ["#3a4136", "#59624b", "#7d8857", "#a5c64c", "#263027", "#c4d46b"],
  crypt: ["#241a33", "#3a2f4a", "#5c4c74", "#806b9c", "#d9d3bc", "#150f1c"],
  town: ["#4a2e1a", "#70421f", "#9c6331", "#c5823b", "#e2ad57", "#2b1b12"],
};

/** `masterPalette` as a name -> hex lookup (e.g. `P.ink`, `P.accent`), for icon/sprite sources
 * that paint with the master ramp by name instead of re-spelling hex literals. */
export const P = Object.fromEntries(masterPalette);

/** The equipment tier ramp (#143): one shadow/base/highlight triple per metal tier, used
 * IDENTICALLY across every weapon and armour class (daggers, swords, maces, bow tips, staff
 * fittings, arrowheads, chainbodies, helms, kiteshields) so the bronze->iron->steel->mithril
 * progression reads as the same ladder everywhere, per docs/art-style.md's "one metal-tier
 * palette" rule. Neither the master ramp (warm-dark neutrals) nor the zone sub-palettes
 * (Area backdrop themes) carry a metal identity, so this is the equipment redraw's own small,
 * fixed addition — never spelled out per-icon, always referenced from here. */
export const metalTiers = {
  bronze: { shadow: "#5c3018", base: "#a85c32", highlight: "#d9924a" },
  iron: { shadow: "#3f3f3f", base: "#787878", highlight: "#b8b8b8" },
  steel: { shadow: "#465662", base: "#8fa3b0", highlight: "#d3e2ea" },
  mithril: { shadow: "#263a56", base: "#4a6fa5", highlight: "#8fb8e8" },
};

/** Gem colors (#143), matching the existing `sapphire`/`emerald`/`ruby` Material icons' own
 * palette exactly (sampled from `src/assets/icons/*.png`) so jewelry reads as the same gem —
 * the companion #144 issue redraws the Material icons themselves under this same identity. */
export const gemTiers = {
  sapphire: { ink: "#0a143c", shadow: "#0f286e", base: "#1e50c8", highlight: "#6ea0ff" },
  emerald: { ink: "#052814", shadow: "#0a5028", base: "#1e9650", highlight: "#78e696" },
  ruby: { ink: "#3c050f", shadow: "#640a19", base: "#be1e32", highlight: "#ff7882" },
};
