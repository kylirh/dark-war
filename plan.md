1. Add a test in `src/engine/systems/simulation/pickup.test.ts` to assert that damage from explosions (`fromExplosion: true`) bypasses armor damage reduction.
    - Test will create a player with armor, deal damage with `fromExplosion: true`, and assert that the damage taken equals the raw incoming damage (no armor reduction).
2. Complete pre-commit steps to ensure proper testing, verification, review, and reflection are done.
3. Submit the change.
