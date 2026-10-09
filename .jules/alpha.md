## 2026-10-09 - Reject rest interruption on non-WAIT commands

**What was found:** A proposal was made to interrupt resting when a player issues a non-WAIT command (like MOVE), claiming that ignoring the command without waking violated the contract and risked leaking REST_TIME_SCALE.

**Action:** The proposal was rejected. As per docs/HEALTH-AND-REST.md, only damage or the wake command (WAIT) interrupts rest. Silently ignoring other commands is the intended behavior, preventing accidental rest cancellation. There is also no timescale leak, as stopPlayerResting correctly resets the time scale synchronously.

**Prevention:** Do not propose changing the rest interruption behavior to include non-WAIT commands. The current implementation (ignoring the command and maintaining rest) is a deliberate pacing decision documented in HEALTH-AND-REST.md, not a defect.
