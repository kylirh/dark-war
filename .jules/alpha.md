
## 2024-10-05 - Interrupt rest on non-wait commands

**What was found:** Resting state was not fully cancelled when a player issues a non-WAIT command, leaking the accelerated rest frame scale into the next command execution.

**Action:** Explicitly called `stopPlayerResting(state, player)` in `resolveCommand` for resting players before returning on non-WAIT commands. Added a test ensuring resting scale is properly reset on movement commands.

**Prevention:** When handling multi-tick state effects that adjust the simulation time scale, ensure the cancellation path covers both explicit interrupts (damage) and implicit interrupts (player taking action).
