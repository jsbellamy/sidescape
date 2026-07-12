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

## Generate base families, not every variant

Generate one canonical shape for an item family, then derive variants deterministically where only
material, tier, or state changes:

- Generate the lowest useful equipment tier (for example a bronze dagger or iron full helm), then
  recolor that compact source for higher metal tiers instead of asking the model to redraw it.
- Generate raw food only. Cooked meat and fish reuse the raw silhouette with a cooked color ramp;
  they are not separate image-generation subjects.
- Generate one representative bar, gem, hide, arrow, bow, rune, potion bottle, and staff shape;
  derive sibling tiers or elements from that approved base when their silhouette is unchanged.

This keeps related items visibly related and reserves image generation for a new silhouette rather
than a palette swap. Current strong base references include the iron bar, fish, kiteshield, iron
sword, water staff, bank chest, cooking drumstick, herblore plant, and smithing anvil.

## Design for the compact result

The large generation is an intermediate, not the approval target. Always compare the generated
subject with `icon-gen-inbox/preview/<name>@8x.png`, which is the exact 34×34 build result. Approve
only when the compact preview preserves the large image's subject, dominant silhouette, defining
feature, and material read. If any of those become ambiguous, regenerate; a successful ingest is
necessary but not sufficient.

Simple subjects work best: one connected silhouette, two to four broad material planes, structural
features at least 3 logical pixels thick, and no decorative detail. For a weapon, make the
identity-defining head or blade roughly 35–45% of the icon and separate its parts by **value**, not
subtle hue. The accepted bronze-mace retry follows the fire-staff pattern: an oversized head, broad
light flanges, a dark central core and shadow notches, plus a simpler shaft. Earlier small,
same-value mace heads passed ingest but collapsed into a generic club at 34×34 and were rejected.
Apply the same rule to materials: a rounded sapphire became a blue egg after ingest, while a retry
with four sharp outer points and four large value-separated facets remained an unmistakable cut gem.
When material and subject share a color ramp (blue fish, water, sapphire), silhouette must carry the
category distinction.

Also compare a candidate against other icons with the same outer shape. The first round bronze
shield passed ingest but read as a second coin; the accepted retry added a large contrasting steel
boss, broad X bracing, and visible side depth. Similar silhouettes need one oversized category cue
that survives independently of color.

When retrying, state the compact failure explicitly in the next prompt (for example "head became a
featureless blob"), attach the failed compact preview as a negative reference, and exaggerate only
the lost defining feature. Carry the successful correction forward as the new prompt standard for
that family.

If geometry already reads correctly and ingest rejects only off-ramp coverage, keep the composition
fixed and retry with the exact named ramp hex values. The kiln cat and shade wisp used this
color-only retry: redesigning their already-clear silhouettes would have introduced unnecessary
variation.

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
- **Over 15% of subject cells off-ramp** — the subject's dominant hue has no faithful named ramp,
  so the whole body would silently ship recolored (a red potion shipped brown before the `blood`
  ramp existed). Add a material ramp to `scripts/art/palettes.mjs` or recolor the generation; a few
  anti-aliased edge pixels warning is normal and does not trip this.
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
  distance warnings flag any color with no faithful ramp before you commit, and ingest rejects
  outright when off-ramp colors cover more than 15% of the subject — that means a whole hue family
  is missing from `scripts/art/palettes.mjs` (the red potion quantized entirely to brown before the
  `blood` ramp existed), not an edge-pixel artifact.
- **Enclosed background.** Magenta (or transparent) regions the subject fully encloses — a bow's
  window, a ring's center — are keyed to transparency along with the outer background and reported
  as a count. Open-frame subjects still ingest best when their members are ≥3 logical pixels thick;
  1px strings and threads tend to fall to despeckling. A large enclosed count on a subject with no
  real hole means the key leaked and the crop/tolerance needs tightening.

## What is and isn't committed

Committed: `scripts/art/icon-sources/<name>.png` (the compact source) and the `icons.mjs` entry.
Never committed: anything under `scripts/art/icon-gen-inbox/` (raw generations and previews) — it is
git-ignored. Shipped icons under `src/assets/icons/` remain deterministic `npm run art` output and
must pass the full lint suite and sheet rubric in [art-style.md](art-style.md) like any other icon.
