import { describe, expect, it } from "vitest";
import {
  checkBinaryAlpha,
  checkColorBudget,
  checkClusterNoise,
  checkConnected,
  checkFill,
  checkMargin,
  checkStructuralConnected,
  countOpaqueColors,
  type DecodedIcon,
  findStaleExemptions,
} from "./icon-lint";

/** Builds a tiny decoded-PNG fixture: `rows` is an array of row strings, one character per
 * pixel. "." is a fully-transparent pixel; any other character maps to an opaque RGBA color
 * via `palette`. Independent of the production RGBA layout beyond the pngjs convention
 * (4 bytes per pixel, row-major) so fixtures read like the worked examples they are. */
function fixture(
  rows: string[],
  palette: Record<string, [number, number, number, number]>,
): DecodedIcon {
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  const data = new Uint8Array(width * height * 4);
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      const [r, g, b, a] = ch === "." ? [0, 0, 0, 0] : palette[ch]!;
      const at = (y * width + x) * 4;
      data[at] = r;
      data[at + 1] = g;
      data[at + 2] = b;
      data[at + 3] = a;
    });
  });
  return { width, height, data };
}

/** Builds a `size`x`size` icon that is transparent except for an opaque rectangle from
 * (x0,y0) to (x1,y1) inclusive — used where a literal row-string fixture would be unwieldy
 * (large canvases, bounding-box and connectivity checks). */
function solidBox(size: number, x0: number, y0: number, x1: number, y1: number): DecodedIcon {
  const data = new Uint8Array(size * size * 4);
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const at = (y * size + x) * 4;
      data[at] = 1;
      data[at + 1] = 0;
      data[at + 2] = 0;
      data[at + 3] = 255;
    }
  return { width: size, height: size, data };
}

describe("countOpaqueColors", () => {
  it("counts each distinct opaque RGBA color once, ignoring fully-transparent pixels", () => {
    const icon = fixture(["AAB", ".AC"], {
      A: [255, 0, 0, 255],
      B: [0, 255, 0, 255],
      C: [0, 0, 255, 255],
    });
    // A, B, C are three distinct opaque colors; the "." pixel contributes nothing.
    expect(countOpaqueColors(icon)).toBe(3);
  });
});

describe("checkColorBudget", () => {
  it("passes an icon with exactly 12 distinct opaque colors (the approved material-ramp budget)", () => {
    const icon = fixture(["ABCDEFGHIJKL"], {
      A: [1, 0, 0, 255],
      B: [2, 0, 0, 255],
      C: [3, 0, 0, 255],
      D: [4, 0, 0, 255],
      E: [5, 0, 0, 255],
      F: [6, 0, 0, 255],
      G: [7, 0, 0, 255],
      H: [8, 0, 0, 255],
      I: [9, 0, 0, 255],
      J: [10, 0, 0, 255],
      K: [11, 0, 0, 255],
      L: [12, 0, 0, 255],
    });
    expect(checkColorBudget(icon)).toBe(true);
  });

  it("fails an icon with 13 distinct opaque colors", () => {
    const icon = fixture(["ABCDEFGHIJKLM"], {
      A: [1, 0, 0, 255],
      B: [2, 0, 0, 255],
      C: [3, 0, 0, 255],
      D: [4, 0, 0, 255],
      E: [5, 0, 0, 255],
      F: [6, 0, 0, 255],
      G: [7, 0, 0, 255],
      H: [8, 0, 0, 255],
      I: [9, 0, 0, 255],
      J: [10, 0, 0, 255],
      K: [11, 0, 0, 255],
      L: [12, 0, 0, 255],
      M: [13, 0, 0, 255],
    });
    expect(checkColorBudget(icon)).toBe(false);
  });
});

describe("checkClusterNoise", () => {
  it("allows a small number of intentional one-pixel details", () => {
    const icon = fixture(["AAAAAAA", "AAAAAAA", "AABABAA", "AAAAAAA", "AAAAAAA"], {
      A: [1, 0, 0, 255],
      B: [2, 0, 0, 255],
    });
    expect(checkClusterNoise(icon)).toBe(true);
  });

  it("rejects scattered same-color sparkle noise", () => {
    const icon = fixture(["AAAAAAAAA", "ABABABABA", "AAAAAAAAA", "ABAAAAAAA", "AAAAAAAAA"], {
      A: [1, 0, 0, 255],
      B: [2, 0, 0, 255],
    });
    expect(checkClusterNoise(icon)).toBe(false);
  });
});

describe("checkBinaryAlpha", () => {
  it("passes an icon whose every pixel alpha is 0 or 255", () => {
    const icon = fixture([".AB"], { A: [1, 0, 0, 255], B: [2, 0, 0, 255] });
    expect(checkBinaryAlpha(icon, false)).toBe(true);
  });

  it("fails an icon with an intermediate alpha when allowOneIntermediate is false", () => {
    const icon = fixture([".AH"], { A: [1, 0, 0, 255], H: [2, 0, 0, 128] });
    expect(checkBinaryAlpha(icon, false)).toBe(false);
  });

  it("allows exactly one intermediate alpha VALUE when allowOneIntermediate is true (shade-wisp)", () => {
    const icon = fixture([".AHH"], { A: [1, 0, 0, 255], H: [2, 0, 0, 128] });
    expect(checkBinaryAlpha(icon, true)).toBe(true);
  });

  it("still fails when two different intermediate alpha VALUES appear, even with allowOneIntermediate", () => {
    const icon = fixture([".AHI"], { A: [1, 0, 0, 255], H: [2, 0, 0, 128], I: [2, 0, 0, 64] });
    expect(checkBinaryAlpha(icon, true)).toBe(false);
  });
});

