
## 2024-09-23 - Prevent invalid diagonal traversals

**What was found:** The `canTraverse` utility in `WorldPlane` used `Math.max(Math.abs(deltaX), Math.abs(deltaY)) !== 1` to assert that traversals must be limited to exactly 1 tile. However, this logic incorrectly allowed diagonal movements since moving 1 tile diagonally yields `Math.max(1, 1) === 1`.

**Action:** Modified the verification in `canTraverse` to use Manhattan distance (`Math.abs(deltaX) + Math.abs(deltaY) !== 1`). Added a unit test validating that diagonal traversals correctly return `false`.

**Prevention:** When enforcing strict orthogonal single-step boundaries in grid environments, ensure coordinates are verified using Manhattan distances (sum of absolute deltas) rather than maximum bounds, as the latter allows unbounded diagonal creep.
