import { writeIcon } from "./icon-canvas.mjs";
import { P, zonePalettes } from "./palettes.mjs";

/** Draws a filled block with a 1px master-ramp outline in one call — the icon set's shared
 * "outline, base, one shadow, one highlight" pixel rule (docs/art-style.md) reduced to its most
 * common shape. Callers add extra shading strokes on top where a flat block would read too plain. */
function block(canvas, x0, y0, x1, y1, fill, outline = P.ink) {
  canvas.rect(x0 - 1, y0 - 1, x1 + 1, y1 + 1, outline);
  canvas.rect(x0, y0, x1, y1, fill);
}

/** Filled circle with a 1px outline ring, same "outline then inset fill" idea as `block` above,
 * for round silhouette parts (pommels, potion bulbs, coin stacks). */
function disc(canvas, cx, cy, r, fill, outline = P.ink) {
  canvas.circle(cx, cy, r + 1, outline);
  canvas.circle(cx, cy, r, fill);
}

const meadow = zonePalettes.meadow; // [sky, spring-green, mid-green, deep-green, forest-green, gold]
const crypt = zonePalettes.crypt; // [violet-lt, violet, violet-mid, violet-dk, bone, ink-violet]
const town = zonePalettes.town; // [dk-brown, brown, tan-brown, orange, lt-orange, blackish-brown]
const sewer = zonePalettes.sewer;

/**
 * The eleven Skill icons (one per `SKILL_NAMES` entry, #131) plus the six workspace/navigation
 * icons. Each entry's `paint` draws on the shared 34×34 icon canvas (`icon-canvas.mjs`) using only
 * colors already pinned by `docs/art-style.md` (master ramp + the five zone sub-palettes) — no new
 * hex values are introduced here, matching the master-palette discipline the style guide pins.
 */
