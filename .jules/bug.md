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

## 2024-10-21 - Fix undefined priority sorting in commands

**What was found:** `sortCommandsDeterministically` used numerical subtraction (`b.priority - a.priority`) to sort commands, but `priority` is optional and could be `undefined`. Subtracting with `undefined` yields `NaN`, breaking the sort comparator contract and resulting in unpredictable tick resolution.

**Action:** Updated `sortCommandsDeterministically` in `src/engine/systems/simulation/tick.ts` to explicitly default `undefined` priorities to `0` (`a.priority ?? 0`), and added a test in `src/engine/systems/simulation/command-order.test.ts` to prevent regressions.

**Prevention:** When deterministically sorting simulation commands by priority, any `undefined` priority values must be explicitly defaulted to `0` to avoid returning `NaN` from numerical subtraction comparators.
