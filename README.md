# SideScape

A taskbar-sized, RuneScape-like incremental idle game. It lives in a slim, always-on-top window (320×220) you park at the edge of your screen — pick an Area and a Monster, and it auto-grinds combat while open, earning skill XP (11 skills, from Attack to Herblore, levels 1–99) and gear drops that improve your character.

Built with Tauri v2 (Rust shell) + TypeScript + Vite, with plain DOM/CSS rendering — no game engine. All game logic is headless TypeScript in `src/core/`. See `docs/design.md` for the full v1 design and `CONTEXT.md` for the domain glossary.

## Prerequisites

- **Node.js 26+** (matches CI). Includes `npm`.
- **Rust** — only needed to run the desktop app (`npm run tauri dev`). Install via [rustup](https://rustup.rs/). If `cargo` isn't on your PATH, run `source ~/.cargo/env`.
- Node-only tasks (`dev`, `test`, `typecheck`, `build`) do **not** need Rust.

## Install

```bash
npm install
```

## Running the game

Two ways to run it:

### Desktop app (the real thing)

```bash
npm run tauri dev
```

Launches the always-on-top Tauri window. **The first run compiles the Rust shell and takes several minutes**; after that it's cached and starts quickly. The window is frameless — drag it by its header to park it at a screen edge; the × button closes it. Progress autosaves to local storage every 10s and on close.

### Browser (fast UI iteration)

```bash
npm run dev
```

Runs the Vite frontend in your browser at the printed localhost URL. Much faster to reload, but Tauri-specific APIs (native window controls) are unavailable — use this for working on UI, the desktop command for the full experience.

## Development

```bash
npm test           # run the Vitest suite once
npm run test:watch # watch mode
npm run typecheck  # tsc --noEmit (strict flags)
npm run build      # typecheck + bundle the frontend
```

A husky pre-commit hook runs Prettier (staged files), then `typecheck`, then the full test suite — commits are blocked if any fail. Don't bypass it with `--no-verify`. See `AGENTS.md` for working conventions (test-first via the Engine interface, branch-per-issue, CI must be green to merge).

## Get the app without building from source

If you just want to run SideScape on macOS without installing Rust, `.github/workflows/release.yml` builds a packaged `.app`/`.dmg` in CI and attaches it to a draft GitHub Release.

### Cutting a release

The workflow only runs on `workflow_dispatch` — there is no tag-push trigger. Run it manually:

- GitHub UI: **Actions** tab → **Release** → **Run workflow**, or
- CLI: `gh workflow run release.yml`

This produces a **draft** GitHub Release with the `.app`/`.dmg` attached, not a published one. Open the repo's Releases page and click **Publish release** to make it visible (or leave it as a draft for yourself).

Before running the workflow, bump the version by hand in all three of these files — nothing keeps them in sync automatically:

- `package.json` (`version` field)
- `src-tauri/tauri.conf.json` (`version` field)
- `src-tauri/Cargo.toml` (`version` field)

The release's tag and name are generated from `src-tauri/tauri.conf.json`'s version specifically (`tagName: app-v__VERSION__`, `releaseName: "SideScape v__VERSION__"`), so that file's version in particular must be correct for the release to be named right.

### Installing

Download the `.dmg` from the release, open it, and drag `sidescape.app` to `Applications` (or run the `.app` directly from wherever it was downloaded). Note the bundle is named `sidescape.app` (matching `productName` in `src-tauri/tauri.conf.json`), even though the app window itself is titled "SideScape".

### First launch: Gatekeeper warning

macOS's Gatekeeper will block the first launch, reporting that `sidescape.app` is from an unidentified developer, because this build is intentionally unsigned — per `AGENTS.md`, the transparent-window `macOSPrivateApi` setup this app relies on is "suitable for personal distribution" rather than notarized App Store distribution. To bypass it (only needed once per machine): right-click (Control-click) `sidescape.app` → **Open** → confirm **Open** in the dialog.

## Project layout

- `src/core/` — headless game Engine: combat ticks, XP curve, drop rolls, save serialization. Pure TS, no DOM, unit-tested. Caller-pumped `tick()` (see `docs/adr/0001-caller-pumped-deep-engine.md`).
- `src/data/` — content as typed const arrays (Areas, Monsters, Drop Tables, Equipment). Adding content never requires Engine changes.
- `src/ui/` — DOM renderers; `mountApp(engine, root, content)` builds the scene and subscribes to Engine events.
- `src/main.ts` — thin shell: loads the save, mounts the UI, owns the 600ms tick and autosave intervals, wires the close button.
- `src-tauri/` — Tauri v2 Rust shell and window config (untouched scaffold).
