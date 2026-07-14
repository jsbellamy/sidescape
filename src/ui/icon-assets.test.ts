import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { buildContactSheets } from "../../scripts/art/contact-sheet.mjs";
import { icons as generatedIcons } from "../../scripts/art/icons.mjs";
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

const iconFiles = readdirSync(ICONS_DIR)
  .filter((f) => f.endsWith(".png"))
  .sort();

function decode(fileName: string): DecodedIcon {
  const png = PNG.sync.read(readFileSync(`${ICONS_DIR}/${fileName}`));
  return { width: png.width, height: png.height, data: png.data };
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
