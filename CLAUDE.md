# SideScape — Claude Code

**`AGENTS.md` is the source of truth. Read it first.** It covers the domain,
architecture (`src/core` Engine / `src/data` content / `src/ui` renderers), the
test-first conventions, commands, and the git + issue workflow that apply to all
agents. This file only adds the Claude-Code-specific layer; everything not
restated here is governed by `AGENTS.md`.

## Skills

- **`/tdd`** — invoke explicitly for every Engine change, then work test-first
  at the Engine seams (`createEngine` → commands / `tick()` / `snapshot()` /
  events) with fixture Content and a seeded RNG. UI behaviour is verified with
  DOM integration tests. This is the concrete form of the test-first rule in
  `AGENTS.md`.

## Subagents

- Spawn implementation subagents as the **`issue-implementer`** agent type
  (`.claude/agents/issue-implementer.md`), pinned to **Sonnet at high effort**.
  Never override the model upward and never run it above high effort. It
  implements one GitHub issue end-to-end in an isolated worktree and opens a PR.
- The model-neutral definition of the same agent lives in
  `.agents/issue-implementer.md` for non-Claude runtimes; keep the two in sync.

## Toolchain notes

- `npm test` and `npm run typecheck` need only Node; `npm run tauri dev` also
  needs Rust (`source ~/.cargo/env` if `cargo` is missing).
- If `gh` is not on `PATH`, it is at `/opt/homebrew/bin/gh`.
</content>
