# 0012 - Pathfinding Movement Connectivity

**Status:** Proposed
**Date:** 2026-10-09

## Context

Dark War features continuous fluid movement for players, not a grid-locked system. Input is handled with continuous remappable movement with normalized diagonals (as implemented in `src/client/systems/input.ts:336-350`), ensuring diagonal movement speed matches orthogonal speed. Players move freely in float pixel coordinates (`worldX`/`worldY`).

However, pathfinding—specifically click-to-move and the monster BFS AI—is grid-based and relies on `WorldPlane.canTraverse`. This predicate gates a single pathfinding step by checking `Math.max(Math.abs(deltaX), Math.abs(deltaY)) !== 1`, which explicitly allows eight-way (Chebyshev) diagonal movement to match the player's diagonal capability.

This code structurally resembles an off-by-one error for a standard four-way (Manhattan) grid adjacency check. Because the 8-way pathfinding contract was historically untested, contributors "fixed" this predicate to Manhattan distance (`Math.abs(deltaX) + Math.abs(deltaY) !== 1`) across twelve separate pull requests. Every one passed the test suite and broke diagonal pathfinding, creating a mismatch where monsters and click-to-move would become four-directional while keyboard player movement remained continuous and diagonal.

This specific recurrence has been mitigated. As of PR #296, the 8-connected pathfinding contract is pinned by tests in `world-plane.test.ts` and `pathfinding.test.ts`, causing any Manhattan distance modification to loudly fail. The bleeding has stopped.

The remaining open architectural question is whether grid-based pathfinders should continue to use 8-way connectivity to roughly approximate the player's continuous diagonal movement, or if they should be formally restricted to 4-way movement, even if it creates a divergence between player and AI capabilities.

## Options

### 1. Maintain Eight-Way Pathfinding (Status Quo)

Keep `WorldPlane.canTraverse` and the pathfinders 8-connected. Rely on the tests added in #296 to prevent accidental reversions to Manhattan distance.

**The case for this:** It keeps AI and click-to-move capabilities roughly aligned with the player's ability to move diagonally across open spaces. Pathfinding feels more natural because entities don't stair-step to reach diagonal destinations. The cost of contributors misunderstanding the predicate has been definitively solved by test coverage, so no further changes are required to protect the code.

**The case against:** The grid-based nature of the world still strongly implies orthogonal rules to developers reading the code, requiring them to learn that pathfinding is an exception that approximates continuous movement.

### 2. Switch Pathfinding to Four-Way (Manhattan) Movement

Change `WorldPlane.canTraverse` and both pathfinders to explicitly reject diagonal steps, enforcing 4-way Manhattan distance for all grid-based movement.

**The case for this:** It aligns the pathfinding logic exactly with what developers expect to see for grid adjacency. It simplifies the pathfinding heuristic and neighbor expansion from 8 directions to 4.

**The case against:** It creates a direct, observable mismatch between player movement and AI/click-to-move movement. Players will move smoothly along diagonals while monsters and automated paths zig-zag in a stair-step pattern, making enemies easier to kite and automated movement feel robotic. It also requires rewriting the tests that currently pin the 8-way behavior.

## Decision

We document this tension but do not recommend a gameplay change.

The historical cost of the 8-way predicate—the twelve PRs attempting to change it—was a symptom of a test coverage gap, not necessarily a flawed design. Now that #296 has closed that gap, the 8-way pathfinding safely fulfills its purpose: giving grid-bound AI and click-to-move systems the ability to approximate the continuous diagonal movement the player enjoys.

Changing the pathfinders to 4-way movement would resolve a developer expectation mismatch but introduce a player-facing mechanics mismatch. Whether that trade-off is desirable is a fundamental design decision for a human, not a structural problem for this document to settle.

## Consequences

- **What gets better (if Status Quo maintained):** AI and automated movement continue to match the player's diagonal mobility. The test suite successfully defends the design.
- **What gets worse (if Option 2 taken):** AI movement becomes strictly orthogonal (stair-stepping), creating a permanent divergence from the player's continuous diagonal movement.
- **Migration cost (if Option 2 taken):** High. Requires changing `WorldPlane.canTraverse`, updating directional arrays in `src/engine/utils/helpers.ts` and the pathfinders to expand 4 neighbors, rewriting the tests that pin the 8-way behavior, and accepting the gameplay divergence.
