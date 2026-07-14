import { fileURLToPath } from "node:url";
import { createCanvas, writeIcon } from "./icon-canvas.mjs";
import { loadSourceGrid, paintSourceIcon } from "./icon-source.mjs";
import { writePng } from "./write-png.mjs";

/** Directory holding committed compact icon sources (`<name>.png`) for source-driven icons —
 * produced by `npm run art:ingest` from prompt-kit generations (docs/icon-gen.md) and conformed to
 * house style at build by `paintSourceIcon`. */
const ICON_SOURCES_DIR = fileURLToPath(new URL("./icon-sources", import.meta.url));

/**
 * The material ramps AND zones each committed icon SOURCE quantizes into (#252, #261) — the
 * vocabulary `paintSourceIcon` is allowed to snap that source's cells to.
 *
 * This is keyed by source, not by icon, because quantization reads the source art only: every tier
 * variant of a family shares one source and therefore one palette scope, and their differences
 * come later, from the explicit `opts.recolor` map. A material ramp or zone NOT listed here can
 * never win a cell of this source, which is the whole point: `quantizeGrid` picks the globally
 * nearest palette entry, so before this table existed, merely ADDING a ramp or zone re-quantized
 * unrelated shipped icons (adding `adamant` — a green metal — put a green patch on
 * mithril-chainbody; `zonePalettes` had no allowlist at all, so a new zone could do the same; see
 * `buildNamedPalette`'s doc and the `src/ui/art-ramp-isolation.test.ts` regression test).
 *
 * `zoneNames` is a PALETTE dependency, not a semantic Area ownership claim — a source may
 * legitimately list several zones because its raw, off-palette pixels happen to quantize nearest
 * to entries from each of them under today's full palette. Each entry's lists are exactly the
 * material ramps and zones that actually win at least one cell of that source. Removing the ones
 * that never win cannot change any cell's nearest color, so scoping reproduces the pre-#252/#261
 * shipped bytes exactly. To add a source: quantize it against the full palette once and record
 * what it lands on. A source missing from this table throws in `writeIcons` rather than silently
 * falling back to the every-entry palette.
 */
const SOURCE_PALETTES = {
  "golden-armor-kiteshield.png": {
    materialRampNames: ["ember", "gold", "steel"],
    zoneNames: ["town", "sewer", "meadow"],
  },
  "golden-base-air-rune.png": { materialRampNames: ["water"], zoneNames: ["meadow", "forest"] },
  "golden-base-apprentice-staff.png": {
    materialRampNames: ["ember", "gold", "steel"],
    zoneNames: ["town", "crypt", "sewer"],
  },
  "golden-base-bronze-arrow.png": { materialRampNames: ["ember"], zoneNames: ["town"] },
  "golden-base-bronze-shield.png": {
    materialRampNames: ["ember", "gold", "steel"],
    zoneNames: ["town", "meadow", "crypt", "sewer"],
  },
  "golden-base-cowhide.png": { materialRampNames: ["blood"], zoneNames: ["town"] },
  "golden-base-fishing-frog.png": { materialRampNames: [], zoneNames: ["sewer", "meadow"] },
  "golden-base-guam-herb.png": {
    materialRampNames: [],
    zoneNames: ["sewer", "forest", "meadow", "town"],
  },
  "golden-base-iron-chainbody.png": {
    materialRampNames: ["steel"],
    zoneNames: ["sewer", "forest", "crypt"],
  },
  "golden-base-iron-full-helm.png": { materialRampNames: ["steel"], zoneNames: ["sewer"] },
  "golden-base-kiln-cat.png": { materialRampNames: ["blood", "ember"], zoneNames: ["town"] },
  "golden-base-leather-chaps.png": { materialRampNames: [], zoneNames: ["town"] },
  "golden-base-leather-coif.png": { materialRampNames: [], zoneNames: ["town"] },
  "golden-base-raw-pike.png": {
    materialRampNames: [],
    zoneNames: ["forest", "crypt", "meadow", "sewer"],
  },
  "golden-base-raw-shrimp.png": { materialRampNames: ["blood", "ember"], zoneNames: ["town"] },
  "golden-base-raw-trout.png": {
    materialRampNames: ["steel", "water"],
    zoneNames: ["town", "forest", "meadow", "crypt", "sewer"],
  },
  "golden-base-rock-golem.png": {
    materialRampNames: ["steel"],
    zoneNames: ["crypt", "sewer", "town"],
  },
  "golden-base-sapphire-amulet.png": {
    materialRampNames: ["ember", "gold", "steel", "water"],
    zoneNames: ["meadow"],
  },
  "golden-base-sapphire-ring.png": {
    materialRampNames: ["ember", "gold", "water"],
    zoneNames: ["meadow", "forest", "town"],
  },
  "golden-base-sapphire.png": { materialRampNames: ["water"], zoneNames: ["meadow", "crypt"] },
  "golden-base-shade-blade.png": { materialRampNames: [], zoneNames: ["crypt"] },
  "golden-base-shade-wisp.png": { materialRampNames: ["steel"], zoneNames: ["crypt"] },
  "golden-base-shortbow.png": { materialRampNames: [], zoneNames: ["town"] },
  "golden-consumable-red-potion.png": {
    materialRampNames: ["blood", "ember"],
    zoneNames: ["town", "crypt", "sewer"],
  },
  "golden-item-bronze-dagger.png": {
    materialRampNames: ["ember", "gold"],
    zoneNames: ["town", "meadow"],
  },
  "golden-item-bronze-mace.png": {
    materialRampNames: ["ember", "gold"],
    zoneNames: ["meadow", "town"],
  },
  "golden-item-goblin-charm.png": {
    materialRampNames: [],
    zoneNames: ["town", "meadow", "forest", "sewer"],
  },
  "golden-item-gold.png": {
    materialRampNames: ["ember", "gold"],
    zoneNames: ["town", "meadow", "sewer"],
  },
  "golden-item-leather-body.png": { materialRampNames: [], zoneNames: ["town"] },
  "golden-item-raw-beef.png": { materialRampNames: ["blood"], zoneNames: [] },
  "golden-resource-iron-bar.png": { materialRampNames: ["steel"], zoneNames: ["sewer", "crypt"] },
  "golden-skill-cooking.png": {
    materialRampNames: ["blood", "ember", "gold"],
    zoneNames: ["town"],
  },
  "golden-skill-crafting-v2.png": {
    materialRampNames: ["ember", "gold", "steel", "water"],
    zoneNames: ["town", "sewer", "forest"],
  },
  "golden-skill-herblore.png": {
    materialRampNames: [],
    zoneNames: ["meadow", "forest", "town", "crypt"],
  },
  "golden-skill-hitpoints.png": { materialRampNames: ["ember", "gold"], zoneNames: ["town"] },
  "golden-skill-smithing.png": {
    materialRampNames: ["steel"],
    zoneNames: ["sewer", "town", "crypt", "forest"],
  },
  "golden-tab-bank.png": { materialRampNames: ["ember", "gold"], zoneNames: ["meadow", "town"] },
  "golden-tab-character.png": { materialRampNames: ["blood", "gold"], zoneNames: ["town"] },
  "golden-tab-loot.png": {
    materialRampNames: ["ember", "gold"],
    zoneNames: ["town", "meadow", "sewer"],
  },
  "golden-tab-skills.png": { materialRampNames: [], zoneNames: ["town", "sewer", "meadow"] },
  "golden-tab-vendor.png": { materialRampNames: ["ember", "gold"], zoneNames: ["town", "meadow"] },
  "golden-tab-world-v2.png": {
    materialRampNames: ["ember", "steel", "water"],
    zoneNames: ["town", "forest", "meadow", "crypt", "sewer"],
  },
  "golden-weapon-iron-sword.png": {
    materialRampNames: ["gold", "steel"],
    zoneNames: ["sewer", "meadow", "town", "forest"],
  },
  "skill-attack.png": {
    materialRampNames: ["ember", "gold", "steel"],
    zoneNames: ["sewer", "town"],
  },
  "skill-fishing.png": { materialRampNames: ["steel", "water"], zoneNames: [] },
  "skill-strength.png": { materialRampNames: ["ember"], zoneNames: ["town"] },
};

