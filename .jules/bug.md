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

## 2026-10-06 - Interrupt resting when non-WAIT commands are issued

**What was found:** When a resting player issues a non-WAIT command, the command is aborted (`resolveCommand` returns early) but the player's `resting` state is never interrupted. As a result, the accelerated `REST_TIME_SCALE` leaks into normal gameplay.

**Action:** `resolveCommand` in `src/engine/systems/simulation/commands.ts` now explicitly calls `stopPlayerResting(state, player)` before returning. Covered by updating the existing `ignores non-WAIT commands when resting` test in `commands.test.ts` to also verify that `player.resting` becomes `false`.

**Prevention:** Ensure that when a stateful action like resting is aborted or dismissed by user input, any associated time-dilation side effects are reliably cleaned up.
