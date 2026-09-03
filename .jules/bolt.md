## 2026-08-28 - O(N) array scanning for EntityManager

**Learning:** Various simulation systems (commands, AI, events, and conversation) were resolving `Entity` lookups via O(N) `state.entities.find((e) => e.id === someId)` calls. `EntityManager` provides a fast `state.entityManager.getById(id)` lookup mapping.

**Action:** Replaced O(N) ID searches with O(1) Map lookups via `state.entityManager.getById()`.
