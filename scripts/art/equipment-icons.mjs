import { writeIcon } from "./icon-canvas.mjs";
import { P, zonePalettes, metalTiers, gemTiers } from "./palettes.mjs";

/** Equipment icon redraw (#143): 47 weapon/armour/jewelry icons painted with the shared original-
 * art pipeline (#139). The core rule this file exists to satisfy: ONE metal-tier palette
 * (`metalTiers` in palettes.mjs) used identically across every weapon and armour class, so the
 * bronze->iron->steel->mithril progression reads as the same ladder everywhere; within a class,
 * every tier shares one base silhouette (geometry is parameterized by tier, never re-drawn per
 * tier). `shade-blade` breaks the metal ramp deliberately (crypt sub-palette, its own drop
 * theme). Jewelry uses `gemTiers`, sampled from the existing `sapphire`/`emerald`/`ruby` Material
 * icons so the gem identity matches across Items (see docs/assets.md). */

const town = zonePalettes.town;
const crypt = zonePalettes.crypt;

function block(canvas, x0, y0, x1, y1, fill, outline = P.ink) {
  canvas.rect(x0 - 1, y0 - 1, x1 + 1, y1 + 1, outline);
  canvas.rect(x0, y0, x1, y1, fill);
}

function disc(canvas, cx, cy, r, fill, outline = P.ink) {
  canvas.circle(cx, cy, r + 1, outline);
  canvas.circle(cx, cy, r, fill);
}

/** A tapered blade: outline pass first (avoids stacking ink into a solid dark point, the same fix
 * #164's shield/heart sheet sweep used), then shadow/base/highlight columns left-to-right so the
 * blade reads as one shaded surface. Shared by dagger/sword/shade-blade — only the tier ramp,
 * height, and taper differ per class, so every blade class reads as the same construction. */
function taperedBlade(c, cx, yTop, yBottom, wTop, wBottom, ramp) {
  for (let y = yTop; y <= yBottom; y++) {
    const t = (y - yTop) / (yBottom - yTop);
    const half = Math.round(wTop + (wBottom - wTop) * t);
    c.rect(cx - half - 1, y, cx + half + 1, y, P.ink);
  }
  for (let y = yTop; y <= yBottom; y++) {
    const t = (y - yTop) / (yBottom - yTop);
    const half = Math.max(1, Math.round(wTop + (wBottom - wTop) * t));
    c.rect(cx - half, y, cx + half, y, ramp.shadow);
    if (half >= 1) c.rect(cx - half + 1, y, cx + half, y, ramp.base);
    c.plot(cx + half, y, ramp.highlight);
  }
}

/** Dagger silhouette: short, wide, stubby blade + narrow guard. `bronze-dagger`, `iron-dagger`,
 * `steel-dagger`, `mithril-dagger` all call this with the same geometry, only `tier` differs, so
 * the tier ladder reads identically. */
function paintDagger(c, tier) {
  taperedBlade(c, 16, 4, 17, 0, 3, tier);
  block(c, 12, 18, 20, 19, tier.shadow);
  block(c, 15, 20, 17, 27, P.umber);
  disc(c, 16, 29, 2, P.umber);
}

/** Sword silhouette: long, narrow blade + a wide flared crossguard — the crossguard's flare (vs.
 * the dagger's narrow one) is the deliberate "differ at a glance" cue between the two classes. */
function paintSword(c, tier) {
  taperedBlade(c, 16, 3, 21, 0, 2, tier);
  block(c, 10, 22, 22, 23, tier.shadow);
  block(c, 15, 24, 17, 29, P.umber);
  disc(c, 16, 31, 1, P.umber);
}

/** Mace silhouette: flanged head (disc + four short spikes) on a haft — no blade at all, so it
 * reads as a distinct class from dagger/sword at a glance (round head vs. tapered edge). */
