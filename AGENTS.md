# SideScape agent guide

SideScape is a taskbar-sized RuneScape-like incremental idle game in a slim
always-on-top window (320 × 640). It uses a Tauri v2 shell with a TypeScript
and Vite frontend. There is no game engine dependency: rendering is plain
DOM/CSS. The Rust code in `src-tauri/` is an untouched scaffold; game logic
lives in TypeScript.

## Read first

Before exploring or changing a domain area, read:

1. `CONTEXT.md` for the canonical domain vocabulary.
2. The ADRs in `docs/adr/` that apply to that area.
3. `docs/design.md` when the v1 product behaviour is relevant.

Use the terms defined in `CONTEXT.md` in code, tests, issues, and discussion.
Do not replace explicitly avoided terms with synonyms. If a proposed change
conflicts with an ADR, call out the conflict rather than silently overriding
the decision.

## Architecture

- `src/core/` is the headless game Engine: pure TypeScript with no DOM access.
  It owns game state and combat rules, emits discrete events, and is unit
  tested.
- `src/data/` contains typed constant content arrays, such as Monsters, Items,
  and Areas. Adding content must not require changes to the Engine.
- `src/ui/` contains DOM renderers that subscribe to Engine events. Use CSS for
  visual effects such as damage splats and toasts.
- The UI shell owns time and calls the Engine once every 600 ms. The Engine
  must not own a timer; tests pump Ticks synchronously using a seeded RNG.

For stateful Engine behaviour, test through its public interface:
`createEngine(content, rng, saved?)`, commands, `tick()`, `snapshot()`, and
events. Direct unit tests are appropriate for isolated math that has an
independent worked example, such as the XP curve or max-hit formula. Test UI
behaviour with DOM integration tests.

## Working conventions

- Invoke `/tdd` explicitly for every Engine change, then work test-first. If
  the current runtime does not expose that skill, use the equivalent red-green
  workflow at the same public seams.
- Keep invalid Engine commands loud: they throw rather than silently doing
  nothing.
- Do not add DOM access to `src/core/` or move Engine rules into UI callers.
- Preserve intentional duplication documented by an ADR. In particular,
  `STYLE_SKILL` and `STYLE_BOOST` represent separate domain facts and must stay
  separate unless a new ADR supersedes ADR-0002.
- Assets must be CC0 and their provenance must be recorded in `docs/assets.md`.

## Commands

- `npm run dev` — run the Vite frontend in a browser for fast UI iteration.
- `npm run tauri dev` — run the desktop app; needs Rust and may take several
  minutes on its first build. If needed, run `source ~/.cargo/env` so `cargo`
  is available.
- `npm test` — run Vitest once.
- `npm run test:watch` — run Vitest in watch mode.
- `npm run typecheck` — strict TypeScript check.
- `npm run build` — typecheck and bundle the frontend.

Node-only work does not require Rust. Before pushing, run `npm run typecheck`
and `npm test`.

## Git and issue workflow

- Use one branch per issue: `issue-<N>-<slug>`, based on `main`.
- Finish with a pull request that includes `Closes #<N>` in its body.
- CI (typecheck and tests) must be green before merge.
- Never bypass the pre-commit hook with `--no-verify`.
- GitHub issues are the project tracker. Use `gh` from the repository; if it
  is not on `PATH`, use `/opt/homebrew/bin/gh`.
- External pull requests are not a triage surface. For issue commands and
  label conventions, follow `docs/agents/issue-tracker.md` and
  `docs/agents/triage-labels.md`.

## Delegating work

These instructions are model-neutral. Do not require a particular provider,
model, or platform-specific effort setting to delegate work. When subagents
are available, choose a capable coding agent permitted by the current runtime,
give it a bounded task with clear acceptance criteria, and review its result.
If subagents are unavailable, complete the task directly. Keep delegated work
within the same architecture, testing, and verification requirements above.
