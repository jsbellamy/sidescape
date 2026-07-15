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
  // WARNING (learned the hard way while building this exact ramp): unlike materialPalettes,
  // zonePalettes has NO scoping allowlist — buildNamedPalette (trace-core.mjs) emits every
  // zonePalettes entry for EVERY icon/sprite build, unconditionally, regardless of that asset's
  // own `ramps`/SOURCE_RAMPS. Two "looks safe" heuristics both silently recolored committed
  // assets the moment `npm run art` ran (25 files on the first attempt, 7 on the second) — a
  // source-driven icon/sprite quantizes its own RAW, off-palette pixel color, which can sit
  // meaningfully farther from its CURRENT nearest named color than "distance to the nearest named
  // palette entry" assumes, so eyeballing distance from named colors alone is not sufficient. This
  // exact ramp was instead ground-truth verified: every quantization REPORT row (raw color, its
  // current nearest named ref, and that ref's exact distance) was collected across every
  // source-driven icon (via `rampsForSource`) and every sprite (via its own `ramps`) through the
  // real `buildNamedPalette`/`quantizeGrid` pipeline, and each hex below was confirmed farther
  // from every one of those raw colors than that color's own current nearest distance already is
  // (minimum safety margin ~5 RGB units, most 10+) — so none of them can win a cell they don't
  // already own. They land in the same cold blue-cyan family as the `rune` material ramp #252
  // added. After ANY future edit to this array, rerun `npm run art` and check
  // `git diff --name-status main...HEAD -- src/assets/` is empty of `M` entries before committing
  // — do not trust a green test suite alone (icon-assets.test.ts/sprite-assets.test.ts regenerate
  // and compare against the committed output, so they pass by construction even when the committed
  // output itself just silently drifted).
  glacier: ["#041437", "#0ea0ae", "#0d9fce", "#0e8ae9", "#2372f3", "#85aaf9"],
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
