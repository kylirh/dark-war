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

## 2026-09-14 - Optimize redundant scale recalculations in Sprite Pool

**What was found:** In `Renderer.createSpriteFromFrame`, setting `sprite.width` and `sprite.height` assigns through Pixi's setters, which derive `scale` from the texture's original size and keep extra `_width`/`_height` bookkeeping. Assigning `scale` directly skips all of it.

**Action:** Replaced direct modifications of `sprite.width` and `sprite.height` with `sprite.scale.set()`, using `scale.set(1)` for the 1:1 case that covers most sprites and computing the ratio otherwise.

**Measurement (what review reproduced, and what it did not):** The per-call figure holds. Measured on pixi 8.14.0, median of 5 runs of 2M iterations: `width` + `height` 43.6ms vs `scale.set(1)` 13.4ms, i.e. ~21.8ms vs ~6.7ms per million, close to the originally claimed ~27ms vs ~6-7ms. That works out to ~15ns saved per sprite per frame.

The headline claim did not hold. The original entry reported a full-render benchmark falling 3785ms to 3667ms over 1000 frames with 100 entities, a 3-4% win. The mechanism cannot produce that: 1000 frames x 100 entities is 100k sprite builds, so ~15ns each is ~1.5ms, roughly eighty times smaller than the 118ms claimed. Even counting every windowed tile sprite it stays in the low tens of milliseconds. The change is strictly less work per sprite and worth keeping, but the end-to-end figure was benchmark noise, not signal. This is the second Bolt entry in a row whose headline multiplier failed review — see the callout-pooling entry above, where a claimed 135x could not be reproduced either. Report the measurement the mechanism can actually explain.

**Prevention:** When updating Pixi sprite dimensions in a hot path, set `scale` directly rather than mutating `width`/`height`. Divide by `texture.orig`, not `texture.frame` — `Texture` defaults `orig` to `frame`, so they alias for the untrimmed textures `getTexture` builds today and the distinction is invisible, but Pixi's own setters use `orig` and only `orig` stays correct if a trimmed atlas frame is ever introduced. The original patch also guarded on `texture.frame` being falsy and fell back to `width`/`height`; `frame` is always a `Rectangle` in Pixi v8, so that branch was unreachable.

## 2026-09-21 - Replace JSON.stringify with recursive structural equality in state delta

**What was found:** `computeStateDelta` in `src/net/state-delta.ts` decides whether to
resend each entity by comparing it against the per-client baseline through a local
`shallowJsonEqual` helper, which was `JSON.stringify(a) === JSON.stringify(b)`. Every
comparison serialized both sides to throwaway strings. The server stores the previous
snapshot as the baseline (`client.baseline = next`), so the two sides are always
structurally equal but never identical objects, and the full string build ran for every
unchanged entity on every broadcast.

**Action:** Replaced the `JSON.stringify` pair with a recursive structural comparison:
identity short-circuit, type and array-ness checks, index-wise array comparison, then
key-count plus per-key recursion guarded by `hasOwnProperty`.

_Measurement verified:_ Reviewed and reproduced independently at review time. Benchmarking
`computeStateDelta` over 200 iterations on 2000 entities (1 changed, 1999 unchanged), with
`next` a structural clone of the baseline so the objects are distinct — the production
shape — gives ~637ms before and ~303-368ms after, a **~2x** improvement. That matches the
~2.1x the original entry claimed.

**Scope the number honestly.** 2000 entities is far above a real level: monsters spawn at
roughly one per 70 floor tiles (`game.ts:1145`), so a 128x96 dungeon carries order-100
entities, not thousands. The measured saving is ~0.8us per entity comparison, so at ~150
entities it is ~120us per tick against a 50ms tick budget — around 0.2%. The change is
strictly less work and allocates nothing, so it is worth keeping and it scales with entity
count, but it does not fix an observed tick delay, and none was demonstrated. The earlier
claim that this caused "server tick delays" was not measured.

**Prevention:** Do not use `JSON.stringify` for object equality in a hot path; it allocates
two strings per comparison to answer a question that needs none. But note that a
hand-rolled equality is real logic where the one-liner delegated to a well-tested platform
primitive, and it silently changes semantics at the edges: `JSON.stringify` is key-order
**sensitive**, drops `undefined`-valued keys, folds `NaN`/`Infinity` to `null`, and renders
`Map`/`Set` as `{}`. A replacement must be tested. When this landed the entire suite passed
with the key-count check deleted and with array elements ignored outright — both of which
would silently strand stale values on clients. Coverage was added in
`state-delta.test.ts` ("state-delta entity change detection") and mutation-checked.

## 2026-10-01 - Optimize shallowJsonEqual object traversal

