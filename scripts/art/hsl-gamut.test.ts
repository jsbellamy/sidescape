import { describe, expect, it } from "vitest";
import {
  conformCellPaletteToHslGamut,
  hslToRgb,
  isRgbWithinHslGamut,
  rgbToHsl,
  validateHslGamut,
} from "./trace-core.mjs";

/** Glacier-shaped Theme gamut from #313 — cold chromatic band + neutral floor. */
const GLACIER_GAMUT = {
  neutralMaxSaturation: 20,
  chromaticHueRange: [175, 240] as [number, number],
  chromaticMaxSaturation: 65,
};

describe("rgbToHsl (#313)", () => {
  it("decodes the pinned cold-sky contaminant from the issue", () => {
    const { h, s, l } = rgbToHsl([0, 24, 50]);
    expect(Number(h.toFixed(1))).toBe(211.2);
    expect(Number(s.toFixed(0))).toBe(100);
    expect(Number(l.toFixed(3))).toBe(9.804);
  });

  it("reports achromatic hue as 0", () => {
    expect(rgbToHsl([40, 40, 40]).h).toBe(0);
    expect(rgbToHsl([40, 40, 40]).s).toBe(0);
  });

  it("rejects malformed RGB", () => {
    expect(() => rgbToHsl([0, 24] as unknown as [number, number, number])).toThrow(/RGB/);
    expect(() => rgbToHsl([0, 24, 50.5] as unknown as [number, number, number])).toThrow(/RGB/);
    expect(() => rgbToHsl([-1, 0, 0] as unknown as [number, number, number])).toThrow(/RGB/);
  });
});

describe("HSL gamut predicate (#313)", () => {
  it("accepts inclusive hue and saturation boundary colors", () => {
    expect(isRgbWithinHslGamut([27, 126, 118], GLACIER_GAMUT)).toBe(true); // ~175°, ~65%
    expect(isRgbWithinHslGamut([27, 27, 126], GLACIER_GAMUT)).toBe(true); // 240°, ~65%
  });

  it("accepts neutrals at neutralMaxSaturation regardless of hue", () => {
    expect(isRgbWithinHslGamut([122, 102, 82], GLACIER_GAMUT)).toBe(true); // warm ~30°, ~20%
  });

  it("rejects saturated cold-out-of-range and over-cap in-range blues", () => {
    expect(isRgbWithinHslGamut([0, 24, 50], GLACIER_GAMUT)).toBe(false);
    expect(isRgbWithinHslGamut([0, 77, 153], GLACIER_GAMUT)).toBe(false);
  });

  it("rejects every malformed gamut contract", () => {
    expect(() => validateHslGamut(null)).toThrow();
    expect(() => validateHslGamut({ ...GLACIER_GAMUT, extra: 1 })).toThrow(/extra|unknown/i);
    expect(() =>
      validateHslGamut({
        neutralMaxSaturation: 20,
        chromaticHueRange: [175, 240],
      }),
    ).toThrow(/missing|unknown/i);
    expect(() =>
      validateHslGamut({
        ...GLACIER_GAMUT,
        chromaticHueRange: [240, 175],
      }),
    ).toThrow(/0 <= min <= max < 360/i);
    expect(() =>
      validateHslGamut({
        ...GLACIER_GAMUT,
        chromaticHueRange: [350, 370],
      }),
    ).toThrow(/0 <= min <= max < 360/i);
    expect(() =>
      validateHslGamut({
        ...GLACIER_GAMUT,
        neutralMaxSaturation: 80,
        chromaticMaxSaturation: 65,
      }),
    ).toThrow(/neutralMaxSaturation/i);
    expect(() =>
      validateHslGamut({
        ...GLACIER_GAMUT,
        neutralMaxSaturation: Number.NaN,
      }),
    ).toThrow(/finite/i);
  });
});

describe("conformCellPaletteToHslGamut (#313)", () => {
  it("keeps already-valid cold RGB byte-identical with zero changes", () => {
    const valid: [number, number, number] = [40, 70, 90];
    expect(isRgbWithinHslGamut(valid, GLACIER_GAMUT)).toBe(true);
    const result = conformCellPaletteToHslGamut([[valid, valid]], GLACIER_GAMUT);
    expect(result.cells[0]![0]).toBe(valid);
    expect(result.changedCellCount).toBe(0);
    expect(result.inputColorCount).toBe(1);
    expect(result.outputColorCount).toBe(1);
  });

  it("reduces saturated in-range blue saturation while preserving lightness", () => {
    const saturated = hslToRgb(210, 100, 30) as [number, number, number];
    const { l: sourceL } = rgbToHsl(saturated);
    const out = conformCellPaletteToHslGamut([[saturated]], GLACIER_GAMUT).cells[0]![0]!;
    expect(isRgbWithinHslGamut(out, GLACIER_GAMUT)).toBe(true);
    expect(out).not.toEqual(saturated);
    expect(rgbToHsl(out).l).toBeCloseTo(sourceL, 0);
    expect(rgbToHsl(out).s).toBeLessThanOrEqual(GLACIER_GAMUT.chromaticMaxSaturation);
  });

  it("projects purple to the nearer (upper) endpoint and warm hues to the lower", () => {
    const purple = hslToRgb(300, 80, 40) as [number, number, number];
    const purpleOut = conformCellPaletteToHslGamut([[purple]], GLACIER_GAMUT).cells[0]![0]!;
    expect(rgbToHsl(purpleOut).h).toBeGreaterThan(207);

    const warm = hslToRgb(30, 80, 40) as [number, number, number];
    const warmOut = conformCellPaletteToHslGamut([[warm]], GLACIER_GAMUT).cells[0]![0]!;
    expect(rgbToHsl(warmOut).h).toBeLessThan(207);
  });

  it("on an exact circular hue tie, starts from the lower endpoint", () => {
    // [24,11,0] decodes to hue 27.5° — equidistant from 175 and 240.
    const tie: [number, number, number] = [24, 11, 0];
    expect(rgbToHsl(tie).h).toBe(27.5);
    const out = conformCellPaletteToHslGamut([[tie]], GLACIER_GAMUT).cells[0]![0]!;
    // Inward search from an endpoint cannot cross the midpoint, so a final hue
    // below the midpoint proves the tie chose the lower endpoint (175), not 240.
    expect(rgbToHsl(out).h).toBeLessThan(207.5);
    expect(isRgbWithinHslGamut(out, GLACIER_GAMUT)).toBe(true);
  });

  it("revalidates Math.round integer candidates at hue and saturation boundaries", () => {
    const contam: [number, number, number] = [0, 24, 50];
    const out = conformCellPaletteToHslGamut([[contam]], GLACIER_GAMUT).cells[0]![0]!;
    expect(isRgbWithinHslGamut(out, GLACIER_GAMUT)).toBe(true);
    expect(out.every((channel: number) => Number.isInteger(channel))).toBe(true);
  });

  it("preserves null masks, memoizes repeats, never grows the palette, and is byte-stable", () => {
    const warm: [number, number, number] = [200, 80, 40];
    const cells = [
      [warm, null, warm],
      [null, warm, null],
    ];
    const first = conformCellPaletteToHslGamut(cells, GLACIER_GAMUT);
    const second = conformCellPaletteToHslGamut(cells, GLACIER_GAMUT);
    expect(first.cells[0]![1]).toBeNull();
    expect(first.cells[1]![0]).toBeNull();
    expect(first.outputColorCount).toBeLessThanOrEqual(first.inputColorCount);
    expect(first.inputColorCount).toBe(1);
    expect(second).toEqual(first);
  });
});
