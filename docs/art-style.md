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
- Use a 1px master-ramp dark outline, base, one shadow, and one highlight.
- No anti-aliasing or partial alpha; designated ghost/wisp art may use one translucency step.
- Draw silhouette first: assets must read in the 320px-wide window. The UI applies
  `image-rendering: pixelated`, and source art assumes it.

Combat sprites are **facing inward**: player right, Monsters left, including Boss-class sprites.
