# Asset provenance

Every third-party asset in this repo must be CC0 (public domain) and recorded
here: pack name, author, source URL, and license confirmation. New asset work
appends a new section below — don't restructure existing sections, since
multiple issues add to this file independently.

## Original-art-first policy (#139)

New assets are original art following `docs/art-style.md`, with reviewable sources and generated
PNG output under `scripts/art/` via `npm run art`. Third-party assets remain an exception: they
must be CC0 and have provenance recorded in this document.

## Sprite packs

Used for the combat scene's player and Monster sprites (`src/ui/sprites.ts`,
`src/assets/sprites/`). All source images are pixel art rendered with
`image-rendering: pixelated` at a shared on-screen size, and given a subtle
CSS idle bob (`.sprite` in `src/styles.css`) rather than shipping per-pack
animation frames, so packs of different native resolutions still read as one
scene.

| Sprite               | Pack                 | Author         | License | Source                                               |
| -------------------- | -------------------- | -------------- | ------- | ---------------------------------------------------- |
| Player, Chicken, Cow | Tiny Farm            | Kenney         | CC0 1.0 | https://kenney.nl/assets/tiny-farm                   |
| Goblin               | Goblin Free Pixelart | thekingphoenix | CC0 1.0 | https://opengameart.org/content/goblin-free-pixelart |

- **Tiny Farm** (Kenney, CC0 1.0 — "written permission not required"): 16×16
  tile sheet. `src/assets/sprites/player.png` is the farmer tile, `cow.png`
  and `chicken.png` are the matching animal tiles. Kenney dedicates all
  released assets to the public domain; confirmed on the pack's page.
- **Goblin Free Pixelart** (thekingphoenix, CC0): 32×32 idle/run/attack/death
  animation set; `src/assets/sprites/goblin.png` is the first frame of the
  front-facing idle animation. Confirmed CC0 on the OpenGameArt submission
  page.

### Darkroot Forest, Old Sewers, and Bone Crypt Monsters (#12)

Sprites for the seven remaining Monsters (Wolf, Goblin Warrior, Bandit, Giant
Rat, Zombie, Skeleton, Crypt Shade), sourced from four more CC0 packs. As
above, native resolutions vary (16×16 up to 64×64); the combat scene's shared
on-screen size and `image-rendering: pixelated` keep them reading as one
scene.

| Sprite                           | Pack                  | Author          | License | Source                                              |
| -------------------------------- | --------------------- | --------------- | ------- | --------------------------------------------------- |
| Wolf                             | Wolf (walk cycle)     | carnageddon     | CC0     | https://opengameart.org/content/wolf-3              |
| Goblin Warrior, Zombie, Skeleton | Tiny Creatures        | Clint Bellanger | CC0 1.0 | https://opengameart.org/content/tiny-creatures      |
| Bandit                           | Bandit Sprite [16x16] | One Man Army    | CC0     | https://opengameart.org/content/bandit-sprite-16x16 |
| Crypt Shade                      | Wraith [48x48]        | One Man Army    | CC0     | https://opengameart.org/content/wraith-48x48        |
| Giant Rat                        | Mouse                 | allen yatsura   | CC0     | https://opengameart.org/content/mouse-0             |

- **Wolf** (carnageddon, CC0 — "feel free to credit me or not, it's up to
  you"): a 128×192 six-frame running-wolf sheet (2 columns × 3 rows, 64×64
  cells); `src/assets/sprites/wolf.png` is the middle-row, left-column frame,
  a clean side-on running pose. Confirmed CC0 on the OpenGameArt submission
  page.
- **Tiny Creatures** (Clint Bellanger, CC0 1.0 Universal — public domain
  dedication, made with Kenney's explicit permission as an expansion of Tiny
  Dungeon/Tiny Town): a 170×306 packed tilemap of 16×16 monster/animal tiles
  (1px spacing, 10 columns), bundled with a `License.txt` confirming CC0.
  `src/assets/sprites/goblin-warrior.png` (tile index 10, armored green
  goblin), `zombie.png` (tile index 0), and `skeleton.png` (tile index 1) are
  untouched single-tile crops.
