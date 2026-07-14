import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { writeIcons } from "../../scripts/art/icons.mjs";
import { materialPalettes, zonePalettes } from "../../scripts/art/palettes.mjs";
import { writeSprites } from "../../scripts/art/sprites.mjs";

/**
 * Ramp isolation (#252). `quantizeGrid` snaps every cell to the nearest entry of the palette it is
 * handed, so any material ramp in that palette is a candidate color for every cell of every asset.
 * When the generation paths built that palette with a bare `buildNamedPalette()` — i.e. every ramp
 * in the project — merely ADDING a ramp silently recolored unrelated shipped art: introducing
 * `adamant` (a green metal) put a mottled olive patch across 5.5% of `mithril-chainbody`, and
 * `rune` (a cyan metal) visibly shifted the `crypt-shade` and `zombie` sprites. ~35 icons and 4
 * sprites drifted in total.
 *
 * The pre-existing art tests could not catch this: `icon-assets.test.ts` regenerates the contact
 * sheets and compares them to the committed sheets, but BOTH sides are produced with the new ramps,
 * so it passes by construction. A green art suite is not evidence that existing art is unchanged.
 *
 * This test locks the property directly, at the seam the bug actually lived at: **adding a material
 * ramp cannot alter an asset that does not use it.** It installs a decoy ramp positioned right next
 * to `steel` — close enough that a global nearest-color quantizer would steal essentially every
 * steel cell in the project — regenerates the complete icon and sprite sets, and asserts every
 * committed asset's bytes are untouched. Under the old global palette this fails loudly; under the
 * per-asset scoping (`icons.mjs`'s `SOURCE_PALETTES`/`paletteForSource`, `sprites.mjs`'s
 * per-sprite `materialRampNames`) it passes because no asset declares the decoy.
 */

const ICONS_DIR = fileURLToPath(new URL("../assets/icons", import.meta.url));
const SPRITES_DIR = fileURLToPath(new URL("../assets/sprites", import.meta.url));

/** A ramp sitting ~1-2 RGB units from `steel` — a global quantizer would snap steel cells to it. */
const DECOY_RAMP = { shadow: "#5a646e", base: "#8e9aa4", light: "#c5cdd2", glint: "#eff3f3" };
const DECOY_NAME = "decoy-ramp-issue-252";

/**
 * A zone sitting ~1 RGB unit (each channel) from every `town` entry — the same construction as
 * `DECOY_RAMP` above, but for `zonePalettes` (#261). `zonePalettes` had NO scoping allowlist at
 * all before this issue: `buildNamedPalette` emitted every zone unconditionally for every
 * icon/sprite build, so a new zone this close to `town` would silently steal `town`-quantized
 * cells across the whole project the same way an unscoped material ramp could.
 */
const DECOY_ZONE = ["#4b2f1b", "#714320", "#9d6432", "#c6833c", "#e3ae58", "#2c1c13"];
const DECOY_ZONE_NAME = "decoy-zone-issue-261";

/** Regenerates the full icon + sprite sets into a temp dir and returns name -> bytes. */
async function generateAll(): Promise<{
  icons: Map<string, Buffer>;
  sprites: Map<string, Buffer>;
}> {
  const dir = mkdtempSync(join(tmpdir(), "sidescape-art-"));
  try {
    await writeIcons(dir);
    await writeSprites(dir);
    const icons = new Map<string, Buffer>();
    const sprites = new Map<string, Buffer>();
    const { readdirSync } = await import("node:fs");
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".png"))) {
      const bytes = readFileSync(join(dir, file));
      // writeIcons and writeSprites share the temp dir; sort each generated file back to the
      // committed set it belongs to by which directory actually ships it.
      const name = file.replace(/\.png$/, "");
      try {
        readFileSync(join(SPRITES_DIR, file));
        sprites.set(name, bytes);
      } catch {
        icons.set(name, bytes);
      }
    }
    return { icons, sprites };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function committed(dir: string, name: string): Buffer {
  return readFileSync(join(dir, `${name}.png`));
}

