## 2024-11-20 - Enforce orthogonal movement in world planes

**What was found:** `WorldPlane.canTraverse` in `src/engine/core/world-plane.ts` incorrectly permitted diagonal movement when `Math.max(Math.abs(deltaX), Math.abs(deltaY)) === 1` was evaluated.

**Action:** Replaced the condition with `Math.abs(deltaX) + Math.abs(deltaY) !== 1` to strictly enforce orthogonal traversals (Manhattan distance of 1). Added explicit tests to `src/engine/core/world-plane.test.ts` to assert that diagonal traversals are correctly rejected while orthogonal ones are accepted.

**Prevention:** Ensure that grid-based distance checks meant to restrict to strictly adjacent cells use Manhattan distance (or an explicit check against exactly 1 in either X or Y, with 0 in the other) rather than Chebyshev distance (which allows diagonals).
