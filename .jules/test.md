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

## 2026-09-06 - simulateTick command processing limit

**What was found:** The logic that truncates generated AI commands to `MAX_COMMANDS_PER_TICK` to prevent a massive command processing cascade and potential server hang had no test coverage.

**Action:** Added a focused unit test in `src/engine/systems/simulation/tick.test.ts` to mock the AI generation, generate too many commands, and verify that `stepSimulationTick` truncates the command array to the correct limit.

**Prevention:** Always add tests to ensure safety boundaries (e.g. `MAX_COMMANDS_PER_TICK` or `MAX_EVENTS_PER_TICK`) are respected and not unintentionally removed.

## 2026-09-07 - Ensure dead players cannot revive themselves

**What was found:** The `resolveCommand` function explicitly short-circuits commands from dead players, protecting against scenarios where a dead actor could use an item (like a medkit) to revive themselves or interact with the world. However, this critical death check was uncovered by tests. `canActorAct` also holds an uncovered death check.

**Action:** Added a regression test to `src/engine/systems/simulation/use-item.test.ts` asserting that a dead player attempting to use a medkit does not heal and does not consume the item. Included a direct resolution test that bypasses `canActorAct` (via `useImmediately`) to directly prove `resolveCommand` catches the behavior if `canActorAct` is altered or bypassed elsewhere.

**Prevention:** Ensure global pre-conditions in central dispatcher methods (like `resolveCommand` or `tick`) have regression coverage, as they protect downstream handlers that deliberately rely on them to skip redundant state checks. Future runs should address `canActorAct`'s uncovered death check.
