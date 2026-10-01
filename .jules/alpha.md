
## 2026-10-01 - Interrupt rest on non-WAIT command

**What was found:** Resting players who issued a non-WAIT command had the command silently rejected, and their resting state was not interrupted. This caused the accelerated `REST_TIME_SCALE` to leak into normal gameplay.

**Action:** Modified `resolveCommand` in `src/engine/systems/simulation/commands.ts` to call `stopPlayerResting(state, player)` when a resting player issues a non-WAIT command, properly interrupting rest and restoring normal time scale. Added a regression test `test-interruption.test.ts`.

**Prevention:** When handling player commands, ensure that any command that breaks a continuous state (like resting) explicitly cleans up that state before resolving the command, to prevent associated time-scale or multiplier side effects from persisting.