function paintMace(c, tier) {
  disc(c, 16, 10, 6, tier.base);
  c.thickLine(16, 1, 16, 4, 2, tier.shadow);
  c.thickLine(22, 10, 27, 10, 2, tier.shadow);
  c.thickLine(10, 10, 5, 10, 2, tier.shadow);
  c.plot(13, 7, tier.highlight);
  c.plot(13, 8, tier.highlight);
  c.thickLine(16, 16, 16, 30, 2, P.umber);
  disc(c, 16, 31, 1, P.umber);
}

/** Bow silhouette: a curved wood limb (belly bulging left) + a straight string closing the D-shape
 * at the tips, with a small tier-tinted fitting at each nock — the issue's "tier ladder only at
 * bow limbs/tips" rule (the limb itself stays wood-toned every tier). `shortbow` (the untiered
 * starter bow) uses the bronze tier. */
function paintBow(c, tier) {
  for (let y = 3; y <= 30; y++) {
    const t = (y - 3) / 27;
    const bow = Math.round(9 * Math.sin(t * Math.PI));
    c.plot(16 - bow, y, P.umber);
    c.plot(17 - bow, y, P.sand);
  }
  c.line(16, 3, 16, 30, P.cream);
  disc(c, 16, 3, 1, tier.base);
  disc(c, 16, 30, 1, tier.base);
}

/** Staff silhouette: a plain shaft topped by a two-tone orb — the orb carries the whole tier
 * ladder (the shaft stays wood every tier), matching the bow's "tier only at the metal fitting"
 * treatment. `apprentice-staff` (the untiered starter staff) uses the bronze tier. */
function paintStaff(c, tier) {
  c.circle(16, 8, 5, P.ink);
  c.circle(16, 8, 4, tier.shadow);
  c.circle(16, 8, 3, tier.base);
  c.plot(14, 6, tier.highlight);
  c.thickLine(16, 12, 16, 30, 2, P.umber);
}

/** Ammo silhouette: diagonal shaft, a tier-tinted head at one end, pale fletching at the other —
 * shared by all three arrow tiers (no iron-arrow tier exists in this issue's list). */
function paintArrow(c, tier) {
  c.thickLine(6, 29, 27, 6, 2, P.sand);
  block(c, 27, 4, 30, 7, tier.base);
  c.rect(27, 6, 28, 7, tier.shadow);
  c.thickLine(3, 31, 8, 27, 2, P.cream);
  c.thickLine(3, 27, 8, 31, 2, P.cream);
}

/** Chainbody silhouette: a tapered torso with a dotted chain-link texture — shared by iron/steel/
 * mithril (no bronze chainbody exists in this issue's list). */
function paintChainbody(c, tier) {
  for (let y = 4; y <= 30; y++) {
    const t = (y - 4) / 26;
    const half = Math.round(11 - 3 * t);
    c.rect(16 - half - 1, y, 16 + half + 1, y, P.ink);
  }
  for (let y = 4; y <= 30; y++) {
    const t = (y - 4) / 26;
    const half = Math.max(1, Math.round(11 - 3 * t));
    c.rect(16 - half, y, 16 + half, y, tier.base);
  }
  for (let y = 8; y <= 26; y += 3) for (let x = 10; x <= 22; x += 3) c.plot(x, y, tier.shadow);
  c.rect(13, 4, 19, 5, tier.highlight);
}

/** Full-helm silhouette: a domed head + neck guard with a T-slit visor — shared by iron/steel/
 * mithril (no bronze full-helm exists in this issue's list). */
function paintFullHelm(c, tier) {
  disc(c, 16, 12, 10, tier.base);
  block(c, 9, 22, 24, 29, tier.shadow);
  c.thickLine(16, 6, 16, 20, 2, P.ink);
  c.thickLine(10, 14, 23, 14, 2, P.ink);
  c.line(8, 6, 8, 12, tier.highlight);
}

