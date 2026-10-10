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

## 2026-10-10 - Interrupted resting players stay unresponsive

**What was found:** Resting players who issued a non-WAIT command had the command correctly blocked (via an early `return` in `resolveCommand`), but the game failed to interrupt their rest state. This left them perpetually asleep and ignoring input while the simulation continued at an accelerated `REST_TIME_SCALE`.

**Action:** Updated `resolveCommand` in `src/engine/systems/simulation/commands.ts`. Instead of a silent early return when a resting player issues a non-WAIT command, it now explicitly calls `stopPlayerResting(state, player)` before returning. This cancels the rest state, resets the simulation timescale, and requires the player to re-issue the command, preventing accidental actions. Added test coverage in `src/engine/systems/simulation/resting.test.ts`.

**Prevention:** When canceling or aborting player actions due to an ongoing state (like resting), always evaluate whether that state needs to be cleared or transitioned out of, rather than silently discarding the input.
