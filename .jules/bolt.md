
## Performance Optimization

* The `EntityManager` maintains a dedicated `items: Item[]` index. Use `state.entityManager.items` for item lookups rather than filtering the full `state.entities` array to avoid O(N) complexity.