/** Kite-shield silhouette: flat-topped body tapering to a point (the same construction #164's
 * `skill-defence` heater shield uses — outline drawn as its own pass, not per-row `block()`, to
 * avoid stacking ink into a solid dark point). Shared by `bronze-shield` (the untiered starter
 * shield) and iron/steel/mithril kiteshield. */
function paintKiteshield(c, tier) {
  const top = 4,
    bottom = 30,
    topHalf = 10;
  for (let y = top; y <= bottom; y++) {
    const t = (y - top) / (bottom - top);
    const half = Math.round(topHalf * (1 - t));
    c.rect(16 - half - 1, y, 16 + half + 1, y, P.ink);
  }
  for (let y = top; y <= bottom; y++) {
    const t = (y - top) / (bottom - top);
    const half = Math.max(1, Math.round(topHalf * (1 - t)));
    c.rect(16 - half, y, 16 + half, y, tier.base);
  }
  disc(c, 16, 13, 3, tier.shadow);
  c.line(16, 6, 16, 10, tier.highlight);
}

/** Leather/hard-leather torso, legs, and hood silhouettes share one light-tan (leather) or dark-
 * studded (hard-leather) ramp instead of the metal tier ramp — the issue's "hard-leather reads
 * visibly tougher: darker + studs" rule, kept as the existing placeholder intent. */
const leatherRamp = { shadow: "#6b3d1f", base: "#b46d42", highlight: "#d9955a" };
const hardLeatherRamp = { shadow: "#1c1008", base: "#4a3018", highlight: "#7a5030" };

function paintLeatherBody(c, ramp, studded) {
  for (let y = 4; y <= 30; y++) {
    const t = (y - 4) / 26;
    const half = Math.round(10 - 2 * t);
    c.rect(16 - half - 1, y, 16 + half + 1, y, P.ink);
  }
  for (let y = 4; y <= 30; y++) {
    const t = (y - 4) / 26;
    const half = Math.max(1, Math.round(10 - 2 * t));
    c.rect(16 - half, y, 16 + half, y, ramp.base);
  }
  c.thickLine(16, 6, 16, 28, 2, ramp.shadow);
  c.line(10, 7, 10, 12, ramp.highlight);
  if (studded) for (let y = 9; y <= 25; y += 5) for (const x of [11, 21]) c.plot(x, y, P.sand);
}

function paintLeatherLegs(c, ramp, studded) {
  block(c, 10, 3, 23, 9, ramp.base);
  for (let y = 10; y <= 30; y++) c.rect(9, y, 14, y, ramp.base);
  for (let y = 10; y <= 30; y++) c.rect(19, y, 24, y, ramp.base);
  c.rectOutline(9, 10, 14, 30, P.ink);
  c.rectOutline(19, 10, 24, 30, P.ink);
  c.thickLine(11, 12, 11, 28, 2, ramp.shadow);
  c.thickLine(21, 12, 21, 28, 2, ramp.highlight);
  if (studded) for (let y = 13; y <= 25; y += 6) for (const x of [11, 21]) c.plot(x, y, P.sand);
}

function paintLeatherHood(c, ramp, studded) {
  disc(c, 16, 12, 10, ramp.base);
  block(c, 9, 22, 24, 30, ramp.base);
  c.line(8, 8, 8, 14, ramp.highlight);
  c.thickLine(16, 12, 16, 25, 2, ramp.shadow);
  if (studded)
    for (const [x, y] of [
      [10, 10],
      [23, 10],
      [10, 22],
      [23, 22],
    ])
      c.plot(x, y, P.sand);
}

/** Gem-diamond silhouette: a rhombus with a highlight top half, shadow bottom half, and a single
 * base-color center pixel — reused by every gem tier so the amulet/ring pair for a given gem
 * shares one shape (the "one-gem-shape-per-tier" convention). */
