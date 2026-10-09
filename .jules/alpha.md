
## 2024-11-20 - Fix rest interruption leak

**What was found:** Resting players issuing a non-WAIT command had the command ignored, but their rest state was not explicitly interrupted via `stopPlayerResting`, which violates the contract that non-WAIT commands should cancel rest and require the player to input the command again.

**Action:** Added `stopPlayerResting(state, player)` before returning early when a resting player issues a non-WAIT command in `resolveCommand`. Added a regression test to `resting.test.ts`.

**Prevention:** Ensure that any early-return guard clauses that skip command execution during states like resting properly resolve the cleanup of that state before aborting.
