## 2024-11-20 - Fix resting interruption

**What was found:** When a player issued a non-WAIT command (like MOVE) while resting, the game properly aborted the command, but left the player in a state where the `REST_TIME_SCALE` (an accelerated time scale used to rapidly process rest) remained active, leaking into normal gameplay.

**Action:** Modified `resolveCommand` in `src/engine/systems/simulation/commands.ts`. If a resting player issues a non-WAIT command, we explicitly call `stopPlayerResting(state, player)` before returning. This effectively breaks the player out of rest and returns the `sim.timeScale` and `sim.targetTimeScale` back to normal (0.85). Also added a regression test in `src/engine/systems/simulation/resting.test.ts`.

**Prevention:** Make sure `stopPlayerResting` is explicitly called when aborting commands due to resting interruption to avoid timeframe scale leaks.
