# SideScape original-art style

All new SideScape art follows this guide. The generated [palette preview](art-style-preview.png)
is its visual reference; regenerate it with `npm run art` after changing its committed source.

## Master palette

The UI anchors are `--bg #1a1410`, `--bg-panel #262019`, `--border #3d332a`, `--text #e8dcc8`,
`--text-dim #9a8a72`, and `--accent #d4a017`. The warm-dark outline/shadow ramp is ink
`#110d0a`, outline `#292017`, shadow `#4b3828`, and umber `#70503a`; parchment highlights are
parchment `#f5ebcf`, cream `#e6d4aa`, sand `#c6ad79`, and glint `#fff8df`.

## Zone palettes

| Theme   | Six-color sub-palette                             | Direction                    |
| ------- | ------------------------------------------------- | ---------------------------- |
| meadow  | `#86b6d8 #cfe6a8 #5f8a4f #3f6b3b #2c4a26 #e7c65a` | spring green, sky blue       |
| forest  | `#233b39 #3f5f50 #567b5b #78945d #172b24 #a7bf71` | cold deep green              |
| sewer   | `#3a4136 #59624b #7d8857 #a5c64c #263027 #c4d46b` | moss grey-green, sickly glow |
| crypt   | `#241a33 #3a2f4a #5c4c74 #806b9c #d9d3bc #150f1c` | purple, bone white           |
| town    | `#4a2e1a #70421f #9c6331 #c5823b #e2ad57 #2b1b12` | timber brown, forge orange   |
| glacier | `#041437 #0ea0ae #0d9fce #0e8ae9 #2372f3 #85aaf9` | deep glacial blue, icy cyan  |

These drive backdrops, sprite accents, and scene props so each Theme is coherent.

## Icon material ramps

Close-up icons may use the named steel, water/scale, gold, blood (red), and ember (orange) ramps
in `scripts/art/palettes.mjs`. These ramps exist to reproduce the golden master's readable material
planes; use their named `shadow`, `base`, `light`, and `glint` roles and spend the 8–12-color budget
intentionally. The ramps are also the entire hue vocabulary build-time quantization can speak: a
subject whose dominant hue has no ramp (the red potion, before `blood` existed) silently ships
recolored into the nearest ramp, so add a ramp here rather than letting an off-hue subject drift.

## Grids and pixel rules

- Icons: native 34×34 canvas, with art confined to the inner 32×32 area.
- Combat sprites: shared 32×32 grid; Boss-class sprites may be 48×48.
- Backdrops: horizontally tileable 160×120 strips.
- Scene props: approximately 24×20.
- Use a selective 1px warm-dark outline, thickening to 2px only at important silhouette corners,
  plus clustered material shadows and highlights. The reference look normally uses 8–12 colors.
- No anti-aliasing or partial alpha; designated ghost/wisp art may use one translucency step.
- Draw silhouette first: assets must read in the 320px-wide window. The UI applies
  `image-rendering: pixelated`, and source art assumes it.

Combat sprites are **facing inward**: player right, Monsters left, including Boss-class sprites.

## Icon legibility (34×34)

Design icons directly at their final 34×34 resolution. Never downscale a smooth or detailed
illustration into `src/assets/icons` — naive downscaling of continuous-tone art is still banned,
because it produces the muddy anti-aliased edges these rules exist to prevent. Two image-derived
origins are sanctioned, because both reconstruct a real pixel grid rather than smearing a smooth
illustration:

1. The **source-driven pipeline** (`docs/icon-gen.md`): a chunky pixel-art image generated from the
   committed prompt kit is ingested (`npm run art:ingest`) into a committed _compact source_ under
   `scripts/art/icon-sources/`, then conformed to house style at every build — quantized to the
   named ramps, palette-reduced and despeckled to the color/cluster budgets, and given one derived
   warm-ink ring. This needs no per-pixel hand-work; the golden master stays the style authority via
   the build-time quantization, not by replacing it with the generation's look.
