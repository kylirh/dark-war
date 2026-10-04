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

## 2026-10-02 - Interrupt resting on non-WAIT commands

**What was found:** If a player was resting and issued a non-WAIT command, the simulation loop in `resolveCommand` simply ignored the command by returning early (`if (player?.resting && cmd.type !== CommandType.WAIT) return;`). This left the player resting, with accelerated time scale, while dropping inputs silently rather than waking the player up and executing the requested action.

**Action:** Modified `resolveCommand` to explicitly call `stopPlayerResting(state, player)` before processing non-WAIT commands for resting players. Added integration test in `resting.test.ts` and unit test in `commands.test.ts` to ensure rest is broken and the non-WAIT command executes correctly.

**Prevention:** When evaluating conditions that block command execution (like resting or stun states), consider if the correct behavior is to silently ignore the command, or to actively break the blocking state and then handle the command.
