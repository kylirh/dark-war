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

## 2026-10-08 - Invalid defect report on resting interruption

**What was found:** A previous run believed that an aborted command (non-WAIT during rest) leaked the accelerated `REST_TIME_SCALE` into normal gameplay because `stopPlayerResting` was not called. This was incorrect: the time scale is derived on every frame/tick and intrinsically coupled to `player.resting`. The player remained resting, and the time scale was correctly accelerated for a resting player.

**Action:** Reverted the attempt to call `stopPlayerResting` on an aborted command, which was a pacing/design change masquerading as a bug fix, and closed the pull request without making changes.

**Prevention:** Do not try to fix resting interruption pacing by changing `commands.ts`. The simulation design intentionally ignores non-WAIT commands during rest. Read `.jules/bug.md` and check PR feedback carefully; verify that your "defect" is not actually working exactly as intended by the derived time scale architecture.
