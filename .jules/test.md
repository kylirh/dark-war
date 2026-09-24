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
