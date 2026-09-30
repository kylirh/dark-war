
## 2026-09-30 - Wake player on non-WAIT command during rest

**What was found:** Resting players in Dark War who issued a non-WAIT command had their command silently ignored while remaining in the rest state. This meant the accelerated `REST_TIME_SCALE` could leak into normal gameplay because the game did not interrupt the rest state for these commands, leading to unintuitive lock-ups.

**Action:** Modified `resolveCommand` in `src/engine/systems/simulation/commands.ts` to explicitly call `stopPlayerResting(state, player)` when a resting player issues a non-WAIT command.

**Prevention:** Always ensure that when a state like resting is intentionally aborted or interrupted by an action, the cleanup function (`stopPlayerResting`) is explicitly called before discarding the command to prevent speed modifiers from lingering incorrectly.
