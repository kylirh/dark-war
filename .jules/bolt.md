## 2026-08-26 - O(n) array splicing during level population

**Learning:** `spawnLevelEntities` and friends drew a random tile from a
`freeTiles` pool and removed it with `freeTiles.splice(index, 1)`. The pool
holds one entry per walkable tile (a few thousand on a 128x96 dungeon), and
`splice` shifts every element after the hole, so each spawn was O(n).

**Action:** Replaced it with swap-and-pop (`pool[i] = pool[pool.length - 1];
pool.pop()`), which is O(1). Safe because the pool is only ever sampled
uniformly at random, so the reordering is unobservable.

**Caveat worth recording:** measured, this is worth roughly 30 microseconds
per level generation - ~60 spawns against a ~5k pool. It is asymptotic
hygiene and a readability win once factored into one helper, not a fix for a
measured bottleneck. Do not cite it as one.

## 2026-08-26 - Item index on EntityManager

**Learning:** `resolvePickupCommand` filtered the whole `state.entities` array
to find nearby items on every pickup.

**Action:** `EntityManager` now maintains an `items: Item[]` index alongside
the entity array. Use `state.entityManager.items` for item lookups. The index
is maintained by every mutation path (`spawn`, `destroy`, `destroyWhere`,
`replaceAll`), which is what keeps it honest - do not mutate `state.entities`
directly, or the index silently desyncs.

**Caveat:** a level holds ~55 entities, so this saves well under a microsecond
per pickup. The win is that item-scanning code now reads as such; it is not a
measured bottleneck.

## 2026-08-27 - Entity ID lookups to Map

**Learning:** Replaced `state.entities.find((e) => e.id === ...)` lookups with `state.entityManager.getById(...)`.
Many systems were looping through the N-sized array to find specific actors and items via their ID.

**Action:** Switched to O(1) Map lookups provided by the `EntityManager`. `getById()` accesses a dedicated map under the hood. For components where `find` relied on complex type guards (e.g. testing `kind === EntityKind.PLAYER`), I destructured to get the item first and then cast.

**Caveat:** Similarly, with ~55 entities in a typical level, avoiding the scan offers small microsecond-level savings per lookup. It keeps hot paths from unnecessary loops, but is primarily a structural health cleanup.
