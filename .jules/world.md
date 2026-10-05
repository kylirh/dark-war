## 2026-09-29 - WorldPlane.canTraverse is deliberately 8-connected; do not narrow it to Manhattan

**What was found:** `WorldPlane.canTraverse` gates a single step with
`Math.max(Math.abs(deltaX), Math.abs(deltaY)) !== 1` — a Chebyshev
neighbourhood, so the four diagonals are traversable. This reads like an
off-by-one for "adjacent", and it has now been reported as one and "fixed" to
Manhattan distance (`Math.abs(deltaX) + Math.abs(deltaY) !== 1`) in eleven
separate pull requests: #263, #268, #270, #275, #284, #288, #294, #298, #300,
#315, and #320 — the last of them today. Every one was closed. Several were character-for-character
identical.

The Chebyshev check is the contract, not a bug. Both pathfinders expand all
eight neighbours and gate every step on it: `src/engine/utils/pathfinding.ts:80-108`
(click-to-move) and `src/engine/systems/simulation/ai.ts:133-148` (monster
pathing, its own inline BFS over the same eight offsets). Narrowing the
predicate makes all four diagonals return `false`, which silently turns the
whole game four-directional.

Each of those pull requests reported `npm test` passing, and each was telling
the truth: on `main` the 8-connected contract has no test, so the Manhattan
edit is green on the full suite. A bot cannot distinguish "my change is
correct" from "nothing covers this" by running the suite, which is exactly why
the same edit keeps coming back.

**Action:** None to the source. The predicate is correct as written. #296 is
open and pins the contract directly, in `world-plane.test.ts` and
`pathfinding.test.ts`; once it lands, the twelfth attempt fails loudly instead
of looking correct.

**Prevention:** Before proposing a change to a predicate that looks like an
off-by-one, find its callers and ask what they rely on. `canTraverse` has two,
both pathfinders, both 8-connected. A green suite is evidence only where
coverage exists — check that the behaviour you are changing is actually tested
before treating "all tests pass" as proof the change is safe. Whether Dark War
should move four-directionally is a design decision for a human and an ADR, not
a one-line predicate edit.

## 2024-05-23 - Fix diagonal pathfinding across wrapped coordinate seams

**What was found:** The `WorldPlane.canTraverse` pathfinding capability returned `false` for diagonal coordinates spanning the toroidal world seam (e.g., from `(mapWidth-1, mapHeight-1)` to `(0, mapHeight-1)`). While relative `deltaX` and `deltaY` were correctly constrained across seams, the `inBounds` coordinate bounds check occurred *before* absolute coordinates were wrapped, rejecting the out-of-bounds `toX` and `toY` coordinates before they could be resolved to valid wrapped coordinates on the grid.

**Action:** Reordered coordinate logic in `WorldPlane.canTraverse` to wrap absolute `fromX`, `fromY`, `toX`, and `toY` coordinates over bounds first via modulo arithmetic when `wraps = true`. This allows the subsequent bounds check, grid index lookup, passability check, and elevation check to correctly evaluate the wrapped coordinate. The `deltaX` and `deltaY` are still resolved using absolute coordinates first.

**Prevention:** When testing pathfinders or grid algorithms that utilize the toroidal world, ensure differential tests explicitly verify coordinates immediately straddling the boundaries, especially for cross-seam diagonal traversals.