2. **Grid-faithful reconstruction** of a committed, approved pixel-art reference sheet with a
   regular pseudo-pixel grid (currently `icon-style-golden-master.png`) via
   `scripts/art/trace-reference.mjs`, which detects the sheet's cell pitch, majority-votes each art
   cell, and quantizes to the named ramps. Its output is a _draft_ for hand-cleanup, not a source.

Both are transcription of existing pixels, not downscaling of an illustration. For hand-authored
icons, translate the concept into deliberate native-pixel clusters while preserving the useful
interior planes visible in the golden master.

The approved visual reference is the committed
[icon-style golden master](icon-style-golden-master.png), supplied during the July 2026 icon-style
pass. Its defining traits are a near-black warm outline, compact exaggerated forms, multi-step
clustered shading, material-specific highlights, irregular contours, and large readable
silhouettes. The committed `skill-fishing` and `tab-bank` sources are canonical material and contour
examples; `skill-fishing` is the canonical mask-first multi-part example, and `skill-attack` and
`skill-strength` are the canonical source-driven examples (prompt-kit generations ingested to compact
sources and conformed at build; see `docs/icon-gen.md`). The `scripts/art/trace-reference.mjs`
grid-tracing tool remains available for reconstructing a committed reference sheet into a draft, but
no shipped icon currently uses it. Review new work side-by-side with that image; prose and lint do
not override a visible mismatch.

### Native-grid authoring workflow

For a multi-part subject, compose a colorless union with `createMask()` from
`scripts/art/icon-canvas.mjs`. Keep the body inside coordinates 2..31 so `outlineMask()` can derive
one exterior 1px outline inside the drawable 1..32 area. Apply the base with `paintMask()`, then add
shadow/highlight planes through `paintInside()` so they cannot leak outside the approved contour.
Do not outline each rectangle, circle, limb, or equipment part independently; those overlapping
outlines are the main source of dark internal scars and melted silhouettes.

Work in this order:

1. Define one 4-connected silhouette before choosing colors. Detached accents remain exceptional.
2. Run `npm run art` and inspect [the silhouette-only 1× sheet](icon-silhouette-sheet-1x.png). The
   subject must be recognizable as a flat shape at native scale.
3. Add one upper-left lighting scheme using clustered material planes, then inspect
   [the color 1× sheet](icon-sheet-1x.png) beside the
   [golden master](icon-style-golden-master.png). Use the 4× sheet only to diagnose pixel placement;
   it cannot overrule a weak 1× read.
4. Run the icon tests. Code-generated icons must use four-connected structural joins and may have
   at most three isolated one-pixel color clusters. This preserves intentional eyes/glints while
   rejecting diagonal-only anatomy and sparkle noise.

### Source-driven authoring workflow

For subjects better realized by an image model than by hand, use the source-driven pipeline
documented in [icon-gen.md](icon-gen.md): generate a chunky pixel-art image from the committed
prompt kit, run `npm run art:ingest -- --name <icon>` to reconstruct its native pseudo-pixel grid into
a committed compact source under `scripts/art/icon-sources/`, review the git-ignored preview, and
add a `{ name, source: "<icon>.png" }` entry to `scripts/art/icons.mjs`. The build
(`paintSourceIcon`) conforms the source to house style deterministically: quantize to the named
ramps, reduce the palette and despeckle to the color-budget and cluster-noise lints, and derive one
warm-ink ring. Unlike the tracer draft, this requires no per-pixel hand-cleanup — but the generation
must still clear the same sheet rubric and lint suite, and ingest rejects a source whose grid is the
wrong size or over budget. Nothing under the git-ignored `scripts/art/icon-gen-inbox/` (raw
generations and previews) is ever committed; only the compact source and the `icons.mjs` entry are.

A generated large raster is otherwise not a production icon source and must not be downscaled into
`src/assets/icons`. Image generation may also be used purely for concept exploration (subject, pose,
palette, material planes), translating an approved concept into the native-grid mask workflow above.

