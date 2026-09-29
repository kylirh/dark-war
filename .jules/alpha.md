## 2024-10-24 - Fix player resting interrupted by non-WAIT commands

**What was found:** The `resolveCommand` function in `src/engine/systems/simulation/commands.ts` had a bug where non-WAIT commands correctly aborted command execution for resting players, but failed to call `stopPlayerResting(state, player)`, causing the simulation to stay at a fast time scale (`REST_TIME_SCALE`) without resuming normal gameplay.

**Action:** Updated `resolveCommand` to explicitly call `stopPlayerResting(state, player)` when a resting player attempts a non-WAIT command, properly waking the player.

**Prevention:** Ensure that when a player action aborts a state (like resting), the cleanup function for that state is called, rather than silently returning.
