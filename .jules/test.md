## 2026-09-03 - Explosion recursion prevention test

**What was found:** The `!data.fromExplosion` guard on flutterbang death explosions in `processDeathEvent` lacked test coverage, leaving it vulnerable to regressions where an explosive chain reaction could infinitely recurse.

**Action:** Added a test in `monster-abilities.test.ts` verifying that a flutterbang dying with `fromExplosion: true` does not emit an explosion effect.

**Prevention:** Future refactors of `events.ts` and death handling logic must preserve the `fromExplosion` check to maintain explosive cascade stability.

## 2026-09-04 - Explosion damage bypasses armor

**What was found:** The logic that prevents armor from reducing damage caused by an explosion (`!data.fromExplosion` in `processDamageEvent`) lacked direct test coverage.

**Action:** Added a unit test to `src/engine/systems/simulation/pickup.test.ts` verifying that when a player wearing armor is hit by explosion damage (`fromExplosion: true`), the full damage is applied without armor reduction.

**Prevention:** Future refactors of `events.ts` and damage-handling logic must preserve the `!data.fromExplosion` check when mitigating damage via armor.

## 2026-09-05 - processEventQueue infinite loop prevention

**What was found:** The `processEventQueue` function limits event processing per tick by halting when it reaches `MAX_EVENTS_PER_TICK` (1000) to prevent a runaway cascade. A gap existed in the test suite where this specific limit and its mechanism for preserving unprocessed events for the next tick were not tested.

**Action:** Added a focused test in `src/engine/systems/simulation/events.test.ts` to `processEventQueue`. It fills the event queue beyond the limit, calls `processEventQueue`, and verifies that the execution halts and the remaining unprocessed events are correctly retained (the processed ones are spliced away).

**Prevention:** Always cover the "what happens when it breaks or stops" paths for protective limitations.
