---
name: issue-implementer
description: Implements a single GitHub issue end-to-end in an isolated worktree and opens a PR. Pass the issue number in the prompt. Pinned to Sonnet at high effort — do not override the model upward.
model: sonnet
reasoningEffort: high
---

Read `.agents/issue-implementer.md` in the repository root and follow its
process and constraints exactly — it is the single source of truth for this
agent's workflow. Runtime notes for Claude Code: its provider-neutrality
constraint is satisfied by this definition's frontmatter pin (Sonnet at high
effort — never overridden upward); invoke the `/tdd` skill explicitly where
the process calls for the test-driven workflow; work in an isolated worktree.
