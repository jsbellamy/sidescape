# Source-driven combat sprite generation (prompt kit)

The sibling of [icon-gen.md](icon-gen.md), for the combat scene's player and Monster sprites. Same
shape: generate a chunky pixel-art character from an external image model, ingest it into a
committed _compact source_, and let `npm run art` conform it to house style. No per-pixel
hand-cleanup — consistency comes from the build converter.

Until #264 there was no sprite ingest at all. Every source under `scripts/art/sprite-sources/` was
either a crop of a CC0 tile sheet or a **hand-reconstruction of a generation, eyeballed pixel by
pixel into a 32×32 canvas**. That hand step is where the art was lost, not in the build: the
committed `sprite-player.png` contains 11 colors, and every one of them is already an exact named
palette hex, so quantization is a no-op on it. The pipeline was never the thing flattening the
sprites. This kit exists so a generation reaches the canvas by machine instead.

## The two stages

```
 generate ──► scripts/art/sprite-gen-inbox/<name>.png   (raw image, git-ignored)
    │
    ├─ npm run art:ingest-sprite -- --name <name>
    │      keys background → detects the pseudo-pixel grid → votes each cell → normalizes
    │      recovered cell colors deterministically →
    │      bottom-anchors on the canvas → writes:
    │
    ├──► scripts/art/sprite-sources/sprite-<name>.png   (compact 1px/cell source — COMMITTED)
    └──► scripts/art/sprite-gen-out/<name>-preview-8x.png  (8× preview — git-ignored)
           │
           ├─ add/adjust the entry in scripts/art/sprites.mjs
           └─ npm run art  →  src/assets/sprites/<name>.png  (quantized, deterministic)
```

Stage 1 (ingest) runs **once per sprite** and is human-approved. Stage 2 (`writeSprites`, invoked by
`npm run art`) runs every build and is deterministic.

## Render resolution

**Render size ÷ canvas size = the pitch**, the size of one logical pixel in real pixels. Ingest
needs a pitch of ~8px or more to majority-vote each cell reliably, and `detectPitch` handles a
fractional pitch fine (it locked onto 10.25px on the first 1254×1254 player render), so the render
does **not** need to be an exact multiple of the canvas. Whatever your image model outputs natively
is almost certainly fine:

| Render    | Pitch (48 canvas) | Notes                                  |
| --------- | ----------------- | -------------------------------------- |
| 1024×1024 | ~21px             | Fine — the common image-model minimum. |
| 768×768   | 16px              | Also fine if your model offers it.     |

The one thing resolution does **not** fix is a figure drawn taller than the canvas. The first player
generation came back **94 logical pixels tall** for a 48 canvas — and it would have been 94 tall at
any resolution, because that is the model ignoring the grid line, not a pixel-count problem. The fix
is pinning the logical grid in the prompt (below), not choosing a smaller render.

**Do not downscale a large render to hit a "nicer" number.** A resave is exactly what smeared the
first render into 63k colors. Feed ingest the model's raw output at whatever size it came out.

**Save the model's PNG directly.** Do not resize, open it in an editor, re-export it, downsample it,
or hand-edit it. Keep that raw PNG in the git-ignored inbox. Built-in image generation can produce
tens of thousands of subtly different RGB values even when its logical grid is recoverable; that is
expected and not itself a failure. Ingest first recovers the logical cells, then deterministically
normalizes their source-local palette (16 colors by default; the player explicitly uses 24). This
is neither raster downscaling nor hand editing. The later Stage-2 named-ramp projection is separate.

## Prompt template

> A full-body video-game character sprite of **\<SUBJECT\>**, chunky pixel art. Drawn on a **48×48
> logical pixel grid rendered large** (each logical pixel is a clean flat block — **no smooth
> gradients, no anti-aliasing, no blur**). Standing in a combat-ready stance, **facing left**,
> **spanning about 44–46 logical pixels tall**. Flat **magenta `#ff00ff`** background, nothing else
> in frame. **Selective 1px dark warm outline**, light from the upper-left, 10–16 muted earthy
> colors, clustered shading (no dithering, no drop shadow).