`scripts/art/trace-reference.mjs` produces a **draft, never an icon**. Its emitted `paintGrid`
definition must be pasted into `scripts/art/icons.mjs`, rescaled and hand-cleaned through
native-grid workflow steps 1–4 above (the tool's non-integer fit scaling leaves uneven cells and
one-pixel noise on purpose, for the author to resolve), and pass the full sheet rubric and lint
suite before commit. Nothing under the tool's git-ignored `scripts/art/trace-out/` — the raw
reconstruction and draft previews — is ever committed as an icon source; shipped icons remain
deterministic `npm run art` output.

Agent brief: design exactly one dominant object; settle a recognizable 32×32 silhouette first;
derive one exterior warm-dark outline around the union; light from upper-left; use 8–12 named-ramp
colors; place shadows/highlights in 2–8px clusters; avoid gradients, antialiasing, dithering,
internal outline scars, decorative particles, and diagonal-only joins; verify silhouette 1×,
color 1×, color 4×, then lint.

Every icon PR must satisfy the rules below. Each is labeled **[lint]** (mechanically enforced by
`src/ui/icon-assets.test.ts`, run by `npm test`) or **[sheet]** (judged by eye on the 1×
contact sheet, `docs/icon-sheet-1x.png`, cited as PR evidence):

- One dominant object per icon, filling 26–32px on the long axis. [lint: fill]
- Prefer a side/profile silhouette over multiple overlapping objects. [sheet]
- Primary structural features should usually be ≥2px wide, but 1px native details are allowed for
  interior seams, contour steps, glints, bowstrings, eyes, and similar information visible in the
  reference. Use `thickLine` for broad shafts and blade spines. [sheet]
- 8–12 colors is the normal target, with twelve the hard maximum: near-black outline, 2–3 shadow
  values, base, 2–3 highlight values, and material/accent colors. Fewer is fine for simple subjects
  such as a heart. [lint: color-budget]
- Shade in clusters: highlights and shadows should form intentional 2–8 native-pixel groups.
  Avoid isolated sparkle noise, checkerboard dithering, smooth gradients, or one-pixel banding.
  [lint for code-generated icons: cluster-noise; sheet for cluster shape]
- Separate adjacent parts by VALUE, not subtle hue — several zone-palette neighbors are near-
  isovalue (e.g. forest `#3f5f50` vs `#567b5b`); pick across the ramp, not adjacent steps. [sheet]
- Use one connected silhouette; purposeful secondary details such as the roast's flame must touch
  the body instead of floating. Code-generated icons additionally require shared-edge, not
  diagonal-only, joins throughout the silhouette. [lint: connected; generated structural-connected]
- Edge contrast against the panel: the silhouette's outer edge must read against `--bg-panel
#262019` — pure ink/outline shapes sink into the panel. A dark outline is fine only around a
  mid-or-lighter fill. [sheet]
- Transparent breathing room: rows/columns 0 and 33 stay transparent; drawable art is confined to
  coordinates 1..32. [lint: margin]
- Binary alpha: every pixel is fully transparent or fully opaque, no anti-aliasing — except icons
  named in `TRANSLUCENT_ALLOWED` (`src/ui/icon-assets.test.ts`), which may use exactly one
  intermediate alpha value (the existing ghost/wisp exception, e.g. `shade-wisp`). [lint:
  binary-alpha]
- Silhouette-first, as above.

The required sheet rubric is: recognizable flat silhouette; one dominant object; no internal
outline scars; no accidental tangencies or diagonal-only structural bridges; consistent
upper-left lighting; adjacent parts separated by value; readable against `--bg-panel` at 1×.

New icons must be born clean under these rules — the exemption baseline
(`src/ui/icon-lint-exemptions.ts`) only shrinks as existing icons are redrawn to comply; it never
grows to cover a new violator.
