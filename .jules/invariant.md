## 2024-06-21 - Multiplayer exploration sync failure

**What was found:** The `exploredByPlayer` object (which tracks the map tiles seen by each player individually) was left out of the network state delta logic (`StateDelta`). As a result, new map explorations were not being correctly synchronized over multiplayer network, breaking a core invariance assumption (delta compression fidelity).

**Action:** Updated `StateDelta` to track `exploredByPlayer`, computed the diff using `shallowJsonEqual`, applied the diff during reconstruction, and added a test to ensure round-trip correctness.

**Prevention:** Future implementations involving delta fields sync should be extremely careful to test properties end to end to ensure round-trip integrity, especially when large changes to objects occur (such as replacing array representations with mapped representation for individual users).
