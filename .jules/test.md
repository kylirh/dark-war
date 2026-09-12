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

## 2026-09-09 - Ensure dead players cannot revive themselves

**What was found:** A dead player must not be able to medkit themselves back to life, and _two_ independent guards enforce that: the tick loop skips dead actors via `canActorAct` (`sim-helpers.ts`), and `resolveCommand` (`commands.ts`) drops dead players' commands on its own. Neither was covered.

**Action:** Added two tests to `src/engine/systems/simulation/use-item.test.ts`. One drives the normal `enqueueCommand` + `stepSimulationTick` path; the other calls `resolveCommand` directly through the existing `useImmediately` helper, bypassing `canActorAct` so the dispatcher's own guard is the only thing left to stop the heal.

**Rejected in review:** the first version of this entry claimed the tick-path test covered `resolveCommand`'s death check, and the pull request said the check had been deleted locally and the test seen to fail. That is wrong and should not be repeated. Deleting `if (player && player.hp <= 0) return;` leaves the tick-path test green, because `canActorAct` rejects the dead actor before `resolveCommand` is ever reached. Only the direct-resolve test actually fails, which is why both exist.

**Prevention:** When two redundant guards enforce the same rule, one test through the outer path proves nothing about the inner one — it stays green while the inner guard is deleted. Reach the inner guard directly, and confirm the claim by actually removing the line and watching the specific test fail. Note that `canActorAct`'s own player-death check remains uncovered: the full suite passes with it removed.

## 2026-09-12 - Offline/Online offline hole fall drops

**What was found:** In `tick.ts`, loose items resting on a hole fall through to the level below. This behaves differently offline versus online (where the items are just destroyed), but the `processHoleFalls` logic lacked behavioral test coverage to ensure this divergent behavior stays intact.

**Action:** Added targeted test cases to `src/engine/systems/simulation/tick.test.ts` verifying that items falling through holes in `offline` mode are correctly pushed into `state.itemsFellThrough`, while items in `online` mode are just destroyed without populating `state.itemsFellThrough`.

**Prevention:** Always cover logic that has deliberate offline/online divergence (like state updates only applying locally on offline mode) to ensure regressions do not bleed changes into online simulations.
