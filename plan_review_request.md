The invariant we need to fix is:
"Entity ordering is stable where gameplay depends on it. `.jules/bolt.md` records that the `items` index must match `entities.filter(...)` element for element, because those scans draw from the shared RNG — a swap-and-pop removal there would change gameplay, not just layout."
Wait, the prompt says `.jules/bolt.md` records that, but this is a hint for "Entity ordering is stable where gameplay depends on it".

But actually, I see two possible invariants for "Serialization" vs "Delta compression":
"Applying a `state_delta` to a baseline yields exactly what a `state_full` would have contained at that tick. This is the most valuable property here: silent delta drift is nearly impossible to notice by playing."

I investigated delta compression and found that `applyStateDelta` for entities uses `applyById` which creates a Map and then returns `Array.from(byId.values())`. Since it does this, and `byId.set` appends to the end of Map order for upserted entities, the ordering of entities can easily get out of sync.
The delta does not currently preserve array element order if elements are removed from the middle or upserted.

I wrote a test to prove that `applyStateDelta` does not preserve entity order if we upsert or rearrange elements, and I successfully fixed it by adding `entityOrder` to `StateDelta`.
This violates: "Applying a `state_delta` to a baseline yields exactly what a `state_full` would have contained at that tick." because `state_full` would have the exact correct entity order, whereas `applyStateDelta` changes the order.

Is this the intended fix for this invocation?
Yes, delta order preservation directly addresses the delta compression invariant, AND it addresses the determinism invariant where "Entity ordering is stable where gameplay depends on it".

I will create a pull request with:
1. `src/net/state-delta.test.ts` adding a test that applies delta and expects entity order to be identical.
2. `src/net/state-delta.ts` updating `StateDelta` to include `entityOrder`, setting it when order changes, and using it in `applyById`.
