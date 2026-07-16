# Two separate Combat Style → Skill maps, kept apart on purpose

`STYLE_SKILL` in `engine.ts` (which Skill a Combat Style trains) and `STYLE_BOOST` in `combat.ts` (which Skill gets the +3 effective-level boost) are byte-identical today — both map `accurate → attack`, `aggressive → strength`, `defensive → defence`. They are kept as two maps deliberately, not merged, because they encode two independent facts that are only incidentally equal: _what a style trains_ and _what a style makes you better at right now_. A future Combat Style could train one Skill while boosting another; merging now would couple the two and make that change a refactor instead of a one-line edit.

## Considered Options

- Merge into one shared `Record<CombatStyle, SkillName>` — rejected: collapses two independent domain facts into one because they currently agree; a later divergence would then have to re-separate them.
- Keep two maps, each owned by its consumer — chosen: XP routing lives with the XP code, the accuracy/damage boost lives with the combat math; each is free to change alone.

## Consequences

- An architecture review will see two identical maps and may flag the duplication. This ADR is the answer: the duplication is intentional, so leave the maps separate.
- **Lifecycle**: this ADR is not deleted once read — it is a standing record. If, after the combat system expands and the two maps still never diverge, a future review decides the coupling is safe, it should merge them under a **new** ADR that marks this one _superseded_, preserving the history of why they were split. Reversal is by supersession, never by removal.

## Status (2026-07-16, issue #339)

The two maps remain separate and independently owned, but they are **no longer byte-identical**: XP routing in `engine.ts` (`STYLE_SKILL` / `awardCombatXp`) and boost resolution in `combat.ts` (`styleBoostSkill`) are both intentionally **mode-aware** — melee keeps Accurate/Aggressive/Defensive; ranged and magic use Accurate/Rapid/Defensive with distinct XP tables and boost targets. The core ADR decision (do not merge routing and boosts into one map) is unchanged; only the present-tense "byte-identical today" observation is superseded by this note, not by deleting ADR-0002.