function paintGemShape(c, cx, cy, r, gem) {
  for (let dy = -r; dy <= r; dy++) {
    const half = r - Math.abs(dy);
    c.rect(cx - half - 1, cy + dy, cx + half + 1, cy + dy, gem.ink);
  }
  for (let dy = -r; dy <= r; dy++) {
    const half = r - Math.abs(dy);
    if (half < 0) continue;
    c.rect(cx - half, cy + dy, cx + half, cy + dy, dy <= 0 ? gem.highlight : gem.shadow);
  }
  c.plot(cx, cy, gem.base);
}

function paintAmulet(c, gem) {
  paintGemShape(c, 16, 21, 8, gem);
  for (let x = 5; x <= 27; x++) {
    const t = (x - 5) / 22;
    const y = 3 + Math.round(8 * Math.sin(t * Math.PI));
    c.plot(x, y, P.sand);
    c.plot(x, y + 1, P.sand);
  }
  c.thickLine(16, 10, 16, 13, 2, P.sand);
}

function paintRing(c, gem) {
  paintGemShape(c, 16, 10, 6, gem);
  for (let x = 6; x <= 26; x++) {
    const t = (x - 6) / 20;
    const y = 20 + Math.round(9 * Math.sin(t * Math.PI));
    c.plot(x, y, P.sand);
    c.plot(x, y + 1, P.sand);
    c.plot(x, y + 2, P.sand);
  }
  c.thickLine(16, 16, 16, 28, 2, P.sand);
}

/** Goblin-charm: a curved fang/tooth pendant on a draped cord with a small bead — original design
 * (not a recolored gem or metal-tier shape), built entirely from already-pinned master-ramp and
 * `town` zone-palette colors, so no new hex value is introduced. */
function paintGoblinCharm(c) {
  for (let x = 5; x <= 27; x++) {
    const t = (x - 5) / 22;
    const y = 3 + Math.round(5 * Math.sin(t * Math.PI));
    c.plot(x, y, P.umber);
    c.plot(x, y + 1, P.umber);
  }
  for (let y = 9; y <= 30; y++) {
    const t = (y - 9) / 21;
    const half = Math.max(1, Math.round(5 * (1 - t * 0.6)));
    const bend = Math.round(2 * Math.sin(t * Math.PI));
    c.rect(16 - half + bend - 1, y, 16 + half + bend + 1, y, P.ink);
  }
  for (let y = 9; y <= 30; y++) {
    const t = (y - 9) / 21;
    const half = Math.max(1, Math.round(5 * (1 - t * 0.6)));
    const bend = Math.round(2 * Math.sin(t * Math.PI));
    c.rect(16 - half + bend, y, 16 + half + bend, y, P.parchment);
  }
  c.line(14, 12, 14, 25, P.sand);
  c.thickLine(16, 6, 16, 10, 2, P.umber);
  disc(c, 22, 6, 1, town[3]);
}

const tiers = ["bronze", "iron", "steel", "mithril"];

/** Every equipment icon (#143): filenames match `ItemDef.icon` exactly, so `src/ui/icons.ts` and
 * every `ItemDef` need zero code changes (bytes-only swap). */
