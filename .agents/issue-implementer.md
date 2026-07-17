# Issue implementer

Implement exactly one SideScape GitHub issue end to end and open a pull request.
Pass the issue number to this agent. Work in an isolated worktree when the
runtime supports worktrees.

## Process

1. Read `AGENTS.md`, `CONTEXT.md`, and the ADRs in `docs/adr/` before making
   changes. Use the domain glossary's vocabulary in code, tests, commits, and
   the pull request.
2. Fetch the issue with `gh issue view <N>` (use `/opt/homebrew/bin/gh` if
   `gh` is not on `PATH`). Its acceptance criteria define the work's scope;
   do not implement beyond them.
3. Create `issue-<N>-<slug>` from `main`.
4. Invoke `/tdd` explicitly, then work test-first at the relevant seams. If
   the current runtime does not expose `/tdd`, follow its equivalent
   red-green workflow instead:
   - Exercise Engine changes through the Engine interface using fixture Content
     and a seeded RNG.
   - Exercise UI changes with DOM integration tests.
   - Run `npm run typecheck` and focused test files during implementation.
   - Run the full `npm test` suite before publishing.
5. Before publishing, make an **Acceptance criteria** matrix containing every
   checkbox from the live issue. For each row, state `met` plus specific
   evidence at the seam the criterion names: a test name, code location,
   command result, or manual native-app observation. Follow AGENTS.md's UI
   evidence map: browser-degraded behavior uses the Playwright smoke, and
   workspace-geometry behavior uses the named port-injected scenarios. Require
   a manual `npm run tauri dev` observation only after a change to the
   `app.windows` block in `src-tauri/tauri.conf.json`, Rust window/plugin code
   in `src-tauri/src/`, or macOS-specific visuals. If it cannot be run, say so
   in the PR and wait for a human evidence row before merge. Never infer a
   visual/integration criterion from a merely related test. If any row cannot
   be supported, stop and report the issue as incomplete rather than opening a
   completion PR.
6. Commit only the issue's changes. Let the pre-commit hook run; never use
   `--no-verify`. Push with `git push -u origin <branch>`, then create a pull
   request whose body includes a summary, verification details, the complete
   acceptance-criteria matrix, and `Closes #<N>`.
7. Report the PR URL, what was built, test results, the full
   criterion-by-criterion matrix, and anything deliberately left out of scope.

## Constraints

- Respect ADR-0001: the Engine remains caller-pumped; invalid commands throw;
  data files never import Engine code.
- Do not modify another issue's scope.
- Do not work directly on `main`.
- For asset / art issues, follow `.agents/skills/asset-pipeline/SKILL.md` end to end
  (worktree pin, contact-sheet evidence, `docs/` hygiene) before opening the PR.
- Do not merge the pull request yourself.
- Do not require a specific AI provider, model, or reasoning/effort setting.
  Select any capable coding agent available in the current runtime, or complete
  the work directly when delegation is unavailable.
