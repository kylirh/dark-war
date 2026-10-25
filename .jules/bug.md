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

## 2024-10-25 - Fix undefined priority sorting regression in tick resolution

**What was found:** In `src/engine/systems/simulation/tick.ts`, `sortCommandsDeterministically` directly subtracts `a.priority` and `b.priority`. If a command has an undefined priority (as is common when properties are optional or partially initialized in some code paths), `b.priority - a.priority` results in `NaN`, which breaks deterministic command sorting and causes unexpected command resolution orders.

**Action:** Modified `sortCommandsDeterministically` to explicitly default `undefined` priorities to `0` (`a.priority ?? 0` and `b.priority ?? 0`) before comparison, ensuring consistent numeric sorting. Covered this with a test in `command-order.test.ts`.

**Prevention:** When sorting deterministically using numeric subtraction, always explicitly provide a fallback (like `0`) for potentially `undefined` numeric values to avoid `NaN` corrupting the sort order.
