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

/** Material ramps used by close-up UI icons. Zone palettes establish atmosphere; these ramps
 * establish readable steel, water/scale, and gold volume at 34x34 without gradients. */
export const materialPalettes = {
  steel: ["#59636d", "#8d99a3", "#c4ccd1", "#eef2f2"],
  water: ["#4f7f9f", "#72a7cc", "#9bc9e3", "#c6e4f2"],
  gold: ["#8f5b00", "#d49b00", "#f0bd36", "#ffe18a"],
};

/** `masterPalette` as a name -> hex lookup (e.g. `P.ink`, `P.accent`), for icon/sprite sources
 * that paint with the master ramp by name instead of re-spelling hex literals. */
export const P = Object.fromEntries(masterPalette);
