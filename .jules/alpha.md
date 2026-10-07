
## $(date +%Y-%m-%d) - Fix rest state leaking when a non-WAIT command is issued

**What was found:** If a player issues a non-WAIT command while resting, the command is ignored, but the resting state and accelerated time scale are not interrupted. This violates the health and rest contract where any wake command interrupts rest.

**Action:** Updated `resolveCommand` to explicitly call `stopPlayerResting(state, player)` before returning early when a resting player issues a non-WAIT command. Added a regression test to verify this behavior.

**Prevention:** Remember that when aborting a command from a resting player, the resting state must be explicitly stopped to prevent accelerated `REST_TIME_SCALE` from leaking into normal gameplay.
