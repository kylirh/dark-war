
## 2026-10-09 - Interrupt resting before dropping command

**What was found:** When a resting player issued a non-WAIT command (such as moving), the `resolveCommand` pipeline dropped the command but failed to stop the resting state, effectively ignoring the input while keeping the game running at the accelerated `REST_TIME_SCALE`.

**Action:** Updated `resolveCommand` in `commands.ts` to explicitly call `stopPlayerResting(state, player)` before returning when a resting player issues a non-WAIT command. Added a regression test in `resting.test.ts` to assert that the command is aborted and the rest state is cleared.

**Prevention:** Future gameplay state machine interrupts that silently abort early should verify if they need to clean up the existing state first, rather than leaving the actor in a stale mode while dropping their input.
