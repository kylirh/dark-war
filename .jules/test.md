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

## 2026-09-12 - Offline/online divergence in item hole falls

**What was found:** In `tick.ts`, loose items resting on a hole fall through to the level below. This behaves differently offline versus online (where the items are just destroyed), but the `processHoleFalls` logic lacked behavioral test coverage to ensure this divergent behavior stays intact.

**Action:** Added targeted test cases to `src/engine/systems/simulation/tick.test.ts` verifying that items falling through holes in `offline` mode are correctly pushed into `state.itemsFellThrough`, while items in `online` mode are just destroyed without populating `state.itemsFellThrough`.

**Verified, not assumed:** the decision really was uncovered — on `main`, forcing `const offline = true;` leaves all 818 tests green. With the new tests, forcing it to `true` fails only the online case and forcing it to `false` fails only the offline case, so each test binds to the branch it names.

**Rejected in review:** the online test originally overwrote `state.multiplayer = { mode: "online" } as any` after constructing `new Game({ mode: "online" })`. That was redundant — the constructor already builds `state.multiplayer.mode` from its option — and it made the test pass even if the constructor stopped honouring the mode. Removed; the test now drives the branch through the constructor alone.

**Prevention:** Always cover logic that has deliberate offline/online divergence (like state updates only applying locally on offline mode) to ensure regressions do not bleed changes into online simulations. Set up mode through the public constructor rather than assigning over the state it produces.

## 2026-09-16 - Add test for magnetic pickup item event emission

**What was found:** The `processMagneticPickup` logic in `src/engine/systems/simulation/tick.ts` lacked a behavioral test ensuring that a `PICKUP_ITEM` event is emitted correctly when an item moves within the collection radius.

**Action:** Added a dedicated behavioral test for `processMagneticPickup` in `src/engine/systems/simulation/tick.test.ts`. The test verifies that when a player moves close to an item within `MAGNET_COLLECT_RADIUS`, the item is processed and collected correctly without being permanently destroyed, pushing the right `PICKUP_ITEM` event to the `eventQueue` which resolves during the tick processing.

**Prevention:** Ensure that engine events, especially logic that couples entity interactions (like item collection based on bounding radii) are thoroughly tested so future behavioral changes do not inadvertently stop events from firing.

## 2026-09-17 - Add coverage for powercell pickup bypass

**What was found:** `resolvePickupCommand` contains an explicit bypass for powercells, allowing them to be picked up even when normal inventory checks would reject them (e.g., when the inventory is full). This decision wasn't covered by tests.

**Action:** Added `it("bypasses a full inventory when picking up a powercell", ...)` to `src/engine/systems/simulation/pickup.test.ts`.

**Prevention:** Future changes to inventory logic or item types should ensure that utility/stackable bypasses are tested explicitly to avoid regressions where items silently fail to pick up.

## 2026-09-17 - Update powercell pickup bypass context

**What was found:** Testing `resolvePickupCommand` directly requires careful spatial positioning because `processMagneticPickup` collects anything within `MAGNET_COLLECT_RADIUS` (20px) before the command can even evaluate `canAddToInventory`.

**Action:** Confirmed that the `PICKUP_RADIUS` for the command is 24px, leaving a small 20–24px ring where the command handles the pickup. Spawning items at a 22px offset ensures only `resolvePickupCommand` evaluates the item.

