
## 2025-02-12 - Players do not fall into pre-existing holes

**What was found:**
The simulation logic for `processHoleFalls` successfully checked if players moved into newly created holes, but entirely lacked the logic to check if players stepped on *pre-existing* holes, meaning players could safely traverse any existing holes in a level.

**Action:**
Added the missing logic within `processHoleFalls` to check `movedOntoHole` for players and trigger a fall (100% chance, similar to new holes), along with a test `hole-falls.test.ts` to assert that players fall into pre-existing holes upon stepping onto them.

**Prevention:**
Always evaluate boundary conditions for entities interacting with the terrain. When handling collision logic (e.g. holes, spikes), ensure both new tiles and pre-existing tiles are checked for active entities.
