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

Sound effects for the SFX module (`src/ui/sfx.ts`) come from two Kenney.nl packs, both licensed CC0 1.0 Universal. Re-sourced in #282 for higher-quality, more distinct clips (same 5 keys and files, new source samples within the same two packs):

| Event (Engine)          | File                         | Source pack                                        |
| ----------------------- | ---------------------------- | -------------------------------------------------- |
| `kill`                  | `public/audio/kill.wav`      | Kenney Impact Sounds — `impactPunch_heavy_004.ogg` |
| `food-eaten`            | `public/audio/eat.wav`       | Kenney Impact Sounds — `impactSoft_medium_001.ogg` |
| `levelup`               | `public/audio/levelup.wav`   | Kenney Digital Audio — `phaserUp3.ogg`             |
| `drop` (rare band only) | `public/audio/rare-drop.wav` | Kenney Digital Audio — `threeTone2.ogg`            |
| `death`                 | `public/audio/death.wav`     | Kenney Digital Audio — `lowThreeTone.ogg`          |

- **Pack**: Impact Sounds
  **Author**: Kenney Vleugels (kenney.nl)
  **URL**: https://kenney.nl/assets/impact-sounds
  **License**: CC0 1.0 Universal (public domain dedication) — confirmed via the pack's bundled `License.txt`

- **Pack**: Digital Audio
  **Author**: Kenney Vleugels (kenney.nl)
  **URL**: https://kenney.nl/assets/digital-audio
  **License**: CC0 1.0 Universal (public domain dedication) — confirmed via the pack's bundled `License.txt`

Source files were re-encoded from the packs' `.ogg` originals to `.wav` (PCM 16-bit, 44.1 kHz) for broad WebView audio-element compatibility (notably WKWebView on macOS, which Tauri uses, does not reliably decode Ogg Vorbis). Each clip was also loudness-matched via a single-pass EBU R128 normalization (`ffmpeg ... loudnorm=I=-16:TP=-1.5:LRA=11`, integrated target -16 LUFS / true peak -1.5 dBTP) so no one cue sits jarringly louder than the others; no other alteration was made to the audio content.

## Scene backdrops and activity overlays (#80, #141, #254)

