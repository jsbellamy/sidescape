# SideScape original-art style

All new SideScape art follows this guide. The generated [palette preview](art-style-preview.png)
is its visual reference; regenerate it with `npm run art` after changing its committed source.

## Master palette

The UI anchors are `--bg #1a1410`, `--bg-panel #262019`, `--border #3d332a`, `--text #e8dcc8`,
`--text-dim #9a8a72`, and `--accent #d4a017`. The warm-dark outline/shadow ramp is ink
`#110d0a`, outline `#292017`, shadow `#4b3828`, and umber `#70503a`; parchment highlights are
parchment `#f5ebcf`, cream `#e6d4aa`, sand `#c6ad79`, and glint `#fff8df`.

## Zone palettes

| Theme  | Six-color sub-palette                             | Direction                    |
| ------ | ------------------------------------------------- | ---------------------------- |
| meadow | `#86b6d8 #cfe6a8 #5f8a4f #3f6b3b #2c4a26 #e7c65a` | spring green, sky blue       |
| forest | `#233b39 #3f5f50 #567b5b #78945d #172b24 #a7bf71` | cold deep green              |
| sewer  | `#3a4136 #59624b #7d8857 #a5c64c #263027 #c4d46b` | moss grey-green, sickly glow |
| crypt  | `#241a33 #3a2f4a #5c4c74 #806b9c #d9d3bc #150f1c` | purple, bone white           |
| town   | `#4a2e1a #70421f #9c6331 #c5823b #e2ad57 #2b1b12` | timber brown, forge orange   |

These drive backdrops, sprite accents, and scene props so each Theme is coherent.

## Grids and pixel rules

- Icons: 34×34 canvas, 32×32 art with a 1px transparent margin.
- Combat sprites: shared 32×32 grid; Boss-class sprites may be 48×48.
- Backdrops: horizontally tileable 160×120 strips.
- Scene props: approximately 24×20.
- Use a 1px master-ramp dark outline, base, highlight, and one accent — the same ≤5-color budget
  as the Icon legibility rules below (this doc used to say "one shadow, one highlight", which
  under-counted and let 12-color icons ship; ≤5 total is the one number that matters).
- No anti-aliasing or partial alpha; designated ghost/wisp art may use one translucency step.
- Draw silhouette first: assets must read in the 320px-wide window. The UI applies
  `image-rendering: pixelated`, and source art assumes it.

Combat sprites are **facing inward**: player right, Monsters left, including Boss-class sprites.

## Icon legibility (34×34)

Design icons at native size — 34×34, never draw large and downscale. A downscaled icon reads as
streak noise at in-game scale even when it looks fine zoomed in.

Every icon PR must satisfy the rules below. Each is labeled **[lint]** (mechanically enforced by
`src/ui/icon-assets.test.ts`, run by `npm test`) or **[sheet]** (judged by eye on the 1×
contact sheet, `docs/icon-sheet-1x.png`, cited as PR evidence):

- One dominant object per icon, filling 26–32px on the long axis. [lint: fill]
- Prefer a side/profile silhouette over multiple overlapping objects. [sheet]
- Structural features ≥2px wide — use `thickLine` (`scripts/art/icon-canvas.mjs`) for them;
  single-pixel strokes are for highlights/glints only, never structural edges. [sheet]
- ≤5 colors: outline, shadow, base, highlight, one accent. [lint: color-budget]
- Separate adjacent parts by VALUE, not subtle hue — several zone-palette neighbors are near-
  isovalue (e.g. forest `#3f5f50` vs `#567b5b`); pick across the ramp, not adjacent steps. [sheet]
- One connected silhouette — no floating smoke, sparks, drips, or chains; if a detail can't be
  ≥2px and attached to the main shape, cut it. [lint: connected]
- Edge contrast against the panel: the silhouette's outer edge must read against `--bg-panel
#262019` — pure ink/outline shapes sink into the panel. A dark outline is fine only around a
  mid-or-lighter fill. [sheet]
- 1px transparent margin: rows/columns 0 and 33 stay fully transparent, drawable art confined to
  1..32. [lint: margin]
- Binary alpha: every pixel is fully transparent or fully opaque, no anti-aliasing — except icons
  named in `TRANSLUCENT_ALLOWED` (`src/ui/icon-assets.test.ts`), which may use exactly one
  intermediate alpha value (the existing ghost/wisp exception, e.g. `shade-wisp`). [lint:
  binary-alpha]
- Silhouette-first, as above.

New icons must be born clean under these rules — the exemption baseline
(`src/ui/icon-lint-exemptions.ts`) only shrinks as existing icons are redrawn to comply; it never
grows to cover a new violator.
