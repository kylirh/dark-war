## 2026-09-24 - Event Queue Safety Limits

**What was found:** The simulation system explicitly bounds `MAX_EVENTS_PER_TICK` and `MAX_COMMANDS_PER_TICK` to 1000 to prevent runaway cascades. While replacing these hard limits with real-world time budgets (e.g., 50ms) would dynamically adapt to server load, doing so would fundamentally break the engine's determinism, causing client-side prediction and the server to desync based purely on hardware execution speed.

**Action:** Wrote ADR 0009 proposing to keep the deterministic hard limits and explicitly rejecting time-based execution yielding for the simulation tick.

**Prevention:** Never introduce real-time budgets (`performance.now()`, `Date.now()`) to govern simulation execution flow. A deterministic engine must produce identical outcomes regardless of the hardware it runs on; using elapsed time to truncate a tick violates this and causes irreversible multiplayer desyncs.
