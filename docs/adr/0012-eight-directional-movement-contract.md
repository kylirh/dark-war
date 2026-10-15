# 0012 - Eight-Directional Movement Contract

**Status:** Proposed
**Date:** 2026-10-15

## Context

In `WorldPlane.canTraverse`, single-step traversals are gated by checking `Math.max(Math.abs(deltaX), Math.abs(deltaY)) === 1`. This allows for eight-directional movement (Chebyshev distance of 1). However, because this looks visually similar to an off-by-one error for a Manhattan distance check, contributors frequently "fix" it to `Math.abs(deltaX) + Math.abs(deltaY) === 1`.

This has imposed a severe, recurring cost in code review. According to `.jules/world.md` (2026-09-29), this exact change has been proposed and closed in eleven separate pull requests (#263, #268, #270, #275, #284, #288, #294, #298, #300, #315, and #320). Because there was no test enforcing the eight-directional contract, the narrowed Manhattan predicate passed the full test suite, leading contributors to believe their "fix" was safe. The core architectural question remains: should Dark War support eight-way diagonal movement, or should it be strictly four-directional?

## Options

### 1. Enforce Four-Directional (Manhattan) Movement

Change the traversal predicate to strictly orthogonal movement (Manhattan distance of 1) and update the two pathfinding systems (`click-to-move` and `ai.ts`) to only expand the four cardinal neighbors.

**The case for this:** It simplifies collision and corner-cutting logic. Many classic grid-based games restrict movement to four directions to make spatial reasoning clearer for the player. It permanently eliminates the confusing Chebyshev check, stopping the stream of "fix" pull requests.

**The case against:** It fundamentally alters the feel of the game and how entities navigate open spaces, making traversal feel more rigid. It requires re-tuning movement speeds and AI pathing.

### 2. Maintain Eight-Directional (Chebyshev) Movement (Status Quo)

Keep the existing Chebyshev distance check. Treat the eight-directional movement as the intended design.

**The case for this:** Both the `click-to-move` pathfinder and the monster AI pathfinder are already built around an eight-neighbor expansion. The game was designed for fluid, 8-way traversal. The recurring pull requests are a symptom of a missing test, not a design flaw.

## Decision

We recommend **Option 2: Maintain Eight-Directional (Chebyshev) Movement**.

The game's systems—including AI and click-to-move pathfinding—were explicitly designed around eight-way movement. While the visual similarity to an off-by-one error caused repeated churn, changing the entire movement system to four-directional just to appease readers of one predicate is an overreaction.

## Consequences

- **What gets better:** The game retains its fluid diagonal movement and pathfinding.
- **What gets worse:** Developers reading `canTraverse` for the first time may still briefly mistake it for a bug.
- **What becomes harder to change:** Any future features relying on strict orthogonal alignment (like some types of pushable block puzzles) will need custom logic instead of relying on the global traversal rule.
- **Migration cost:** Zero. The engine already implements this.
