## 2026-09-16 - Add test for magnetic pickup item event emission

**What was found:** The `processMagneticPickup` logic in `src/engine/systems/simulation/tick.ts` lacked a behavioral test ensuring that a `PICKUP_ITEM` event is emitted correctly when an item moves within the collection radius.

**Action:** Added a dedicated behavioral test for `processMagneticPickup` in `src/engine/systems/simulation/tick.test.ts`. The test verifies that when a player moves close to an item within `MAGNET_COLLECT_RADIUS`, the item is processed and collected correctly without being permanently destroyed, pushing the right `PICKUP_ITEM` event to the `eventQueue` which resolves during the tick processing.

**Prevention:** Ensure that engine events, especially logic that couples entity interactions (like item collection based on bounding radii) are thoroughly tested so future behavioral changes do not inadvertently stop events from firing.
