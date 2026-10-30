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

## 2023-11-20 - Fix off-by-one error in processEventQueue MAX_EVENTS_PER_TICK guard

**What was found:** The loop condition in `processEventQueue` (`src/engine/systems/simulation/events.ts`) was written as `if (processed++ > MAX_EVENTS_PER_TICK)`. The post-increment operator evaluates before incrementing, meaning when `processed` was exactly 1000 (`MAX_EVENTS_PER_TICK`), the condition `1000 > 1000` evaluated to false. The break did not trigger, and the event was processed, allowing 1001 events through instead of 1000. This caused tests simulating exactly enough events to push a `PLAYER_DEATH` event into the next tick's deferred queue to actually process the event in the current tick, breaking expectations.

**Action:** Changed `if (processed++ > MAX_EVENTS_PER_TICK)` to `if (processed++ >= MAX_EVENTS_PER_TICK)` in `src/engine/systems/simulation/events.ts`. This ensures exactly 1000 events are processed before breaking. Updated `events.test.ts` and `death-transition.test.ts` to align with the corrected 1000-event limit.

**Prevention:** Be cautious with post-increment operators in bounds checks. When `++` is used after a variable in a comparison, the comparison uses the value before the increment. `var++ > MAX` allows `MAX + 1` iterations.
