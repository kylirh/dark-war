## 2026-10-30 - sync visual neighborhood updates from semantic edits

**What was found:** `state.changedTiles` misses visually dirty indices after semantic edit. A semantic edit invalidates its 3x3 neighborhood which produces visual state mismatches between client and server unless properly synced.

**Action:** `setStateTile` calls `tileSource?.setTile` but previously only recorded the exact grid cell modified. Altered `TileSource.setTile` to return `readonly number[] | void` and `WorldPlane.setTile` to explicitly return `refreshNeighborhood(x, y)` which `setStateTile` handles by iterating over indices.

**Prevention:** Terrain mutation utilities (like `setStateTile`) must capture and add all returned indices to `state.changedTiles` to ensure clients correctly sync these visual changes.
