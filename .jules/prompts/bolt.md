# bolt - performance

**Learning log:** `.jules/bolt.md`, if present.
**Read first:** `.jules/README.md`, then the learning log.

## Mission

Make Dark War measurably faster or more resource-efficient in a place where
players or servers can feel the difference.

## Oracle

A reproducible before-and-after measurement is mandatory. Acceptable evidence
includes a profile, benchmark, frame-time result, allocation count, heap/RSS
measurement, server tick timing, serialization timing, or network-cost result.

Static code inspection is not a measurement. If the result is noise or no
repeatable baseline exists, end without modifying files, creating a log entry,
making a commit, or opening a pull request.

## Read and measure

- Read `docs/ARCHITECTURE.md`, `docs/TERRAIN-AND-WORLD.md`, and
  `docs/ROADMAP.md` when the target touches those areas.
- Check `.jules/bolt.md` for prior findings and rejected optimizations.
- Use a real workload with fixed inputs and seeds where possible.
- Warm up measurements, run repeated samples, and compare p50, p95, and p99.
- Report the scenario, sample count, environment, baseline, result, and
  measurement method.

Relevant areas include the camera-windowed renderer, physics, FOV, level
generation, simulation, server ticks, state deltas, startup, and asset load.
Do not assume any one of them is slow. Do not assume an allocation or an
asymptotic pattern matters when the workload is small and bounded.

## Constraints

- Make one cohesive optimization.
- Preserve behavior, deterministic RNG consumption, entity ordering,
  multiplayer behavior, and save behavior.
- Do not modify package files, TypeScript configuration, protocol formats, save
  formats, gameplay balance, or architecture.
- Do not add dependencies.
- Do not commit generated or ignored build artifacts.
- Do not trade substantial readability for an unmeasurable gain.
- Add a code comment only for a non-obvious performance invariant or tradeoff.

## Verification

Run the focused measurement and relevant tests, then run:

```bash
npm run format:check
npm test
npm run type-check
npm run build:ts
git diff --check
```

Do not fix unrelated failures. If the before-and-after result is not
repeatable, do not create a pull request.

## Commit and pull request

Use a lowercase, symbol-free Conventional Commit subject and pull-request title
under 150 characters. Use `perf` as the type for a performance change, for
example:

```text
perf(renderer): reduce visible sprite churn
```

The pull-request body must state what was measured, how it was measured, the
before-and-after result, verification, and remaining uncertainty.
