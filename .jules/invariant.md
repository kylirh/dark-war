## 2026-09-04 - Fix index desync on EntityManager.destroyWhere

**What was found:** `EntityManager.destroyWhere` iterates backwards over `this._entities` and calls `this._entities.splice(i, 1)` directly when an entity matches the predicate. However, if the `predicate` function internally mutates the `_entities` array (e.g. by destroying another entity), the `_entities` array length shrinks and the elements shift. This causes `this._entities.splice(i, 1)` to remove the _wrong_ entity and leaves the `EntityManager` out of sync, because `this.unindex(entity)` will unindex the correct entity while the array mutation removed an innocent entity.

**Action:** Replaced the backward array iteration with a loop over a shallow copy (`[...this._entities]`). For every entity that matches the predicate, we explicitly call `this.destroy(entity)`, which internally looks up the entity's correct current index and correctly manages all indices. We also check `if (!this.has(entity.id)) continue;` to ensure we don't attempt to destroy entities that were already removed earlier in the same iteration loop.

**Prevention:** Never iterate directly over a mutable array if the loop body executes user-provided or external functions (like `predicate`) that could mutate the array. When processing bulk operations (like `destroyWhere`), rely on the core lifecycle methods (`destroy`) to handle index lookup and cleanup correctly, rather than duplicating the array splicing logic.

## 2026-09-04 - Fix silent drift in explored set removals during delta compression

**What was found:** The delta compression logic in `diffExplored` correctly calculated `added` elements by checking what was in `next` but missing in `base`. However, its fallback for when the set *shrank* only checked `next.length < base.length`. If the explored set removed one element but added two new ones in the same tick (e.g. `[1, 2, 3]` -> `[1, 3, 4, 5]`), the length increased, so the fallback was skipped. The delta would send the additions but silently fail to remove the deleted elements on the client side, causing state desync.

**Action:** Replaced the length comparison with `base.length + added.length !== next.length`. This explicitly tests whether any elements were dropped from the original set, regardless of how many new ones were added, ensuring the keyframe fallback triggers correctly on removals.

**Prevention:** When computing deltas for arrays or sets that do not support explicit removal payloads, do not rely on simple length changes. Always check for structural integrity (e.g., if all old elements are still present) or test additions and removals symmetrically.
