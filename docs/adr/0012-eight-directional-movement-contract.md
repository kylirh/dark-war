# 0012 - Eight-Directional Movement Contract

**Status:** Proposed
**Date:** 2026-10-15

## Context

In `WorldPlane.canTraverse` (`src/engine/core/world-plane.ts:183`), single-step traversals are gated by `if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) !== 1) return false;` — a Chebyshev neighbourhood, so all four diagonals are traversable. Because this looks visually similar to an off-by-one error for a Manhattan check, contributors repeatedly "fix" it to `Math.abs(deltaX) + Math.abs(deltaY) !== 1`.

This has imposed a severe, recurring cost in code review. The same edit has been proposed and closed unmerged **thirteen** times: #263, #268, #270, #275, #284, #288, #294, #298, #300, #315, #317, #320, and #324. (`.jules/world.md`'s 2026-09-29 entry counts eleven of these; #317 is absent from that list and #324 arrived the day after it was written.) Several were character-for-character identical.

The cause was a coverage gap, not a disagreement. Through #324 the eight-directional contract had no test, so the narrowed Manhattan predicate was green on the full suite and every one of those pull requests could truthfully report "npm test passed". That gap is now closed — three tests fail under the Manhattan edit:

- `world-plane.test.ts` — "allows all four diagonal neighbours on level ground"
- `pathfinding.test.ts` — "cuts straight across open ground instead of stepping around"
- `pathfinding.test.ts` — "uses a diagonal step to round a corner"

No further proposal has arrived since #324 closed on 2026-09-30, so the churn appears to have stopped at the source. What the tests cannot say is _why_ eight-way movement is wanted — they fail the edit without stating the intent behind it, which is what this record is for. The architectural question itself is unchanged: should Dark War support eight-way diagonal movement, or should it be strictly four-directional?

## Options

### 1. Enforce Four-Directional (Manhattan) Movement

Change the traversal predicate to strictly orthogonal movement (Manhattan distance of 1) and update the two pathfinding systems (`click-to-move` and `ai.ts`) to only expand the four cardinal neighbors.

**The case for this:** It simplifies collision and corner-cutting logic. Many classic grid-based games restrict movement to four directions to make spatial reasoning clearer for the player. It permanently eliminates the confusing Chebyshev check — though the three tests above already stop the "fix" pull requests at CI, so that is no longer a reason on its own.

**The case against:** It fundamentally alters the feel of the game and how entities navigate open spaces, making traversal feel more rigid. It requires re-tuning movement speeds and AI pathing.

### 2. Maintain Eight-Directional (Chebyshev) Movement (Status Quo)

Keep the existing Chebyshev distance check. Treat the eight-directional movement as the intended design.

**The case for this:** Both pathfinders are already built around an eight-neighbour expansion over the shared `EIGHT_WAY_DIRECTIONS` offsets — `src/engine/utils/pathfinding.ts:86` (click-to-move) and `src/engine/systems/simulation/ai.ts:133` (monster pathing) — and gate every step on `canTraverse`. Narrowing the predicate makes all four diagonals return `false`, silently turning both four-directional. The game was designed for fluid, 8-way traversal; the recurring pull requests were a symptom of a missing test, not a design flaw.

## Decision

We recommend **Option 2: Maintain Eight-Directional (Chebyshev) Movement**.

The game's systems—including AI and click-to-move pathfinding—were explicitly designed around eight-way movement. While the visual similarity to an off-by-one error caused repeated churn, changing the entire movement system to four-directional just to appease readers of one predicate is an overreaction.

## Consequences

- **What gets better:** The game retains its fluid diagonal movement and pathfinding.
- **What gets worse:** Developers reading `canTraverse` for the first time may still briefly mistake it for a bug. The cost is now bounded by CI rather than by review, but it is not zero.
- **What becomes harder to change:** Any future features relying on strict orthogonal alignment (like some types of pushable block puzzles) will need custom logic instead of relying on the global traversal rule.
- **Migration cost:** Zero. The engine already implements this.
