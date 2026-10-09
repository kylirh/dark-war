## 2026-10-05 - Engine-to-Host Transition Signals

**What was found:** The `GameState` object contains ephemeral flags (`shouldDescend`, `shouldAscend`, etc.) used exclusively to signal level transitions to the offline host. This design led to a bug (documented in `.jules/bug.md`) where the host acted on these flags even if the player died later in the same tick. It forces the engine to manually cancel these flags on death and pollutes the simulation state with host-specific routing logic.

**Action:** Proposed ADR 0011 recommending the removal of these transition flags from `GameState` in favor of returning transient `HostIntent` signals from the simulation loop.

**Prevention:** When an offline-only routing or presentation signal is needed, return it out-of-band (e.g., as a return value from the tick function) rather than storing it on the canonical `GameState`. Persistent state should not be used as a messaging queue for the host environment.

**Corrected during review:** the ADR as first written claimed that removing the
flags would stop them "polluting the serialized state". None of the four is in
`SerializedState`, so there is no save- or wire-format gain; the cost is
in-memory only. It also missed that `shouldDescend` has an _intra-tick_ reader
(`tick.ts:462`, the `processHoleFalls` guard), which an end-of-tick intent
cannot serve, so the recommended option keeps an internal marker rather than
removing the flag. And the offline host consumes the flags at two sites in
`main.ts`, not one. Verify which fields are serialized and count every reader
before claiming a field is purely host-bound.

## 2026-10-09 - Movement Connectivity

**What was found:** The game's pathfinding natively supports 8-way (Chebyshev) movement via `WorldPlane.canTraverse` using `Math.max(Math.abs(deltaX), Math.abs(deltaY)) === 1`. However, because the visual terrain is strictly orthogonal, this code looks like an off-by-one error for Manhattan distance. As a result, developers have repeatedly tried to "fix" it by narrowing it to 4-way distance across eleven separate PRs, which broke diagonal movement but passed tests since the 8-way contract was uncovered.

**Action:** Proposed ADR 0012 recommending changing the game's movement rules to explicitly be 4-way (Manhattan) distance. This aligns the physics with both developer expectations and the game's orthogonal visual presentation.

**Prevention:** When a correct implementation of an engine rule repeatedly causes confusion and leads to repeated, identical, well-intentioned "fixes" from contributors, the root cause is often a mismatch between the system's structural affordances (like its visual presentation) and its mechanics. Consider whether the design itself should be aligned with the expected affordances rather than endlessly defending the counter-intuitive mechanic.
