import { hex, writePng } from "./write-png.mjs";

/** Icons live on the 34×34 canvas pinned by docs/art-style.md (32×32 art + 1px transparent
 * margin on every side, so drawable art coordinates run 1..32 inclusive). A canvas starts fully
 * transparent; drawing ops paint opaque master/zone-palette colors only (no anti-aliasing, no
 * partial alpha — matches the art-style pixel rules) so every icon regenerates byte-stably from
 * its source paint function. */
const SIZE = 34;

/** Exported (in addition to being used internally by `writeIcon`) so `src/ui/icon-canvas.test.ts`
 * (#166) can unit-test drawing primitives like `thickLine` directly against the exact module
 * `npm run art` renders with. */
export function createCanvas() {
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
    /** Straight line stamped with a `width`x`width` square at every Bresenham step (#166) — the
     * only line primitive above was 1px `line`, which produces single-pixel stair-noise on
     * diagonals. Structural features (blade spines, hafts, staff shafts) need >=2px strokes per
     * docs/art-style.md's legibility rules; `thickLine` is that primitive. `width` is the square's
     * side length, centered on each step (so width 2 covers the step pixel plus one neighbor). */
    thickLine(x0, y0, x1, y1, width, color) {
      const half = Math.floor((width - 1) / 2);
      const stamp = (cx, cy) => {
        for (let dy = 0; dy < width; dy++)
          for (let dx = 0; dx < width; dx++) this.plot(cx - half + dx, cy - half + dy, color);
      };
      let dx = Math.abs(x1 - x0),
        sx = x0 < x1 ? 1 : -1;
      let dy = -Math.abs(y1 - y0),
        sy = y0 < y1 ? 1 : -1;
      let err = dx + dy;
      let x = x0,
        y = y0;
      for (;;) {
        stamp(x, y);
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
    /** Whether a coordinate currently contains a painted pixel. Used by mask composition and
     * exposed for tests/debug tooling; callers should still render through `toPixelFn()`. */
    has(x, y) {
      return x >= 0 && y >= 0 && x < SIZE && y < SIZE && cells[y * SIZE + x] !== null;
    },
    /** Paints a previously composed silhouette mask with one flat color. */
    paintMask(mask, color) {
      for (let y = 0; y < SIZE; y++)
        for (let x = 0; x < SIZE; x++) if (mask.has(x, y)) this.plot(x, y, color);
    },
    /** Derives one exterior 4-neighbor outline around the unioned silhouette. Because the outline
     * is computed after parts are unioned, overlapping primitives cannot leave internal seams. */
    outlineMask(mask, color) {
      const neighbors = [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ];
      for (let y = 0; y < SIZE; y++)
        for (let x = 0; x < SIZE; x++) {
          if (!mask.has(x, y)) continue;
          for (const [dx, dy] of neighbors) {
            const nx = x + dx,
              ny = y + dy;
            if (!mask.has(nx, ny)) this.plot(nx, ny, color);
          }
        }
    },
    /** Runs normal drawing primitives through a silhouette clip. This keeps material planes and
     * highlight/shadow clusters inside the approved contour even when their source primitives
     * extend beyond it. */
    paintInside(mask, paint) {
      const target = this;
      const clipped = {
        ...this,
        plot(x, y, color) {
          if (mask.has(x, y)) target.plot(x, y, color);
        },
      };
      paint(clipped);
    },
    toPixelFn() {
      return (x, y) => {
        const color = cells[y * SIZE + x];
        return color ? hex(color) : [0, 0, 0, 0];
      };
    },
  };
}

/** Creates a colorless silhouette canvas. Compose as many primitives as needed here, then apply
 * one outline/fill pair to the union with `canvas.outlineMask()` and `canvas.paintMask()`.
 * Mask methods intentionally omit color arguments so agents cannot shade before the contour is
 * settled. */
export function createMask() {
  const source = createCanvas();
  const mark = "#ffffff";
  return {
    plot(x, y) {
      source.plot(x, y, mark);
    },
    rect(x0, y0, x1, y1) {
      source.rect(x0, y0, x1, y1, mark);
    },
    rectOutline(x0, y0, x1, y1) {
      source.rectOutline(x0, y0, x1, y1, mark);
    },
    circle(cx, cy, r) {
      source.circle(cx, cy, r, mark);
    },
    line(x0, y0, x1, y1) {
      source.line(x0, y0, x1, y1, mark);
    },
    thickLine(x0, y0, x1, y1, width) {
      source.thickLine(x0, y0, x1, y1, width, mark);
    },
    has(x, y) {
      return source.has(x, y);
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
