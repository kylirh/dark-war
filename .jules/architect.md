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

## 2026-10-11 - main.ts Action Routing

**What was found:** The `src/client/main.ts` file acts as the central router for all player input and network events, leading to a massive 3450+ line file. Almost every user action contains an inline `if (this.isOnlineMode())` branch to coordinate between offline execution on the local game loop and online execution via `MultiplayerClient`.

**Action:** Proposed ADR 0012 recommending the extraction of a `ClientActionRouter` interface with dedicated `OfflineRouter` and `OnlineRouter` implementations to cleanly separate these paths and significantly reduce the bloat and coupling in `main.ts`.

**Prevention:** When implementing new core systems that bridge different operational modes (like offline and online multiplayer), prefer extracting dedicated implementations behind a common interface rather than using inline branching throughout the main presentation or coordination layer.