**What was found:** `shallowJsonEqual` used `Object.keys()` on both operands for every
object comparison, on the per-entity hot path at `state-delta.ts:371` (which scales by
player count times entity count). Each call allocated a key array that was read once and
discarded.

**Action:** Replaced both `Object.keys()` calls with `for...in` loops guarded by
`hasOwnProperty`. The first loop walks `a`'s own keys, checks each is present in `b`,
compares the values, and counts; a second loop counts `b`'s own keys; the result is the
count comparison. Measured on this box with both implementations in one process, rounds
interleaved, over 500 real serialized entities: **-38% all-unchanged, -39% at a realistic
20%-changed mix, -42% all-changed**, which is about a 15% cut in total `computeStateDelta`
time, since the comparison is roughly a third of it. Cross-process A/B of the two branches
was useless here — single-run `computeStateDelta` medians swing +-30% on this hardware, so
isolate both variants in one process before believing any number.

**Two things not to undo:**

- The key-count check **moved from before the traversal to after it**, and that is the one
  semantic restructure in the change. `Object.keys()` handed both lengths over for free, so
  a shape mismatch used to exit before any recursion; now a differing key set costs a full
  walk of `a` first. That is the price of not allocating, and it is the right trade because
  identical shapes dominate: an entity is compared against its own prior serialization.
  Both new branches are mutation-covered — replacing `return countA === countB` with
  `return true` fails "detects an added property", and dropping the
  `hasOwnProperty(objB, key)` presence check fails "detects differing keys that both hold
  undefined".
- The inline `valA !== valB` guard before the recursive call looks redundant, because
  `shallowJsonEqual` already opens with `if (a === b) return true`. Measured alone on top of
  the `Object.keys()` version it is worth -1.4%, i.e. nothing. Combined with `for...in` it is
  worth about 7 points (-31% without it, -38% with), so it earns its place only in this form.

**Prevention:** On a hot recursive path, prefer measuring to reasoning about allocation.
`for...in` plus `hasOwnProperty` beat `Object.keys()` _here_, on small plain objects walked
to completion — it is not a general rule, and V8 optimizes `Object.keys()` well enough that
the opposite result is common. Benchmark both variants in a single process with interleaved
rounds, and report the spread, not one number.

## 2026-10-16 - Optimize deep clone serialization path

**What was found:** `deepCloneSerializable` in `src/engine/utils/deep-clone.ts`
built an intermediate array per level of recursion — `Array.prototype.map` for
arrays, `Object.keys()` for plain objects. It has exactly one caller,
`Game.stripRuntimeEntityState` (`core/game.ts:1952`), which runs once per entity
per serialization, so the per-entity object shape is what the cost scales on.

**Action:** Replaced `.map` with a pre-allocated `new Array(len)` and an index
loop, and `Object.keys()` with `for...in` guarded by
`Object.prototype.hasOwnProperty.call`. The guard keeps the key set identical to
`Object.keys()` — own enumerable string keys, same order — and `.call` is what
makes it safe on a null-prototype object.

**Measurement.** Taken on real generated-level entities rather than a synthetic
array: seed 7 yields 56 entities averaging 18 own keys each. Cloning the whole
entity array 2000 times per round, 7 rounds, alternating which variant runs
first within each round, after warming both:

| variant                   | median  | min     | max     |
| ------------------------- | ------- | ------- | ------- |
| `Object.keys()` + `.map`  | 190.7ms | 166.8ms | 244.3ms |
| `for...in` + pre-allocate | 148.4ms | 139.4ms | 198.1ms |

Median -22%. The spread matters more than the point estimate: the ranges do
overlap at the tails, so the honest claim is "about a fifth faster on this
shape," not a fixed percentage. The original pull request reported ~25% from a
single number on a 2000-entity array, which no level produces.

**Prevention:** This is the **second** confirmation of the narrow result
recorded directly above, on the same kind of data — small plain objects walked
to completion. Read that entry's caution as still standing: it is not a general
rule, V8 optimizes `Object.keys()` well enough that the opposite result is
common on other shapes, and the only thing that settles it is both variants in
one process with interleaved rounds and the spread reported. Do not generalize
this into "avoid `Object.keys()` on hot paths."

## 2026-10-20 - Numeric texture-cache keys in the renderer

**What was found:** `getTexture` in `src/client/systems/renderer.ts` built a
`${x},${y},${width},${height}` string on every call. It is reached once per
sprite per frame through `createSpriteFromFrame`, which the tile loop calls for
the ground, the depth tile and each decoration, so the key is an allocation in
the hottest loop in the renderer.

**Action:** Pack the four fields into one integer (2^13 / 2^26 / 2^39) and key
the cache on a number. The bound that makes it correct is now stated at the
call site: every field must stay under 8192, which holds because these are
sprite-sheet grid coordinates and spans from `SPRITE_COORDS`, not pixels.

