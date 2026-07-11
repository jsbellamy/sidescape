import { writeIcon } from "./icon-canvas.mjs";
import { P, zonePalettes } from "./palettes.mjs";

const meadow = zonePalettes.meadow;
const forest = zonePalettes.forest;
const sewer = zonePalettes.sewer;
const crypt = zonePalettes.crypt;
const town = zonePalettes.town;

function block(c, x0, y0, x1, y1, fill, outline = P.ink) {
  c.rect(x0 - 1, y0 - 1, x1 + 1, y1 + 1, outline);
  c.rect(x0, y0, x1, y1, fill);
}

function disc(c, cx, cy, r, fill, outline = P.ink) {
  c.circle(cx, cy, r + 1, outline);
  c.circle(cx, cy, r, fill);
}

function sword(c, x, y, flip = false) {
  const px = (dx) => (flip ? x - dx : x + dx);
  for (let i = 0; i < 17; i++) {
    c.plot(px(i), y - i, P.ink);
    c.plot(px(i + 1), y - i, P.cream);
    c.plot(px(i + 2), y - i, P.sand);
  }
  c.line(px(-3), y + 2, px(5), y - 2, P.ink);
  c.line(px(-2), y + 2, px(4), y - 1, P.accent);
  c.line(px(1), y + 1, px(5), y + 5, P.ink);
  c.line(px(2), y + 1, px(5), y + 4, P.umber);
}

function leaf(c, x, y, flip = false) {
  const s = flip ? -1 : 1;
  c.line(x, y, x + 6 * s, y - 5, P.ink);
  c.line(x, y - 1, x + 5 * s, y - 5, meadow[2]);
  c.line(x + s, y - 1, x + 5 * s, y - 2, meadow[1]);
}

