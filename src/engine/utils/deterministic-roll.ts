/**
 * Stateless keyed deterministic rolls.
 *
 * Unlike `RandomNumberGenerator` (a mutable SFC32 stream), a keyed roll has no
 * internal state: the same key always yields the same value, and the value
 * depends only on the key fields — never on call order or how many rolls came
 * before. That makes actor decisions reproducible across save/load and identical
 * on every peer in multiplayer, and it makes them easy to debug (you can compute
 * any single roll in isolation).
 *
 * The key must fully identify the decision:
 *
 * - `simulationSeed` — the durable per-game seed on `GameState`.
 * - `actorStableId`  — a stable identity for the deciding actor.
 * - `decisionEpoch`  — a persisted per-actor counter, NOT the raw tick. Advance
 *                      (and persist) it only when a decision's advancement should
 *                      affect future behavior.
 * - `purpose`        — a distinct string per decision kind, so adding a cosmetic
 *                      roll (e.g. "idle-bark") can never perturb an existing one
 *                      (e.g. "choose-target").
 * - `ordinal`        — index within a batch of rolls sharing the other fields.
 *
 * Never consume a roll merely because rendering occurred; rolls are a function of
 * simulation state only.
 */

export interface RollKey {
  readonly simulationSeed: number;
  readonly actorStableId: string;
  readonly decisionEpoch: number;
  readonly purpose: string;
  readonly ordinal?: number;
}

/** Mix a 32-bit value into the accumulator (murmur3-style). */
function fold32(acc: number, value: number): number {
  let k = Math.imul(value | 0, 0xcc9e2d51);
  k = (k << 15) | (k >>> 17);
  k = Math.imul(k, 0x1b873593);
  let h = acc ^ k;
  h = (h << 13) | (h >>> 19);
  return (Math.imul(h, 5) + 0xe6546b64) | 0;
}

/** Fold a string in a length-prefixed, order-stable way. */
function foldString(acc: number, s: string): number {
  let h = fold32(acc, s.length);
  for (let i = 0; i < s.length; i++) h = fold32(h, s.charCodeAt(i));
  return h;
}

/** murmur3 finalizer — avalanche the accumulated hash. */
function finalize32(h: number): number {
  let x = h;
  x ^= x >>> 16;
  x = Math.imul(x, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return x >>> 0;
}

/** Hash a roll key to an unsigned 32-bit integer. */
export function deterministicHash(key: RollKey): number {
  let h = 0x9e3779b1 | 0;
  h = fold32(h, key.simulationSeed | 0);
  h = foldString(h, key.actorStableId);
  h = fold32(h, key.decisionEpoch | 0);
  h = foldString(h, key.purpose);
  h = fold32(h, (key.ordinal ?? 0) | 0);
  return finalize32(h);
}

/** Deterministic float in [0, 1) for the given key. */
export function deterministicUnit(key: RollKey): number {
  return deterministicHash(key) / 4294967296;
}

/** Deterministic integer in [0, n) for the given key. */
export function deterministicInt(key: RollKey, n: number): number {
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(
      `deterministicInt requires a positive integer, received ${n}`,
    );
  }
  return (deterministicUnit(key) * n) | 0;
}

/** Deterministic true-with-probability-`p` for the given key. */
export function deterministicChance(key: RollKey, p: number): boolean {
  if (p <= 0) return false;
  if (p >= 1) return true;
  return deterministicUnit(key) < p;
}

/** Deterministically choose an element of a non-empty array. */
export function deterministicChoice<T>(key: RollKey, arr: readonly T[]): T {
  if (arr.length === 0) {
    throw new Error("deterministicChoice requires a non-empty array");
  }
  return arr[deterministicInt(key, arr.length)];
}

let seedSequence = 0;

/**
 * Mint a fresh durable simulation seed for a new game. Varied per call and per
 * process (time + a monotonic counter, avalanched) without consuming
 * `Math.random`. Persisted on `GameState.simulationSeed` and restored on load;
 * this is the root of determinism, not a per-tick consumer.
 */
export function createSimulationSeed(): number {
  seedSequence = (seedSequence + 1) | 0;
  let h = (Date.now() & 0xffffffff) >>> 0;
  h ^= Math.imul(seedSequence, 0x9e3779b1);
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}
