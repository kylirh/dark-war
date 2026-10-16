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

## 2026-10-02 - Sort AI commands before truncating to preserve high-priority intent

**What was found:** `MAX_COMMANDS_PER_TICK` (1000) was enforced in `stepSimulationTick` by truncating the `aiCommands` array _before_ it was sorted by priority. This meant that if the limit was exceeded, the commands that survived were the first 1000 generated (based on map iteration order), rather than the 1000 most important ones. A low-priority ambient wander could push out a high-priority combat maneuver. Also, `sortCommandsDeterministically` didn't handle `undefined` priority, meaning commands without a priority might not sort correctly if mixed with those that had one.

**Action:** Moved `sortCommandsDeterministically(aiCommands)` to run _before_ truncation, so the array is sorted by priority (highest first) before being sliced to `MAX_COMMANDS_PER_TICK`. `sortCommandsDeterministically` now explicitly falls back to `0` for undefined priorities. Covered by adding a test to `tick.test.ts` to verify the lowest priority commands are dropped, and tests in `command-order.test.ts` to ensure undefined priority treats it as 0.

**Prevention:** When enforcing bounds or safety limits on a queue or buffer (such as dropping overflow), verify that the items being dropped are actually the least important ones. Truncation must generally follow sorting, not precede it.
