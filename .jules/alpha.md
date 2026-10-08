## 2024-10-08 - Interrupt rest immediately on non-wait command

**What was found:** In `resolveCommand`, when a resting player issues a non-WAIT command, the code immediately returned (aborting the command) but failed to call `stopPlayerResting(state, player)`. This allowed the accelerated rest time scale to continue running until another system noticed the command, leaking the faster tick rate into normal gameplay frames.

**Action:** Explicitly called `stopPlayerResting(state, player)` before returning from the non-WAIT command check in `resolveCommand`. Updated `commands.test.ts` to assert that the player is no longer resting after issuing an interrupting command.

**Prevention:** When breaking out of a long-running time-scaled state like resting, the teardown (like `stopPlayerResting`) must be explicitly called before aborting the current execution path to ensure normal simulation timing is cleanly restored.
