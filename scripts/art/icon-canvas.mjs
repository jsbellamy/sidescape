import { hex, writePng } from "./write-png.mjs";

/** Icons live on the 34×34 canvas pinned by docs/art-style.md (32×32 art + 1px transparent
 * margin on every side, so drawable art coordinates run 1..32 inclusive). A canvas starts fully
 * transparent; drawing ops paint opaque master/zone-palette colors only (no anti-aliasing, no
 * partial alpha — matches the art-style pixel rules) so every icon regenerates byte-stably from
 * its source paint function. */
const SIZE = 34;

function createCanvas() {
  const cells = new Array(SIZE * SIZE).fill(null);
  return {
    plot(x, y, color) {
      if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
      cells[y * SIZE + x] = color;
    },
    /** Inclusive filled rectangle. */
    rect(x0, y0, x1, y1, color) {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.plot(x, y, color);
    },
    /** 1px rectangle outline (inclusive bounds). */
    rectOutline(x0, y0, x1, y1, color) {
      for (let x = x0; x <= x1; x++) {
        this.plot(x, y0, color);
        this.plot(x, y1, color);
      }
      for (let y = y0; y <= y1; y++) {
        this.plot(x0, y, color);
        this.plot(x1, y, color);
      }
    },
    /** Filled circle (inclusive of the boundary), centered at (cx, cy) with radius r. */
    circle(cx, cy, r, color) {
      for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
        for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
          const dx = x + 0.5 - cx,
            dy = y + 0.5 - cy;
          if (dx * dx + dy * dy <= r * r) this.plot(x, y, color);
        }
    },
    /** Straight line between two points (integer Bresenham steps — pixel art has no sub-pixel
     * lines). Used for thin strokes: blade edges, bowstrings, rod lines. */
    line(x0, y0, x1, y1, color) {
      let dx = Math.abs(x1 - x0),
        sx = x0 < x1 ? 1 : -1;
      let dy = -Math.abs(y1 - y0),
        sy = y0 < y1 ? 1 : -1;
      let err = dx + dy;
      let x = x0,
        y = y0;
      for (;;) {
        this.plot(x, y, color);
        if (x === x1 && y === y1) break;
        const e2 = 2 * err;
        if (e2 >= dy) {
          err += dy;
          x += sx;
        }
        if (e2 <= dx) {
          err += dx;
          y += sy;
        }
      }
    },
    toPixelFn() {
      return (x, y) => {
        const color = cells[y * SIZE + x];
        return color ? hex(color) : [0, 0, 0, 0];
      };
    },
  };
}

/** Renders one icon source (a `paint(canvas)` function) to `path` on the shared 34×34 canvas. */
export async function writeIcon(path, paint) {
  const canvas = createCanvas();
  paint(canvas);
  await writePng(path, SIZE, SIZE, canvas.toPixelFn());
}

export const ICON_SIZE = SIZE;
