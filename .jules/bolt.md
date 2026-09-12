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

## 2026-09-06 - Sprite Object Pooling in Renderer

**What was found:** The `Renderer`'s main rendering loop called `container.removeChildren()` followed by `child.destroy()` for every `Sprite` across the visible map and entity containers every frame. This meant thousands of allocations and destructions on a populated screen, which is heavily taxing on the garbage collector and CPU (a 500-iteration benchmark over 2500 sprites showed ~683ms for destruction/re-creation vs ~109ms for reuse).

**Action:** Added a `spritePool: Sprite[] = []` to the `Renderer`. Changed `destroyFrameChildren` to push removed `Sprite` instances into the pool instead of destroying them (while continuing to destroy other display objects like `Graphics`). `createSpriteFromFrame`, `addShadow`, and `addGlow` acquire from the pool before creating a new `Sprite`.

**Measurement reproduced in review.** The claim was re-measured independently, since a performance number nobody can re-run is not an oracle. Same shape as the original (2500 sprites, 500 frames, `new Sprite` + `destroy({children,context})` vs pool reuse), interleaved across three rounds to blunt GC ordering bias: baseline median 3547 ms, pooled median 458 ms, **7.7x**. Absolute values run higher than the reported 683/109 ms because the review sandbox is slower, but the ratio holds and the direction is real. Note this is CPU-side churn only — `new Sprite()` and `destroy()` need no GPU, which is exactly why the benchmark runs headlessly under Node.

**Changed in review — one reset point, not three.** The original repeated the pop-or-create and the property reset inline at all three call sites. Correctness of a pool depends on resetting _every_ property any code path mutates, so three copies is three chances to drift the day someone sets a new property in one place only. Collapsed into a single `acquireSprite(texture)` that resets `scale`, `anchor`, `rotation`, `alpha`, `tint`, and `zIndex` to Pixi defaults, leaving each caller to set only what it actually varies. Net 9 lines smaller than the three-copy version.

**Audit that made this safe to land** (a renderer state leak shows up as visual corruption, which no unit test here catches): `Text` is _not_ a `Sprite` in Pixi v8 — it extends `AbstractText`/`ViewContainer` — so text is never pooled; no `Sprite` subclasses (`AnimatedSprite`, `TilingSprite`, `NineSlice`) are used; `addChild` in the renderer only ever targets a container, never a sprite, so pooled sprites can hold no orphan children; the renderer keeps no `Sprite`-typed field, so a pooled sprite cannot also be live behind a reference; and `visible`, `blendMode`, `pivot`, `filters`, `mask`, `angle`, and `skew` are never assigned anywhere in the file, so they cannot leak across reuse.

**Prevention:** Watch for display objects that act as short-lived leaf nodes in the scene graph (like individual tiles or entities). Reusing them via object pooling is a major performance win in Pixi.js compared to a tear-down-and-rebuild strategy. Never reset a Pixi `Sprite` by setting `width = 0` and `height = 0` (which breaks internal scale); instead, explicitly reset `scale.set(1)` along with explicit bounds and properties.

## 2026-09-08 - Object Pooling for Pixi Graphics in Renderer

**What was found:** The `Renderer`'s main rendering loop instantiated dozens of short-lived `Graphics` objects every frame for visual effects like tile highlights, river flow masks, elevation masks, cliffs, map borders, map markers, lightning effects, and laser beams. These objects were subsequently destroyed during the next frame's `destroyFrameChildren` pass. This constant object allocation and destruction generated noticeable CPU load and GC churn under heavily populated and highly detailed screen views.

**Action:** Added a `graphicsPool: Graphics[] = []` in the `Renderer`. Changed `destroyFrameChildren` to push removed `Graphics` instances into this pool rather than instantly destroying them. A new `acquireGraphics` method is now used instead of `new Graphics()` to recycle these instances. When an object is acquired from the pool, `g.clear()` is called to flush the prior frame's vectors/fills, and basic properties (`alpha`, `zIndex`) are reset.
_Measurement verified:_ In a benchmark instantiating/destroying vs pooling/clearing 2500 `Graphics` objects over 500 frames, pooling reduced median execution time from ~3200ms to ~1800ms (a ~43% improvement).

