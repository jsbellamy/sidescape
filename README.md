# SideScape

A taskbar-sized, RuneScape-like incremental idle game. It lives in a slim, always-on-top window (320×640) you park at the edge of your screen — pick an Area and a Monster, and it auto-grinds combat while open, earning skill XP (Attack / Strength / Defence / Hitpoints, levels 1–99) and gear drops that improve your character.

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

A husky pre-commit hook runs Prettier (staged files), then `typecheck`, then the full test suite — commits are blocked if any fail. Don't bypass it with `--no-verify`. See `CLAUDE.md` for working conventions (test-first via the Engine interface, branch-per-issue, CI must be green to merge).

## Project layout

- `src/core/` — headless game Engine: combat ticks, XP curve, drop rolls, save serialization. Pure TS, no DOM, unit-tested. Caller-pumped `tick()` (see `docs/adr/0001-caller-pumped-deep-engine.md`).
- `src/data/` — content as typed const arrays (Areas, Monsters, Drop Tables, Equipment). Adding content never requires Engine changes.
- `src/ui/` — DOM renderers; `mountApp(engine, root, content)` builds the scene and subscribes to Engine events.
- `src/main.ts` — thin shell: loads the save, mounts the UI, owns the 600ms tick and autosave intervals, wires the close button.
- `src-tauri/` — Tauri v2 Rust shell and window config (untouched scaffold).