The per-Area parallax backdrop (`#backdrop`'s `.layer-sky`/`.layer-mid`/`.layer-near`, one set per
Theme — meadow/forest/sewer/crypt/town/glacier) are original pixel-art PNG tiles. As of #263, a
reusable deterministic backdrop generator exists (`scripts/art/backdrops.mjs`, wired into
`scripts/art/generate.mjs` and `npm run art`) parallel to the icon and sprite writers, but its
production registry (`backdrops`) is **deliberately empty** — none of the six sets above have been
migrated to it. `npm run art` therefore still writes nothing under `src/assets/backdrops/`, and
every one of them remains hand-assembled and committed directly, exactly as before this issue. The
Frostspire slice (#142) is the named follow-up that registers the first real definition
(`glacier`) and retires its hand-assembled bytes; until then, all six sets stay on the old
hand-assembled path this section documents. The `glacier` set
(Frostspire, #254) was procedurally hand-assembled with a small throwaway script rather than
painted pixel-by-pixel, drawing from the `glacier` zone sub-palette (`scripts/art/palettes.mjs`)
plus plain white for snow highlights (backdrops bypass the quantization pipeline entirely, so they
are not restricted to the named-ramp vocabulary icons/sprites use). Every repeating shape (cloud,
mountain peak, foreground hummock/icicle) is drawn at every `k * period + phase` position across a
working canvas several tiles wide, where `period` evenly divides the 160px tile width — this makes
each 160×120 tile exactly horizontally periodic by construction rather than by eye, verified by
asserting `pixel(x, y) === pixel(x + 160, y)` across the full working canvas before the final crop
(zero mismatches for all three layers). The five activity
overlays are original transparent 80×60 native-pixel assets under `src/assets/activity-overlays/`:
Smithing's anvil, Cooking's campfire, Crafting's tanning rack, Herblore's cauldron, and Fishing's
planted rod/line/ripple. They are not CSS shapes and require no third-party provenance.

Backdrops use one native pixel per CSS pixel (160×120), while player/Monster sprites and activity
overlays use the player grain: the overlay's 80×60 source is rendered at 2× as a 160×120 fixed,
bottom-centred near-scene plane. Its subject is placed beside the separately-rendered player at
native ground line y=50; it never embeds a player or maps Fishing variants per Area.

`scripts/art/ingest-overlay.mjs` is the reproducible sibling of the icon ingest pipeline. It keys a
flat-background source generation from the git-ignored `scripts/art/icon-gen-inbox/`, reuses
`trace-core.mjs` to recover its chunky grid, then bottom-anchors the fitted subject onto a
transparent 80×60 canvas. Run it manually (or `npm run art:overlay -- ...`) when an overlay needs
adjustment. `scripts/art/overlays.mjs` records the five committed placements and fits; `npm run
art:overlays` rebuilds all five once their raw inbox generations are present. `npm run art` remains
the icon-only deterministic build.

## Item icons (#78)

> **Superseded by #187:** the icon bytes documented below were replaced by original source-driven
> art generated from committed golden sources through `scripts/art/icons.mjs`; the provenance history
> below is preserved.

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

The dagger, sword, and mace tiers are source-driven production families. Daggers share
`golden-item-bronze-dagger.png`, swords share `golden-weapon-iron-sword.png`, and maces share
`golden-item-bronze-mace.png`. Within each family, bronze, iron, steel, and mithril preserve one
canonical silhouette while deterministic named-ramp remaps communicate the metal tier. The mace's
oversized flanged head and dark central notches remain unchanged so its weapon read survives at
34×34.

## Raw catch icons (Cooking wave, #115)

`raw-beef`, `raw-shrimp`, `raw-trout`, and `raw-pike` are source-driven production icons using the
approved compact sources `golden-item-raw-beef.png`, `golden-base-raw-shrimp.png`,
`golden-base-raw-trout.png`, and `golden-base-raw-pike.png`. Each species keeps its own canonical
silhouette. `cooked-meat`, `cooked-shrimp`, `cooked-trout`, and `cooked-pike` reuse the corresponding
raw compact source and deterministically remap only its material colors to a cooked brown/orange
ramp. Cooked states are never separately generated, so raw and cooked geometry remains identical.

## Gem and jewelry icons (Crafting wave, #117)

Loose gems, amulets, and rings are three source-driven silhouette families using
`golden-base-sapphire.png`, `golden-base-sapphire-amulet.png`, and
`golden-base-sapphire-ring.png`. Sapphire is canonical; emerald and ruby remap only the large gem
facets while preserving the gold setting, chain, or band. The same sharp four-point gem identity
therefore remains consistent across the Material and both jewelry slots.

## Hide and leather/ranged-armour icons (Crafting wave, #116)

The three hides are source-driven variants of `golden-base-cowhide.png`: cowhide remains tan,
wolf hide uses a cool-gray material ramp, and thick hide uses a darker brown ramp. Leather body,
chaps, and coif use `golden-item-leather-body.png`, `golden-base-leather-chaps.png`, and
`golden-base-leather-coif.png`. Each hard-leather item reuses its corresponding normal-leather
silhouette with a deterministic darker material remap, keeping equipment-slot recognition stable.

## Herb and potion icons (Herblore wave, #118)

The four herb Materials are source-driven production icons sharing the approved compact source
`scripts/art/icon-sources/golden-base-guam-herb.png`. Its tied five-leaf sprig stays geometrically
identical while named-ramp remaps communicate progression: `guam-herb` bright green,
`marrentill-herb` teal, `tarromin-herb` olive-yellow, and `harralander-herb` deep green.

The four potion Items are source-driven production icons. They share the approved compact source
`scripts/art/icon-sources/golden-consumable-red-potion.png`; `scripts/art/icons.mjs` preserves its
bottle, cork, glass, lighting, and outline while deterministically remapping only the liquid ramp:
`strength-potion` red, `attack-potion` orange, `fishing-potion` blue, and `production-potion`
purple. `npm run art` renders all four at the final 34×34 size with binary alpha.

## Arrow and rune icons (Ammo wave, #119)

Arrow tiers share `golden-base-bronze-arrow.png`; only the triangular arrowhead changes from bronze
to steel or mithril, while the wood shaft and pale fletching remain fixed. Elemental runes share
`golden-base-air-rune.png`, preserving one rounded carved-tablet silhouette while named-ramp remaps
produce pale air, blue water, green earth, and orange fire variants.

## Pet icons (Pets wave, #120)

The four pets are source-driven production icons using their approved compact sources:
`golden-base-rock-golem.png`, `golden-base-fishing-frog.png`, `golden-base-kiln-cat.png`, and
`golden-base-shade-wisp.png`. `PetDef.icon` remains resolved through the same `src/ui/icons.ts`
registry as every `ItemDef.icon`. Each pet keeps one large native-scale category silhouette rather
than relying on small texture detail.

## Skill and workspace/navigation icons (UI & Assets wave 1/8, #131)

`docs/icon-style-golden-master.png` is an original project reference supplied directly by the
repository owner in the July 11, 2026 Codex design conversation (source: the owner's attached
`codex-clipboard-574ec938-922b-4e19-9ca3-95f0af1a99e7.png`; no third-party pack or URL). It is
project-owned review guidance, not a redistributable asset pack or runtime game asset. Future
agents must compare new icons against it alongside the generated 1× contact sheet.

`skill-attack`, `skill-strength`, `skill-defence`, `skill-hitpoints`, `skill-fishing`,
`skill-smithing`, `skill-ranged`, `skill-magic`, `skill-cooking`, `skill-crafting`,
`skill-herblore` (one per `SKILL_NAMES` entry, `src/core/types.ts`) and `tab-world`, `tab-skills`,
`tab-character`, `tab-bank`, `tab-vendor`, `tab-loot` (`src/assets/icons/*.png`) are the first
assets built entirely through the original-art pipeline `#139` committed (`scripts/art/`,
`npm run art`), not third-party crops, so no license/provenance entry is needed. Their source-driven
and native-canvas definitions live in `scripts/art/icons.mjs` and regenerate byte-stably. The
approved compact sources now drive hitpoints, smithing, cooking, herblore, and all six workspace
tabs; attack, strength, and fishing retain their previously approved source/native definitions,
while defence, ranged, magic, and crafting retain the clearer native-canvas versions. The build writes
`src/assets/icons/*.png` for this set alongside the pre-existing `docs/art-style-preview.png` swatch
sheet. Every color used is drawn from the pinned master ramp, a zone sub-palette, or a named
material ramp in `docs/art-style.md` / `scripts/art/palettes.mjs`; the July 2026 style pass added
the steel, water/scale, and gold ramps for readable close-up material planes. Following the
approved icon reference, `skill-attack`, `skill-fishing`, and `tab-bank` are canonical 34×34
examples for irregular contours, selective outlines, and clustered material ramps.
Each icon is a
simple, silhouette-first shape read at a glance as its Skill/tab: `skill-attack` a sword,
`skill-strength` a flexed arm, `skill-defence` a heater shield, `skill-hitpoints` a heart,
`skill-fishing` a fish, `skill-smithing` a hammer and anvil, `skill-ranged` a drawn bow, `skill-magic` a
glinting staff, `skill-cooking` a roast drumstick, `skill-crafting` a needle and thread,
`skill-herblore` a herb sprig; `tab-world` a compass, `tab-skills` an open book, `tab-character` an adventurer hood,
`tab-bank` a reinforced resource chest, `tab-vendor` a coin purse, `tab-loot` a scroll. The four production views
(`smithing`, `cooking`, `crafting`, `herblore`) intentionally have no separate `tab-*.png`: their
workspace-tab icon is the matching `skill-*.png`, resolved through `tabIcon` in `src/ui/icons.ts`
reusing `skillIcon`'s own URL for those four keys — see that file's `tabIcons` registry. This wave
is assets + registries only; rendering the Skills panel and three-card workspace navigation with
these icons is `#135`/`#136`.

### Bone Crypt's own cast: Crypt Ghoul and Bone Knight (#253)

Shade Crypt (the Bone Crypt Dungeon) needed two new open-world Monsters to replace Crypt Shade,
which this issue promotes to that Dungeon's boss. Per the owner's placeholder-art decision (#253),
both sprites are further crops of the same **Tiny Creatures** sheet already used for Goblin
Warrior, Zombie, and Skeleton (see "Darkroot Forest, Old Sewers, and Bone Crypt Monsters" above):

| Sprite      | Pack           | Author          | License | Source                                         |
| ----------- | -------------- | --------------- | ------- | ---------------------------------------------- |
| Crypt Ghoul | Tiny Creatures | Clint Bellanger | CC0 1.0 | https://opengameart.org/content/tiny-creatures |
| Bone Knight | Tiny Creatures | Clint Bellanger | CC0 1.0 | https://opengameart.org/content/tiny-creatures |

- **Tiny Creatures** (Clint Bellanger, CC0 1.0 Universal, per the pack's own `License.txt`,
  re-confirmed on this fetch): `scripts/art/sprite-sources/sprite-crypt-ghoul.png` is tile index 69
  (a green-headed decayed humanoid) and `sprite-bone-knight.png` is tile index 96 (an armoured
  bone-pale sentinel holding a weapon) of the same 10-column, 18-row, 16×16 packed tilemap the
  earlier Monster crops came from. Both tiles ship on the pack's own rounded-card background (solid
  near-black corners over a maroon body panel, not transparency); this pack's tiles are portrait/
  front-facing rather than a true left/right walk cycle — the same is already true of the committed
  zombie and skeleton sources from this pack — so "facing left" (`docs/art-style.md:46`) is
  satisfied trivially, matching precedent. The card background was flood-keyed to alpha 0 (a
  neighbor-relative tolerance flood from the border, the same treatment implied by the existing
  zombie/skeleton/goblin-warrior sources, whose committed bytes also carry alpha-0 background
  pixels rather than a hard crop) and the resulting 16×16 cutout was nearest-neighbor upscaled to
  32×32 to match this registry's native-source contract, exactly as the interim derivatives
  documented in "Source-driven combat sprite pipeline" below were normalized from this same pack's
  mixed native sizes. No other alteration was made. Like the rest of the sources under
  `scripts/art/sprite-sources/`, these are interim CC0 derivatives; #142 replaces the whole cast
  with original art.

### Frostspire's own cast: Frost Wolf, Ice Wraith, Frost Giant, and Frost Warden (#254)

The 5th Area needed four new Monster sprites: three open-world (32×32) plus the dungeon-only Frost
Warden boss (48×48, the sanctioned Boss canvas — `crypt-shade` is the existing precedent). Per the
same owner placeholder-art decision #253 already applied, all four are further crops of the same
**Tiny Creatures** sheet already used for Goblin Warrior, Zombie, Skeleton, Crypt Ghoul, and Bone
Knight (see "Darkroot Forest, Old Sewers, and Bone Crypt Monsters" and "Bone Crypt's own cast"
above):

| Sprite       | Pack           | Author          | License | Source                                         |
| ------------ | -------------- | --------------- | ------- | ---------------------------------------------- |
| Frost Wolf   | Tiny Creatures | Clint Bellanger | CC0 1.0 | https://opengameart.org/content/tiny-creatures |
| Ice Wraith   | Tiny Creatures | Clint Bellanger | CC0 1.0 | https://opengameart.org/content/tiny-creatures |
| Frost Giant  | Tiny Creatures | Clint Bellanger | CC0 1.0 | https://opengameart.org/content/tiny-creatures |
| Frost Warden | Tiny Creatures | Clint Bellanger | CC0 1.0 | https://opengameart.org/content/tiny-creatures |

- **Tiny Creatures** (Clint Bellanger, CC0 1.0 Universal, per the pack's own `License.txt`,
  re-fetched directly from `https://opengameart.org/sites/default/files/tiny-creatures.zip` for
  this issue): all four crops come from `Tilemap/tilemap_packed.png`, the same 10-column, 18-row,
  16×16 packed tilemap the earlier Monster crops came from, but a DIFFERENT source file within the
  pack than #253 used — `tilemap_packed.png` already carries alpha-0 background outside each
  tile's own art (unlike the raw individual `Tiles/tile_NNNN.png` files #253 cropped from, which
  needed a manual flood-key of their card background), so no flood-fill step was needed this time.
  `sprite-frost-wolf.png` is tile index 93 (a dark grey, armoured wolf-headed humanoid bust),
  `sprite-ice-wraith.png` is tile index 48 (a pale icy-blue spiky elemental/ghost), and
  `sprite-frost-giant.png` is tile index 43 (a white yeti/abominable-snowman with a blue eye) — all
  three nearest-neighbor upscaled 2× from their native 16×16 cell to this registry's 32×32 native-
  source contract. `sprite-frost-warden.png` is tile index 30 (a white/silver dragon head-and-neck
  bust), nearest-neighbor upscaled 3× from its native 16×16 cell to the 48×48 Boss canvas — the
  same normalization principle #253 used for 32×32, just a larger factor to fill the bigger canvas.
  This pack's tiles are portrait/front-facing rather than a true left/right walk cycle, so "facing
  left" (`docs/art-style.md`) is satisfied trivially, matching precedent. No other alteration was
  made to any of the four. Like the rest of the sources under `scripts/art/sprite-sources/`, these
  are interim CC0 derivatives; #142 (which explicitly says it "should absorb them") replaces the
  whole cast with original art.

## Source-driven combat sprite pipeline (#188)

The 20 combat sprites now regenerate through `scripts/art/sprites.mjs` as part of `npm run art`
(this count grew from 11 through #253's Crypt Ghoul/Bone Knight, #254's Frost cast, #292's Meadows
completion, and #266's Darkroot redraw). Its registry keeps the runtime ids and filenames in
`src/ui/sprites.ts` unchanged while declaring each source's canvas and alpha policy explicitly:
12 sprites use 32×32 binary-alpha canvases, seven use 48×48, and `hollow-warden` uses 64×64. Canvas
size is explicit visual scale rather than a Monster or Boss classification; `crypt-shade` may contain
at most one intermediate alpha value, while every other entry is binary-alpha. The writer rejects invalid sources, projects colors onto the named
house ramps, reduces each sprite to at most `maxColors` RGB colors, and despeckles color clusters
(both default to 12 colors / 3 passes but are overridable per registry entry — `player` uses 24
colors and 0 passes; see the redraw section below) without changing its alpha mask or
source-authored outline geometry.

The committed files under `scripts/art/sprite-sources/` are interim derivatives of the CC0 sprites
documented in the Sprite packs sections above. They nearest-neighbor normalize the old mixed canvas
sizes into the new native source contract while preserving the existing subject, pose, facing,
padding, and approximate 64×64 in-app read. They are pipeline-proof assets rather than a redraw;
#142 replaces them with the new original-art, inward-facing cast. Generated outputs live under
`src/assets/sprites/`, and the deterministic native-scale and 4× review artifacts are
`docs/sprite-sheet-1x.png` and `docs/sprite-sheet-4x.png`.

## Original combat sprite redraw (#142)

The `player` row starts the split original-art redraw tracked by #142. Its committed source is
original SideScape art, faces left toward Monsters (the Monster stands to its left in `#sprite-row`),
and keeps its feet on the shared ground baseline via bottom-anchored transparent padding.

**Scope note (#264 as built).** The issue specified an in-place redraw on the existing 32×32 canvas
inside the unchanged 64×64 box. During the work the original render was recovered at ~48 logical
pixels tall, and squashing it to 32 destroyed the outline and shading (see `docs/sprite-gen.md`). So
the redraw instead **establishes the shared character scale on the 48×48 canvas** — which #264's own
umbrella framing ("establishing the shared character scale and pixel grain that each later Area slice
validates against its Monsters") calls for — rather than forcing the smaller canvas. This carried a
handful of deliberate scope changes over the issue text, all recorded in PR #<pending>:

- **Native canvas 32×32 → 48×48.** An explicitly declared visual scale; 32-native Monsters are
  unchanged. The player quantizes with a wider `maxColors` (24) and no despeckle so the ingested
  original art keeps its shading and single-pixel accents.
- **New `skin` and `leather` material ramps** (`scripts/art/palettes.mjs`) so a lit character has a
  faithful flesh/leather vocabulary; both are per-asset-scoped and touch no other sprite.
- **Per-sprite display grain, not a fixed 64×64 box.** `src/ui/sprites.ts` now sizes each sprite as
  `native × SPRITE_GRAIN` (grain = 2): 32-native Monsters stay 64px, the 48-native player is 96px,
  and any 48-native Monster is likewise 96px. Uniform grain keeps one pixel size across the cast;
  a bigger Boss comes from a bigger canvas, never a bigger grain. This edited `src/ui/sprites.ts`,
  `src/styles.css` (`.sprite` box → `--sprite-edge` variable), and `src/ui/app.ts`, which #264's
  text asked to leave untouched.
- **New ingest tooling** (`scripts/art/ingest-sprite.mjs`, `npm run art:ingest-sprite`) and its
  prompt kit (`docs/sprite-gen.md`) so the source is machine-recovered from a generation rather than
  hand-redrawn by eye — the sibling of the icon pipeline.

One follow-up remains intentionally out of scope: #142's later Area slices append their own
original-art Monster rows here as they replace the remaining interim CC0 sources.

**Tunic recolor (#278).** The player's tunic originally quantized to brown for lack of a green
material ramp. A `moss` ramp (`scripts/art/palettes.mjs`) closes that gap — four cold, desaturated
olive-green steps in the same value/saturation family as the `forest`/`meadow` zone greens — and the
`player` row now lists `moss` alongside `skin`/`leather`/`steel` in `materialRampNames`. Per-asset
scoping means adding it recolors nothing else. The regenerated `player.png` tunic reads green.

This row supersedes only the historical Tiny Farm-derived player sprite documented above; that CC0
provenance remains recorded as history.

### Lumbry Meadows (#265)

Chicken, Cow, and Goblin now form the first original-art Monster mini-set. Each source began as a
raw 1254×1254 RGB model PNG on a uniform `#ff00ff` key background, retained unchanged in the
git-ignored sprite-generation inbox, then passed through `npm run art:ingest-sprite -- --name <id>
--size 32`. The ingest recovered the generation's own chunky cell grid and bottom-anchored it on a
32×32 binary-alpha source canvas, then normalized the recovered source-local cell palette; it did
not downsample or hand-place source pixels. Raw RGB variety is expected and the later named-ramp
projection remains a separate Stage-2 build step. The compact
chicken, low broad cow, and unarmoured, club-bearing goblin all face right toward the left-facing
player. Their warm outline, upper-left light, and muted meadow-adjacent materials make them read as
one set at the scene's native scale. The goblin's exposed green skin, ragged brown cloth, and crude
wooden club deliberately leave room for Darkroot's Goblin Warrior to tier up through armour and
stronger proportions.

The registry scopes each source to the material and zone palette entries that actually win cells
after quantization; the regular-Monster 12-color / 3-pass cleanup defaults remain in force. This
subsection supersedes the historical Tiny Farm Chicken/Cow and Goblin Free Pixelart Goblin outputs
documented above, while preserving their CC0 provenance as history.

### Meadows completion (#292)

Cow supersedes the #265 32×32 source with a corrected-scale 48×48 original brown-and-cream dairy
silhouette. Goblin Brute and Goblin Chief add original 48×48 Meadows Depths combat sprites: the
Brute keeps the landed goblin family's green skin, low brow, pointed ears, leather, and heavy wooden
club while scaling up its shoulders and forearms; the Chief adds a fur mantle, bone-and-brass brow
crown, decorated leather, and ceremonial iron-headed club. All three sources began as untouched raw
model PNGs in the ignored sprite-generation inbox, passed mandatory dry-run ingest, then recovered
to bottom-anchored binary-alpha compact sources. They face right toward the player and use the
standard 12-color, three-pass finishing defaults. The previous #265 entry and every historical CC0
provenance record remain historical context; only Cow's supplied source has been superseded.

### Darkroot Forest (#266)

Wolf, Goblin Warrior, Bandit, and the dungeon-only Hollow Warden now form one original Darkroot
Forest combat set. Each compact source was recovered from one untouched built-in image-generation
PNG on the ignored `sprite-gen-inbox` path after a passing dry-run ingest; no raw was resized,
re-exported, downsampled, or hand-edited. Wolf and Goblin Warrior use 32×32 binary canvases, Bandit
uses a player-scale 48×48 canvas, and Hollow Warden uses a looming 64×64 canvas. Their sources are
bottom-anchored and face right toward the left-facing player. At 1×, the low charcoal wolf, compact
armoured green goblin, crouched hooded dagger Bandit, and root-bound hollow-armour Warden remain
distinct; the Warden's blank chest cavity, antlers, and raised pale-green spell establish the Dungeon
Boss read without a different pixel grain. All four retain the standard `maxColors: 12` and three-pass
cleanup defaults because the compact previews retained their defining silhouettes.

This subsection supersedes only the historical CC0 Wolf, Goblin Warrior, and Bandit outputs recorded
above. Their provenance remains preserved as historical context; Hollow Warden is new original art.

### Old Sewers (#267)

Giant Rat, Zombie, Skeleton, and the dungeon-only Sewer King now form a coherent original Old
Sewers combat set. Each compact source was recovered from one untouched built-in image-generation
PNG on the ignored `sprite-gen-inbox` path after a passing dry-run ingest; no raw was resized,
re-exported, downsampled, or hand-edited. Giant Rat uses a low 32×32 binary canvas, while the
broad dock-worker Zombie, narrow sword-bearing Skeleton, and proud human scavenger King use
player-scale 48×48 binary canvases. Their sources are bottom-anchored and face right toward the
left-facing player. At 1×, the four silhouettes stay distinct, and the King’s bent-scrap crown,
leather layers, steel shoulder, narrow sewer-green cape accent, and rusted cudgel establish rank
without a Boss-only canvas.
All four retain the standard `maxColors: 12` and three-pass cleanup defaults because their compact
previews retained their defining silhouettes.

This subsection supersedes only the historical CC0 Giant Rat, Zombie, and Skeleton outputs
recorded above. Their provenance remains preserved as historical context; Sewer King is new
original art.
