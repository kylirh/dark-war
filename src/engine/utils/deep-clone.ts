/**
 * Deliberate structural deep clone for serialization DTOs.
 *
 * Serialized state (entities, components, relationship snapshots) must share no
 * mutable references with live game state — otherwise a delta baseline aliases
 * live objects, in-place mutation silently rewrites the baseline, and the change
 * disappears from the diff, desyncing clients.
 *
 * This clones plain JSON-shaped data (primitives, arrays, plain objects) plus
 * `Map`/`Set`. It is NOT a lossy `JSON.parse(JSON.stringify(...))` round-trip:
 * `undefined` values and container types are preserved. It intentionally does
 * not clone class instances or functions — serialization DTOs are plain data.
 */
export function deepCloneSerializable<T>(value: T): T {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => deepCloneSerializable(item)) as unknown as T;
  }
  if (value instanceof Map) {
    const out = new Map();
    for (const [k, v] of value.entries()) {
      out.set(deepCloneSerializable(k), deepCloneSerializable(v));
    }
    return out as unknown as T;
  }
  if (value instanceof Set) {
    const out = new Set();
    for (const item of value.values()) {
      out.add(deepCloneSerializable(item));
    }
    return out as unknown as T;
  }
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value as object)) {
    out[key] = deepCloneSerializable((value as Record<string, unknown>)[key]);
  }
  return out as T;
}