export const icons = [
  {
    name: "skill-attack",
    paint(c) {
      // One oversized blade reads more cleanly than crossed weapons at 1x.
      for (let i = 0; i < 20; i++) {
        c.plot(7 + i, 25 - i, P.ink);
        c.plot(8 + i, 25 - i, P.sand);
        c.plot(9 + i, 25 - i, P.cream);
        c.plot(10 + i, 25 - i, P.glint);
        c.plot(11 + i, 25 - i, P.ink);
      }
      c.line(5, 27, 12, 20, P.ink);
      c.line(6, 27, 12, 21, P.accent);
      c.line(7, 26, 12, 31, P.ink);
      c.line(8, 26, 12, 30, town[2]);
    },
  },
  {
    name: "skill-strength",
    paint(c) {
      // A compact raised gauntlet: four knuckles, curled fingers, broad wrist.
      block(c, 8, 9, 13, 18, town[2]);
      block(c, 14, 6, 18, 17, town[3]);
      block(c, 19, 8, 23, 18, town[2]);
      block(c, 24, 11, 27, 19, town[3]);
      block(c, 10, 17, 26, 25, town[1]);
      block(c, 13, 25, 23, 29, town[2]);
      c.line(11, 19, 24, 19, town[4]);
      c.line(15, 8, 15, 15, town[4]);
    },
  },
  {
    name: "skill-defence",
    paint(c) {
      // Broad kite shield with a bright steel boss and reinforced quarters.
      c.rect(7, 7, 26, 19, P.ink);
      c.line(7, 19, 16, 30, P.ink);
      c.line(26, 19, 17, 30, P.ink);
      c.rect(9, 9, 24, 18, town[1]);
      for (let y = 19; y <= 26; y++) c.line(10 + (y - 19), y, 23 - (y - 19), y, town[1]);
      c.line(16, 8, 16, 27, P.sand);
      c.line(8, 17, 25, 17, P.sand);
      disc(c, 16.5, 17, 3, P.cream);
      c.plot(16, 15, P.glint);
    },
  },
  {
    name: "skill-hitpoints",
    paint(c) {
      disc(c, 11.5, 12, 6, town[3]);
      disc(c, 21.5, 12, 6, town[3]);
      for (let y = 12; y <= 27; y++) {
        const half = Math.max(0, 10 - Math.floor((y - 12) * 0.67));
        c.line(16 - half, y, 17 + half, y, town[3]);
      }
      c.line(9, 8, 13, 6, town[4]);
      c.line(9, 9, 11, 9, P.glint);
    },
  },
  {
    name: "skill-fishing",
    paint(c) {
      // Large fish profile; the tail alone carries the fishing silhouette.
      c.circle(15, 17, 10, P.ink);
      c.circle(15, 17, 8, meadow[0]);
      c.rect(15, 9, 23, 25, meadow[0]);
      c.line(23, 12, 30, 7, P.ink);
      c.line(23, 22, 30, 27, P.ink);
      c.rect(22, 13, 28, 21, meadow[0]);
      c.line(10, 21, 19, 23, meadow[2]);
      c.rect(9, 13, 10, 14, P.ink);
      c.plot(9, 12, P.glint);
    },
  },
  {
    name: "skill-smithing",
    paint(c) {
      // The anvil owns most of the canvas; the hammer is a compact accent.
      c.rect(3, 17, 30, 22, P.ink);
      c.rect(6, 19, 27, 22, P.shadow);
      c.rect(8, 23, 25, 27, P.ink);
      c.rect(11, 27, 22, 30, P.outline);
      block(c, 5, 5, 16, 11, P.sand);
      c.line(7, 6, 15, 6, P.parchment);
      c.line(15, 11, 22, 17, P.ink);
      c.line(16, 11, 23, 17, P.umber);
    },
  },
  {
    name: "skill-ranged",
    paint(c) {
      // Chunky recurved bow, taut string, and a bright nocked arrow.
      c.line(9, 5, 5, 10, P.ink);
      c.line(5, 10, 8, 25, P.ink);
      c.line(8, 25, 12, 29, P.ink);
      c.line(10, 5, 7, 10, town[2]);
      c.line(7, 10, 10, 25, town[3]);
      c.line(10, 25, 12, 28, town[2]);
      c.line(10, 5, 9, 17, P.cream);
      c.line(9, 17, 12, 28, P.cream);
      c.line(7, 17, 28, 17, P.sand);
      c.line(24, 14, 29, 17, P.ink);
      c.line(24, 20, 29, 17, P.ink);
    },
  },
  {
    name: "skill-magic",
    paint(c) {
      c.line(9, 28, 21, 12, P.ink);
      c.line(11, 29, 23, 13, P.umber);
      disc(c, 23, 10, 7, crypt[2]);
      c.circle(23, 10, 4, meadow[0]);
      c.plot(21, 7, P.glint);
      c.line(14, 6, 17, 7, crypt[3]);
      c.line(27, 19, 30, 17, crypt[3]);
    },
  },
  {
    name: "skill-cooking",
    paint(c) {
      // A browned joint over a compact orange campfire.
      c.circle(16, 12, 8, P.ink);
      c.circle(16, 12, 7, town[2]);
      c.rect(20, 7, 27, 11, P.ink);
      c.rect(21, 8, 27, 10, crypt[4]);
      c.plot(12, 8, town[4]);
      c.line(6, 28, 27, 28, P.outline);
      c.line(8, 27, 13, 19, town[3]);
      c.line(13, 27, 17, 17, town[4]);
      c.line(18, 27, 22, 19, town[3]);
      c.line(23, 27, 26, 21, town[4]);
    },
  },
  {
    name: "skill-crafting",
    paint(c) {
      // One continuous hide silhouette with four uneven corner flaps.
      c.rect(7, 7, 26, 27, P.ink);
      c.rect(4, 5, 12, 13, P.ink);
      c.rect(22, 4, 29, 13, P.ink);
      c.rect(4, 22, 12, 30, P.ink);
      c.rect(21, 23, 29, 30, P.ink);
      c.rect(8, 8, 25, 26, town[2]);
      c.rect(6, 7, 11, 12, town[2]);
      c.rect(23, 6, 27, 12, town[2]);
      c.rect(6, 23, 11, 28, town[2]);
      c.rect(22, 24, 27, 28, town[2]);
      c.line(8, 27, 27, 8, P.ink);
      c.line(9, 26, 27, 8, P.cream);
      c.plot(27, 7, P.glint);
    },
  },
  {
    name: "skill-herblore",
    paint(c) {
      // Wide mortar bowl first, with one thick pestle and one leaf accent.
      c.rect(5, 15, 28, 20, P.ink);
      c.rect(7, 17, 26, 20, P.shadow);
      for (let y = 21; y <= 28; y++)
        c.line(8 + Math.floor((y - 21) / 2), y, 25 - Math.floor((y - 21) / 2), y, P.outline);
      c.line(22, 4, 12, 17, P.ink);
      c.line(24, 6, 14, 19, P.sand);
      leaf(c, 11, 29, true);
    },
  },
  {
    name: "tab-world",
    paint(c) {
      // Single compass silhouette: broad rim and oversized directional needle.
      disc(c, 16.5, 16.5, 13, P.accent);
      c.circle(16.5, 16.5, 10, P.cream);
      c.line(16, 5, 16, 28, P.ink);
      c.line(17, 5, 17, 28, P.ink);
      for (let y = 8; y <= 16; y++)
        c.line(16 - Math.floor((y - 8) / 2), y, 17 + Math.floor((y - 8) / 2), y, meadow[0]);
      for (let y = 17; y <= 25; y++)
        c.line(12 + Math.floor((y - 17) / 2), y, 21 - Math.floor((y - 17) / 2), y, P.outline);
      disc(c, 16.5, 16.5, 2, P.glint);
    },
  },
  {
    name: "tab-skills",
    paint(c) {
      c.rect(4, 8, 29, 27, P.ink);
      c.rect(6, 9, 15, 25, P.cream);
      c.rect(18, 9, 27, 25, P.cream);
      c.line(16, 10, 16, 27, P.sand);
      c.line(17, 10, 17, 27, P.sand);
      c.line(8, 14, 13, 14, P.umber);
      c.line(20, 14, 25, 14, P.umber);
      c.line(8, 18, 13, 18, P.umber);
      c.line(20, 18, 25, 18, P.umber);
      c.plot(27, 24, P.accent);
      c.plot(25, 26, P.accent);
      c.plot(29, 26, P.accent);
    },
  },
  {
    name: "tab-character",
    paint(c) {
      // Helmeted head only: large eye slit and central nasal guard.
      disc(c, 16.5, 16, 13, P.ink);
      c.circle(16.5, 16, 11, P.sand);
      c.rect(6, 14, 27, 20, P.ink);
      c.rect(8, 16, 14, 18, P.glint);
      c.rect(19, 16, 25, 18, P.glint);
      c.rect(15, 5, 18, 27, P.outline);
      c.rect(16, 6, 17, 27, P.cream);
      c.line(10, 24, 16, 29, P.ink);
      c.line(23, 24, 17, 29, P.ink);
    },
  },
  {
    name: "tab-bank",
    paint(c) {
      // Closed reinforced chest: one lock, no loose coin confetti.
      c.rect(5, 12, 28, 29, P.ink);
      c.rect(7, 14, 26, 27, town[1]);
      c.line(6, 19, 27, 19, P.sand);
      c.line(10, 13, 10, 28, P.outline);
      c.line(23, 13, 23, 28, P.outline);
      c.rect(4, 9, 29, 15, P.ink);
      c.rect(7, 10, 26, 13, town[2]);
      disc(c, 16.5, 20, 3, P.accent);
      c.rect(15, 20, 18, 25, P.accent);
    },
  },
  {
    name: "tab-vendor",
    paint(c) {
      // Tiny market stall: striped awning, dark counter, hanging coin sign.
      c.rect(5, 9, 27, 28, P.ink);
      c.rect(7, 15, 25, 26, town[1]);
      c.rect(4, 6, 28, 14, P.ink);
      c.rect(6, 8, 10, 13, meadow[2]);
      c.rect(11, 8, 15, 13, P.cream);
      c.rect(16, 8, 20, 13, meadow[2]);
      c.rect(21, 8, 26, 13, P.cream);
      c.line(6, 22, 26, 22, P.sand);
      disc(c, 20, 20, 4, P.accent);
      c.plot(19, 18, P.glint);
    },
  },
  {
    name: "tab-loot",
    paint(c) {
      // One open sack and one oversized gem; no scattered secondary objects.
      c.line(9, 9, 14, 6, P.ink);
      c.line(14, 6, 24, 8, P.ink);
      c.line(24, 8, 27, 15, P.ink);
      c.circle(17, 20, 11, P.ink);
      c.circle(17, 20, 9, town[1]);
      c.rect(8, 8, 26, 12, P.ink);
      c.rect(11, 10, 23, 12, town[2]);
      c.line(8, 10, 5, 14, P.umber);
      c.line(26, 10, 29, 14, P.umber);
      c.line(17, 13, 11, 20, meadow[1]);
      c.line(11, 20, 17, 27, meadow[3]);
      c.line(17, 27, 23, 20, meadow[2]);
      c.line(23, 20, 17, 13, meadow[0]);
      c.plot(15, 16, P.glint);
    },
  },
];

export async function writeIcons(destDir) {
  for (const { name, paint } of icons) await writeIcon(`${destDir}/${name}.png`, paint);
}