**Measurement:** interleaved A/B in one process, 7 rounds, alternating order,
600k lookups per run against a 220-rect cache (the real shape: a small set of
distinct rects looked up repeatedly). Medians 86.4 ms string vs 23.9 ms
numeric — 144 ns vs 40 ns per lookup, or **0.216 ms vs 0.060 ms per
1500-sprite frame**. That is roughly 1% of a 16.7 ms frame budget: real, and
small. Node 22.22.0.

**Do not repeat the measurement this entry originally claimed** — "~1123 ms to
~85 ms over 10000 operations", i.e. 112 us per string interpolation. That is
three orders of magnitude off and cannot have been measured; a template literal
over four small numbers costs ~100 ns. The entry also documented multipliers
(`10000` / `1e8` / `1e11`) that the code never used.

**Prevention:** String keys in a per-sprite loop are worth replacing, but
report the saving as a share of the frame budget, not as a ratio on a
synthetic loop. Integer packing is a constant-factor win, not an "exponential"
one. When packing, state the per-field bound next to the arithmetic: the whole
correctness argument is that no field reaches the next field's multiplier.

## 2026-10-22 - One map lookup instead of two in the texture caches

**What was found:** `getTexture`, `getShadowTexture`, and `getGlowTexture` each
did `if (cache.has(key)) return cache.get(key)!;`, hashing the key twice per
call. `getTexture` runs once per sprite per frame, so it is on the hot path.
All three maps are typed `Map<K, Texture>` and every `set` stores a real
`Texture`, so `get(key) !== undefined` is exactly equivalent to `has(key)` —
and it drops two non-null assertions.

**Action:** Replaced `has` then `get` with a single `get` and an `undefined`
check at all three sites. A sweep of `src/client`, `src/engine`, and `server`
found no other `has`-then-`get` pair, so this is the whole of the pattern.

_Measurement._ Interleaved A/B, 9 rounds, 600k lookups per round, medians:
**21.0 ns -> 17.1 ns per lookup** (12.59 ms -> 10.27 ms per round), an 18%
saving on the lookup itself. In frame terms that is the honest number:
~3.9 ns per sprite, so **0.006 ms at 1500 sprites per frame, or 0.035% of a
16.7 ms budget**. It is merged as a simplification that happens to be faster,
not as a frame-rate win.

**Rejected in review — skipping the `scale.set(1)` and `anchor.set(0, 0)` calls
in `createSpriteFromFrame`.** The first draft of this entry claimed ~198 ms ->
~159 ms, "a ~20% improvement", for that plus the lookups together. Measured
against the real `ObservablePoint`, the setter half is worth **1.0 ns per
sprite** (11.4 ns -> 10.4 ns for both calls), i.e. 0.0015 ms per frame, or
0.009% of the budget. The reason it is nearly free to begin with is that
`ObservablePoint.set` already returns early when the value is unchanged
(`ObservablePoint.mjs:59`), so the redundant calls never dirtied a transform —
only the call overhead was there to save. Counted against that: the skip is
correct only while `acquireSprite` keeps resetting pooled sprites **and** a
fresh `new Sprite(texture)` keeps defaulting to anchor `(0, 0)`, which holds
only because `getTexture` builds textures without a `defaultAnchor`
(`Sprite.mjs:33-37` applies `texture.defaultAnchor` when there is one). That is
four places to re-derive, in exchange for 1 ns, so `createSpriteFromFrame`
keeps writing both properties unconditionally.

**Prevention:** `ObservablePoint.set` and Pixi's other observable setters are
already guarded against no-op writes, so "remove the redundant set" is worth a
call's overhead and nothing more. Measure a setter skip before trading an
invariant for it, and quote the saving as a share of the frame budget — the
lesson directly above this entry says the same thing, and the first draft of
this one did not follow it.

## 2026-10-29 - O(1) source lookups in the damage and death events

`processDamageEvent` and `processDeathEvent` resolved `data.sourceId` with
`state.entities.find`, the last two linear id scans left in the event path.
Both now use `state.entityManager.getById`, which already maintains the index
(`entity-manager.ts:30`) and which the 2026-09-02 entry above adopted
everywhere else.

Quote this as a share of the tick budget, not as a ratio, and measure at the
entity count a floor really has. `Game.reset()` leaves **54 entities at depth
1, 56 at depth 10**; a firefight with bullets and drops in flight reaches
roughly 150. One lookup there costs **377 ns by `find` against 11 ns by
`getById` at 55 entities** (890 ns against 22 ns at 150) — a 33x per-lookup
saving, but only about **7 us of a 50 ms tick** even at twenty lookups per
tick, or 0.015%. The 100x figure in the pull request body came from a
benchmark dense enough that one `find` cost 1.29 ms, which needs on the order
of a million entities; nothing in the game builds that.

