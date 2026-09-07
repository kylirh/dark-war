
## 2024-05-18 - Fix coordinate wrapping destruction in WorldPlane.canTraverse

**What was found:** The `canTraverse` method for the world grid computed distance checks by mapping wrap coordinates into bounds via modulo math, which destroyed their relative spatial relationships across the seam and created logic bugs for distances.

**Action:** Calculated `deltaX` and `deltaY` *before* wrapping coordinates, so they accurately reflect distance and direction across the toroid, and then applied modulo math to fix out of bounds lookups.

**Prevention:** When dealing with wrap-around boundaries, always evaluate the delta logic first before bounding coordinates to array bounds.
