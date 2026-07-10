# SideScape

A taskbar-sized RuneScape-like incremental idle game in a slim always-on-top window (320×640). Tauri v2 shell + TypeScript + Vite frontend; no game engine — plain DOM/CSS rendering. The Rust side (`src-tauri/`) is untouched scaffold; all game logic lives in TypeScript.

Read `CONTEXT.md` for the domain language (Area, Monster, Drop Table, Tick, …) and use its terms in code, tests, and issues. The full v1 design is in `docs/design.md`.

## Commands

- `npm run tauri dev` — run the app (first run compiles the Rust shell; takes minutes, then cached)
- `npm run dev` — Vite only, in a browser (fast UI iteration; Tauri APIs unavailable)
- `npm test` — Vitest, single run (`npm run test:watch` to watch)
- `npm run build` — typecheck + bundle frontend

## Architecture

The desktop UI is one transparent native Tauri window: the compact gameplay widget and floating
management cards are opaque CSS cards on a glass shell, never secondary windows. The shell picks
a stable top/bottom anchor when cards first open and remembers compact/card dimensions locally
(not in a Snapshot/save). macOS transparency requires Tauri's `macOSPrivateApi`; that is suitable
for personal distribution but makes this configuration unsuitable for Mac App Store submission.

- `src/core/` — headless game engine: pure TS, **no DOM access**, unit-tested (combat ticks, XP curve, drop rolls, save serialization). Emits events (`kill`, `drop`, `levelup`, `hp-change`) on a tiny event bus.
- `src/data/` — content as typed const arrays (`monsters.ts`, `items.ts`, `areas.ts`). Adding content must never require engine changes.
- `src/ui/` — DOM renderers subscribed to core events. CSS animations for damage splats / toasts.
- Game loop: `setInterval` driving 600ms core Ticks.

## Working conventions

- **Test-first.** Every Engine change goes through /tdd at its interface (`createEngine` → tick/commands/snapshot/events) with fixture Content + seeded Rng; pure math with independent worked examples may keep direct unit tests (ADR-0001). UI behavior is verified by DOM integration tests.
- **Branch per issue**: `issue-<N>-<slug>` off `main`. Finish with a PR whose body includes `Closes #<N>`; CI (typecheck + tests) must be green before merge. Never bypass the pre-commit hook (`--no-verify` is not acceptable).
- **Run before pushing**: `npm run typecheck` and `npm test`.
- **Toolchain**: `npm test`/`typecheck` need only Node. `npm run tauri dev` also needs Rust (`source ~/.cargo/env` if `cargo` is missing). If `gh` isn't on PATH, it's at `/opt/homebrew/bin/gh`.
- **Subagents**: spawn implementation subagents as the `issue-implementer` agent type (pinned to Sonnet, effort ≤ high). Never run a subagent on Fable or above high effort.
- **Assets** are original art following `docs/art-style.md`, generated via `scripts/art` (`npm run art`); third-party assets are allowed only if CC0 with provenance recorded in `docs/assets.md`.

## Agent skills

### Issue tracker

Issues live on GitHub (`jsbellamy/sidescape`) via the `gh` CLI; external PRs are not a triage surface. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary — role strings equal the canonical names (`needs-triage`, `ready-for-agent`, …). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