export const icons = [
  // --- Skill icons (SKILL_NAMES order) ---
  {
    name: "skill-attack",
    paint(c) {
      // Sword: blade + crossguard + grip + pommel.
      block(c, 15, 4, 18, 21, P.cream);
      c.line(16, 5, 16, 20, P.sand);
      block(c, 10, 22, 23, 24, P.umber);
      block(c, 15, 25, 18, 29, P.outline);
      disc(c, 16.5, 30, 2, P.umber);
    },
  },
  {
    name: "skill-strength",
    paint(c) {
      // Flexed-arm silhouette: forearm rising into a fist/bicep bump.
      block(c, 10, 20, 15, 29, town[2]);
      block(c, 14, 10, 23, 21, town[3]);
      disc(c, 19, 12, 5, town[3]);
      c.line(16, 15, 22, 9, town[4]);
    },
  },
  {
    name: "skill-defence",
    paint(c) {
      // Heater shield: flat-topped body tapering to a point.
      block(c, 9, 6, 24, 20, meadow[2]);
      for (let y = 21; y <= 27; y++) {
        const inset = Math.round(((y - 20) / 7) * 7);
        block(c, 9 + inset, y, 24 - inset, y, meadow[2]);
      }
      c.line(16, 8, 16, 18, meadow[1]);
      c.line(17, 8, 17, 18, meadow[1]);
      disc(c, 16.5, 13, 2, meadow[5]);
    },
  },
  {
    name: "skill-hitpoints",
    paint(c) {
      // Heart: two lobes + a point, warm-dark tones (no true red in the pinned palette).
      disc(c, 12, 12, 5, town[3]);
      disc(c, 21, 12, 5, town[3]);
      for (let y = 14; y <= 27; y++) {
        const half = Math.round((27 - y) * 0.55) + 2;
        block(c, 17 - half, y, 16 + half, y, town[3]);
      }
      c.line(9, 9, 13, 6, town[4]);
    },
  },
  {
    name: "skill-fishing",
    paint(c) {
      // Fish: oval body + tail fin + eye.
      c.circle(15, 17, 8, P.ink);
      c.circle(15, 17, 7, meadow[0]);
      c.line(23, 10, 29, 5, P.ink);
      c.line(23, 24, 29, 29, P.ink);
      c.line(23, 17, 29, 17, P.ink);
      c.rect(22, 12, 27, 22, meadow[0]);
      disc(c, 11, 15, 1, P.ink);
      c.line(9, 20, 15, 22, meadow[1]);
    },
  },
  {
    name: "skill-smithing",
    paint(c) {
      // Hammer over an anvil hint: hammer head + haft.
      block(c, 8, 8, 18, 14, P.sand);
      c.line(9, 9, 17, 9, P.parchment);
      block(c, 16, 15, 19, 27, P.umber);
      block(c, 12, 26, 25, 30, P.outline);
      c.plot(23, 12, town[3]);
      c.plot(24, 13, town[3]);
      c.plot(22, 15, town[3]);
    },
  },
  {
    name: "skill-ranged",
    paint(c) {
      // Recurve bow with drawn string + nocked arrow.
      for (let y = 4; y <= 29; y++) {
        const bow = Math.round(9 * Math.sin(((y - 4) / 25) * Math.PI));
        c.plot(16 - bow, y, P.umber);
        c.plot(17 - bow, y, P.sand);
      }
      c.line(16, 4, 8, 16, P.cream);
      c.line(8, 16, 16, 29, P.cream);
      c.line(6, 16, 27, 16, P.sand);
      c.line(20, 16, 27, 16, P.ink);
    },
  },
  {
    name: "skill-magic",
    paint(c) {
      // Staff with a glinting orb.
      c.line(12, 8, 24, 29, P.ink);
      c.line(13, 8, 25, 29, P.umber);
      disc(c, 13, 8, 4, crypt[2]);
      c.plot(12, 6, crypt[4]);
      c.plot(14, 6, crypt[4]);
      c.plot(13, 5, P.glint);
    },
  },
  {
    name: "skill-cooking",
    paint(c) {
      // Flame silhouette.
      for (let y = 6; y <= 28; y++) {
        const t = (y - 6) / 22;
        const width = Math.round(9 * Math.sin(t * Math.PI) + 1);
        block(c, 17 - width, y, 17 + width, y, town[3]);
      }
      for (let y = 12; y <= 25; y++) {
        const t = (y - 12) / 13;
        const width = Math.max(1, Math.round(4 * Math.sin(t * Math.PI)));
        c.rect(17 - width, y, 17 + width, y, town[4]);
      }
    },
  },
  {
    name: "skill-crafting",
    paint(c) {
      // Needle + eye + thread stitch.
      c.line(8, 26, 26, 8, P.sand);
      c.line(9, 26, 27, 8, P.ink);
      disc(c, 8, 26, 2, P.ink);
      c.line(20, 14, 24, 10, P.cream);
      c.line(10, 21, 14, 25, sewer[3]);
      c.line(13, 18, 17, 22, sewer[3]);
    },
  },
  {
    name: "skill-herblore",
    paint(c) {
      // Herb sprig: stem + leaves, meadow-green tier.
      c.line(17, 28, 17, 10, P.umber);
      c.line(17, 22, 10, 15, meadow[3]);
      c.line(17, 22, 10, 15, meadow[2]);
      c.line(17, 16, 24, 9, meadow[3]);
      c.line(17, 16, 24, 9, meadow[2]);
      c.circle(17, 8, 3, meadow[1]);
      block(c, 12, 26, 22, 29, P.outline);
    },
  },
  // --- Workspace/navigation icons ---
  {
    name: "tab-world",
    paint(c) {
      // Compass: circle rim + N/S/E/W needle diamond.
      c.circle(16.5, 16.5, 12, P.ink);
      c.circle(16.5, 16.5, 11, meadow[4]);
      c.circle(16.5, 16.5, 8, P.outline);
      c.line(16, 6, 16, 27, meadow[5]);
      c.line(6, 16, 27, 16, meadow[5]);
      disc(c, 16.5, 16.5, 3, town[3]);
    },
  },
  {
    name: "tab-skills",
    paint(c) {
      // Open-book silhouette (Skills panel).
      block(c, 6, 10, 16, 26, P.cream);
      block(c, 17, 10, 27, 26, P.cream);
      c.line(16, 10, 16, 26, P.sand);
      c.line(17, 10, 17, 26, P.sand);
      c.line(9, 14, 14, 14, P.outline);
      c.line(9, 18, 14, 18, P.outline);
      c.line(19, 14, 24, 14, P.outline);
      c.line(19, 18, 24, 18, P.outline);
    },
  },
  {
    name: "tab-character",
    paint(c) {
      // Person silhouette: head + shoulders.
      disc(c, 16.5, 11, 5, P.cream);
      block(c, 8, 18, 25, 28, P.cream);
      for (let x = 8; x <= 25; x++) {
        const y0 = 18 + Math.round(4 * Math.abs(Math.sin(((x - 8) / 17) * Math.PI)));
        c.plot(x, y0 - 1, P.ink);
      }
    },
  },
  {
    name: "tab-bank",
    paint(c) {
      // Coin stack: three overlapping discs.
      disc(c, 16.5, 24, 8, town[3]);
      disc(c, 16.5, 17, 8, town[4]);
      disc(c, 16.5, 10, 8, town[3]);
      c.circle(16.5, 10, 4, town[5]);
    },
  },
  {
    name: "tab-vendor",
    paint(c) {
      // Coin purse: rounded sack + drawstring tie.
      c.circle(16.5, 20, 10, P.ink);
      c.circle(16.5, 20, 9, P.umber);
      block(c, 13, 8, 20, 11, P.outline);
      disc(c, 16.5, 8, 2, town[3]);
      c.line(11, 20, 22, 20, town[4]);
    },
  },
  {
    name: "tab-loot",
    paint(c) {
      // Scroll: rolled ends + ruled lines.
      block(c, 9, 9, 24, 24, P.parchment);
      disc(c, 9, 9, 2, P.sand);
      disc(c, 9, 24, 2, P.sand);
      disc(c, 24, 9, 2, P.sand);
      disc(c, 24, 24, 2, P.sand);
      c.line(12, 13, 21, 13, sewer[1]);
      c.line(12, 17, 21, 17, sewer[1]);
      c.line(12, 21, 21, 21, sewer[1]);
    },
  },
];

/** Writes every icon in `icons` to `src/assets/icons/<name>.png` on the shared 34×34 canvas.
 * Called by `scripts/art/generate.mjs` as part of `npm run art`. */
export async function writeIcons(destDir) {
  for (const { name, paint } of icons) {
    await writeIcon(`${destDir}/${name}.png`, paint);
  }
}
