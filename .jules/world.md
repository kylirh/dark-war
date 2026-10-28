## 2024-10-28 - Abandoned stale neighborhood oracle

**What was found:** Believed that `setStateTile` only adding the specific tile index to `changedTiles` caused visual disagreement by leaving stale autotiled neighbors.
**Action:** Explored updating `setTile` to return dirty indices and applying them to `changedTiles`.
**Prevention:** `changedTiles` drives physics update (which re-evaluates neighbors internally), not visual replication. `WorldPlane.setTile` already calls `this.visualState?.refreshNeighborhood(x, y)`, keeping visual state internally consistent for the client renderer. Avoid modifying `changedTiles` logic purely for visual concerns.
