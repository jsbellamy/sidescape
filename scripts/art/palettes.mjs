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
  // Frostspire (#254): the 5th Area's cold blues. Appended, never inserted or reordered.
  //
  // Zone palettes are scoped per asset through buildNamedPalette's `zoneNames`, just as material
  // palettes are scoped by `materialRampNames`. New entries can only affect a source that declares
  // the zone, but declaration order remains load-bearing for equal-distance quantization ties.
  glacier: ["#10263d", "#244763", "#4c718d", "#7f9eb3", "#b8cbd4", "#e8f0ed"],
  // Workshop interior (#434): warm timber / ember ramp for the shared Production backdrop.
  // Appended, never inserted or reordered — declaration order is load-bearing for quantization ties.
  workshop: ["#1c110b", "#3a1e12", "#6b3a1c", "#a85c28", "#d4a06a", "#e07a30"],
};

/** Material ramps used by close-up UI icons. Zone palettes establish atmosphere; these ramps
 * establish readable steel, water/scale, gold, blood-red, and ember-orange volume at 34x34
 * without gradients. Without `blood`/`ember`, quantization has no red or orange vocabulary at
 * all and pulls potions, hearts, and flames into the brown/gold ramps. Hexes are tuning. */
export const materialPalettes = {
  steel: { shadow: "#59636d", base: "#8d99a3", light: "#c4ccd1", glint: "#eef2f2" },
  water: { shadow: "#4f7f9f", base: "#72a7cc", light: "#9bc9e3", glint: "#c6e4f2" },
  gold: { shadow: "#8f5b00", base: "#d49b00", light: "#f0bd36", glint: "#ffe18a" },
  blood: { shadow: "#71201d", base: "#a53026", light: "#d05c47", glint: "#f1a58c" },
  ember: { shadow: "#8a3c12", base: "#c56a1e", light: "#e99a37", glint: "#ffcf6f" },
  // Gear Tier ladder, tiers 5/6 (#252): the two new material ramps the ladder's 5th/6th tier
  // needs — quantization can only speak the named-ramp vocabulary (docs/icon-gen.md), so these
  // must exist before any adamant/rune icon recolor is registered in icons.mjs.
  adamant: { shadow: "#2e3d2a", base: "#4c6b45", light: "#7a9c6e", glint: "#b8d9a8" },
  rune: { shadow: "#16505a", base: "#2a8a92", light: "#5fc4c9", glint: "#b8f2ec" },
  // Player original art (#264): the character sources have no vocabulary for lit flesh or worn
  // leather, so quantization pulled every face, hand, boot, belt, and strap into the master ramp's
  // sand/cream/umber browns — the single biggest reason a rendered character reads as mud. Unlike
  // zonePalettes, materialPalettes IS scoped per asset (writeSprites' materialRampNames,
  // icons.mjs' SOURCE_PALETTES), so an entry here can only reach a sprite/icon that names it;
  // appending these cannot touch the 16 existing sprites, none of which declare them.
  skin: { shadow: "#8a5a45", base: "#c08a68", light: "#e0b48f", glint: "#f2d8bb" },
  leather: { shadow: "#3f2a1c", base: "#6b452a", light: "#96683d", glint: "#c08f5a" },
  // Moss (#278, #264 follow-up): the player redraw's tunic has no green material vocabulary, so
  // quantization pulled it into the master ramp's shadow/umber browns instead. Scoped per asset
  // like skin/leather above, so it can only reach a sprite that names it. Cold, desaturated
  // olive-green steps in the same value/saturation family as the forest/meadow zone greens.
  moss: { shadow: "#2f3a1c", base: "#465825", light: "#657c37", glint: "#8ba054" },
};

/** `masterPalette` as a name -> hex lookup (e.g. `P.ink`, `P.accent`), for icon/sprite sources
 * that paint with the master ramp by name instead of re-spelling hex literals. */
export const P = Object.fromEntries(masterPalette);