/** The `{ materialRampNames, zoneNames }` scope a given icon source may quantize into. Exported
 * for the ramp/zone-isolation regression test, which asserts no asset depends on a material ramp
 * or zone it does not declare. Throws loudly rather than falling back to the every-entry palette,
 * per this issue's acceptance criteria. */
export function paletteForSource(source) {
  const scope = SOURCE_PALETTES[source];
  if (!scope) {
    throw new Error(
      `icons.mjs: source ${JSON.stringify(source)} has no SOURCE_PALETTES entry — declare the material ramps and zones it quantizes into (see SOURCE_PALETTES' doc)`,
    );
  }
  return scope;
}

const sapphireToEmerald = {
  "forest[1]": "meadow[4]",
  "water.shadow": "meadow[4]",
  "water.base": "meadow[3]",
  "water.light": "meadow[2]",
  "water.glint": "forest[5]",
  "meadow[0]": "forest[3]",
};
const sapphireToRuby = {
  "forest[1]": "blood.shadow",
  "water.shadow": "blood.shadow",
  "water.base": "blood.base",
  "water.light": "blood.light",
  "water.glint": "blood.glint",
  "meadow[0]": "blood.light",
};

/**
 * Complete production registry for Skill, workspace/navigation, item, and pet icons. Each entry
 * either paints on the shared 34×34 canvas or renders an approved compact source, using only the
 * master, zone, and material ramps pinned by `docs/art-style.md`.
 */
