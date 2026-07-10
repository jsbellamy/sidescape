# Asset provenance

Every third-party asset in this repo must be CC0 (public domain) and recorded
here: pack name, author, source URL, and license confirmation. New asset work
appends a new section below — don't restructure existing sections, since
multiple issues add to this file independently.

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
Theme — meadow/forest/sewer/crypt/town) and the Smithing anvil foreground prop
(`#activity-prop.prop-anvil`) are **hand-built with plain CSS** (`linear-gradient` layers, a
`clip-path` silhouette for the anvil) — no third-party image asset, so no license/provenance entry
is needed for them. This invokes the issue's own escape hatch verbatim: "if a decent CC0 set can't
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
