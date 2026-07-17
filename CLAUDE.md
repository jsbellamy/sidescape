# SideScape — Claude Code

**`AGENTS.md` is the source of truth. Read it first.** It covers the domain,
architecture (`src/core` Engine / `src/data` content / `src/ui` renderers), the
test-first conventions, commands, and the git + issue workflow that apply to all
agents. This file only adds the Claude-Code-specific layer; everything not
restated here is governed by `AGENTS.md`.

**When you change shared guidance (domain, architecture, conventions, commands,
workflow), edit `AGENTS.md`, not this file.** Keep `CLAUDE.md` limited to
Claude-Code specifics (skills, subagent types, Claude-only toolchain notes).

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
- The process lives in `.agents/issue-implementer.md`; the `.claude` variant
  contributes only the frontmatter pins and Claude-runtime notes.

## Toolchain notes

- `npm test` and `npm run typecheck` need only Node; `npm run tauri dev` also
  needs Rust (`source ~/.cargo/env` if `cargo` is missing).
- If `gh` is not on `PATH`, it is at `/opt/homebrew/bin/gh`.
</content>
