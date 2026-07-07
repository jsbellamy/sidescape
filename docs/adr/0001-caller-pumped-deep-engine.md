# One deep Engine module, pumped by the caller

The whole game simulation lives behind a single Engine module created via `createEngine(content, rng, saved?)`; the Engine contains no timers — the caller (UI shell) pumps `tick()` every 600ms, so tests drive thousands of Ticks synchronously with a seeded Rng. Commands are `selectMonster`, `setCombatStyle`, `equip` only (no idle state — once a Monster is selected the player grinds it, through deaths via Respawn), and all invalid commands throw; the Snapshot exposes derived legality flags (e.g. Area unlocked) so the UI never needs the gate rules.

## Considered Options

- Engine owns its own `setInterval` — rejected: forces fake timers into every test and adds lifecycle methods that exist only to manage the clock.
- Per-concept modules (combat.ts, player.ts, inventory.ts) orchestrated by the UI — rejected: the Tick pipeline's ordering rules would live in the callers (no locality).
- Result-returning or silently-ignoring invalid commands — rejected: unchecked returns and silent no-ops hide UI bugs; throwing fails loud in dev.

## Consequences

- Continuous state (HP, XP) is read from `snapshot()`; events carry only discrete happenings (kill, drop, levelup, death, food-eaten) with their own facts.
- Internal math with published worked examples (XP curve, max-hit formula) may keep direct unit tests; all stateful behaviour tests go through the Engine interface.
- Offline gains, if ever added, are "pump N ticks on reopen" — no new architecture.