export const icons = [
  // --- Skill icons (SKILL_NAMES order) ---
  {
    // Canonical SOURCE-DRIVEN icon (docs/icon-gen.md): its committed compact source
    // scripts/art/icon-sources/skill-attack.png (ingested from a prompt-kit generation) is quantized
    // to the named ramps and given one derived warm-ink ring by `paintSourceIcon` at build.
    name: "skill-attack",
    source: "skill-attack.png",
  },
  {
    // Source-driven (docs/icon-gen.md): committed compact source scripts/art/icon-sources/
    // skill-strength.png (ingested from a prompt-kit generation of a clenched fist) is quantized to
    // the named ramps and given one derived warm-ink ring by `paintSourceIcon` at build.
    name: "skill-strength",
    source: "skill-strength.png",
  },
  {
    name: "skill-defence",
    source: "golden-armor-kiteshield.png",
  },
  {
    name: "skill-hitpoints",
    source: "golden-skill-hitpoints.png",
  },
  {
    name: "skill-fishing",
    source: "golden-base-raw-trout.png",
  },
  {
    name: "skill-smithing",
    source: "golden-skill-smithing.png",
  },
  {
    name: "skill-ranged",
    source: "golden-base-shortbow.png",
  },
  {
    name: "skill-magic",
    source: "golden-base-apprentice-staff.png",
  },
  {
    name: "skill-cooking",
    source: "golden-skill-cooking.png",
  },
  {
    name: "skill-crafting",
    source: "golden-skill-crafting-v2.png",
  },
  {
    name: "skill-herblore",
    source: "golden-skill-herblore.png",
  },
  // --- Workspace/navigation icons ---
  { name: "tab-world", source: "golden-tab-world-v2.png" },
  { name: "tab-skills", source: "golden-tab-skills.png" },
  { name: "tab-character", source: "golden-tab-character.png" },
  { name: "tab-bank", source: "golden-tab-bank.png" },
  { name: "tab-vendor", source: "golden-tab-vendor.png" },
  { name: "tab-loot", source: "golden-tab-loot.png" },
  // --- Potion family ---
  // One approved bottle silhouette, with only its three liquid planes remapped per target. Glass,
  // cork, lighting, scale, and outline remain identical across the family.
  {
    name: "strength-potion",
    source: "golden-consumable-red-potion.png",
  },
  {
    name: "attack-potion",
    source: "golden-consumable-red-potion.png",
    opts: {
      recolor: {
        "blood.shadow": "ember.shadow",
        "blood.base": "ember.base",
        "blood.light": "ember.light",
      },
    },
  },
  {
    name: "fishing-potion",
    source: "golden-consumable-red-potion.png",
    opts: {
      recolor: {
        "blood.shadow": "water.shadow",
        "blood.base": "water.base",
        "blood.light": "water.light",
      },
    },
  },
  {
    name: "production-potion",
    source: "golden-consumable-red-potion.png",
    opts: {
      recolor: {
        "blood.shadow": "crypt[1]",
        "blood.base": "crypt[2]",
        "blood.light": "crypt[3]",
      },
    },
  },
  // --- Herb family ---
  // The tied five-leaf sprig is canonical; progression is communicated by leaf ramp only.
  {
    name: "guam-herb",
    source: "golden-base-guam-herb.png",
  },
  {
    name: "marrentill-herb",
    source: "golden-base-guam-herb.png",
    opts: {
      recolor: {
        "sewer[4]": "forest[4]",
        "meadow[4]": "forest[0]",
        "meadow[2]": "forest[1]",
        "sewer[3]": "forest[2]",
        "sewer[5]": "forest[3]",
      },
    },
  },
  {
    name: "tarromin-herb",
    source: "golden-base-guam-herb.png",
    opts: {
      recolor: {
        "meadow[4]": "sewer[0]",
        "meadow[2]": "sewer[1]",
        "sewer[3]": "sewer[2]",
      },
    },
  },
  {
    name: "harralander-herb",
    source: "golden-base-guam-herb.png",
    opts: {
      recolor: {
        "sewer[4]": "forest[4]",
        "meadow[2]": "meadow[3]",
        "sewer[3]": "meadow[2]",
        "sewer[5]": "forest[2]",
      },
    },
  },
  // --- Raw/cooked food family ---
  // Cooked foods are palette-state variants of their raw species source; no cooked silhouette is
  // generated independently.
  {
    name: "raw-beef",
    source: "golden-item-raw-beef.png",
  },
  {
    name: "cooked-meat",
    source: "golden-item-raw-beef.png",
    opts: {
      recolor: {
        "blood.shadow": "town[0]",
        "blood.base": "town[1]",
        "blood.glint": "town[4]",
      },
    },
  },
  {
    name: "raw-shrimp",
    source: "golden-base-raw-shrimp.png",
  },
  {
    name: "cooked-shrimp",
    source: "golden-base-raw-shrimp.png",
    opts: {
      recolor: {
        "blood.shadow": "ember.shadow",
        "blood.base": "ember.base",
        "blood.light": "ember.light",
        "blood.glint": "ember.glint",
      },
    },
  },
  {
    name: "raw-trout",
    source: "golden-base-raw-trout.png",
  },
  {
    name: "cooked-trout",
    source: "golden-base-raw-trout.png",
    opts: {
      recolor: {
        "steel.shadow": "town[0]",
        "water.shadow": "ember.shadow",
        "meadow[0]": "ember.base",
        "water.light": "ember.light",
        "water.glint": "ember.glint",
      },
    },
  },
  {
    name: "raw-pike",
    source: "golden-base-raw-pike.png",
  },
  {
    name: "cooked-pike",
    source: "golden-base-raw-pike.png",
    opts: {
      recolor: {
        "forest[4]": "town[5]",
        "forest[0]": "town[0]",
        "meadow[4]": "town[0]",
        "meadow[3]": "town[1]",
        "meadow[2]": "ember.base",
        "forest[3]": "ember.light",
        "forest[5]": "ember.glint",
      },
    },
  },
  // --- Dagger family ---
  {
    name: "bronze-dagger",
    source: "golden-item-bronze-dagger.png",
  },
  {
    name: "iron-dagger",
    source: "golden-item-bronze-dagger.png",
    opts: {
      recolor: {
        "town[2]": "steel.shadow",
        "town[3]": "steel.base",
        "P.cream": "steel.light",
        "ember.glint": "steel.glint",
      },
    },
  },
  {
    name: "steel-dagger",
    source: "golden-item-bronze-dagger.png",
    opts: {
      recolor: {
        "town[2]": "P.outline",
        "town[3]": "steel.shadow",
        "P.cream": "steel.base",
        "ember.glint": "steel.light",
      },
    },
  },
  {
    name: "mithril-dagger",
    source: "golden-item-bronze-dagger.png",
    opts: {
      recolor: {
        "town[2]": "water.shadow",
        "town[3]": "water.base",
        "P.cream": "water.light",
        "ember.glint": "water.glint",
      },
    },
  },
  {
    // Gear Tier ladder, tiers 5/6 (#252): recolor of the shared bronze-dagger source, mapped
    // straight to the new adamant ramp — mirrors mithril-dagger's direct town[]->ramp mapping.
    name: "adamant-dagger",
    source: "golden-item-bronze-dagger.png",
    opts: {
      recolor: {
        "town[2]": "adamant.shadow",
        "town[3]": "adamant.base",
        "P.cream": "adamant.light",
        "ember.glint": "adamant.glint",
      },
    },
  },
  {
    name: "rune-dagger",
    source: "golden-item-bronze-dagger.png",
    opts: {
      recolor: {
        "town[2]": "rune.shadow",
        "town[3]": "rune.base",
        "P.cream": "rune.light",
        "ember.glint": "rune.glint",
      },
    },
  },
  // --- Sword family ---
  {
    name: "iron-sword",
    source: "golden-weapon-iron-sword.png",
  },
  {
    name: "bronze-sword",
    source: "golden-weapon-iron-sword.png",
    opts: { recolor: { "steel.base": "town[2]", "P.text": "town[4]" } },
  },
  {
    name: "steel-sword",
    source: "golden-weapon-iron-sword.png",
    opts: { recolor: { "steel.base": "steel.shadow", "P.text": "steel.base" } },
  },
  {
    name: "mithril-sword",
    source: "golden-weapon-iron-sword.png",
    opts: { recolor: { "steel.base": "water.shadow", "P.text": "water.light" } },
  },
  {
    // Gear Tier ladder, tiers 5/6 (#252): mirrors mithril-sword's steel.base->X.shadow,
    // P.text->X.light mapping shape, retargeted at the new adamant/rune ramps.
    name: "adamant-sword",
    source: "golden-weapon-iron-sword.png",
    opts: { recolor: { "steel.base": "adamant.shadow", "P.text": "adamant.light" } },
  },
  {
    name: "rune-sword",
    source: "golden-weapon-iron-sword.png",
    opts: { recolor: { "steel.base": "rune.shadow", "P.text": "rune.light" } },
  },
  // --- Mace family ---
  {
    name: "bronze-mace",
    source: "golden-item-bronze-mace.png",
  },
  {
    name: "iron-mace",
    source: "golden-item-bronze-mace.png",
    opts: {
      recolor: {
        "ember.shadow": "P.outline",
        "town[0]": "steel.shadow",
        "town[1]": "steel.shadow",
        "town[2]": "steel.base",
        "town[3]": "steel.light",
        "town[4]": "steel.glint",
        "ember.light": "steel.glint",
      },
    },
  },
  {
    name: "steel-mace",
    source: "golden-item-bronze-mace.png",
    opts: {
      recolor: {
        "ember.shadow": "P.ink",
        "town[0]": "P.outline",
        "town[1]": "steel.shadow",
        "town[2]": "steel.shadow",
        "town[3]": "steel.base",
        "town[4]": "steel.light",
        "ember.light": "steel.light",
      },
    },
  },
  {
    name: "mithril-mace",
    source: "golden-item-bronze-mace.png",
    opts: {
      recolor: {
        "ember.shadow": "P.outline",
        "town[0]": "water.shadow",
        "town[1]": "water.shadow",
        "town[2]": "water.base",
        "town[3]": "water.light",
        "town[4]": "water.glint",
        "ember.light": "water.glint",
      },
    },
  },
  {
    // Gear Tier ladder, tiers 5/6 (#252): mirrors mithril-mace's mapping shape, retargeted at the
    // new adamant ramp.
    name: "adamant-mace",
    source: "golden-item-bronze-mace.png",
    opts: {
      recolor: {
        "ember.shadow": "P.outline",
        "town[0]": "adamant.shadow",
        "town[1]": "adamant.shadow",
        "town[2]": "adamant.base",
        "town[3]": "adamant.light",
        "town[4]": "adamant.glint",
        "ember.light": "adamant.glint",
      },
    },
  },
  {
    name: "rune-mace",
    source: "golden-item-bronze-mace.png",
    opts: {
      recolor: {
        "ember.shadow": "P.outline",
        "town[0]": "rune.shadow",
        "town[1]": "rune.shadow",
        "town[2]": "rune.base",
        "town[3]": "rune.light",
        "town[4]": "rune.glint",
        "ember.light": "rune.glint",
      },
    },
  },
  // --- Shield families ---
  {
    name: "bronze-shield",
    source: "golden-base-bronze-shield.png",
  },
  {
    name: "iron-kiteshield",
    source: "golden-armor-kiteshield.png",
  },
  {
    name: "steel-kiteshield",
    source: "golden-armor-kiteshield.png",
    opts: {
      recolor: {
        "steel.shadow": "P.outline",
        "steel.base": "steel.shadow",
        "steel.light": "steel.base",
      },
    },
  },
  {
    name: "mithril-kiteshield",
    source: "golden-armor-kiteshield.png",
    opts: {
      recolor: {
        "steel.shadow": "water.shadow",
        "steel.base": "water.base",
        "steel.light": "water.light",
      },
    },
  },
  {
    // Gear Tier ladder, tiers 5/6 (#252): mirrors mithril-kiteshield's direct steel.*->ramp
    // mapping, retargeted at the new adamant/rune ramps.
    name: "adamant-kiteshield",
    source: "golden-armor-kiteshield.png",
    opts: {
      recolor: {
        "steel.shadow": "adamant.shadow",
        "steel.base": "adamant.base",
        "steel.light": "adamant.light",
      },
    },
  },
  {
    name: "rune-kiteshield",
    source: "golden-armor-kiteshield.png",
    opts: {
      recolor: {
        "steel.shadow": "rune.shadow",
        "steel.base": "rune.base",
        "steel.light": "rune.light",
      },
    },
  },
  // --- Chainbody family ---
  {
    // Gear Tier ladder (#251): bronze baseline, a recolor of the shared iron-chainbody source
    // (bronze armour never existed before this slice — see the issue's "New items this slice").
    // Mirrors the town[]-ramp mapping bronze-bar already uses for this same source family
    // (steel.shadow -> town[0], steel.base -> town[2], steel.glint -> town[4]).
    name: "bronze-chainbody",
    source: "golden-base-iron-chainbody.png",
    opts: {
      recolor: {
        "forest[1]": "town[0]",
        "sewer[1]": "town[0]",
        "sewer[0]": "P.outline",
        "steel.shadow": "town[0]",
        "steel.base": "town[2]",
        "steel.light": "town[3]",
        "steel.glint": "town[4]",
        'P["text-dim"]': "town[2]",
        "P.text": "town[4]",
      },
    },
  },
  {
    name: "iron-chainbody",
    source: "golden-base-iron-chainbody.png",
    opts: {
      recolor: {
        "forest[1]": "steel.shadow",
        "sewer[1]": "steel.shadow",
        "sewer[0]": "P.outline",
        'P["text-dim"]': "steel.base",
        "P.text": "steel.glint",
      },
    },
  },
  {
    name: "steel-chainbody",
    source: "golden-base-iron-chainbody.png",
    opts: {
      recolor: {
        "forest[1]": "P.outline",
        "sewer[1]": "P.outline",
        "sewer[0]": "P.ink",
        "steel.shadow": "P.outline",
        "steel.base": "steel.shadow",
        "steel.light": "steel.base",
        'P["text-dim"]': "steel.shadow",
        "P.text": "steel.light",
      },
    },
  },
  {
    name: "mithril-chainbody",
    source: "golden-base-iron-chainbody.png",
    opts: {
      recolor: {
        "forest[1]": "water.shadow",
        "sewer[1]": "water.shadow",
        "sewer[0]": "P.outline",
        "steel.shadow": "water.shadow",
        "steel.base": "water.base",
        "steel.light": "water.light",
        'P["text-dim"]': "water.base",
        "P.text": "water.glint",
      },
    },
  },
  {
    // Gear Tier ladder, tiers 5/6 (#252): mirrors mithril-chainbody's full mapping shape,
    // retargeted at the new adamant/rune ramps.
    name: "adamant-chainbody",
    source: "golden-base-iron-chainbody.png",
    opts: {
      recolor: {
        "forest[1]": "adamant.shadow",
        "sewer[1]": "adamant.shadow",
        "sewer[0]": "P.outline",
        "steel.shadow": "adamant.shadow",
        "steel.base": "adamant.base",
        "steel.light": "adamant.light",
        'P["text-dim"]': "adamant.base",
        "P.text": "adamant.glint",
      },
    },
  },
  {
    name: "rune-chainbody",
    source: "golden-base-iron-chainbody.png",
    opts: {
      recolor: {
        "forest[1]": "rune.shadow",
        "sewer[1]": "rune.shadow",
        "sewer[0]": "P.outline",
        "steel.shadow": "rune.shadow",
        "steel.base": "rune.base",
        "steel.light": "rune.light",
        'P["text-dim"]': "rune.base",
        "P.text": "rune.glint",
      },
    },
  },
  // --- Full-helm family ---
  {
    // Gear Tier ladder (#251): bronze baseline, a recolor of the shared iron-full-helm source
    // (bronze armour never existed before this slice). Mirrors mithril-full-helm's full
    // steel.*->target-ramp recolor below, targeting town[] instead of water.*.
    name: "bronze-full-helm",
    source: "golden-base-iron-full-helm.png",
    opts: {
      recolor: {
        'P["text-dim"]': "town[2]",
        "steel.shadow": "town[0]",
        "steel.base": "town[2]",
        "steel.light": "town[3]",
        "steel.glint": "town[4]",
      },
    },
  },
  {
    name: "iron-full-helm",
    source: "golden-base-iron-full-helm.png",
    opts: { recolor: { 'P["text-dim"]': "steel.base" } },
  },
  {
    name: "steel-full-helm",
    source: "golden-base-iron-full-helm.png",
    opts: {
      recolor: {
        'P["text-dim"]': "steel.shadow",
        "steel.shadow": "P.outline",
        "steel.base": "steel.shadow",
        "steel.light": "steel.base",
        "steel.glint": "steel.light",
      },
    },
  },
  {
    name: "mithril-full-helm",
    source: "golden-base-iron-full-helm.png",
    opts: {
      recolor: {
        'P["text-dim"]': "water.base",
        "steel.shadow": "water.shadow",
        "steel.base": "water.base",
        "steel.light": "water.light",
        "steel.glint": "water.glint",
      },
    },
  },
  {
    // Gear Tier ladder, tiers 5/6 (#252): mirrors mithril-full-helm's mapping shape, retargeted
    // at the new adamant/rune ramps.
    name: "adamant-full-helm",
    source: "golden-base-iron-full-helm.png",
    opts: {
      recolor: {
        'P["text-dim"]': "adamant.base",
        "steel.shadow": "adamant.shadow",
        "steel.base": "adamant.base",
        "steel.light": "adamant.light",
        "steel.glint": "adamant.glint",
      },
    },
  },
  {
    name: "rune-full-helm",
    source: "golden-base-iron-full-helm.png",
    opts: {
      recolor: {
        'P["text-dim"]': "rune.base",
        "steel.shadow": "rune.shadow",
        "steel.base": "rune.base",
        "steel.light": "rune.light",
        "steel.glint": "rune.glint",
      },
    },
  },
  // --- Shortbow family ---
  {
    name: "shortbow",
    source: "golden-base-shortbow.png",
  },
  {
    name: "iron-shortbow",
    source: "golden-base-shortbow.png",
    opts: {
      recolor: {
        "town[0]": "P.outline",
        "town[1]": "steel.shadow",
        "town[2]": "steel.base",
        "town[3]": "steel.light",
      },
    },
  },
  {
    name: "steel-shortbow",
    source: "golden-base-shortbow.png",
    opts: {
      recolor: {
        "town[0]": "P.ink",
        "town[1]": "P.outline",
        "town[2]": "steel.shadow",
        "town[3]": "steel.base",
      },
    },
  },
  {
    name: "mithril-shortbow",
    source: "golden-base-shortbow.png",
    opts: {
      recolor: {
        "town[0]": "P.outline",
        "town[1]": "water.shadow",
        "town[2]": "water.base",
        "town[3]": "water.light",
      },
    },
  },
  {
    // Gear Tier ladder, tiers 5/6 (#252): mirrors mithril-shortbow's mapping shape, retargeted at
    // the new adamant/rune ramps.
    name: "adamant-shortbow",
    source: "golden-base-shortbow.png",
    opts: {
      recolor: {
        "town[0]": "P.outline",
        "town[1]": "adamant.shadow",
        "town[2]": "adamant.base",
        "town[3]": "adamant.light",
      },
    },
  },
  {
    name: "rune-shortbow",
    source: "golden-base-shortbow.png",
    opts: {
      recolor: {
        "town[0]": "P.outline",
        "town[1]": "rune.shadow",
        "town[2]": "rune.base",
        "town[3]": "rune.light",
      },
    },
  },
  // --- Neutral staff family ---
  {
    name: "apprentice-staff",
    source: "golden-base-apprentice-staff.png",
  },
  {
    name: "iron-staff",
    source: "golden-base-apprentice-staff.png",
    opts: {
      recolor: {
        "town[0]": "P.outline",
        "town[1]": "steel.shadow",
        "town[2]": "steel.base",
        "ember.light": "steel.light",
      },
    },
  },
  {
    name: "steel-staff",
    source: "golden-base-apprentice-staff.png",
    opts: {
      recolor: {
        "town[0]": "P.ink",
        "town[1]": "P.outline",
        "town[2]": "steel.shadow",
        "ember.light": "steel.base",
      },
    },
  },
  {
    name: "mithril-staff",
    source: "golden-base-apprentice-staff.png",
    opts: {
      recolor: {
        "town[0]": "P.outline",
        "town[1]": "water.shadow",
        "town[2]": "water.base",
        "ember.light": "water.light",
      },
    },
  },
  {
    // Gear Tier ladder, tiers 5/6 (#252): mirrors mithril-staff's mapping shape, retargeted at
    // the new adamant/rune ramps.
    name: "adamant-staff",
    source: "golden-base-apprentice-staff.png",
    opts: {
      recolor: {
        "town[0]": "P.outline",
        "town[1]": "adamant.shadow",
        "town[2]": "adamant.base",
        "ember.light": "adamant.light",
      },
    },
  },
  {
    name: "rune-staff",
    source: "golden-base-apprentice-staff.png",
    opts: {
      recolor: {
        "town[0]": "P.outline",
        "town[1]": "rune.shadow",
        "town[2]": "rune.base",
        "ember.light": "rune.light",
      },
    },
  },
  // --- Metal bar family ---
  {
    name: "iron-bar",
    source: "golden-resource-iron-bar.png",
  },
  {
    name: "bronze-bar",
    source: "golden-resource-iron-bar.png",
    opts: {
      recolor: {
        "steel.shadow": "town[0]",
        "steel.base": "town[2]",
        "steel.light": "town[3]",
        "steel.glint": "town[4]",
      },
    },
  },
  {
    // Gear Tier ladder (#251): steel Equipment is now smithable, so a steel-bar Material must
    // exist. Recolor of the shared iron-bar source, one step darker than iron — mirrors the
    // steel-kiteshield/steel-full-helm "shift down" pattern (steel.shadow -> P.outline,
    // steel.base -> steel.shadow, steel.light -> steel.base) applied to this bar source's own
    // four-step ramp.
    name: "steel-bar",
    source: "golden-resource-iron-bar.png",
    opts: {
      recolor: {
        "steel.shadow": "P.outline",
        "steel.base": "steel.shadow",
        "steel.light": "steel.base",
        "steel.glint": "steel.light",
      },
    },
  },
  {
    // Gear Tier ladder (#251): mithril Equipment is now smithable, so a mithril-bar Material must
    // exist. Recolor of the shared iron-bar source, mapped straight to the water ramp — mirrors
    // mithril-chainbody/mithril-kiteshield/mithril-full-helm's steel.*->water.* recolor.
    name: "mithril-bar",
    source: "golden-resource-iron-bar.png",
    opts: {
      recolor: {
        "steel.shadow": "water.shadow",
        "steel.base": "water.base",
        "steel.light": "water.light",
        "steel.glint": "water.glint",
      },
    },
  },
  {
    // Gear Tier ladder, tiers 5/6 (#252): adamant Equipment is smithable, so an adamant-bar
    // Material must exist. Recolor of the shared iron-bar source, mapped straight to the new
    // adamant ramp — mirrors mithril-bar's direct steel.*->ramp mapping.
    name: "adamant-bar",
    source: "golden-resource-iron-bar.png",
    opts: {
      recolor: {
        "steel.shadow": "adamant.shadow",
        "steel.base": "adamant.base",
        "steel.light": "adamant.light",
        "steel.glint": "adamant.glint",
      },
    },
  },
  {
    // Gear Tier ladder, tiers 5/6 (#252): rune Equipment is smithable, so a rune-bar Material
    // must exist. Same mapping shape as adamant-bar, retargeted at the new rune ramp.
    name: "rune-bar",
    source: "golden-resource-iron-bar.png",
    opts: {
      recolor: {
        "steel.shadow": "rune.shadow",
        "steel.base": "rune.base",
        "steel.light": "rune.light",
        "steel.glint": "rune.glint",
      },
    },
  },
  // --- Hide family ---
  {
    name: "cowhide",
    source: "golden-base-cowhide.png",
  },
  {
    name: "wolf-hide",
    source: "golden-base-cowhide.png",
    opts: {
      recolor: {
        "town[1]": "steel.shadow",
        "town[2]": "steel.base",
        "town[3]": "steel.light",
        "town[4]": "steel.glint",
        "blood.glint": "steel.light",
        "P.sand": "steel.base",
      },
    },
  },
  {
    name: "thick-hide",
    source: "golden-base-cowhide.png",
    opts: {
      recolor: {
        "town[1]": "town[5]",
        "town[2]": "town[0]",
        "town[3]": "town[1]",
        "town[4]": "town[2]",
        "blood.glint": "town[3]",
        "P.sand": "town[2]",
      },
    },
  },
  // --- Leather armour families ---
  {
    name: "leather-body",
    source: "golden-item-leather-body.png",
  },
  {
    name: "hard-leather-body",
    source: "golden-item-leather-body.png",
    opts: {
      recolor: {
        "P.shadow": "town[5]",
        "P.umber": "town[0]",
        "town[1]": "town[0]",
        "town[2]": "town[1]",
        "town[3]": "town[2]",
        "town[4]": "town[3]",
      },
    },
  },
  {
    name: "leather-chaps",
    source: "golden-base-leather-chaps.png",
  },
  {
    name: "hard-leather-chaps",
    source: "golden-base-leather-chaps.png",
    opts: {
      recolor: {
        "P.shadow": "town[5]",
        "P.umber": "town[0]",
        "town[0]": "town[5]",
        "town[1]": "town[0]",
        "town[2]": "town[1]",
        "town[3]": "town[2]",
      },
    },
  },
  {
    name: "leather-coif",
    source: "golden-base-leather-coif.png",
  },
  {
    name: "hard-leather-coif",
    source: "golden-base-leather-coif.png",
    opts: {
      recolor: {
        "P.umber": "town[0]",
        "town[0]": "town[5]",
        "town[1]": "town[0]",
        "town[3]": "town[1]",
      },
    },
  },
  // --- Gem and jewelry families ---
  {
    name: "sapphire",
    source: "golden-base-sapphire.png",
  },
  {
    name: "emerald",
    source: "golden-base-sapphire.png",
    opts: { recolor: sapphireToEmerald },
  },
  {
    name: "ruby",
    source: "golden-base-sapphire.png",
    opts: { recolor: sapphireToRuby },
  },
  {
    name: "sapphire-amulet",
    source: "golden-base-sapphire-amulet.png",
  },
  {
    name: "emerald-amulet",
    source: "golden-base-sapphire-amulet.png",
    opts: { recolor: sapphireToEmerald },
  },
  {
    name: "ruby-amulet",
    source: "golden-base-sapphire-amulet.png",
    opts: { recolor: sapphireToRuby },
  },
  {
    name: "sapphire-ring",
    source: "golden-base-sapphire-ring.png",
    opts: { recolor: { "forest[1]": "water.shadow" } },
  },
  {
    name: "emerald-ring",
    source: "golden-base-sapphire-ring.png",
    opts: { recolor: sapphireToEmerald },
  },
  {
    name: "ruby-ring",
    source: "golden-base-sapphire-ring.png",
    opts: { recolor: sapphireToRuby },
  },
  // --- Arrow family ---
  {
    name: "bronze-arrow",
    source: "golden-base-bronze-arrow.png",
  },
  {
    name: "steel-arrow",
    source: "golden-base-bronze-arrow.png",
    opts: {
      recolor: {
        "town[2]": "steel.shadow",
        "town[3]": "steel.base",
        "town[4]": "steel.light",
        "ember.base": "steel.glint",
      },
    },
  },
  {
    name: "mithril-arrow",
    source: "golden-base-bronze-arrow.png",
    opts: {
      recolor: {
        "town[2]": "water.shadow",
        "town[3]": "water.base",
        "town[4]": "water.light",
        "ember.base": "water.glint",
      },
    },
  },
  {
    // Gear Tier ladder, tiers 5/6 (#252): ranged ammo parity with the new adamant/rune bows.
    // Mirrors mithril-arrow's mapping shape, retargeted at the new adamant ramp.
    name: "adamant-arrow",
    source: "golden-base-bronze-arrow.png",
    opts: {
      recolor: {
        "town[2]": "adamant.shadow",
        "town[3]": "adamant.base",
        "town[4]": "adamant.light",
        "ember.base": "adamant.glint",
      },
    },
  },
  {
    name: "rune-arrow",
    source: "golden-base-bronze-arrow.png",
    opts: {
      recolor: {
        "town[2]": "rune.shadow",
        "town[3]": "rune.base",
        "town[4]": "rune.light",
        "ember.base": "rune.glint",
      },
    },
  },
  // --- Elemental rune family ---
  {
    name: "air-rune",
    source: "golden-base-air-rune.png",
    opts: {
      recolor: {
        "forest[1]": "steel.shadow",
        "water.base": "steel.base",
        "meadow[0]": "steel.base",
        "water.light": "steel.light",
        "water.glint": "steel.glint",
      },
    },
  },
  {
    name: "water-rune",
    source: "golden-base-air-rune.png",
  },
  {
    name: "earth-rune",
    source: "golden-base-air-rune.png",
    opts: {
      recolor: {
        "forest[1]": "meadow[4]",
        "water.base": "meadow[3]",
        "meadow[0]": "meadow[2]",
        "water.light": "forest[3]",
        "water.glint": "forest[5]",
      },
    },
  },
  {
    name: "fire-rune",
    source: "golden-base-air-rune.png",
    opts: {
      recolor: {
        "forest[1]": "ember.shadow",
        "water.base": "ember.base",
        "meadow[0]": "ember.base",
        "water.light": "ember.light",
        "water.glint": "ember.glint",
      },
    },
  },
  // --- Approved singleton drops and pets ---
  { name: "gold", source: "golden-item-gold.png" },
  { name: "goblin-charm", source: "golden-item-goblin-charm.png" },
  { name: "shade-blade", source: "golden-base-shade-blade.png" },
  { name: "rock-golem", source: "golden-base-rock-golem.png" },
  { name: "fishing-frog", source: "golden-base-fishing-frog.png" },
  { name: "kiln-cat", source: "golden-base-kiln-cat.png" },
  { name: "shade-wisp", source: "golden-base-shade-wisp.png" },
];

/** Writes every icon in `icons` to `src/assets/icons/<name>.png` on the shared 34×34 canvas.
 * Called by `scripts/art/generate.mjs` as part of `npm run art`. An entry is either hand-authored
 * (`paint(canvas)`) or **source-driven** (`source: "<name>.png"` + optional `opts`), in which case
 * its committed compact source under `scripts/art/icon-sources/` is loaded and conformed to house
 * style by `paintSourceIcon`. Both paths render deterministically, so regeneration stays byte-stable. */
export async function writeIcons(destDir) {
  for (const icon of icons) {
    if (icon.source) {
      const grid = loadSourceGrid(`${ICON_SOURCES_DIR}/${icon.source}`);
      const canvas = createCanvas();
      // Quantize against ONLY the material ramps and zones this source uses (#252, #261) — see
      // SOURCE_PALETTES' doc.
      paintSourceIcon(canvas, grid, { ...icon.opts, scope: paletteForSource(icon.source) });
      await writePng(`${destDir}/${icon.name}.png`, 34, 34, canvas.toPixelFn());
    } else {
      await writeIcon(`${destDir}/${icon.name}.png`, icon.paint);
    }
  }
}
