import { PNG } from "pngjs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
export function hex(hex) {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
}
/** Renders `pixel(x, y) -> [r, g, b, a]` into an encoded PNG Buffer without touching the
 * filesystem (#166) — the pure core `writePng` below wraps for the common "write to disk" case,
 * and `contact-sheet.mjs`'s sync-check test uses this directly so it compares the exact bytes a
 * regeneration would produce, not a re-decoded/re-diffed approximation. */
export function encodePng(width, height, pixel) {
  const image = new PNG({ width, height });
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = pixel(x, y);
      const at = (width * y + x) << 2;
      image.data[at] = r;
      image.data[at + 1] = g;
      image.data[at + 2] = b;
      image.data[at + 3] = a;
    }
  return PNG.sync.write(image);
}

export async function writePng(path, width, height, pixel) {
  const buffer = encodePng(width, height, pixel);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, buffer);
}
