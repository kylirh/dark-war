## 2024-11-20 - Allow wrapped canTraverse checks to span the seam

**What was found:** Entities could not traverse across the wrapping boundary of the outside world, because the `WorldPlane.canTraverse` method rejected paths out of bounds (`this.inBounds(fromX, fromY)`) before correctly resolving them with the modular arithmetic afforded by `wraps`.
**Action:** Used modulo coordinates for the bound-check and index retrievals strictly when `wraps` is true, permitting wrapping movement around the toroidal outside world while preventing genuinely out-of-bounds inputs. Added extensive test coverage in `world-plane.test.ts`.
**Prevention:** Always verify coordinate transformations early on when applying a `wraps` flag to authoritative grid access methods, as index fetches will fail or reject valid bounds otherwise.
