## 2026-10-02 - Cancel level transitions upon player death

**What was found:** `shouldDescend` / `shouldAscend` are set while commands
resolve in step 1 of `stepSimulationTick`, but the host consumes them only after
the tick ends (`src/client/main.ts:1616-1634`). `processEventQueue` runs in
between (step 4), so any damage event that lands in the same tick — a monster's
melee, an explosive detonating, a hole fall — could kill the player after the
transition was already committed. The host then ran `Game.descend()` /
`Game.ascend()` for a dead player.

**Action:** `processPlayerDeathEvent` in
`src/engine/systems/simulation/events.ts` now clears `shouldDescend`,
`shouldAscend`, `descendTarget`, and `pendingPortalId`. Covered by
`death-transition.test.ts` for the descend, ascend, and lethal-hole-fall paths;
each of the four cleared fields fails a test when dropped individually.

**Scope note:** the shared flags are an offline-only mechanism. The multiplayer
server clears both after every tick (`server/multiplayer-server.ts:880-883`)
because per-player migration is handled by the room, so this cannot cancel
another player's transition.

**Prevention:** Always consider the state invalidation effects of actor death on
pending actions or delayed transitions. Any state flags set by a command that
are evaluated later in the tick (or after the tick) must be aborted if the actor
dies in the interim.

## 2026-10-06 - Interrupt resting on non-wait player command

**What was found:** When a player issued a non-WAIT command (like moving or firing) while resting, the `resolveCommand` pipeline returned early and aborted the command, but left the player in a `resting` state indefinitely. This caused the time scale acceleration to remain active without the player realizing they were still 'resting' but ignoring their inputs.

**Action:** `resolveCommand` now explicitly calls `stopPlayerResting(state, player)` before returning early if a non-WAIT command is processed for a resting player. Added a test in `resting.test.ts` to cover this behavior.

**Prevention:** Whenever state-interrupting rules (such as resting, sleeping, or status effects) require ignoring a command input, ensure that any side-effects of breaking that state (like canceling the rest time-scale or waking up) are applied before returning early and dropping the command.