**Prevention:** Always use mutation testing (temporarily breaking the condition you're protecting) to prove your test exercises the intended code path. Avoid overlapping interaction radii masking test behavior.

## 2026-09-18 - Vending machine exact coin deduction

**What was found:** The logic that handles buying an item from a vending machine contains a branch `if (left <= 0)` where `left` is `coins - VENDING_COST`. This branch is responsible for deleting the coin entry from the player's item counts and inventory if exactly `VENDING_COST` coins are spent. This edge case of having exactly enough coins was not covered by any existing test, making it vulnerable to regressions where exact spends might leave a 0-count item in the inventory, causing UI or logic issues.

**Action:** Added a unit test to `src/engine/systems/simulation/panic-vending.test.ts` that provides the player with exactly 5 coins, initiates a vending machine interaction, and verifies that the `ItemType.COIN` entry is completely removed (`undefined` in `itemCounts` and missing in `inventorySlots`).

**Prevention:** Always verify boundary edge cases for numeric resource deductions (e.g., spending the exact amount of money you have) to ensure resource pools correctly empty or clear instead of dangling at 0 or negative values.

## 2026-09-19 - Add test for monster `selfHeals` ability

**What was found:** The `selfHeals` monster ability logic in `processMonsterAbilities` (which regenerates 1 HP every 20 ticks and caps at `hpMax`) was not covered by any behavioral test. This left it vulnerable to regressions where the healing interval could be accidentally changed or the `hpMax` cap omitted, causing monsters to not heal or heal infinitely.

**Action:** Added a focused test in `src/engine/systems/simulation/monster-abilities.test.ts` to verify that a monster with the `selfHeals` flag correctly heals 1 HP every 20 ticks and respects its `hpMax` limit.

**Prevention:** Ensure that passive creature abilities tied to specific ticks or bounds are covered by focused tests to prevent regressions.

## 2026-09-20 - Exact coin deduction during Moppet theft

**What was found:** The branch `if (left <= 0)` in `events.ts:stealFromPlayer()` for money theft clears the player's inventory slot when a moppet steals all their coins. This branch lacked test coverage. The existing test for moppets stealing coins seeded the player with 10 coins, which means the moppet's theft (1-5 coins) always leaves some behind, failing to reach the exact deduction path.

**Action:** Added a test in `src/engine/systems/simulation/combat-abilities.test.ts` where the player has exactly 1 coin (guaranteed to be fully stolen by the moppet) and verified that both `player.itemCounts[ItemType.COIN]` is undefined and the inventory slot `player.inventorySlots[0].type` is cleared to `null`.

**Prevention:** When testing resource subtraction or theft logic, always verify boundary edge cases for numeric resource deductions (e.g., stealing the exact amount of resources the player has) to ensure resource pools correctly empty or clear instead of dangling at 0 or negative values. Ensure tests verify both the flat count removal and the inventory slot clearance.

## 2026-09-24 - Transition command missing portal behavior

**What was found:** The `getTransitionPortal` helper shared by `resolveDescendCommand` and `resolveAscendCommand` lacked a behavioral test for what happens when a player attempts to transition without standing on a valid portal (stairs, ladder, etc). This left the alert message ("No stairs here.") and early return preventing transition unprotected.

**Action:** Added `src/engine/systems/simulation/commands-transition.test.ts` to cover `CommandType.DESCEND` and `CommandType.ASCEND`. The tests assert that when `state.portals` is empty, trying to descend or ascend correctly adds the "No stairs here." alert to `state.pendingAlerts` and does not set `state.shouldDescend` or `state.shouldAscend`.

**Prevention:** Ensure that boundary conditions and failure paths in player commands (such as missing prerequisites like items or portals) are tested directly to protect edge-case UI feedback and state flags from regressions.

## 2026-09-27 - Add tests for `canActorAct` death guards

**What was found:** The `canActorAct` function in `src/engine/systems/simulation/sim-helpers.ts` acts as a guard to prevent dead players and monsters from acting in the tick loop. This function lacked explicit tests verifying that it correctly returns `false` when a player or monster's `hp` is <= 0. The need for this coverage was specifically noted in a prior learning log entry about redundant guards.

**Action:** Added two unit tests to `src/engine/systems/simulation/sim-helpers.test.ts` to assert that `canActorAct` returns false for players and monsters with `hp <= 0`. Verified the test correctness by manually mutating the production code to skip the guard, which successfully caused the tests to fail.

**Prevention:** Always ensure that outer tick-loop guards like `canActorAct` have their own targeted tests independent of inner guards, so their specific gating logic is not silently lost during refactors.

## 2026-09-28 - Add test for empty cookie branch in item use

**What was found:** The logic that handles eating a cookie in `resolveUseItemCommand` contained a branch (`if ((player.itemCounts[ItemType.COOKIE] ?? 0) <= 0)`) that prevents consuming the item and emits a "No cookies left." alert when the player has no cookies. This branch lacked behavioral test coverage, meaning it could have been removed without failing any tests.

**Action:** Added a focused unit test to `src/engine/systems/simulation/use-item.test.ts` to verify that attempting to eat a cookie with 0 `itemCounts[ItemType.COOKIE]` does not consume a cookie, does not heal the player, and correctly emits the "No cookies left." alert to `state.pendingAlerts`.

**Prevention:** Ensure that boundary conditions for consumable items (such as attempting to use an item you have 0 of) are explicitly covered by tests to protect the UI feedback and prevent silent regressions where items might incorrectly be consumed or effects incorrectly applied.

## 2026-09-29 - Armor sub-1 damage mitigation bypass

**What was found:** The armor damage mitigation logic in `events.ts` intentionally avoids softening naturally sub-1 damage attacks to a minimum of 1 HP (e.g. `Math.max(Math.min(1, rawIncoming), rawIncoming - armor)`). However, this specific behavior was uncovered by tests, meaning a developer simplifying the code to `Math.max(1, rawIncoming - armor)` could accidentally increase the damage of weak, sub-1 attacks against armored players to 1.

**Action:** Added a dedicated test in `src/engine/systems/simulation/events.test.ts` where a player with 10 HP and 5 armor is hit with a sub-1 (0.5) damage event. Verified through mutation that removing the `Math.min(1, rawIncoming)` logic correctly caused the test to fail by rounding the HP loss up to 1.

**Prevention:** Ensure damage mitigation bounds (e.g. minimum damage clamps) explicitly handle sub-1 attack scenarios in tests so that protective mechanics don't become penalties for specific enemy damage profiles.

## 2026-10-02 - Add missing test coverage for mining workshop structures

**What was found:** In `src/engine/systems/simulation/commands.ts`, the `resolveMineCommand` function explicitly checks if the structure being mined is a `WORKSHOP` or `WORKSHOP_FOOTPRINT` and aborts with an alert if so. This logic prevents the player from destroying the permanent settlement structure on the surface. However, this specific behavioral decision lacked test coverage, leaving it vulnerable to being removed in future refactors without causing any tests to fail.

**Action:** Added a behavioral test in `src/engine/systems/simulation/matter-manipulator.test.ts` for each arm of the guard, `StructureType.WORKSHOP` and `StructureType.WORKSHOP_FOOTPRINT`. Each attempts to mine the cell and verifies that the structure survives and the alert is appended to `state.pendingAlerts`. Mutation-checked: bypassing the whole guard fails both, and dropping only the footprint arm fails only the footprint case. Covering just `WORKSHOP`, as this entry originally did, left the footprint arm deletable with all 894 tests still passing.

**Prevention:** Ensure explicit structural protections (like making certain map features indestructible or immutable) are tested so that they cannot be accidentally removed or bypassed as systems evolve.

## 2026-10-03 - Chain explosion coverage

**What was found:** `processExplosionEvent` chains a blast into two separate kinds of neighbour — armed `ExplosiveEntity`s (`explosivesToTrigger`) and dropped grenade/land-mine `ItemEntity`s (`itemsToTrigger`) — and neither arm was covered. Deleting either loop on `main` left all 895 tests passing.

**Action:** Added a top-level `chain explosions` describe to `src/engine/systems/simulation/explosives.test.ts` with one case per arm plus a negative case for the item-type filter, which restricts the item arm to grenades and land mines. Detonations are counted through the `"explosion"` entries in `state.effects`, one per resolved event, rather than by replacing `state.eventQueue.push`.

Mutation-checked, one failing case per mutation: dropping the `itemsToTrigger` loop fails the dropped-grenade case, dropping the `explosivesToTrigger` loop fails the neighbouring-explosive case, and widening the item filter to every item type fails the medkit case.

**Prevention:** When a function fans out over several entity kinds, count the arms before claiming the behaviour is covered — the first pass here covered the item arm only, while its log entry claimed chain explosions as a whole. And assert on observable state rather than monkey-patching a method on the state object: the replacement of `state.eventQueue.push` was never restored, and it would have gone on passing if the arm it tested had been reached by some other path.

## 2026-10-04 - Add tests for building restrictions

**What was found:** The matter manipulator's ability to place blocks had uncovered decisions: preventing players from building over unbuildable terrain (like holes) or directly over entities (like the player themselves). This was an edge case that was missing behavioral tests.

**Action:** Added two new tests to `matter-manipulator.test.ts` that ensure the `PLACE_BLOCK` command correctly rejects these invalid placements and alerts the player.

**Prevention:** When adding new player commands that mutate the world (like building), always consider edge cases where the action intersects with invalid tiles or occupying entities.

## 2026-10-06 - Add test for monster hole fall chance

**What was found:** In `src/engine/systems/simulation/tick.ts`, the logic in `processHoleFalls` that gives a monster a 50% chance to fall when moving onto a hole tile (`if (movedOntoHole && RNG.chance(0.5))`) was not covered by any behavioral test. This left it vulnerable to being accidentally changed or removed without failing any tests.

**Action:** Added two focused tests in `src/engine/systems/simulation/tick.test.ts`. The first verifies that a monster moving onto a hole tile has a probabilistic chance of falling, using a fixed random seed and multiple trials to assert that the fall count is greater than 0 and less than the total number of trials. The second pins the `movedOntoHole` half of the predicate: a monster already standing on the hole never falls, so dropping that guard (which would make a stationary monster fall) cannot pass unnoticed.

**Prevention:** Ensure that probabilistic branches for entity interactions with the environment (e.g. falling through holes, triggering traps) are explicitly covered by tests using fixed seeds and multiple trials to protect against accidental removal of the randomness.

## 2026-10-11 - Test that friendly pets block movement without triggering an attack

**What was found:** The `resolveMoveCommand` handler handles movement, including a collision check that converts movement into melee attacks if the player attempts to walk into a monster. A special edge case was introduced: "Don't attack your own friendly pets by walking into them." This edge case was completely untested, meaning a plausible future change (like reorganizing collision logic, changing how friendly states are evaluated, or moving the logic around) could easily break it, allowing players to accidentally attack their own pets by moving into them.

**Action:** Added a unit test in `src/engine/systems/simulation/commands.test.ts` within the `resolveMoveCommand blocker precedence` block that spawns a friendly `WILD_DOG` on the target tile and validates that a move command correctly returns `false` (blocking movement) without pushing a `DAMAGE` event (meaning it avoids converting the collision into an attack).

**Prevention:** When testing collision, pathfinding, or targeting logic, always look for explicit exceptions for friendly/allied entities and verify that tests exist covering those exceptions.

## 2026-10-13 - Test player movement stops on death

**What was found:** Nothing asserted that a dead player's velocity is zeroed. Deleting both assignments — `processDamageEvent` (`events.ts:203`) and `processPlayerDeathEvent` (`events.ts:995`) — left all 906 tests on `main` green, so a dead player could keep sliding under its prior inertia with nothing to notice.

**Action:** Added two cases in `src/engine/systems/simulation/death-transition.test.ts`, one per entry point into death: the black pill (`hp = 0` plus a direct `PLAYER_DEATH` push, no `DAMAGE` event) and a lethal `DAMAGE` event.

**Prevention:** Ensure that entity physics state resets tied to lifecycle events like death are protected by behavioral tests so that corpses do not inherit active entity properties.

**What these cases do and do not pin — measured, not assumed:**

| mutation                                  | result                                       |
| ----------------------------------------- | -------------------------------------------- |
| `processPlayerDeathEvent` zeroing removed | black-pill case fails                        |
| `processDamageEvent` zeroing removed      | **both cases pass** — full suite stays green |
| both removed                              | both cases fail                              |

Only the black-pill case pins a specific assignment. The damage case pins the
observable behaviour, which either assignment satisfies, because the
`PLAYER_DEATH` that `processDamageEvent` pushes drains inside the same
`processEventQueue` call. Do not read the damage case as coverage of
`events.ts:203`, and do not delete that line as redundant: a cascade that trips
`MAX_EVENTS_PER_TICK` (1000) breaks out before the queued `PLAYER_DEATH` is
reached, leaving it for the next tick, and that assignment is what stops the
slide in the meantime. Writing a test for that window needs a 1000-event
cascade, which is a fixture rather than an oracle.

## 2026-10-15 - Test online multiplayer hole-fall prevention

**What was found:** The logic in `processHoleFalls` (in `src/engine/systems/simulation/tick.ts`) that prevents players from falling through holes during online multiplayer (`if (holeCreated && !online)`) lacked behavioral test coverage. This left the protection vulnerable to being removed without any failing tests, potentially causing double-application of fall damage or unwanted client-side warp signaling.

**Action:** Added a focused unit test to `src/engine/systems/simulation/tick.test.ts` that explicitly simulates a player standing on a newly created hole in `online` mode, verifying that `state.shouldDescend` stays false and that the player takes no fall damage. Mutation tested: with `!online` dropped from the guard, each assertion fails on its own (`shouldDescend` becomes true; hp goes 20 -> 17).

**Prevention:** Ensure explicit multiplayer divergences (like preventing server-owned logic from running on the client) are covered by explicit tests simulating `online` mode to prevent regressions in multiplayer sync logic.

**Corrected during review:** the first draft asserted on `state.eventQueue` after
the tick. That assertion could never fail for two independent reasons:
`stepSimulationTick` calls `processEventQueue` immediately after
`processHoleFalls`, so the queue is always empty by then, and it matched
`amount === 10` when `HOLE_FALL_DAMAGE` is 3. Assert on the damaged entity, not
on a queue the tick has already drained. The draft also relied on an earlier
test in the file having set `generateAICommands.mockReturnValue([])` — vitest is
not configured with `clearMocks`, so it passed in a full-file run and threw
`Cannot read properties of undefined (reading 'length')` when run alone. Set the
mock in every test that steps a tick.

## 2026-10-18 - death velocity zeroing on event cascade

**What was found:** The `death-transition.test.ts` described a decision where `processDamageEvent` zeroes the player's velocity when dealing lethal damage, which guards against corpse sliding if the resulting `PLAYER_DEATH` event gets deferred to the next tick due to exceeding `MAX_EVENTS_PER_TICK`. However, there was no test specifically forcing this event cascade to assert the behavior.

**Action:** Added a test in `src/engine/systems/simulation/death-transition.test.ts` that fills the event queue to the `MAX_EVENTS_PER_TICK` limit before pushing lethal damage, proving that the velocity is stopped in the same tick despite the subsequent `PLAYER_DEATH` event being deferred.

**Prevention:** When testing boundary conditions involving tick-deferred events, explicitly construct the overflow condition to ensure behavior isn't accidentally coupled to deferred processing steps.

## 2025-01-23 - Add test for magnetic auto-pickup drifting and wrapping logic

**What was found:** The \`processMagneticPickup\` logic inside \`src/engine/systems/simulation/tick.ts\` had branches handling non-collectible / machine item exclusion, item drift before collection, and toroidal wrapping of positions on the outside level. These branches were entirely uncovered, meaning future changes could accidentally modify or drop them without failing the test suite.

**Action:** Added three tests to \`tick.test.ts\` that:

1. Verify items with the machine category (e.g., \`VENDING_MACHINE\`) do not get pulled.
2. Verify items within \`MAGNET_RADIUS\` but outside \`MAGNET_COLLECT_RADIUS\` drift toward the player by the exact \`MAGNET_PULL_PX\` value.
3. Verify items correctly evaluate the shortest distance across the toroidal seam and drift accordingly when on an outside level.

**Prevention:** Ensure explicit movement, wrapping computations, and edge case exclusion in background simulation logic are completely covered by asserting the concrete intermediate output (like position updates).