Fill `<SUBJECT>` with a concrete, fully-specified character ("a woman adventurer with a ponytail,
green tunic, brown leather boots and belt, holding a short sword"). Keep the **grid-size**,
**flat-block**, **outline**, and **background** lines verbatim — they are what make ingest reliable,
and each one maps to a failure below.

**Facing.** The player faces **left** (every blade pixel in the committed source sits in its left
half). Get it right in the prompt if you can; `--flip` mirrors a recovered grid losslessly if not.

## Design for the compact result

- **Never let the sprite be downsampled.** This is the whole game. A generation drawn at the canvas
  grid ingests 1:1 and keeps everything. A generation drawn at 2× the grid must be halved, and a 2:1
  majority-vote downsample **deletes the 1px outline** (half a pixel loses the vote), which is worse
  than any palette problem — the figure ends up dark-on-dark, unreadable against the scene's
  `bg-panel`, and no ramp tuning fixes it. Pin the logical grid in the prompt.
- **Quantization can only speak the named-ramp vocabulary** (`scripts/art/palettes.mjs`). A hue with
  no ramp does not merely shift, it collapses. The first player generation's olive tunic (`#5f622c`)
  measured ~5.5× closer to `leather.base` than to any `forest` green — the `forest` zone ramp is
  _teal_-green — so her entire tunic shipped brown. Either dress the character in hues the palette
  already speaks, or add a material ramp first.
- **Adding a material ramp is safe; adding a zone is not.** `materialPalettes` is scoped per asset
  (`materialRampNames`), so a new ramp can only reach a sprite that names it. `zonePalettes` has no
  allowlist and applies to every asset unconditionally — see the warning in `palettes.mjs`.
- **Keep limbs ≥2 logical pixels thick.** A 1px limb or blade survives 1:1 ingest but nothing else.

## Ingesting

```bash
npm run art:ingest-sprite -- --name player --size 48
# reads scripts/art/sprite-gen-inbox/player.png by default (or pass --in <path>)
# note the `--` separator: npm needs it to forward flags to the script
```

The sprite is bottom-anchored (characters stand on the combat scene's ground plane; a vertically
centred sprite floats) and horizontally centred.

Useful overrides: `--crop x0,y0,x1,y1`, `--tolerance` (background key spread, default 40),
`--pitch`/`--pitch-y` (force the grid pitch), `--flip` (mirror horizontally), `--size` (32, 48, or
64; it must match the registry entry's declared canvas), `--min-long`/`--max-long` (the pitch search band), and
`--dry-run` (runs the complete validation/preview pipeline without creating or altering outputs).

## Per-sprite finishing budget

`scripts/art/sprites.mjs` defaults every entry to `maxColors: 12` and `despecklePasses: 3`. Those
are right for a 32×32 Monster read at a glance and wrong for an ingested hero:

- **`maxColors`** merges the least-used colors away, so a rendered character's whole shading
  vocabulary — the second skin tone, the leather highlight, the blade glint — is exactly what falls
  off the bottom of a 12-color budget. The player uses 24.
- **`despecklePasses`** deletes any pixel with no matching 8-neighbour. On a clean 1:1 ingest every
  isolated pixel is deliberate (the eye, the buckle), so the player uses **0**. Do not reach for
  despeckle to clean up a noisy downsample: on the player it ate the outline, dropped her from 22
  colors to 14, and dissolved her into a blob. Fix the generation instead.

## Known failure modes (from the first player trials)

- **Figure taller than the canvas.** The generation ignored the logical grid (94 tall for a 48
  canvas). There is no rescue — regenerate with the grid line pinned. Ingest reports the recovered
  grid so you can see it immediately.
- **Wrong subject or unreadable silhouette.** Normalization cannot repair a wrong subject, lost
  defining feature, incorrect facing, or an unreadable silhouette. Review the Stage-2 preview at
  1x and regenerate when it fails artistically.
- **Everything ships brown.** A dominant hue has no named ramp and collapsed into the master ramp's
  umber/shadow browns. Add a material ramp, or recolor the generation.
- **Empty grid.** Key/pitch detection found nothing — usually a background that is not flat or not
  the key color. Raise `--tolerance` or tighten `--crop`. Ingest fails loudly rather than writing an
  empty source.

## What is and isn't committed

Committed: `scripts/art/sprite-sources/sprite-<name>.png` (the compact source) and the generated
`src/assets/sprites/<name>.png`. Git-ignored: `scripts/art/sprite-gen-inbox/` (raw generations) and
`scripts/art/sprite-gen-out/` (previews) — same contract as the icon inbox.
