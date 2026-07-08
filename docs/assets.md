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
