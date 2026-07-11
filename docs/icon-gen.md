# Source-driven icon generation (prompt kit)

This is the fastest way to add a SideScape icon: generate a chunky pixel-art image from an external
image model, ingest it into a committed _compact source_, and let `npm run art` conform it to house
style. There is no per-pixel hand-cleanup — consistency comes from the build converter, not from
tracing each pixel. It complements the hand-authored mask workflow in
[art-style.md](art-style.md#native-grid-authoring-workflow); use whichever fits the subject.

The golden master ([icon-style-golden-master.png](icon-style-golden-master.png)) remains the style
authority. Generations are pulled toward it at **build time** (quantized to the named ramps, one
derived warm-ink ring), so a bright, thick-outlined generation still ships in the house palette.

## The two stages

```
 generate ──► scripts/art/icon-gen-inbox/<name>.png   (raw ~1MB image, git-ignored)
    │
    ├─ npm run art:ingest -- --name <name>
    │      keys background → detects the pseudo-pixel grid → votes each cell →
    │      validates size/budget → writes:
    │
    ├──► scripts/art/icon-sources/<name>.png           (compact 1px/cell source — COMMITTED)
    └──► scripts/art/icon-gen-inbox/preview/<name>.png  (8× preview — git-ignored)
           │
           ├─ add { name, source: "<name>.png" } to scripts/art/icons.mjs
           └─ npm run art  →  src/assets/icons/<name>.png  (quantized + outlined, deterministic)
```

Stage 1 (ingest) runs **once per icon** and is human-approved. Stage 2 (`paintSourceIcon`, invoked
by `npm run art`) runs every build and is deterministic, so a palette change re-flows every
source-driven icon automatically.

## Prompt template

Attach [icon-style-golden-master.png](icon-style-golden-master.png) as a style reference and use:

> A single video-game inventory icon of **\<SUBJECT\>**, chunky pixel art matching the attached
> style sample. One dominant object, centered, filling most of the frame. Drawn on a **32×32 logical
> pixel grid rendered large** (each logical pixel is a clean flat block — no smooth gradients, no
> anti-aliasing, no blur). The subject's long side spans about **26–30 logical pixels**. Flat
> **magenta `#ff00ff`** background, nothing else in frame. Selective 1px dark warm outline, light
> from the upper-left, 8–12 muted earthy colors, clustered shading (no dithering, no drop shadow).

Fill `<SUBJECT>` with a concrete noun (e.g. "an iron short sword, blade pointing up-right"). Keep the
grid-size and background lines verbatim — they are what makes ingest reliable.

## Ingesting

```
npm run art:ingest -- --name skill-attack
# reads scripts/art/icon-gen-inbox/skill-attack.png by default (or pass --in <path>)
# note the `--` separator: npm needs it to forward flags to the script, not eat them itself
```

The report prints the detected pitch, the reconstructed grid size, the projected color budget, and
the quantization table. On success it writes the compact source and an 8× preview; **review the
preview** — it is rendered through the exact Stage-2 build path, so it is byte-for-byte what
`npm run art` will ship.

The size check measures the **rendered preview's** opaque bounding box — exactly what the fill lint
sees — rather than guessing from the grid (these generations bake their own outline into the grid,
so the rendered icon is about the grid's size, not grid + 2). Ingest **rejects** (non-zero exit,
nothing written) a generation that cannot become a clean icon, so bad generations never reach the
repo:

- **Rendered long axis under 26px.** The subject came in too small for the fill lint. Regenerate it
  larger in frame, or — for a near miss like 25px — re-run with `--fit 28` to nearest-neighbour scale
  the source up (despeckle cleans the scaling seams). `skill-strength` needed `--fit 28`.
- **Grid too big for the drawable area** (build preview fails). The subject fills too much of the
  frame; regenerate smaller, or pass `--pitch N` if the grid was mis-detected too fine.
- **Over 12 colors** after quantization + reduction. Regenerate with a simpler palette.
- **Keyed subject touches the crop edge** — a neighbour or label bled in; pass a tighter `--crop
x0,y0,x1,y1`.

Useful overrides: `--crop` (defaults to the whole image), `--tolerance` (background key spread,
default 40 — raise if the key color is not cleanly flat), `--pitch`/`--pitch-y` (force the grid
pitch), `--fit N` (scale the source so the rendered long axis is ~N, to rescue a slightly-small
subject).

## Known failure modes (from the first trials)

- **Wrong subject.** A "magnifying glass" came back for skill-magic — image models drift on abstract
  prompts. Name a concrete object and regenerate until the subject is right; ingest cannot fix
  content, only conform style.
- **Off-ramp colors.** Pure black outlines and pure white highlights are normal in generations; the
  build quantization pulls them to `P.ink` and the parchment/steel ramps. The ingest report's
  distance warnings flag any color with no faithful ramp before you commit.
- **Interior holes vs. enclosed detail.** Ingest reports enclosed background cells (holes). For a
  solid subject that number should be ~0; a nonzero count on a subject with no real hole means the
  key leaked and the crop/tolerance needs tightening.

## What is and isn't committed

Committed: `scripts/art/icon-sources/<name>.png` (the compact source) and the `icons.mjs` entry.
Never committed: anything under `scripts/art/icon-gen-inbox/` (raw generations and previews) — it is
git-ignored. Shipped icons under `src/assets/icons/` remain deterministic `npm run art` output and
must pass the full lint suite and sheet rubric in [art-style.md](art-style.md) like any other icon.