describe("checkMargin", () => {
  it("passes a 4x4 icon whose outer ring (row/col 0 and 3) is fully transparent", () => {
    const icon = fixture(["....", ".AA.", ".AA.", "...."], { A: [1, 0, 0, 255] });
    expect(checkMargin(icon)).toBe(true);
  });

  it("fails when a pixel in the top row is opaque", () => {
    const icon = fixture([".A..", "....", "....", "...."], { A: [1, 0, 0, 255] });
    expect(checkMargin(icon)).toBe(false);
  });

  it("fails when a pixel in the rightmost column is opaque", () => {
    const icon = fixture(["...A", "....", "....", "...."], { A: [1, 0, 0, 255] });
    expect(checkMargin(icon)).toBe(false);
  });
});

describe("checkFill", () => {
  it("passes when the opaque bounding box's long axis is exactly 26px (the rule's floor)", () => {
    // 26px tall, 10px wide box on a 34x34 canvas.
    const icon = solidBox(34, 5, 4, 14, 29);
    expect(checkFill(icon)).toBe(true);
  });

  it("fails when the opaque bounding box's long axis is only 25px", () => {
    const icon = solidBox(34, 5, 4, 14, 28);
    expect(checkFill(icon)).toBe(false);
  });

  it("fails an entirely transparent icon (no bounding box at all)", () => {
    const icon: DecodedIcon = { width: 34, height: 34, data: new Uint8Array(34 * 34 * 4) };
    expect(checkFill(icon)).toBe(false);
  });
});

describe("checkConnected", () => {
  it("passes a single blob", () => {
    const icon = solidBox(6, 1, 1, 3, 3);
    expect(checkConnected(icon)).toBe(true);
  });

  it("fails competing structural parts that touch only at a shared corner", () => {
    // A 3x3 body and 2x2 part share a corner but no edge. Eight-connectivity incorrectly merges
    // them; four-connectivity exposes the visually fragile diagonal-only join.
    const icon = solidBox(8, 1, 1, 3, 3);
    const at = (x: number, y: number) => (y * icon.width + x) * 4;
    for (let y = 4; y <= 5; y++)
      for (let x = 4; x <= 5; x++) {
        const i = at(x, y);
        icon.data[i] = 1;
        icon.data[i + 3] = 255;
      }
    expect(checkStructuralConnected(icon)).toBe(false);
  });

  it("allows one small detached accent occupying no more than 20% of the art", () => {
    const icon = solidBox(10, 1, 1, 4, 4);
    const at = (x: number, y: number) => (y * icon.width + x) * 4;
    const i = at(7, 7);
    icon.data[i] = 1;
    icon.data[i + 3] = 255;
    expect(checkConnected(icon)).toBe(true);
  });

  it("fails when the detached component competes with the main silhouette", () => {
    const icon = solidBox(10, 1, 1, 3, 3);
    const at = (x: number, y: number) => (y * icon.width + x) * 4;
    for (let y = 6; y <= 7; y++)
      for (let x = 6; x <= 7; x++) {
        const i = at(x, y);
        icon.data[i] = 1;
        icon.data[i + 3] = 255;
      }
    expect(checkConnected(icon)).toBe(false);
  });

  it("fails decorative confetti with more than one detached accent", () => {
    const icon = solidBox(10, 1, 1, 4, 4);
    const at = (x: number, y: number) => (y * icon.width + x) * 4;
    for (const [x, y] of [
      [7, 2],
      [7, 7],
    ] as const) {
      const i = at(x, y);
      icon.data[i] = 1;
      icon.data[i + 3] = 255;
    }
    expect(checkConnected(icon)).toBe(false);
  });

  it("fails an entirely transparent icon (zero components, not one)", () => {
    const icon: DecodedIcon = { width: 10, height: 10, data: new Uint8Array(10 * 10 * 4) };
    expect(checkConnected(icon)).toBe(false);
  });
});

describe("findStaleExemptions", () => {
  it("returns no stale entries when every exempt icon still fails the rule it's exempted from", () => {
    const exemptions = { "iron-kiteshield": ["color-budget", "margin"] } as const;
    const passes = () => false; // still fails everything — exemptions still earn their keep
    expect(findStaleExemptions(exemptions, passes)).toEqual([]);
  });

  it("flags an exemption entry once its icon passes the rule it was exempted for — demonstrates the ratchet: fixing an icon demands deleting its entry, not leaving it inert", () => {
    const exemptions = { "iron-kiteshield": ["color-budget", "margin"] } as const;
    // Simulate "temporarily fixing" iron-kiteshield's color-budget violation while margin is
    // still broken — findStaleExemptions must single out the now-redundant color-budget entry.
    const passes = (icon: string, rule: string) =>
      icon === "iron-kiteshield" && rule === "color-budget";
    expect(findStaleExemptions(exemptions, passes)).toEqual([
      { icon: "iron-kiteshield", rule: "color-budget" },
    ]);
  });
});
