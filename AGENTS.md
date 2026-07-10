# SideScape agent guide

This is the source of truth for every agent working on SideScape, regardless of
which tool or model is driving. Tool-specific files (for example `CLAUDE.md`)
layer on top of this document; when they add nothing on a topic, the rules here
apply. Put changes to shared guidance here, not in a tool-specific file, so the
guidance stays in one place for every agent.

SideScape is a taskbar-sized RuneScape-like incremental idle game in a slim
always-on-top window (320 × 640). It uses a Tauri v2 shell with a TypeScript
and Vite frontend. There is no game-engine dependency: rendering is plain
DOM/CSS. The Rust code in `src-tauri/` is an untouched scaffold; all game logic
lives in TypeScript.

## Read first

Before exploring or changing a domain area, read:

1. `CONTEXT.md` for the canonical domain vocabulary (Area, Monster, Drop Table,
   Tick, …).
2. The ADRs in `docs/adr/` that apply to that area.
3. `docs/design.md` when the v1 product behaviour is relevant.

Use the terms defined in `CONTEXT.md` in code, tests, issues, and discussion.
Do not replace explicitly avoided terms with synonyms. If a proposed change
conflicts with an ADR, call out the conflict rather than silently overriding
the decision.

## Architecture

The desktop UI is one transparent native Tauri window: the compact gameplay
widget and the floating management cards are opaque CSS cards on a glass shell,
never secondary windows. The shell picks a stable top/bottom anchor when cards
first open and remembers compact/card dimensions locally (not in a Snapshot /
save). macOS transparency requires Tauri's `macOSPrivateApi`; that is suitable
for personal distribution but makes this configuration unsuitable for Mac App
Store submission.

- `src/core/` is the headless game Engine: pure TypeScript with **no DOM
  access**. It owns game state and combat rules (combat Ticks, XP curve, drop
  rolls, save serialization), emits discrete events (`kill`, `drop`, `levelup`,
  `hp-change`) on a tiny event bus, and is unit tested.
- `src/data/` contains typed constant content arrays, such as Monsters, Items,
  and Areas (`monsters.ts`, `items.ts`, `areas.ts`). Adding content must not
  require changes to the Engine.
- `src/ui/` contains DOM renderers that subscribe to Engine events. Use CSS for
  visual effects such as damage splats and toasts.
- The UI shell owns time and calls the Engine once every 600 ms via
  `setInterval`. The Engine must not own a timer; tests pump Ticks synchronously
  using a seeded RNG.

For stateful Engine behaviour, test through its public interface:
`createEngine(content, rng, saved?)`, commands, `tick()`, `snapshot()`, and
events. Direct unit tests are appropriate for isolated math that has an
independent worked example, such as the XP curve or max-hit formula. Test UI
behaviour with DOM integration tests.

## Working conventions

- Invoke the test-driven workflow explicitly for every Engine change, then work
  test-first. Engine changes go through the Engine interface with fixture
  Content and a seeded RNG; pure math with an independent worked example may
  keep direct unit tests (ADR-0001). If the current runtime does not expose a
  `/tdd` skill, follow the equivalent red-green workflow at the same seams.
- Keep invalid Engine commands loud: they throw rather than silently doing
  nothing.
- Do not add DOM access to `src/core/` or move Engine rules into UI callers.
- Preserve intentional duplication documented by an ADR. In particular,
  `STYLE_SKILL` and `STYLE_BOOST` represent separate domain facts and must stay
  separate unless a new ADR supersedes ADR-0002.
- **Assets** are original art following `docs/art-style.md`, generated via
  `scripts/art` (`npm run art`); third-party assets are allowed only if CC0 with
  provenance recorded in `docs/assets.md`.

## Commands

- `npm run dev` — run the Vite frontend in a browser for fast UI iteration
  (Tauri APIs are unavailable).
- `npm run tauri dev` — run the desktop app; needs Rust and may take several
  minutes on its first build (cached afterwards). If needed, run
  `source ~/.cargo/env` so `cargo` is available.
- `npm test` — run Vitest once.
- `npm run test:watch` — run Vitest in watch mode.
- `npm run typecheck` — strict TypeScript check.
- `npm run build` — typecheck and bundle the frontend.

Node-only work does not require Rust. Before pushing, run `npm run typecheck`
and `npm test`.

## Git and issue workflow

- GitHub issues are the project tracker (`jsbellamy/sidescape`). External pull
  requests are not a triage surface.
- Use one branch per issue: `issue-<N>-<slug>`, based on `main`. Do not work
  directly on `main`.
- Finish with a pull request that includes `Closes #<N>` in its body.
- CI (typecheck and tests) must be green before merge.
- Before opening a pull request, turn every issue acceptance criterion into an
  explicit evidence row. Put the complete checklist in the PR body: identify
  each criterion, state whether it is met, and cite a test, code location,
  command result, or manual verification. Never mark a criterion met from a
  related test alone. A visual/native behavior needs an automated end-to-end
  assertion or a named manual Tauri check with the observed result. If any row
  lacks evidence, the issue is not ready to merge or close.
- Never bypass the pre-commit hook with `--no-verify`.
- Use `gh` from the repository; if it is not on `PATH`, use
  `/opt/homebrew/bin/gh`.
- For issue commands and label conventions, follow the agent docs below.

## Agent docs

Deeper, single-purpose guidance lives under `docs/agents/`:

- `docs/agents/issue-tracker.md` — how issues are filed and managed via `gh`.
- `docs/agents/triage-labels.md` — the canonical label vocabulary
  (`needs-triage`, `ready-for-agent`, …); role strings equal the label names.
- `docs/agents/domain.md` — how the single-context domain docs (`CONTEXT.md`
  plus `docs/adr/`) are maintained.

## Delegating work

These instructions are model-neutral. Do not require a particular provider,
model, or platform-specific effort setting to delegate work. When subagents are
available, choose a capable coding agent permitted by the current runtime, give
it a bounded task with clear acceptance criteria, and review its result. If
subagents are unavailable, complete the task directly. Keep delegated work
within the same architecture, testing, and verification requirements above.

The orchestrator independently owns the acceptance gate. Before approving a
merge, it must re-read the live issue, make its own criterion-by-criterion
checklist, inspect the diff and tests at the seams named by each criterion,
and run or obtain the required manual/native evidence. Green CI and a
scope-matching file list are necessary but never sufficient. Do not merge a
PR—and therefore do not allow its `Closes #<N>` reference to close the
issue—when any acceptance row is missing, contradicted, untested at the right
seam, or only claimed by the implementer.

A reusable issue-implementation subagent is defined in
`.agents/issue-implementer.md`. Tool-specific runtimes may provide their own
pinned variant (for example `.claude/agents/issue-implementer.md`); prefer the
variant native to the runtime you are in.
</content>
</invoke>
