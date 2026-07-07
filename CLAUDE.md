# SideScape

A taskbar-sized RuneScape-like incremental idle game in a slim always-on-top window (320×640). Tauri v2 shell + TypeScript + Vite frontend; no game engine — plain DOM/CSS rendering. The Rust side (`src-tauri/`) is untouched scaffold; all game logic lives in TypeScript.

Read `CONTEXT.md` for the domain language (Area, Monster, Drop Table, Tick, …) and use its terms in code, tests, and issues. The full v1 design is in `docs/design.md`.

## Commands

- `npm run tauri dev` — run the app (first run compiles the Rust shell; takes minutes, then cached)
- `npm run dev` — Vite only, in a browser (fast UI iteration; Tauri APIs unavailable)
- `npm test` — Vitest, single run (`npm run test:watch` to watch)
- `npm run build` — typecheck + bundle frontend

## Architecture

- `src/core/` — headless game engine: pure TS, **no DOM access**, unit-tested (combat ticks, XP curve, drop rolls, save serialization). Emits events (`kill`, `drop`, `levelup`, `hp-change`) on a tiny event bus.
- `src/data/` — content as typed const arrays (`monsters.ts`, `items.ts`, `areas.ts`). Adding content must never require engine changes.
- `src/ui/` — DOM renderers subscribed to core events. CSS animations for damage splats / toasts.
- Game loop: `setInterval` driving 600ms core Ticks.

## Agent skills

### Issue tracker

Issues live as local markdown under `.scratch/<feature>/` (solo project, no remote). See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary — role strings equal the canonical names (`needs-triage`, `ready-for-agent`, …). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
