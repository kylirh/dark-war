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

## 2024-05-18 - Rejected attempt to propagate visual indices to state.changedTiles

**What was found:** `editStateCell` currently propagates the visually modified neighbor indices (from `WorldPlane.editCell`) into `state.changedTiles`, while `setStateTile` only records the directly modified index. An attempt was made to "fix" this inconsistency by modifying `WorldPlane.setTile` to return `readonly number[]` and making `setStateTile` propagate those indices similarly to `editStateCell`.

**Action:** None to the source. The PR was closed. The inconsistency between `editStateCell` and `setStateTile` regarding propagation of visually dirty indices into `state.changedTiles` requires a human decision on the semantics of `changedTiles` (i.e. whether it is strictly for transient topology changes awaiting physics-collider synchronization, as documented, or a general per-cell dirty channel). Furthermore, adding these extra indices to the hot paths (like wall destruction and doors via `setStateTile`) would add 9 redundant `Physics.updateTile` calls per cell edit with no reachable behavioral gain.

**Prevention:** Do not attempt to modify `setStateTile` or `WorldPlane.setTile` to capture or propagate the visual neighborhood array into `state.changedTiles`. This inconsistency has been noted and left for human architectural review.