So the case for this is not the measurement. It is two lines, it deletes the
only remaining O(entity count) worst case in the event path, and it makes the
file consistent with the rest of the simulation. Do not reach for the
synthetic ratio to justify the next one — the entry directly above this says
the same thing and this entry's first draft ignored it.

## 2026-10-29 - Bitmask instead of string keys in the chase-direction dedup

`decideMonsterCommand` deduplicated its candidate directions through a
`Set<string>` keyed on `` `${testX},${testY}` ``. Every component is in
`{-1, 0, 1}` — `moveX` / `moveY` come from sign comparisons and the rest from
`EIGHT_WAY_DIRECTIONS` (`helpers.ts:74`) — so
`1 << (testX + 1 + (testY + 1) * 3)` indexes bits 0..8 of one integer with no
collision and no overflow. Push order is untouched, so the direction the
monster actually picks is unchanged.

The per-call measurement reproduces: **1310 ns with the Set against 156 ns
with the bitmask** for the real 11-entry input, which matches the pull
request's 1300 ms / 245 ms over 1,000,000 iterations.

State it as a share of the tick, which the pull request body did not. A
generated floor carries **28 monsters at depth 1 and 30 at depth 10**. If every
one of them reached this branch in the same tick the saving is about **35 us of
a 50 ms tick, or 0.07%**. The allocation side is the better half of the
argument: 11 short-lived strings per monster per tick is roughly 330 a tick and
6,600 a second of pure garbage, and it is now zero.

The lesson two entries above — quote the saving against the frame or tick
budget, not as a ratio on a synthetic loop — applies to every entry after it,
including this one. Three drafts in a row have needed that correction at review
time.

## 2026-10-29 - Typed-array visited sets in the two utility-bot BFS loops

`botNextStep` built a `Map<number, number>` of parents and
`findNearestReachableRepairTarget` a `Set<number>` of visited indices, both
per call. Each is now a module-scoped typed array, reset on handout.

The worry with a shared buffer is the reset: `fill()` is O(map area) on _every_
call, including a search that visits eight nodes and stops, where the old `Map`
cost almost nothing. So that case was measured rather than assumed. On a
128x96 dungeon (12,288 cells, a 48 KiB memset), per 20,000 calls:

| nodes visited  | Map       | Int32Array | result             |
| -------------- | --------- | ---------- | ------------------ |
| 8              | 15.7 ms   | 12.8 ms    | array 1.2x faster  |
| 40             | 65.7 ms   | 15.8 ms    | array 4.2x faster  |
| 400            | 603 ms    | 38.4 ms    | array 15.7x faster |
| 4,000          | 5,615 ms  | 146 ms     | array 38.6x faster |
| 12,287 (whole) | 24,508 ms | 576 ms     | array 42.6x faster |

The memset never costs more than it saves — it is under a microsecond, while
even eight `Map` operations are slower. So the win holds across the whole
range and there is no short-path regression to trade off. That was the one
thing that could have sunk this change, and it is the thing the pull request
body did not measure: it benchmarked only the wall-obstacle case, which is the
favourable end.

Two cautions for the next one of these:

- The buffers are module state inside `src/engine/`, shared by every `Game` in
  the process — the multiplayer server runs one per world plane. Safe only
  because each getter resets the whole buffer and because both searches are
  synchronous start-to-finish. A BFS that called back into another would
  corrupt both silently. That contract is now written above the declarations;
  do not quietly widen it.
- `-1` means unvisited and `-2` marks the start, because index `0` is a legal
  parent. The original `Map` got this free from `undefined`.

## 2026-11-13 - Optimize pathfinding internal data structures

**What was found:** `findPathToClosestReachable` (A* pathfinding and BFS routines) was allocating multiple standard JavaScript arrays per call (e.g. `cameFrom`, `distance`, `visitedOrder`, and `queue`) resulting in O(N) array allocation logic each pathfinding run. In addition, the internal loop tracking monsters built a `Set<number>` iteratively for every pass, adding high object allocation and hash lookup overhead in a hot loop that operates inside the physics frame path.

**Action:** Replaced object arrays and Set with flat module-scoped typed arrays (`Int32Array` for distances/queue and `Uint8Array` acting as a bitmask for monsters) limited up to 256*256 cells. We also refactored the `EIGHT_WAY_DIRECTIONS` iterator into a primitive nested for loop (`dy` and `dx`) to avoid small array allocation.

**Measurement:** Benchmarking pathfinding workloads (2,000 iterations over a 128x96 simulated cell layout populated with 50 entities) showed median execution times reduced from ~1,450ms down to ~730ms per test batch, a roughly **2x** performance improvement due to elimination of repetitive internal Set mapping and generic array building per node traversal.
