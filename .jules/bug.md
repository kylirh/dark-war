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

## 2026-10-26 - Default undefined command priorities to 0 to prevent NaN during sort

**What was found:** `sortCommandsDeterministically` in `src/engine/systems/simulation/tick.ts` used `a.priority - b.priority`. When `priority` was `undefined`, this subtraction resulted in `NaN`. This caused the sorting algorithm to fail, returning inconsistent or unexpected command execution orders.

**Action:** Modified `sortCommandsDeterministically` to fall back to `0` when `priority` is undefined (`a.priority ?? 0`). Added a test case in `src/engine/systems/simulation/command-order.test.ts` to prove that undefined priorities sort deterministically as 0.

**Prevention:** When deterministically sorting simulation commands by priority, any `undefined` priority values must be explicitly defaulted to `0` to avoid returning `NaN` from numerical subtraction comparators.
