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

## 2026-10-03 - default undefined command priorities to 0

**What was found:** `sortCommandsDeterministically` would return `NaN` when sorting commands if a command's `priority` was `undefined` because it used `b.priority - a.priority`. A return value of `NaN` from an array sort comparator breaks the sorting behavior, causing non-deterministic resolution of simulation ticks.

**Action:** `sortCommandsDeterministically` in `src/engine/systems/simulation/tick.ts` now uses the nullish coalescing operator `?? 0` to provide a fallback priority of `0` when `undefined` is encountered, so numeric comparisons remain valid. Covered by a new test in `src/engine/systems/simulation/command-order.test.ts`.

**Prevention:** When dealing with potentially undefined values in deterministic sort functions, always provide explicit defaults (like 0) before performing arithmetic comparisons.
