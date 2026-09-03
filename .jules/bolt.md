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

## 2026-08-30 - Item scans on the per-tick path

**Learning:** The `items` index landed earlier but only `resolvePickupCommand`
used it. Seven hot scans still walked all of `state.entities` filtering for
`EntityKind.ITEM` — three per tick (`processMonsterItemPickups`,
`processMagneticPickup`, `processHoleFalls`) and four in the AI
(`nearestJunkItem`, `nearestFetchableItem`, and the ammo and power-cell seeks,
the last two once per steering monster per tick).

**Action:** All seven now read `state.entityManager.items` directly, which also
removes the `as Item` casts the filter needed.

**The bit that actually needed care:** `processMonsterItemPickups` spawns a
dropped weapon inside its loop, and `spawn` appends to the index. Iterating the
live index there would have grown the array mid-iteration, so it still copies
into a local array first. Read-only scans iterate the index directly.

**Caveat:** same as the original index entry — a level holds ~55 entities, so
this is asymptotic hygiene and a readability win, not a measured bottleneck.
Do not cite it as one. The one guarantee worth protecting is _order_: every
removal path splices, so the index matches `entities.filter(...)` element for
element, and these scans draw from the shared RNG. A swap-and-pop removal in
`EntityManager` would change gameplay, not just layout — hence the ordering
test in `entity-manager.test.ts`.
## 2026-09-02 - O(1) Entity Lookups in Simulation Systems

**Learning:** Dozens of hotspots in the simulation loop (such as command parsing, event processing, and conversation states) used `state.entities.find((e) => e.id === someId)` to fetch an entity by its unique ID. This is an O(N) array scan performed very frequently.
**Action:** Replaced these lookups with `state.entityManager.getById(someId)`, leveraging `EntityManager`'s internal O(1) `Map` mapping IDs to entities. Always use `getById(id)` over `entities.find` when possible.
## 2026-09-03 - O(1) Lookups in `updateConversationSessions`

**Learning:** `updateConversationSessions` originally iterated over `state.entities` (an O(N) array search) to build a cache of speakers, and searched for players using `state.players.find` inside a loop.
**Action:** Replaced the array scans with O(1) entity lookups using `state.entityManager.getById(session.speakerId)` and building a map for O(1) player lookups. The performance benchmark showed a significant reduction in overhead (around 65% faster in mock scenarios).
