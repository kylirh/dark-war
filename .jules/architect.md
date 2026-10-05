## 2026-10-05 - Engine-to-Host Transition Signals

**What was found:** The `GameState` object contains ephemeral flags (`shouldDescend`, `shouldAscend`, etc.) used exclusively to signal level transitions to the offline host. This design led to a bug (documented in `.jules/bug.md`) where the host acted on these flags even if the player died later in the same tick. It forces the engine to manually cancel these flags on death and pollutes the simulation state with host-specific routing logic.

**Action:** Proposed ADR 0011 recommending the removal of these transition flags from `GameState` in favor of returning transient `HostIntent` signals from the simulation loop.

**Prevention:** When an offline-only routing or presentation signal is needed, return it out-of-band (e.g., as a return value from the tick function) rather than storing it on the canonical `GameState`. Persistent state should not be used as a messaging queue for the host environment. Before claiming a field pollutes serialized state, verify it actually exists in `SerializedState`. Before assuming a field is entirely host-bound, check for intra-tick readers. Always count all consumer sites before estimating migration cost.
