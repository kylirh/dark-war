## 2024-05-18 - Rest artifacting from queueCommand offline execution

**What was found:** According to `docs/HEALTH-AND-REST.md`, resting should be interrupted by "any damage or wake command". The document specifies that "It is entered through WAIT", and `resolveWaitCommand` properly toggles it off. It does not state that _any_ command wakes the player. However, an offline visual artifact existed where pressing action keys while resting stopped the fast-forward effect without exiting the rest state, because `queueCommand` unconditionally reset `state.sim.targetTimeScale = REAL_TIME_SCALE` before checking if the command would actually be executed by `resolveCommand` (which drops non-WAIT commands silently).

**Action:** Adjusted offline queueing in `src/client/main.ts` so that it doesn't force the simulation time back to real time if the player is resting.

**Prevention:** When evaluating if commands should drop, read the whole context of the related design documents rather than pulling out isolated words. Trust the established pattern of functions like `resolveCommand` (which drops inputs silently for dialogue states as well) unless it violates the written contract. State changes tied to input should be synchronized with the actual execution of those inputs, rather than unconditionally in the input queue handler.