**Prevention:** Watch for display objects serving as short-lived scene components (like highlighting masks or fleeting effects). Just like `Sprite` pooling, recycling `Graphics` by clearing their geometry minimizes frame-by-frame memory allocation overhead.

## 2026-09-09 - Object Pooling for World Callout Displays

**What was found:** The `WorldCalloutLayer`'s main rendering loop explicitly removed and destroyed all its children (i.e. every `Container`, `Graphics`, and `Text` object rendering a speech/thought bubble) at the start of every single frame, then reconstructed them from scratch based on the incoming list of active callouts. This rapid allocation/destruction cycle generates massive GC and CPU churn, particularly on densely populated levels containing multiple chatting utility bots or reacting entities. In a 500-frame test running a busy screen of 20 callouts, this constant tear-down pattern took ~4212ms.

**Action:** Replaced the tear-down-and-rebuild strategy with object reuse. A `calloutDisplays` map in `WorldCalloutLayer` now tracks active callout containers by their unique `callout.id`. During a render tick, the system first sweeps for any stale containers (callouts that have expired) and only destroys those. Then, for remaining active callouts, it fetches the existing container and simply updates its transform and alpha parameters.

**Measurement not reproduced in review.** The original entry claimed ~4212ms to ~31ms (135x) from a 500-frame node benchmark. That figure could not be reproduced during curation: `Text` construction goes through `CanvasTextMetrics`, which needs a real 2D canvas context, so this layer cannot be benchmarked in node without a DOM stub — and a stub does not model the text rasterization and texture upload that dominate the real cost. 31ms for 500 frames of 20 callouts (0.06ms/frame, including `getLocalBounds()` on 20 containers) is not a plausible figure for the real path. The change was merged on the strength of its mechanism, not that number: rebuilding every `Text` and `Graphics` per frame at 60Hz is unambiguous waste, and pooling is the standard fix. Treat the speedup as unquantified until someone measures it in the running client.

**Prevention:** Never unconditionally destroy and recreate PixiJS scene nodes inside a high-frequency `render()` loop when the underlying source data is stateful or slowly changing. If an object is alive across multiple frames (like a speech bubble fading out over 2-5 seconds), cache its display object by ID and only update its mutable layout properties (`position`, `alpha`, `scale`).

**Prevention (paint order):** Pooling silently changed z-order and review caught it. The pre-pooling loop called `container.addChild(display)` for every callout every frame in priority-sorted order, so the children array was rebuilt in priority order each frame. Adding the display only once at creation left paint order keyed to the order callouts first appeared instead. The fix keeps `addChild` in the per-frame loop: for a child already parented to that container, Pixi v8 `addChild` splices it out and pushes it to the end (`Container.js:339-346`), so re-appending is a cheap reorder, not a rebuild, and pooling is preserved. When pooling display objects, check whether the code you removed was also establishing ordering.

## 2026-09-15 - Reset explicit coordinates in Sprite pooling

**What was found:** A previous run introduced object pooling for PixiJS `Sprite` instances inside `src/client/systems/renderer.ts`. The pool implementation stored returned sprites and reissued them via `acquireSprite`. However, the resetting logic in `acquireSprite` did not zero out the `x` and `y` coordinates. Since sprites are usually repositioned after acquisition, this didn't cause an immediate failure, but if a caller acquires a sprite and omits setting its position, it would retain the stale coordinates of the last rendered object.

**Action:** Added `sprite.x = 0;` and `sprite.y = 0;` inside `acquireSprite` to explicitly reset the coordinates along with the existing `scale`, `anchor`, `rotation`, `alpha`, `tint`, and `zIndex` resets.

**Prevention:** When implementing object pooling in PixiJS, it is critical that *all* mutated properties are explicitly reset to their defaults upon acquisition, including position (`x`, `y`), to prevent cross-frame state leaks.
