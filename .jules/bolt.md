## 2024-05-24 - O(n) array splicing during map generation
**Learning:** During map generation, `freeTiles.splice` was being used in a loop to remove used tiles. This is an O(n) operation per item spawned, resulting in a large bottleneck when thousands of tiles and many entities are involved.
**Action:** Replaced `splice` with a swap-and-pop approach (swap element to remove with the last element, then pop the array), transforming it into an O(1) operation.
