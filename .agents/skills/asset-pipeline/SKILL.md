---
name: asset-pipeline
description: Source-driven SideScape art workflow for generating, ingesting, registering, reviewing, and shipping combat sprites or icons. Use when creating or replacing image-generated raster art, changing sprite/icon compact sources, running art ingest commands, or implementing/reviewing a SideScape asset issue.
---

# Source-driven art

Move each generated silhouette through the repository's deterministic pipeline. The raw generation is an input; the compact 1× result is the asset.

## 1. Ground the run

Read `AGENTS.md` and `docs/art-style.md`. Then read the complete branch guide:

- Combat sprite: `docs/sprite-gen.md`
- Icon: `docs/icon-gen.md`

For issue work, read the live issue and comments. Record the initial `git status --short`, the named assets, and the issue's allowed file/output list. Preserve unrelated worktree changes. When the live issue conflicts with the current pipeline or repository contract, stop and resolve the specification instead of silently choosing one.

Done when the asset branch, registry entry, canvas, facing, alpha policy, palette vocabulary, and allowed changed files are known from repository sources rather than guessed.

## 2. Choose the source

Use source-driven generation for a new raster silhouette. For an icon that is a simple native-grid mask or a deterministic variant of an existing family, use the native/recolor workflow selected by `docs/art-style.md` and `docs/icon-gen.md`; skip image generation.

Generate one base silhouette for a family. Derive material, tier, element, or cooked-state variants deterministically when the branch guide says the silhouette is shared.

Done when every requested asset maps to either one new silhouette or one named deterministic source variant.

## 3. Generate an untouched raw

When generation is needed, invoke the available `$imagegen` skill and use its built-in path. Keep the selected branch guide's grid, key-background, and framing language verbatim. Set facing from the live issue and repository contract—player and Monster facing may differ—then use `--flip` only if the recovered generation came back mirrored.

Issue one generation call per distinct silhouette. Copy the resulting PNG directly into the branch inbox:

- Sprite: `scripts/art/sprite-gen-inbox/<name>.png`
- Icon: `scripts/art/icon-gen-inbox/<name>.png`

Keep this PNG as emitted: direct copy, original dimensions, no editor round-trip. The pipeline expects subtle within-cell RGB variation and normalizes it after logical-grid recovery. The inbox remains git-ignored.

Done when every generated silhouette has one untouched raw PNG at its expected inbox path and no inbox file appears in `git status`.

## 4. Recover the compact source

### Combat sprite

Ensure `scripts/art/sprites.mjs` contains the registry row before ingest. Canvas size is explicit visual scale—32, 48, or 64—not a Monster/Boss classification.

Run the complete non-writing pass first:

```bash
npm run art:ingest-sprite -- --name <name> --dry-run
```

Treat exact palette-scope failure as actionable output: set `materialRampNames` and `zoneNames` to the arrays printed by ingest, then repeat the dry run. Reach for `--crop`, `--tolerance`, `--pitch`, `--pitch-y`, or `--flip` only when the report identifies the corresponding crop, key, grid, or facing problem. Keep `sourceMaxColors` separate from shipped `maxColors`; tune either only from compact visual evidence. Use optional `interiorAlpha` only for a deliberately translucent final asset.

Once the dry run passes, run the same command without `--dry-run`. Ingest must write the compact source and Stage-2 preview without changing the raw PNG.

### Icon

Run the validating icon ingest described in `docs/icon-gen.md`:

```bash
npm run art:ingest -- --name <name>
```

Resolve only the failure reported by ingest. Register the accepted compact source and its exact palette scope in `scripts/art/icons.mjs`, following the existing family pattern.

Done when ingest passes, the compact source is committed-path material, registry scope is exact, and the generated preview exists.

## 5. Pass the 1× gate

Inspect the exact Stage-2 preview and then run `npm run art`. Judge the asset at native scale on the relevant 1× sheet, beside its peers and the golden master named by `docs/art-style.md`.

The 1× gate requires all of these:

- the intended subject is immediately recognizable;
- silhouette and defining feature survive compaction;
- facing, baseline, scale, and transparent holes are correct;
- adjacent parts separate by value and materials map to the intended ramps;
- the asset remains distinct from peers with similar outer shapes.

Ingest success is not passage through the gate. When the compact result fails, regenerate from the untouched workflow. State the compact failure in the retry prompt, attach the failed compact preview as the negative reference, and exaggerate only the lost feature. Keep a geometrically successful generation fixed when only its palette vocabulary failed.

Done when every requested asset passes the 1× gate; do not advance a merely technically valid asset.

## 6. Prove the build

Update `docs/assets.md` with original-art provenance/supersession as required by `AGENTS.md`, preserving historical third-party provenance. Generate the final assets with `npm run art`.

Run:

```bash
npm run typecheck
npm test
```

Run `npm run art` a second time and compare hashes of every affected generated PNG and contact sheet before/after that second run. They must be byte-identical. Inspect `git status --short` and the asset diff against the initial scope; the raw inbox and previews stay uncommitted, and no unrelated generated asset drifts.

For issue work, map every acceptance criterion to direct evidence: test/command output for mechanical claims and the named 1× sheet/preview for visual claims.

Done only when all intended assets are registered, the second build is byte-stable, checks pass, every criterion has evidence, and the changed-file set matches the declared scope.

## Handoff

Report:

- final prompt and image-generation mode for each new silhouette;
- raw inbox path, committed compact-source path, and shipped asset path;
- effective ingest overrides and palette-scope changes;
- 1× review result;
- typecheck, tests, and second-build determinism result;
- anything deliberately left outside scope.
