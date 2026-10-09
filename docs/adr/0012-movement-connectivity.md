# 0012 - Movement Connectivity

**Status:** Proposed
**Date:** 2026-10-09

## Context

The game's simulation and pathfinding currently support eight-way (Chebyshev) movement. The foundational guard for this is `WorldPlane.canTraverse`, which gates a single step by checking `Math.max(Math.abs(deltaX), Math.abs(deltaY)) !== 1` (allowing diagonals).

The concrete cost of this design is that the predicate looks exactly like an off-by-one error for a standard four-way (Manhattan) adjacency check. As documented in `.jules/world.md` (2026-09-29), contributors have "fixed" this predicate to Manhattan distance (`Math.abs(deltaX) + Math.abs(deltaY) !== 1`) in eleven separate pull requests (#263, #268, #270, #275, #284, #288, #294, #298, #300, #315, and #320). Every one of these PRs passed the test suite because the 8-connected contract lacked a test, and every one was closed because the change silently breaks both the click-to-move and monster pathfinders, which explicitly expand and rely on eight neighbors.

The documentation has since been updated and tests added to pin the Chebyshev behavior (per #296), but the recurring friction points to a deeper architectural question: the codebase natively supports eight-way movement, but its visual grid and terrain rules strongly imply a four-way orthogonal world. If the game is actually meant to be four-directional, the engine should enforce it structurally rather than defending an eight-way predicate against constant "fixes."

## Options

### 1. Do nothing (Maintain Eight-Way Movement)

Keep the current eight-way movement logic. Rely on the recently added tests and TSDoc comments to defend the `canTraverse` predicate against further Manhattan distance "fixes".

**The case for this:** The engine, pathfinding, and AI are already built and tested for eight-way movement. It allows more natural diagonal traversal of open spaces. The cost of contributors misunderstanding the predicate has been mitigated by documentation and test coverage, so the bleeding has stopped without needing to change the gameplay constraints.

**The case against:** It keeps the game in an awkward middle ground where visuals are strictly orthogonal but movement is not. It does not resolve whether Dark War *should* be four-directional, only that its current implementation is eight-directional.

### 2. Switch to Four-Way (Manhattan) Movement

Formally change the game's movement rules to four-way orthogonal (Manhattan) distance. Update `canTraverse`, both pathfinders, and all movement command validations to reject diagonal steps.

**The case for this:** This aligns the game's physics and movement capabilities with its orthogonal visual presentation and tiled nature. It structurally eliminates the confusion around `canTraverse` because the Manhattan distance check is exactly what developers expect to see for grid adjacency. It simplifies pathfinding heuristics and AI movement logic.

**The case against:** Pathfinding will look more robotic as entities zig-zag to reach diagonal destinations. It requires a coordinated rewrite of the click-to-move pathfinder, the monster AI BFS logic, and several test suites to ensure they do not expand diagonal neighbors or expect diagonal traversal.

## Decision

We recommend **Option 2: Switch to Four-Way (Manhattan) Movement**.

While adding tests and documentation has patched the immediate problem of developers breaking `canTraverse`, the sheer volume of PRs (eleven) attempting the exact same "fix" is a strong signal that the codebase's natural affordances point toward orthogonal movement. By changing the rules to match developer expectations and the game's orthogonal visual style, we permanently align the simulation with its presentation.

However, because this is a fundamental gameplay behavior change, the final call on whether diagonal movement is desired belongs to a human designer, not this document.

## Consequences

- **What gets better:** The movement model aligns with the orthogonal terrain and visuals. `canTraverse` becomes the standard Manhattan distance check everyone expects. Pathfinding neighbor expansion simplifies from 8 directions to 4.
- **What gets worse:** Movement across open spaces becomes strictly orthogonal (stair-stepping), which may feel slower or more artificial to players.
- **What becomes harder to change:** Reverting back to 8-way movement later would require restoring the diagonal expansion logic across multiple systems.
- **Migration cost:** Low to Medium. We must change `WorldPlane.canTraverse`, update the directional arrays in `src/engine/utils/helpers.ts` and the pathfinders to only expand 4 neighbors, and rewrite the tests that currently pin the 8-way behavior to instead enforce 4-way constraints.