describe("material-ramp isolation (#252): a ramp cannot alter an asset that does not use it", () => {
  afterEach(() => {
    delete (materialPalettes as Record<string, unknown>)[DECOY_NAME];
  });

  // Control: proves the harness really regenerates and byte-compares, so the decoy case below
  // cannot pass vacuously.
  it("control: with no decoy ramp, every generated icon and sprite matches its committed bytes", async () => {
    const { icons, sprites } = await generateAll();
    expect(icons.size).toBeGreaterThan(0);
    expect(sprites.size).toBeGreaterThan(0);
    for (const [name, bytes] of icons) {
      expect(Buffer.compare(bytes, committed(ICONS_DIR, name)), `icon ${name} drifted`).toBe(0);
    }
    for (const [name, bytes] of sprites) {
      expect(Buffer.compare(bytes, committed(SPRITES_DIR, name)), `sprite ${name} drifted`).toBe(0);
    }
  });

  it("adding a new material ramp leaves every committed icon byte-identical", async () => {
    (materialPalettes as Record<string, unknown>)[DECOY_NAME] = DECOY_RAMP;
    const { icons } = await generateAll();
    expect(icons.size).toBeGreaterThan(0);
    for (const [name, bytes] of icons) {
      expect(
        Buffer.compare(bytes, committed(ICONS_DIR, name)),
        `icon "${name}" changed when an unrelated material ramp was added — quantization is not scoped to the ramps this icon's source declares (scripts/art/icons.mjs SOURCE_PALETTES)`,
      ).toBe(0);
    }
  });

  it("adding a new material ramp leaves every committed combat sprite byte-identical", async () => {
    (materialPalettes as Record<string, unknown>)[DECOY_NAME] = DECOY_RAMP;
    const { sprites } = await generateAll();
    expect(sprites.size).toBeGreaterThan(0);
    for (const [name, bytes] of sprites) {
      expect(
        Buffer.compare(bytes, committed(SPRITES_DIR, name)),
        `sprite "${name}" changed when an unrelated material ramp was added — quantization is not scoped to the ramps this sprite declares (scripts/art/sprites.mjs)`,
      ).toBe(0);
    }
  });
});

/**
 * Zone isolation (#261). `zonePalettes` had no scoping allowlist at all — `buildNamedPalette`
 * emitted every zone unconditionally, so adding a zone entry could silently recolor unrelated
 * shipped icons and sprites just as an unscoped material ramp could (#252). This is the
 * decoy-ZONE counterpart to the decoy-ramp suite above: it installs a zone right next to `town`
 * (the icon/sprite registries' most common zone dependency), regenerates the complete icon and
 * sprite sets, and asserts every committed asset's bytes are untouched. Under the old
 * globally-emitted-zone behavior this fails loudly (`buildNamedPalette`/`quantizeGrid` had no
 * zone allowlist to scope with); under per-source/per-sprite zone scoping
 * (`icons.mjs`'s `SOURCE_PALETTES`/`paletteForSource`, `sprites.mjs`'s per-sprite `zoneNames`) it
 * passes because no asset declares the decoy zone.
 */
describe("zone-palette isolation (#261): a zone cannot alter an asset that does not use it", () => {
  afterEach(() => {
    delete (zonePalettes as Record<string, unknown>)[DECOY_ZONE_NAME];
  });

  // Non-vacuous control, mirroring the material-ramp suite's control above.
  it("control: with no decoy zone, every generated icon and sprite matches its committed bytes", async () => {
    const { icons, sprites } = await generateAll();
    expect(icons.size).toBeGreaterThan(0);
    expect(sprites.size).toBeGreaterThan(0);
    for (const [name, bytes] of icons) {
      expect(Buffer.compare(bytes, committed(ICONS_DIR, name)), `icon ${name} drifted`).toBe(0);
    }
    for (const [name, bytes] of sprites) {
      expect(Buffer.compare(bytes, committed(SPRITES_DIR, name)), `sprite ${name} drifted`).toBe(0);
    }
  });

  it("adding a new zone leaves every committed icon byte-identical", async () => {
    (zonePalettes as Record<string, unknown>)[DECOY_ZONE_NAME] = DECOY_ZONE;
    const { icons } = await generateAll();
    expect(icons.size).toBeGreaterThan(0);
    for (const [name, bytes] of icons) {
      expect(
        Buffer.compare(bytes, committed(ICONS_DIR, name)),
        `icon "${name}" changed when an unrelated zone was added — quantization is not scoped to the zones this icon's source declares (scripts/art/icons.mjs SOURCE_PALETTES)`,
      ).toBe(0);
    }
  });

  it("adding a new zone leaves every committed combat sprite byte-identical", async () => {
    (zonePalettes as Record<string, unknown>)[DECOY_ZONE_NAME] = DECOY_ZONE;
    const { sprites } = await generateAll();
    expect(sprites.size).toBeGreaterThan(0);
    for (const [name, bytes] of sprites) {
      expect(
        Buffer.compare(bytes, committed(SPRITES_DIR, name)),
        `sprite "${name}" changed when an unrelated zone was added — quantization is not scoped to the zones this sprite declares (scripts/art/sprites.mjs)`,
      ).toBe(0);
    }
  });
});
