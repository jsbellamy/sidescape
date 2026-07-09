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
