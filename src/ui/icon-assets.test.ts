import { readdirSync, readFileSync, mkdtempSync, writeFileSync, cpSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { buildContactSheets } from "../../scripts/art/contact-sheet.mjs";
import { createCanvas } from "../../scripts/art/icon-canvas.mjs";
import {
  loadSourceGrid,
  paintSourceIcon,
  RELIEF_RAMP_REFS,
} from "../../scripts/art/icon-source.mjs";
import {
  icons as generatedIcons,
  SLOT_RELIEF_SOURCES,
  validateIconEntry,
  writeIcons,
  paletteForSource,
} from "../../scripts/art/icons.mjs";
import { P } from "../../scripts/art/palettes.mjs";
import { buildNamedPalette } from "../../scripts/art/trace-core.mjs";
import {
  checkBinaryAlpha,
  checkClusterNoise,
  checkColorBudget,
  checkConnected,
  checkFill,
  checkMargin,
  checkStructuralConnected,
  countSingletonColorClusters,
  type DecodedIcon,
  findStaleExemptions,
  RULE_IDS,
  type RuleId,
} from "./icon-lint";
import { ICON_LINT_EXEMPTIONS } from "./icon-lint-exemptions";

/** Icons allowed exactly one intermediate alpha VALUE for the `binary-alpha` rule (art-style.md's
 * existing ghost/wisp exception) — not a lint bypass, a permanent rule parameter. */
const TRANSLUCENT_ALLOWED = ["shade-wisp"];

const ICONS_DIR = fileURLToPath(new URL("../assets/icons", import.meta.url));
const ICON_SOURCES_DIR = fileURLToPath(new URL("../../scripts/art/icon-sources", import.meta.url));

const iconFiles = readdirSync(ICONS_DIR)
  .filter((f) => f.endsWith(".png"))
  .sort();

function decode(fileName: string): DecodedIcon {
  const png = PNG.sync.read(readFileSync(`${ICONS_DIR}/${fileName}`));
  return { width: png.width, height: png.height, data: png.data };
}

function alphaMask(icon: DecodedIcon): string {
  const bits: number[] = [];
  for (let i = 3; i < icon.data.length; i += 4) bits.push(icon.data[i]! > 0 ? 1 : 0);
  return bits.join("");
}

function opaqueColors(icon: DecodedIcon): Set<string> {
  const colors = new Set<string>();
  for (let i = 0; i < icon.data.length; i += 4) {
    if (!icon.data[i + 3]) continue;
    colors.add(
      [icon.data[i], icon.data[i + 1], icon.data[i + 2]]
        .map((v) => (v ?? 0).toString(16).padStart(2, "0"))
        .join(""),
    );
  }
  return colors;
}

const RULE_CHECKS: Record<RuleId, (icon: DecodedIcon, iconName: string) => boolean> = {
  "color-budget": (icon) => checkColorBudget(icon),
  "binary-alpha": (icon, iconName) =>
    checkBinaryAlpha(icon, TRANSLUCENT_ALLOWED.includes(iconName)),
  margin: (icon) => checkMargin(icon),
  fill: (icon) => checkFill(icon),
  connected: (icon) => checkConnected(icon),
};

// One decode per file, reused across every rule's it() and by the staleness check below.
const decoded = new Map(iconFiles.map((f) => [f.replace(/\.png$/, ""), decode(f)]));
const generatedIconNames = generatedIcons.map((icon) => icon.name);

describe("icon PNG lint (#166)", () => {
  it.each(generatedIconNames)("%s uses four-connected structural joins", (iconName) => {
    expect(checkStructuralConnected(decoded.get(iconName)!)).toBe(true);
  });

  it.each(generatedIconNames)("%s limits isolated one-pixel color clusters", (iconName) => {
    const icon = decoded.get(iconName)!;
    expect(
      checkClusterNoise(icon),
      `${iconName} has ${countSingletonColorClusters(icon)} isolated one-pixel color clusters`,
    ).toBe(true);
  });

  describe.each(iconFiles.map((f) => f.replace(/\.png$/, "")))("%s", (iconName) => {
    it.each(RULE_IDS)("passes %s unless exempted", (rule) => {
      const icon = decoded.get(iconName)!;
      const pass = RULE_CHECKS[rule](icon, iconName);
      const exempt = (ICON_LINT_EXEMPTIONS[iconName] ?? []).includes(rule);
      if (exempt) {
        // Exempted: the rule may fail today. (Staleness — an exemption whose icon now passes —
        // is asserted separately below, once, across the whole baseline.)
        return;
      }
      expect(pass).toBe(true);
    });
  });

  it("has no stale exemptions: every exempted icon still fails the rule it's exempted from", () => {
    const stale = findStaleExemptions(ICON_LINT_EXEMPTIONS, (iconName, rule) => {
      const icon = decoded.get(iconName);
      if (!icon) return false; // handled by the "every exemption names a real icon" check below
      return RULE_CHECKS[rule](icon, iconName);
    });
    expect(
      stale,
      stale
        .map((s) => `stale exemption — delete this entry: "${s.icon}" no longer fails "${s.rule}"`)
        .join("\n"),
    ).toEqual([]);
  });

  it("every exemption entry names a real icon file", () => {
    for (const iconName of Object.keys(ICON_LINT_EXEMPTIONS)) {
      expect(decoded.has(iconName)).toBe(true);
    }
  });

  it("bronze-chainbody does not retain steel-ramp pixels", () => {
    const bronze = decoded.get("bronze-chainbody")!;
    const steel = new Set(["59636d", "8d99a3", "c4ccd1", "eef2f2"]);
    const leaked = new Set<string>();
    for (let i = 0; i < bronze.data.length; i += 4) {
      if (!bronze.data[i + 3]) continue;
      const hex = [bronze.data[i], bronze.data[i + 1], bronze.data[i + 2]]
        .map((value) => (value ?? 0).toString(16).padStart(2, "0"))
        .join("");
      if (steel.has(hex)) leaked.add(hex);
    }
    expect([...leaked], "bronze-chainbody contains un-recolored steel pixels").toEqual([]);
  });

  // The committed color and silhouette sheets are `npm run art` output, not hand-edited — this
  // fails if an icon changed without regenerating them, so visual review never uses stale inputs.
  it("committed contact sheets are in sync with src/assets/icons (regenerate with `npm run art`)", () => {
    const docsDir = fileURLToPath(new URL("../../docs", import.meta.url));
    const committed1x = readFileSync(`${docsDir}/icon-sheet-1x.png`);
    const committed4x = readFileSync(`${docsDir}/icon-sheet-4x.png`);
    const committedSilhouette1x = readFileSync(`${docsDir}/icon-silhouette-sheet-1x.png`);
    const built = buildContactSheets(ICONS_DIR);
    expect(Buffer.compare(built.onePx, committed1x)).toBe(0);
    expect(Buffer.compare(built.fourX, committed4x)).toBe(0);
    expect(Buffer.compare(built.silhouetteOnePx, committedSilhouette1x)).toBe(0);
  });
});

describe("empty-slot reliefs (#306)", () => {
  const slotNames = Object.keys(SLOT_RELIEF_SOURCES);
  const byRef = new Map(buildNamedPalette().map((e) => [e.ref, e.hex ?? ""] as [string, string]));
  const inkHex = (P.ink as string).replace("#", "").toLowerCase();
  const allowedHex = new Set([
    inkHex,
    ...RELIEF_RAMP_REFS.map((ref) => (byRef.get(ref) as string).replace("#", "").toLowerCase()),
  ]);

  it("registers all eleven stable slot-* keys as source-driven reliefs", () => {
    expect(slotNames).toHaveLength(11);
    for (const name of slotNames) {
      const entry = generatedIcons.find((icon) => icon.name === name) as
        { name: string; source?: string; paint?: unknown; opts?: { relief?: boolean } } | undefined;
      expect(entry?.source).toBe(SLOT_RELIEF_SOURCES[name as keyof typeof SLOT_RELIEF_SOURCES]);
      expect(entry?.opts?.relief).toBe(true);
      expect(entry?.paint).toBeUndefined();
    }
  });

  it("rejects relief on a paint entry", () => {
    expect(() =>
      validateIconEntry({ name: "bad-slot", paint: () => {}, opts: { relief: true } }),
    ).toThrow(/relief is source-driven only/);
  });

  it.each(slotNames)("%s uses only P.ink plus the five relief neutrals", (name) => {
    const colors = opaqueColors(decoded.get(name)!);
    for (const c of colors) expect(allowedHex.has(c)).toBe(true);
  });

  it.each(slotNames)("%s uses at least three interior relief values", (name) => {
    const colors = opaqueColors(decoded.get(name)!);
    colors.delete(inkHex);
    expect(colors.size).toBeGreaterThanOrEqual(3);
  });

  it.each(slotNames)(
    "%s mask matches its mapped compact source after outline derivation",
    (name) => {
      const source = SLOT_RELIEF_SOURCES[name as keyof typeof SLOT_RELIEF_SOURCES];
      const canvas = createCanvas();
      paintSourceIcon(canvas, loadSourceGrid(`${ICON_SOURCES_DIR}/${source}`), {
        relief: true,
        scope: paletteForSource(source),
      });
      const fn = canvas.toPixelFn();
      const expected: number[] = [];
      for (let y = 0; y < 34; y++)
        for (let x = 0; x < 34; x++) expected.push(fn(x, y)[3]! > 0 ? 1 : 0);
      expect(alphaMask(decoded.get(name)!)).toBe(expected.join(""));
    },
  );

  it("is byte-identical when regenerated into a temp dir", async () => {
    const dir = mkdtempSync(join(tmpdir(), "slot-relief-"));
    try {
      await writeIcons(dir);
      for (const name of slotNames) {
        const committed = readFileSync(`${ICONS_DIR}/${name}.png`);
        const regenerated = readFileSync(`${dir}/${name}.png`);
        expect(Buffer.compare(committed, regenerated)).toBe(0);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("changing one mapped source changes only that slot's relief output", async () => {
    const sourcesCopy = mkdtempSync(join(tmpdir(), "slot-sources-"));
    const outA = mkdtempSync(join(tmpdir(), "slot-out-a-"));
    const outB = mkdtempSync(join(tmpdir(), "slot-out-b-"));
    try {
      cpSync(ICON_SOURCES_DIR, sourcesCopy, { recursive: true });
      await writeIcons(outA, { sourcesDir: sourcesCopy });

      // Flip one opaque interior cell of the sword source so only slot-weapon's relief can change.
      const swordPath = join(sourcesCopy, "golden-weapon-iron-sword.png");
      const png = PNG.sync.read(readFileSync(swordPath));
      let flipped = false;
      for (let i = 0; i < png.data.length; i += 4) {
        if (png.data[i + 3] === 0) continue;
        png.data[i] = 255 - (png.data[i] ?? 0);
        png.data[i + 1] = 255 - (png.data[i + 1] ?? 0);
        png.data[i + 2] = 255 - (png.data[i + 2] ?? 0);
        flipped = true;
        break;
      }
      expect(flipped).toBe(true);
      writeFileSync(swordPath, PNG.sync.write(png));

      await writeIcons(outB, { sourcesDir: sourcesCopy });

      expect(
        Buffer.compare(
          readFileSync(`${outA}/slot-weapon.png`),
          readFileSync(`${outB}/slot-weapon.png`),
        ),
      ).not.toBe(0);
      for (const name of slotNames) {
        if (name === "slot-weapon") continue;
        expect(
          Buffer.compare(readFileSync(`${outA}/${name}.png`), readFileSync(`${outB}/${name}.png`)),
        ).toBe(0);
      }
    } finally {
      rmSync(sourcesCopy, { recursive: true, force: true });
      rmSync(outA, { recursive: true, force: true });
      rmSync(outB, { recursive: true, force: true });
    }
  });
});
