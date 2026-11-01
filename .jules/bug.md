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

## 2026-10-03 - Stop monster movement immediately on lethal damage

**What was found:** When a monster received lethal damage, its velocity was not immediately zeroed out. The zeroing only occurred after the `EventType.DEATH` event resolved. However, if the event queue exceeded `MAX_EVENTS_PER_TICK`, the `EventType.DEATH` event would be deferred to the next tick, leaving the dead monster to keep sliding (its velocity remaining non-zero) for an extra tick despite having 0 HP.

**Action:** Modified `processDamageEvent` in `src/engine/systems/simulation/events.ts` to explicitly zero out `monster.velocityX` and `monster.velocityY` as soon as its HP reaches 0, exactly mirroring how the player is handled. Covered by a new test in `death-transition.test.ts`.

**Prevention:** Critical state invalidations upon entity death, such as halting movement and cancelling pending flags, must occur synchronously when HP drops to 0, rather than relying on deferred resolution of `PLAYER_DEATH` or `DEATH` events which might get pushed to subsequent ticks.
