
## 2026-10-02 - Interrupt resting on non-wait commands

**What was found:** Resting players who issued a non-WAIT command had their commands ignored in `resolveCommand` by returning early, but `stopPlayerResting(state, player)` was not called. This leaked the accelerated `REST_TIME_SCALE` into normal gameplay frames after the ignored command.

**Action:** Added a call to `stopPlayerResting(state, player)` in `resolveCommand` right before returning early when a resting player issues a non-WAIT command. Also added a regression test in `resting.test.ts`.

**Prevention:** When intercepting commands or preventing execution early based on entity state (like resting or dead), always ensure that state is properly updated and side-effects (like timescale acceleration) are undone before returning.
