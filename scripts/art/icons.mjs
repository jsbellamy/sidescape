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
      block(c, 9, 19, 15, 30, town[2]);
      block(c, 13, 9, 24, 21, town[3]);
      disc(c, 19.5, 12, 6, town[3]);
      c.thickLine(16, 16, 23, 8, 2, town[4]);
    },
  },
  {
    name: "skill-defence",
    paint(c) {
      // Heater shield: flat-topped body tapering to a point. The outline is drawn as its own
      // pass around the whole silhouette instead of via per-row block() calls, which stacked
      // outline ink into a near-solid dark point that sank into the panel (#164 sheet sweep).
      c.rect(8, 5, 25, 20, P.ink);
      c.rect(9, 6, 24, 20, meadow[2]);
      for (let y = 21; y <= 30; y++) {
        const inset = Math.round(((y - 20) / 10) * 8);
        c.rect(8 + inset, y, 25 - inset, y, P.ink);
        c.rect(9 + inset, y, 24 - inset, y, meadow[2]);
      }
      c.line(16, 8, 16, 18, meadow[1]);
      c.line(17, 8, 17, 18, meadow[1]);
      disc(c, 16.5, 13, 2, meadow[5]);
    },
  },
  {
    name: "skill-hitpoints",
    paint(c) {
      // Heart: two lobes + a point, warm-dark tones (no true red in the pinned palette). Outline
      // and fill are drawn as separate passes (not per-row block()) to avoid stacking outline
      // ink into a near-solid dark point at the base (#164 sheet sweep, same fix as the shield).
      disc(c, 12, 12, 6, town[3]);
      disc(c, 21, 12, 6, town[3]);
      for (let y = 13; y <= 30; y++) {
        const half = Math.round((30 - y) * 0.55) + 2;
        c.rect(17 - half - 1, y, 16 + half + 1, y, P.ink);
        c.rect(17 - half, y, 16 + half, y, town[3]);
      }
      c.line(9, 9, 13, 6, town[4]);
    },
  },
  {
    name: "skill-fishing",
    paint(c) {
      // Fish: oval body + tail fin (kept — the dominant fish already read well). The hook is
      // redrawn as one attached >=2px stroke instead of the prior 1px diagonal that read as
      // corner noise (#164).
      c.circle(16, 18, 9, P.ink);
      c.circle(16, 18, 8, meadow[0]);
      for (let x = 23; x <= 31; x++) {
        const half = Math.round(9 * (1 - (x - 23) / 8));
        c.rect(x, 18 - half, x, 18 + half, P.ink);
      }
      for (let x = 23; x <= 30; x++) {
        const half = Math.max(0, Math.round(9 * (1 - (x - 23) / 8)) - 1);
        c.rect(x, 18 - half, x, 18 + half, meadow[0]);
      }
      disc(c, 12, 16, 1, P.ink);
      c.thickLine(6, 9, 6, 17, 2, meadow[1]);
      c.thickLine(6, 17, 9, 20, 2, meadow[1]);
    },
  },
  {
    name: "skill-smithing",
    paint(c) {
      // Anvil: flat working face tapering into a horn, on a waist + base — mid-value town fills
      // with the dark ramp reserved for the outline only (#164: the prior anvil used ink/outline
      // fills that sank into the panel). Hammer rests directly on the face, touching it.
      block(c, 13, 16, 26, 21, town[2]); // body / working face
      for (let x = 6; x <= 13; x++) {
        const half = Math.max(1, Math.round(((x - 6) / 7) * 3) + 1);
        c.rect(x, 19 - half, x, 19 + half, town[2]);
      }
      block(c, 17, 22, 22, 24, town[1]); // waist
      block(c, 11, 25, 27, 29, town[1]); // base
      block(c, 21, 6, 29, 10, P.sand); // hammer head
      c.thickLine(22, 11, 17, 16, 2, P.umber); // haft, touching the anvil face
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
      c.thickLine(21, 16, 27, 16, 2, P.umber);
    },
  },
  {
    name: "skill-magic",
    paint(c) {
      // Staff with a glinting orb — one connected silhouette, thickLine shaft (#164: the prior
      // staff was a 1px stroke and the sparkle was two dashes that read as floating detail).
      c.thickLine(13, 12, 24, 29, 2, P.umber);
      disc(c, 13, 10, 5, crypt[2]);
      c.circle(13, 10, 2, crypt[4]);
      c.plot(12, 8, P.glint);
    },
  },
  {
    name: "skill-cooking",
    paint(c) {
      // Roast drumstick over an attached campfire — one connected silhouette with mid-value
      // fills that read on the panel (#164: the prior icon was a bare flame with no roast).
      disc(c, 16, 12, 7, town[2]);
      block(c, 13, 17, 19, 21, P.cream); // bone
      // Flame: narrow where it meets the bone, widening toward the base — tapers UP to a point,
      // unlike the roast above it (which tapers down), so the two silhouettes read as distinct
      // attached shapes rather than one blob.
      for (let y = 20; y <= 30; y++) {
        const t = (y - 20) / 10;
        const width = Math.max(2, Math.round(8 * t) + 1);
        c.rect(16 - width, y, 16 + width, y, town[3]);
      }
      for (let y = 22; y <= 30; y++) {
        const t = (y - 22) / 8;
        const width = Math.max(1, Math.round(4 * t));
        c.rect(16 - width, y, 16 + width, y, town[4]);
      }
    },
  },
  {
    name: "skill-crafting",
    paint(c) {
      // Needle + eye + thread coil — the needle is now a thickLine shaft (#164 sheet sweep: the
      // prior needle was a bare 1px diagonal) and the coil uses a visible sand tone instead of
      // pure ink, which sank into the panel.
      c.thickLine(6, 28, 27, 7, 2, P.sand);
      disc(c, 6, 28, 2, P.umber, P.ink);
      c.line(21, 13, 25, 9, P.cream);
      c.thickLine(9, 22, 14, 27, 2, sewer[3]);
      c.thickLine(13, 18, 18, 23, 2, sewer[3]);
    },
  },
  {
    name: "skill-herblore",
    paint(c) {
      // Herb sprig: stem + leaves, meadow-green tier — leaves are now thickLine strokes (#164
      // sheet sweep: the prior 1px diagonals read as dashed noise).
      c.thickLine(17, 29, 17, 10, 2, P.umber);
      c.thickLine(17, 22, 9, 14, 2, meadow[2]);
      c.thickLine(17, 16, 25, 8, 2, meadow[2]);
      c.circle(17, 8, 4, meadow[1]);
      block(c, 12, 27, 22, 30, P.outline);
    },
  },
  // --- Workspace/navigation icons ---
  {
    name: "tab-world",
    paint(c) {
      // Compass: circle rim + N/S/E/W needle diamond.
      c.circle(16.5, 16.5, 13, P.ink);
      c.circle(16.5, 16.5, 12, meadow[4]);
      c.circle(16.5, 16.5, 9, P.outline);
      c.thickLine(16, 5, 16, 28, 2, meadow[5]);
      c.thickLine(5, 16, 28, 16, 2, meadow[5]);
      disc(c, 16.5, 16.5, 3, town[3]);
    },
  },
  {
    name: "tab-skills",
    paint(c) {
      // Open-book silhouette (Skills panel).
      block(c, 5, 9, 16, 27, P.cream);
      block(c, 17, 9, 28, 27, P.cream);
      c.line(16, 9, 16, 27, P.sand);
      c.line(17, 9, 17, 27, P.sand);
      c.line(8, 14, 14, 14, P.outline);
      c.line(8, 19, 14, 19, P.outline);
      c.line(19, 14, 25, 14, P.outline);
      c.line(19, 19, 25, 19, P.outline);
    },
  },
  {
    name: "tab-character",
    paint(c) {
      // Person silhouette: head + shoulders.
      disc(c, 16.5, 10, 6, P.cream);
      block(c, 7, 18, 26, 30, P.cream);
      for (let x = 7; x <= 26; x++) {
        const y0 = 18 + Math.round(4 * Math.abs(Math.sin(((x - 7) / 19) * Math.PI)));
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
      c.circle(16.5, 21, 11, P.ink);
      c.circle(16.5, 21, 10, P.umber);
      block(c, 12, 7, 21, 11, P.outline);
      disc(c, 16.5, 7, 2, town[3]);
      c.line(10, 21, 23, 21, town[4]);
    },
  },
  {
    name: "tab-loot",
    paint(c) {
      // Scroll: rolled ends + ruled lines.
      block(c, 7, 7, 26, 26, P.parchment);
      disc(c, 7, 7, 3, P.sand);
      disc(c, 7, 26, 3, P.sand);
      disc(c, 26, 7, 3, P.sand);
      disc(c, 26, 26, 3, P.sand);
      c.line(11, 12, 22, 12, sewer[1]);
      c.line(11, 16, 22, 16, sewer[1]);
      c.line(11, 20, 22, 20, sewer[1]);
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
