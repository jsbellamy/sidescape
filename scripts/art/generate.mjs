import { resolve } from "node:path";
import { writeIcons } from "./icons.mjs";
import { masterPalette, zonePalettes } from "./palettes.mjs";
import { hex, writePng } from "./write-png.mjs";
const swatches = [
  ...masterPalette.map(([, color]) => color),
  ...Object.values(zonePalettes).flat(),
];
const columns = 6,
  cell = 40,
  gutter = 4,
  padding = 8;
const rows = Math.ceil(swatches.length / columns);
await writePng(
  resolve("docs/art-style-preview.png"),
  columns * cell + (columns - 1) * gutter + padding * 2,
  rows * cell + (rows - 1) * gutter + padding * 2,
  (x, y) => {
    const col = Math.floor((x - padding) / (cell + gutter)),
      row = Math.floor((y - padding) / (cell + gutter));
    const inCell =
      x >= padding &&
      y >= padding &&
      col >= 0 &&
      col < columns &&
      row >= 0 &&
      (x - padding) % (cell + gutter) < cell &&
      (y - padding) % (cell + gutter) < cell;
    return inCell ? hex(swatches[row * columns + col] ?? "#1a1410") : hex("#1a1410");
  },
);

// UI & Assets wave 1/8 (#131): the eleven Skill icons + six workspace/navigation icons.
await writeIcons(resolve("src/assets/icons"));
