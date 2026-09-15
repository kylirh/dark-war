
## 2024-05-24 - Orthogonal traversal enforcement

**What was found:** The adjacency check in `WorldPlane.canTraverse` for evaluating single-step movement validity was calculating Chebyshev distance (`Math.max(Math.abs(deltaX), Math.abs(deltaY)) === 1`), which incorrectly allowed diagonal movement and visual traversal validations across corners.

**Action:** Replaced the Chebyshev distance check with a Manhattan distance check (`Math.abs(deltaX) + Math.abs(deltaY) === 1`). This explicitly enforces strictly orthogonal (4-way) adjacency for all world plane traversal validation, which matches the engine's design rules. A new focused test was added to verify rejection of diagonal traversals.

**Prevention:** Future implementations involving grid adjacency, reachability, or traversability should consistently apply Manhattan distance rules unless a specific exception is documented for 8-way algorithms like A*.
