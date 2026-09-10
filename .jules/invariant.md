## 2026-09-04 - Fix index desync on EntityManager.destroyWhere

**What was found:** `EntityManager.destroyWhere` iterates backwards over `this._entities` and calls `this._entities.splice(i, 1)` directly when an entity matches the predicate. However, if the `predicate` function internally mutates the `_entities` array (e.g. by destroying another entity), the `_entities` array length shrinks and the elements shift. This causes `this._entities.splice(i, 1)` to remove the _wrong_ entity and leaves the `EntityManager` out of sync, because `this.unindex(entity)` will unindex the correct entity while the array mutation removed an innocent entity.

**Action:** Replaced the backward array iteration with a loop over a shallow copy (`[...this._entities]`). For every entity that matches the predicate, we explicitly call `this.destroy(entity)`, which internally looks up the entity's correct current index and correctly manages all indices. We also check `if (!this.has(entity.id)) continue;` to ensure we don't attempt to destroy entities that were already removed earlier in the same iteration loop.

**Prevention:** Never iterate directly over a mutable array if the loop body executes user-provided or external functions (like `predicate`) that could mutate the array. When processing bulk operations (like `destroyWhere`), rely on the core lifecycle methods (`destroy`) to handle index lookup and cleanup correctly, rather than duplicating the array splicing logic.

## 2026-09-04 - Fix silent drift in explored set removals during delta compression

**What was found:** The delta compression logic in `diffExplored` correctly calculated `added` elements by checking what was in `next` but missing in `base`. However, its fallback for when the set _shrank_ only checked `next.length < base.length`. If the explored set removed one element but added two new ones in the same tick (e.g. `[1, 2, 3]` -> `[1, 3, 4, 5]`), the length increased, so the fallback was skipped. The delta would send the additions but silently fail to remove the deleted elements on the client side, causing state desync.

**Action:** Replaced the length comparison with `base.length + added.length !== next.length`. This explicitly tests whether any elements were dropped from the original set, regardless of how many new ones were added, ensuring the keyframe fallback triggers correctly on removals.

**Prevention:** When computing deltas for arrays or sets that do not support explicit removal payloads, do not rely on simple length changes. Always check for structural integrity (e.g., if all old elements are still present) or test additions and removals symmetrically.

## 2026-09-07 - Use deterministic RNG for event sounds

**What was found:** The `processDamageEvent` and `processDeathEvent` handlers used `Math.random()` to pick randomized sound effects (flesh hits, metal hits, player hits, and monster death screams). A code comment claimed this avoided "desyncing RNG" because cosmetic variation shouldn't affect gameplay. These were the only four `Math.random()` calls left on the simulation path, and they contradicted the surrounding code: `RNG.choose` was already the idiom for exactly this at five other sound sites, one of them in this same file (`events.ts`, distant fighting sound). `pendingSounds` is serialized into `SerializedState.sounds`, so the same seed replayed to a different observable state.

**Action:** Replaced `Math.random()` with `RNG.choose(sounds)` in `src/engine/systems/simulation/events.ts`, and added a replay property test in `events.test.ts` that reseeds the RNG, drives 16 player-damage events, and asserts the two runs produce the same sound sequence. It fails on the pre-fix code and passes after.

**Rejected in review:** the first version of this entry claimed the `Math.random()` picks were "breaking delta compression." That is wrong, and it should not be repeated. `sounds` is one of the fields `src/net/state-delta.ts` deliberately does _not_ diff — it is documented there as "tiny / ephemeral" and resent whole on every delta (`sounds: next.sounds ?? []`). A random sound choice therefore costs no bandwidth and cannot trigger a baseline mismatch. The real cost is narrower: replay and save/load reproducibility, since the value lands in `SerializedState`.

**Prevention:** Keep `Math.random()` off the simulation path even for cosmetic values, whenever the result reaches `SerializedState`. Note the direction of the argument: routing a cosmetic pick through the shared `RNG` singleton _does_ shift the draw sequence for every later gameplay roll, so this is only safe because every execution of a given tick makes the same draws in the same order. Where that does not hold — a choice made per-observer, or only on some clients — use the keyed `deterministic-roll.ts` helpers instead of the shared stream.

## 2026-09-08 - Fix array ordering loss in delta compression

**What was found:** The `computeStateDelta` and `applyStateDelta` logic successfully reconstructed `entities` and `players` arrays containing the correct instances, but failed to preserve the exact array order across a state synchronization if no entities were added or removed. Since components like `EntityManager` rely on the stable order of item scans (which draw from a shared RNG), this silent reordering across network boundaries broke simulation determinism.

**Action:** Extended the `StateDelta` interface with `entityOrder` and `playerOrder` fields. Updated `diffById` to detect whenever the order of elements changed between the baseline and the next state, even when the elements themselves remained the same. Modified `applyById` to accept this explicit ordering array and correctly rebuild the resulting entity and player collections to match the sequence produced by the authoritative simulation.

**Prevention:** When working with delta compression or modifying `src/net/state-delta.ts`, ensure that explicit array ordering (e.g., `entityOrder` or `playerOrder`) is tracked and reconstructed in `applyById`. JavaScript Maps preserve insertion order, which can silently discard server-side array reordering without explicit array sequence tracking.

## 2026-09-08 - Fix redundant array ordering payloads

**What was found:** The delta compression logic correctly added `entityOrder` and `playerOrder` to preserve order. However, the condition for emitting this list was simply `base.length !== next.length`. Because `EntityManager` appends on `spawn()` and splices on `destroy()`, the surviving order plus any appended IDs is exactly what `applyById`'s default Map reconstruction rebuilds naturally. This caused the ordering list (which contains every entity ID) to be sent on every tick where a spawn or despawn occurred (e.g., a bullet firing), adding ~290% byte overhead to those deltas.

**Action:** Claude Code pushed a correction to the PR: compare the `next` order against the order that `applyById` _would_ naturally reconstruct, and only send the explicit list when they actually differ. Also added tests to cover player reordering and ensure the list is omitted when redundant.

**Prevention:** When sending explicit full-state lists in a delta to preserve structure (like array ordering or explored sets), do not use naive conditions like `length !== length` to trigger the fallback. Compute what the receiver would reconstruct without the list, and only send the full list if that reconstructed state differs from the true `next` state. Always measure byte overhead for hot-path networking changes.
