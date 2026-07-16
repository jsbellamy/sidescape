# Source-driven backdrop generation

Backdrops use a two-stage, source-driven workflow. Stage 1 recovers the untouched generated raster's logical 160×120 pixel grid into a committed compact source. Stage 2 (`npm run art`) deterministically repeats, validates, and writes that source without resampling. The raw PNG and its review previews are ignored inputs, never committed assets.

Register the three source layers for a Theme first, then ingest one untouched raw at a time:

```sh
npm run art:ingest-backdrop -- --theme <theme> --layer <sky|mid|near>
```

The default raw, compact source, and review paths are:

```text
scripts/art/backdrop-gen-inbox/<theme>-<layer>.png
scripts/art/backdrop-sources/<theme>-<layer>.png
scripts/art/backdrop-gen-inbox/preview/<theme>-<layer>@1x.png
scripts/art/backdrop-gen-inbox/preview/<theme>-<layer>@3x-strip.png
```

Every `kind: "source"` Theme declares one HSL gamut beside `theme`, `kind`, and `layers`. The same gamut governs sky, mid, and near — never hardcode a Theme name or duplicate gamut per layer. Prompts guide palette intent but do not enforce decoded-RGB bounds; conformance does.

Use `--in`, `--crop x0,y0,x1,y1`, `--tolerance`, `--pitch`, and `--pitch-y` only to correct a reported input/grid issue. The ingest recovers logical cells by majority vote, then deterministically conforms them to the Theme HSL gamut, then normalizes the conformed cells to the layer's single `maxColors` ceiling using source-local Oklab medoids. Conformance runs before medoid selection so forbidden colors cannot consume palette slots. Allowed cells remain byte-identical; out-of-gamut cells keep their lightness, clamp saturation, and move off-range hue to the nearer chromatic endpoint (exact circular ties take the lower endpoint). Decoded 8-bit RGB is revalidated after rounding. Subtle RGB variation in an untouched image-generator raw is expected: a high sampled-color count alone is not a rejection reason. Ingest reports distinguish sampled, gamut-conformed, and normalized color counts (and the corresponding changed-cell counts). It never continuously resizes or downscales a smooth raster. A result other than exactly 160×120 is rejected without replacing the compact source.

Keep the raw PNG untouched: never resize, re-export, downsample, or hand-edit it. The native 1× preview and unscaled three-period strip remain the visual approval surfaces. If conformance or normalization visibly flattens the image, regenerate the raw or change the cap/gamut only through evidence in the consuming art issue; never hand-paint the compact source. Stage 2 copies the committed compact source exactly, validates dimensions/alpha/cap/gamut, and never repairs or requantizes a source — it rejects the first opaque out-of-gamut pixel with coordinate/RGB/HSL/rule diagnostics.

## Prompt kits

### Opaque sky

```text
One horizontally tileable frozen/environmental panorama SKY layer for a SideScape parallax backdrop. Compose on a 160×120 logical pixel grid rendered large. Fully opaque. Layer-specific subject matter only: no actors, UI, text, frame, foreground, or separate parallax layers. Dense clustered pixel-art terrain and atmosphere; no blur, antialiasing, smooth vector gradients, or continuous shading. Keep both horizontal edges visually continuous.
```

### Keyed transparent mid or near layer

```text
One horizontally tileable SideScape parallax MID/NEAR layer only, with layer-specific terrain or silhouette. Compose on a 160×120 logical pixel grid rendered large, over a flat #ff00ff magenta background. The keyed result must have binary silhouette/terrain alpha: do not paint sky into transparent space. No actors, UI, text, frame, foreground from another layer, blur, antialiasing, smooth vector gradients, or continuous shading. Keep both horizontal edges visually continuous.
```

Prompts do not guarantee a seamless tile or enforce HSL bounds. Review the native 1× result and the unscaled three-period strip. A visible seam, a dominant landmark repeated every 160px, or failed compaction fails the human gate even when the mechanical periodicity check passes. Regenerate from a new untouched raw input; do not hand-paint or smooth the compact source.
