## 2024-09-14 - Fix wrapped distance checking in world-plane

**What was found:** The `WorldPlane.canTraverse()` method was incorrectly computing wrapped deltas (by conditionally subtracting `width` or `height` from the simple delta based on its sign), which calculated incorrect results on toroidal seams. Furthermore, it utilized Chebyshev distance (`Math.max`) instead of Manhattan distance (`Math.abs(deltaX) + Math.abs(deltaY) === 1`) to validate 1-step cardinal moves, which errantly permitted diagonal traversals.

**Action:** Replaced the bespoke wrapping logic in `canTraverse()` with the correct `wrapDelta` utility from `src/engine/utils/wrap.ts`, and constrained the single-step traversal check strictly to Manhattan distance. Added test assertions in `world-plane.test.ts` to assert that correct wrapping traversals succeed while diagonal wrapping traversals fail.

**Prevention:** Remember that when evaluating cell traversals in orthogonal grids, Manhattan distance (`Math.abs(deltaX) + Math.abs(deltaY)`) must be used over Chebyshev distance (`Math.max(Math.abs(deltaX), Math.abs(deltaY))`) to correctly disallow diagonal traversal. Furthermore, rely on centralized wrapping math libraries (`wrapDelta`) for seam boundaries rather than inlining complex wrap modulo logic.
