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

## 2024-05-18 - Fix missed propagation of visual neighborhood updates when setting a tile

**What was found:** `WorldPlane.setTile` correctly refreshes the visual neighborhood (e.g. autotiling) for clients when a semantic tile changes, but it doesn't return the array of modified indices to the caller. This causes `setStateTile` to only capture the direct cell being edited instead of all the changed tiles, leading to visually out-of-sync clients in multiplayer where the deltas don't include those visually-dirty autotiled neighboring cells.

**Action:** Modified `TileSource.setTile` to return `void | readonly number[]`, returned the modified indices from `WorldPlane.setTile`, and updated `setStateTile` in `src/engine/utils/state-tiles.ts` to iterate over these modified indices and add all of them to `state.changedTiles`. Added a test in `src/engine/core/test_world_diff.test.ts` to cover this behavior.

**Prevention:** Terrain mutation utilities must consistently capture and add all returned indices to `state.changedTiles` to ensure clients correctly sync visual changes that touch neighboring cells.