export const equipmentIcons = [
  // --- Weapons (24) ---
  ...tiers.map((t) => ({ name: `${t}-dagger`, paint: (c) => paintDagger(c, metalTiers[t]) })),
  ...tiers.map((t) => ({ name: `${t}-sword`, paint: (c) => paintSword(c, metalTiers[t]) })),
  ...tiers.map((t) => ({ name: `${t}-mace`, paint: (c) => paintMace(c, metalTiers[t]) })),
  { name: "shortbow", paint: (c) => paintBow(c, metalTiers.bronze) },
  { name: "iron-shortbow", paint: (c) => paintBow(c, metalTiers.iron) },
  { name: "steel-shortbow", paint: (c) => paintBow(c, metalTiers.steel) },
  { name: "mithril-shortbow", paint: (c) => paintBow(c, metalTiers.mithril) },
  { name: "apprentice-staff", paint: (c) => paintStaff(c, metalTiers.bronze) },
  { name: "iron-staff", paint: (c) => paintStaff(c, metalTiers.iron) },
  { name: "steel-staff", paint: (c) => paintStaff(c, metalTiers.steel) },
  { name: "mithril-staff", paint: (c) => paintStaff(c, metalTiers.mithril) },
  {
    name: "shade-blade",
    paint(c) {
      // Crypt sub-palette instead of the metal-tier ramp — the wraith-boss drop, per the issue.
      taperedBlade(c, 16, 3, 21, 0, 2, {
        shadow: crypt[1],
        base: crypt[3],
        highlight: crypt[4],
      });
      block(c, 10, 22, 22, 23, crypt[1]);
      block(c, 15, 24, 17, 29, crypt[0]);
      disc(c, 16, 31, 1, crypt[0]);
    },
  },
  { name: "bronze-arrow", paint: (c) => paintArrow(c, metalTiers.bronze) },
  { name: "steel-arrow", paint: (c) => paintArrow(c, metalTiers.steel) },
  { name: "mithril-arrow", paint: (c) => paintArrow(c, metalTiers.mithril) },

  // --- Armour (16) ---
  ...["iron", "steel", "mithril"].map((t) => ({
    name: `${t}-chainbody`,
    paint: (c) => paintChainbody(c, metalTiers[t]),
  })),
  ...["iron", "steel", "mithril"].map((t) => ({
    name: `${t}-full-helm`,
    paint: (c) => paintFullHelm(c, metalTiers[t]),
  })),
  { name: "bronze-shield", paint: (c) => paintKiteshield(c, metalTiers.bronze) },
  { name: "iron-kiteshield", paint: (c) => paintKiteshield(c, metalTiers.iron) },
  { name: "steel-kiteshield", paint: (c) => paintKiteshield(c, metalTiers.steel) },
  { name: "mithril-kiteshield", paint: (c) => paintKiteshield(c, metalTiers.mithril) },
  { name: "leather-body", paint: (c) => paintLeatherBody(c, leatherRamp, false) },
  { name: "leather-chaps", paint: (c) => paintLeatherLegs(c, leatherRamp, false) },
  { name: "leather-coif", paint: (c) => paintLeatherHood(c, leatherRamp, false) },
  { name: "hard-leather-body", paint: (c) => paintLeatherBody(c, hardLeatherRamp, true) },
  { name: "hard-leather-chaps", paint: (c) => paintLeatherLegs(c, hardLeatherRamp, true) },
  { name: "hard-leather-coif", paint: (c) => paintLeatherHood(c, hardLeatherRamp, true) },

  // --- Jewelry + accessory (7) ---
  { name: "sapphire-amulet", paint: (c) => paintAmulet(c, gemTiers.sapphire) },
  { name: "emerald-amulet", paint: (c) => paintAmulet(c, gemTiers.emerald) },
  { name: "ruby-amulet", paint: (c) => paintAmulet(c, gemTiers.ruby) },
  { name: "sapphire-ring", paint: (c) => paintRing(c, gemTiers.sapphire) },
  { name: "emerald-ring", paint: (c) => paintRing(c, gemTiers.emerald) },
  { name: "ruby-ring", paint: (c) => paintRing(c, gemTiers.ruby) },
  { name: "goblin-charm", paint: (c) => paintGoblinCharm(c) },
];

/** Writes every icon in `equipmentIcons` to `src/assets/icons/<name>.png` — called by
 * `scripts/art/generate.mjs` as part of `npm run art`, alongside `writeIcons` (#131 skill/tab
 * icons). */
export async function writeEquipmentIcons(destDir) {
  for (const { name, paint } of equipmentIcons) {
    await writeIcon(`${destDir}/${name}.png`, paint);
  }
}
