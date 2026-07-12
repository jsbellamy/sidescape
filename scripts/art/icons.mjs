import { fileURLToPath } from "node:url";
import { createCanvas, createMask, writeIcon } from "./icon-canvas.mjs";
import { loadSourceGrid, paintSourceIcon } from "./icon-source.mjs";
import { materialPalettes, P, zonePalettes } from "./palettes.mjs";
import { writePng } from "./write-png.mjs";

/** Directory holding committed compact icon sources (`<name>.png`) for source-driven icons —
 * produced by `npm run art:ingest` from prompt-kit generations (docs/icon-gen.md) and conformed to
 * house style at build by `paintSourceIcon`. */
const ICON_SOURCES_DIR = fileURLToPath(new URL("./icon-sources", import.meta.url));

/** Legacy convenience for simple rectangular parts. New multi-part subjects should use a unioned
 * `createMask()` silhouette so constituent primitives do not leave internal outline seams. */
function block(canvas, x0, y0, x1, y1, fill, outline = P.ink) {
  canvas.rect(x0 - 1, y0 - 1, x1 + 1, y1 + 1, outline);
  canvas.rect(x0, y0, x1, y1, fill);
}

/** Filled circle with a 1px outline ring, same "outline then inset fill" idea as `block` above,
 * for round silhouette parts (pommels, potion bulbs, coin stacks). */
function disc(canvas, cx, cy, r, fill, outline = P.ink) {
  canvas.circle(cx, cy, r + 1, outline);
  canvas.circle(cx, cy, r, fill);
}

const meadow = zonePalettes.meadow; // [sky, spring-green, mid-green, deep-green, forest-green, gold]
const crypt = zonePalettes.crypt; // [violet-lt, violet, violet-mid, violet-dk, bone, ink-violet]
const sewer = zonePalettes.sewer;
const water = materialPalettes.water;

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
    paint(c) {
      // Heater shield: flat-topped body tapering to a point. The outline is drawn as its own
      // pass around the whole silhouette instead of via per-row block() calls, which stacked
      // outline ink into a near-solid dark point that sank into the panel (#164 sheet sweep).
      c.rect(8, 5, 25, 20, P.ink);
      c.rect(9, 6, 24, 20, meadow[2]);
      for (let y = 21; y <= 30; y++) {
        const inset = Math.round(((y - 20) / 10) * 8);
        c.rect(8 + inset, y, 25 - inset, y, P.ink);
        c.rect(9 + inset, y, 24 - inset, y, meadow[2]);
      }
      c.line(16, 8, 16, 18, meadow[1]);
      c.line(17, 8, 17, 18, meadow[1]);
      disc(c, 16.5, 13, 2, meadow[5]);
    },
  },
  {
    name: "skill-hitpoints",
    source: "golden-skill-hitpoints.png",
  },
  {
    name: "skill-fishing",
    paint(c) {
      // Canonical native-grid sample: plump profile with stepped belly, highlights, fin, and tail.
      const fish = createMask();
      fish.circle(14, 17, 10);
      fish.rect(13, 8, 25, 25);
      for (let x = 25; x <= 31; x++) {
        const half = 2 + Math.round((x - 25) * 0.9);
        fish.rect(x, 17 - half, x, 17 + half);
      }
      fish.rect(14, 24, 20, 27);
      fish.rect(17, 27, 22, 29);
      fish.rect(19, 29, 22, 30);

      c.outlineMask(fish, P.ink);
      c.paintMask(fish, water.base);
      c.paintInside(fish, (inside) => {
        inside.rect(7, 21, 21, 24, water.shadow);
        inside.rect(9, 24, 18, 26, water.light);
        inside.rect(8, 8, 15, 10, water.light);
        inside.rect(10, 7, 15, 8, water.glint);
        inside.rect(6, 13, 8, 15, P.ink);
        inside.plot(7, 13, P.glint);
        inside.rect(14, 25, 20, 27, meadow[3]);
        inside.rect(17, 27, 22, 29, meadow[2]);
        inside.rect(19, 29, 22, 30, meadow[1]);
      });
    },
  },
  {
    name: "skill-smithing",
    source: "golden-skill-smithing.png",
  },
  {
    name: "skill-ranged",
    paint(c) {
      // Recurve bow with drawn string + nocked arrow.
      for (let y = 4; y <= 29; y++) {
        const bow = Math.round(9 * Math.sin(((y - 4) / 25) * Math.PI));
        c.plot(16 - bow, y, P.umber);
        c.plot(17 - bow, y, P.sand);
      }
      c.thickLine(16, 4, 8, 16, 2, P.cream);
      c.thickLine(8, 16, 16, 29, 2, P.cream);
      c.line(6, 16, 27, 16, P.sand);
      c.thickLine(21, 16, 27, 16, 2, P.umber);
    },
  },
  {
    name: "skill-magic",
    paint(c) {
      // Staff with a glinting orb — one connected silhouette, thickLine shaft (#164: the prior
      // staff was a 1px stroke and the sparkle was two dashes that read as floating detail).
      c.thickLine(13, 12, 24, 29, 2, P.umber);
      disc(c, 13, 10, 5, crypt[2]);
      c.circle(13, 10, 2, crypt[4]);
      c.plot(12, 8, P.glint);
    },
  },
  {
    name: "skill-cooking",
    source: "golden-skill-cooking.png",
  },
  {
    name: "skill-crafting",
    paint(c) {
      // Needle + eye + thread coil — the needle is now a thickLine shaft (#164 sheet sweep: the
      // prior needle was a bare 1px diagonal) and the coil uses a visible sand tone instead of
      // pure ink, which sank into the panel.
      c.thickLine(6, 28, 27, 7, 2, P.sand);
      disc(c, 6, 28, 2, P.umber, P.ink);
      c.line(21, 13, 25, 9, P.cream);
      c.thickLine(9, 22, 14, 27, 2, sewer[3]);
      c.thickLine(13, 18, 18, 23, 2, sewer[3]);
    },
  },
  {
    name: "skill-herblore",
    source: "golden-skill-herblore.png",
  },
  // --- Workspace/navigation icons ---
  { name: "tab-world", source: "golden-tab-world.png" },
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
  // --- Chainbody family ---
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
  // --- Full-helm family ---
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
      paintSourceIcon(canvas, grid, icon.opts);
      await writePng(`${destDir}/${icon.name}.png`, 34, 34, canvas.toPixelFn());
    } else {
      await writeIcon(`${destDir}/${icon.name}.png`, icon.paint);
    }
  }
}