- **Bandit Sprite [16x16]** (One Man Army, CC0 — "completely free to use...
  no credit required"): a 36×18 two-frame sheet; `src/assets/sprites/bandit.png`
  is the first (left) 18×18 frame. Confirmed CC0 on the OpenGameArt
  submission page.
- **Wraith [48x48]** (One Man Army, CC0): a single 48×48 frame used as-is for
  `src/assets/sprites/crypt-shade.png` — Crypt Shade is the endgame Area
  boss, and this pack's largest native canvas reads as appropriately more
  imposing than the other Monster sprites. Confirmed CC0 on the OpenGameArt
  submission page.
- **Mouse** (allen yatsura, CC0 — "can be used in free and commercial
  projects... credit is not necessary but is greatly appreciated"): an
  animated idle/walk GIF pair; `src/assets/sprites/giant-rat.png` is the
  first frame of the idle animation, cropped to its opaque bounding box (the
  source frame is otherwise padded to a 128×128 canvas). Confirmed CC0 on the
  OpenGameArt submission page.

## Audio packs

Sound effects for the SFX module (`src/ui/sfx.ts`) come from two Kenney.nl packs, both licensed CC0 1.0 Universal:

| Event (Engine)          | File                         | Source pack                                        |
| ----------------------- | ---------------------------- | -------------------------------------------------- |
| `kill`                  | `public/audio/kill.wav`      | Kenney Impact Sounds — `impactPunch_heavy_002.ogg` |
| `food-eaten`            | `public/audio/eat.wav`       | Kenney Impact Sounds — `impactSoft_medium_000.ogg` |
| `levelup`               | `public/audio/levelup.wav`   | Kenney Digital Audio — `powerUp1.ogg`              |
| `drop` (rare band only) | `public/audio/rare-drop.wav` | Kenney Digital Audio — `twoTone1.ogg`              |
| `death`                 | `public/audio/death.wav`     | Kenney Digital Audio — `lowDown.ogg`               |

- **Pack**: Impact Sounds
  **Author**: Kenney Vleugels (kenney.nl)
  **URL**: https://kenney.nl/assets/impact-sounds
  **License**: CC0 1.0 Universal (public domain dedication) — confirmed via the pack's bundled `License.txt`

- **Pack**: Digital Audio
  **Author**: Kenney Vleugels (kenney.nl)
  **URL**: https://kenney.nl/assets/digital-audio
  **License**: CC0 1.0 Universal (public domain dedication) — confirmed via the pack's bundled `License.txt`

Source files were re-encoded from the packs' `.ogg` originals to `.wav` (PCM 16-bit) for broad WebView audio-element compatibility (notably WKWebView on macOS, which Tauri uses, does not reliably decode Ogg Vorbis). No other alteration was made to the audio content.

## Scene backdrops and props (#80)

The per-Area parallax backdrop (`#backdrop`'s `.layer-sky`/`.layer-mid`/`.layer-near`, one set per
Theme — meadow/forest/sewer/crypt/town), the Smithing anvil foreground prop
(`#activity-prop.prop-anvil`), the Cooking range/campfire foreground prop
(`#activity-prop.prop-cooking`, #115), and the Crafting workbench/tanning-rack foreground prop
(`#activity-prop.prop-crafting`, #116) are **hand-built with plain CSS** (`linear-gradient` layers,
`clip-path` silhouettes) — no third-party image asset, so no license/provenance entry is needed for
them. This invokes the issue's own escape hatch verbatim: "if a decent CC0 set can't
be found for a theme, hand-build that theme's layers with CSS gradients/shapes — plain-CSS is
CLAUDE.md-native and better than a license risk." All five themes went this route rather than
sourcing five more pixel-art packs, for the same reason CLAUDE.md's "no game engine, plain DOM/CSS
rendering" already prefers — zero license risk, and swapping any one theme to a real sprite sheet
later is a one-line `background-image` change per layer (see the comment above the per-theme rules
in `src/styles.css`), no structural change.

## Item icons (#78)

Every `ItemDef` (`src/data/index.ts`) has a required `icon` key resolved through
`src/ui/icons.ts` (mirrors `sprites.ts`'s pattern), rendered at `image-rendering: pixelated`
like the combat sprites. Two CC0 packs cover the full 33-item set (weapons, armour, food,
materials, currency, the goblin charm accessory):

| Coverage                                                                                 | Pack                                         | Author                     | License | Source                                                                      |
| ---------------------------------------------------------------------------------------- | -------------------------------------------- | -------------------------- | ------- | --------------------------------------------------------------------------- |
| Daggers, swords, bows, staves, chain/leather bodies, helms, food, bars, coins, the charm | 496 pixel art icons for medieval/fantasy RPG | Henrique Lazarini (7Soul1) | CC0 1.0 | https://opengameart.org/content/496-pixel-art-icons-for-medievalfantasy-rpg |
| Kite shields (bronze/iron/steel/mithril)                                                 | kite shield [64x64]                          | LordNeo                    | CC0     | https://opengameart.org/content/kite-shield-64x64                           |

- **496 pixel art icons for medieval/fantasy RPG** (Henrique Lazarini / 7Soul1, CC0 1.0 —
  confirmed on the OpenGameArt submission page, which documents the artist's own re-license from
  an earlier CC-BY 3.0 to CC0): a set of individually-named 32×32-canvas (34×34 with a 1px
  transparent margin) pixel-art icons covering weapons, armour, food, and misc RPG items.
  `src/assets/icons/*.png` (all entries except the four kite shields below) are unmodified
  single-icon crops from this pack, renamed to match their `ItemDef.icon` key
  (e.g. `W_Sword001.png` → `bronze-sword.png`, `I_GoldCoin.png` → `gold.png`,
  `A_Armour03.png` → `mithril-chainbody.png`). Four tiers of the same base item share the same
  source pack but different named files (e.g. the four dagger tiers use four distinct
  `W_Dagger0NN.png` icons) so each tier reads as visually distinct, not just recoloured.
- **kite shield [64x64]** (LordNeo, CC0 — confirmed on the OpenGameArt submission page): a set of
  64×64 kite-shield variants (plain/bronze/copper/mithril/gold). `bronze-shield.png`,
  `iron-kiteshield.png`, `steel-kiteshield.png`, and `mithril-kiteshield.png` are unmodified
  single-variant crops, picked for a bronze→iron→steel→mithril tint progression. This pack's
  larger native canvas (64×64 vs. the 496-pack's 34×34) is left as-is rather than resampled —
  `image-rendering: pixelated` plus the tile's own fixed CSS box already normalize on-screen size
  the same way the combat sprites do across mismatched native resolutions (see "Sprite packs"
  above).

<details>
<summary>Full source-file mapping (`src/assets/icons/<icon key>.png` ← source pack filename)</summary>

| Icon key         | Source file                | Icon key           | Source file                 |
| ---------------- | -------------------------- | ------------------ | --------------------------- |
| apprentice-staff | `W_Staff01.png`            | mithril-chainbody  | `A_Armour03.png`            |
| bronze-bar       | `I_BronzeBar.png`          | mithril-dagger     | `W_Dagger017.png`           |
| bronze-dagger    | `W_Dagger004.png`          | mithril-full-helm  | `C_Elm03.png`               |
| bronze-shield    | `a_shield_kite_bronze.png` | mithril-kiteshield | `a_shield_kite_mithril.png` |
| bronze-sword     | `W_Sword001.png`           | mithril-shortbow   | `W_Bow16.png`               |
| cooked-meat      | `I_C_Meat.png`             | mithril-staff      | `W_Staff06.png`             |
| cooked-pike      | `I_C_Fish.png`             | shade-blade        | `W_Sword016.png`            |
| cooked-shrimp    | `I_FishTail.png`           | shortbow           | `W_Bow02.png`               |
| cooked-trout     | `I_C_RawFish.png`          | steel-chainbody    | `A_Clothing01.png`          |
| goblin-charm     | `Ac_Necklace03.png`        | steel-dagger       | `W_Dagger007.png`           |
| gold             | `I_GoldCoin.png`           | steel-full-helm    | `C_Elm04.png`               |
| iron-bar         | `I_SilverBar.png`          | steel-kiteshield   | `a_shield_kite_0.png`       |
| iron-chainbody   | `A_Armor04.png`            | steel-shortbow     | `W_Bow07.png`               |
| iron-dagger      | `W_Dagger014.png`          | steel-staff        | `W_Staff08.png`             |
| iron-full-helm   | `C_Elm01.png`              | leather-body       | `A_Armour01.png`            |
| iron-kiteshield  | `a_shield_kite_copper.png` |                    |                             |
| iron-shortbow    | `W_Bow01.png`              |                    |                             |
| iron-staff       | `W_Staff04.png`            |                    |                             |

</details>

## Gap-fill mace/sword icons (Combat Depth #102)

`bronze-mace`, `iron-mace`, `steel-mace`, `mithril-mace`, `iron-sword`, `steel-sword`, and
`mithril-sword` (`src/assets/icons/*.png`) are **hand-drawn placeholder pixel art**, generated for
this wave (a simple flanged-mace-head / crossguard-blade silhouette, 34×34, tier-tinted to match
the existing bronze/iron/steel/mithril palette) — not sourced from a third-party pack, so no
license/provenance entry is needed. They intentionally do not match the "496 pixel art icons"
pack's style used above; swapping them for real `W_Mace0NN.png` / `W_Sword0NN.png` crops from that
same CC0 pack (already licensed for this repo) is a follow-up, not a blocker for this wave's
content pass.

## Raw catch icons (Cooking wave, #115)

`raw-beef`, `raw-shrimp`, `raw-trout`, and `raw-pike` (`src/assets/icons/*.png`) are **hand-drawn
placeholder pixel art**, generated for this wave (34×34 canvas, matching the "496 pixel art icons"
pack's on-screen size) — same escape hatch as the gap-fill mace/sword icons above, not sourced from
a third-party pack, so no license/provenance entry is needed. Each is a simple silhouette read at a
glance as "raw": a marbled pink-red meat slab for `raw-beef`, a pale curled shrimp for
`raw-shrimp`, and pale-toned fish outlines (grey-silver, speckled) for `raw-trout`/`raw-pike`,
distinct from their cooked counterparts' existing icons (`I_C_Meat.png`-derived `cooked-meat`,
etc.) without matching the source pack's own style. Swapping these for real raw-fish/raw-meat crops
from a sourced CC0 pack is a follow-up, not a blocker for this wave's content pass — same note as
the mace/sword icons above.

## Gem and jewelry icons (Crafting wave, #117)

`sapphire`, `emerald`, `ruby`, `sapphire-amulet`, `sapphire-ring`, `emerald-amulet`,
`emerald-ring`, `ruby-amulet`, and `ruby-ring` (`src/assets/icons/*.png`) are **hand-drawn
placeholder pixel art**, generated for this wave (34×34 canvas, matching the "496 pixel art
icons" pack's on-screen size) — same escape hatch as the gap-fill mace/sword, raw-catch, and
hide/leather icons above, not sourced from a third-party pack, so no license/provenance entry is
needed. Each gem Material is a simple faceted-diamond silhouette (sapphire blue, emerald green,
ruby red, each with a lighter facet highlight and a darker shadow facet); the ring icons reuse the
same faceted gem set atop a small gold band, and the amulet icons reuse it hanging below a thin
chain arc — one shared gem shape per tier keeps the Material and its two jewelry pieces reading as
the same gem at a glance. Swapping these for sourced CC0 crops is a follow-up, not a blocker for
this wave's content pass — same note as the mace/sword, raw-catch, and hide/leather icons above.

## Hide and leather/ranged-armour icons (Crafting wave, #116)

`cowhide`, `wolf-hide`, `thick-hide`, `leather-chaps`, `leather-coif`, `hard-leather-body`,
`hard-leather-chaps`, and `hard-leather-coif` (`src/assets/icons/*.png`) are **hand-drawn
placeholder pixel art**, generated for this wave (34×34 canvas, matching the "496 pixel art icons"
pack's on-screen size) — same escape hatch as the gap-fill mace/sword and raw-catch icons above,
not sourced from a third-party pack, so no license/provenance entry is needed. The three hides are
irregular pelt-silhouettes, tinted to their source beast (`cowhide` tan, `wolf-hide` cool grey with
a fur-tuft edge, `thick-hide` a darker, bulkier brown). `leather-chaps`/`leather-coif` reuse
`leather-body`'s existing light-tan palette in a legs/hood silhouette; the `hard-leather-*` tier
uses a darker, studded variant of the same shapes to read as a visibly tougher tier. Swapping these
for sourced CC0 crops is a follow-up, not a blocker for this wave's content pass — same note as the
mace/sword and raw-catch icons above.

## Herb and potion icons (Herblore wave, #118)

`guam-herb`, `marrentill-herb`, `tarromin-herb`, `harralander-herb`, `strength-potion`,
`attack-potion`, `fishing-potion`, and `production-potion` (`src/assets/icons/*.png`) are
**hand-drawn placeholder pixel art**, generated for this wave (34×34 canvas, matching the "496
pixel art icons" pack's on-screen size) — same escape hatch as the gap-fill mace/sword, raw-catch,
hide/leather, and gem/jewelry icons above, not sourced from a third-party pack, so no
license/provenance entry is needed. Each herb Material is a simple stem-and-leaves sprig,
tier-tinted (`guam-herb` bright green, `marrentill-herb` teal, `tarromin-herb` olive-yellow,
`harralander-herb` deep green) so the four read as a progression at a glance, mirroring the gem
icons' one-shape-per-tier approach. Each potion Item is a round-bottomed corked flask, the liquid
fill colored to its target (`strength-potion` red, `attack-potion` orange, `fishing-potion` blue,
`production-potion` purple) with a small highlight ellipse for a glass-shine cue. Swapping these
for sourced CC0 crops is a follow-up, not a blocker for this wave's content pass — same note as the
mace/sword, raw-catch, hide/leather, and gem/jewelry icons above.

## Arrow and rune icons (Ammo wave, #119)

`bronze-arrow`, `steel-arrow`, `mithril-arrow`, `air-rune`, `water-rune`, `earth-rune`, and
`fire-rune` (`src/assets/icons/*.png`) are **hand-drawn placeholder pixel art**, generated for this
wave (34×34 canvas, matching the "496 pixel art icons" pack's on-screen size) — same escape hatch
as the gap-fill mace/sword, raw-catch, hide/leather, gem/jewelry, and herb/potion icons above, not
sourced from a third-party pack, so no license/provenance entry is needed. Each arrow is a simple
diagonal shaft-and-fletching silhouette with a triangular metal head, tier-tinted to the SAME
bronze/steel/mithril palette the gap-fill mace/sword icons already use (a shared wood-brown shaft
and pale fletching across all three tiers, only the arrowhead's metal tint changes) so the arrow
ladder reads as the same tier progression as the rest of the weapon ladder. Each rune is a rounded
stone tablet carved with a simple glyph, tinted to its Element (`air-rune` pale cyan-white,
`water-rune` blue — reusing the sapphire gem icon's own blue, `earth-rune` mossy brown-green,
`fire-rune` warm red-orange — reusing the ruby gem icon's own red) so the four read as a set at a
glance, mirroring the gem icons' one-shape-per-tier approach. Swapping these for sourced CC0 crops
is a follow-up, not a blocker for this wave's content pass — same note as every hand-drawn
placeholder set above.

## Pet icons (Pets wave, #120)

`rock-golem`, `fishing-frog`, `kiln-cat`, and `shade-wisp` (`src/assets/icons/*.png`) are
**hand-drawn placeholder pixel art**, generated for this wave (17×17 working grid, upscaled 2× with
nearest-neighbour resampling to the same 34×34 canvas the "496 pixel art icons" pack's on-screen
size uses) — same escape hatch as every hand-drawn placeholder set above, not sourced from a
third-party pack, so no license/provenance entry is needed. `PetDef.icon` is resolved through the
SAME `src/ui/icons.ts` registry as every `ItemDef.icon` (a pet isn't an Item, but its icon key is
required/validated/rendered under the identical discipline — see `PetDef`'s own doc, core/types.ts).
Each pet is a simple silhouette reading at a glance as its source: `rock-golem` (the "combat" pet) a
squat blocky grey-brown golem with a moss-green facet accent and glowing eyes; `fishing-frog` (the
"fishing" pet) a sitting green frog with pale belly and a blue water-droplet accent; `kiln-cat`
(the "production" pet) a sitting orange tabby cat with a small ember accent; `shade-wisp` (the boss
pet, tied to Bone Crypt's `crypt-shade`) a small translucent-lavender ghost wisp with a glowing
core, echoing the wraith it's tied to. Swapping these for sourced CC0 crops is a follow-up, not a
blocker for this wave's content pass — same note as every hand-drawn placeholder set above.

## Skill and workspace/navigation icons (UI & Assets wave 1/8, #131)

`docs/icon-style-golden-master.png` is the user-supplied visual direction reference for original
icon work. It is review guidance rather than a runtime game asset; future agents must compare new
icons against it alongside the generated 1× contact sheet.

`skill-attack`, `skill-strength`, `skill-defence`, `skill-hitpoints`, `skill-fishing`,
`skill-smithing`, `skill-ranged`, `skill-magic`, `skill-cooking`, `skill-crafting`,
`skill-herblore` (one per `SKILL_NAMES` entry, `src/core/types.ts`) and `tab-world`, `tab-skills`,
`tab-character`, `tab-bank`, `tab-vendor`, `tab-loot` (`src/assets/icons/*.png`) are the first
assets built entirely through the original-art pipeline `#139` committed (`scripts/art/`,
`npm run art`), not third-party crops, so no license/provenance entry is needed. Their sources
live in `scripts/art/icons.mjs` and are regenerated byte-stably by `npm run art`, which now also writes
`src/assets/icons/*.png` for this set alongside the pre-existing `docs/art-style-preview.png` swatch
sheet. Every color used is drawn from the pinned master ramp or a zone sub-palette in
`docs/art-style.md` / `scripts/art/palettes.mjs` — no new hex values were introduced. Following the
July 2026 approved icon reference, `skill-attack`, `skill-fishing`, and `tab-bank` are canonical
native-34×34 examples for irregular contours, selective outlines, and clustered material ramps.
Each icon is a
simple, silhouette-first shape read at a glance as its Skill/tab: `skill-attack` a sword,
`skill-strength` a flexed arm, `skill-defence` a heater shield, `skill-hitpoints` a heart,
`skill-fishing` a fish, `skill-smithing` a hammer, `skill-ranged` a drawn bow, `skill-magic` a
glinting staff, `skill-cooking` a flame, `skill-crafting` a needle and thread, `skill-herblore` a
herb sprig; `tab-world` a compass, `tab-skills` an open book, `tab-character` a person silhouette,
`tab-bank` a reinforced resource chest, `tab-vendor` a coin purse, `tab-loot` a scroll. The four production views
(`smithing`, `cooking`, `crafting`, `herblore`) intentionally have no separate `tab-*.png`: their
workspace-tab icon is the matching `skill-*.png`, resolved through `tabIcon` in `src/ui/icons.ts`
reusing `skillIcon`'s own URL for those four keys — see that file's `tabIcons` registry. This wave
is assets + registries only; rendering the Skills panel and three-card workspace navigation with
these icons is `#135`/`#136`.
