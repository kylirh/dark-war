/**
 * State delta encoding for multiplayer broadcasts.
 *
 * The server serializes the full authoritative `SerializedState` for each
 * player every tick (as it always has). Instead of sending that whole blob
 * 20×/sec, it diffs the new state against a per-client baseline and sends
 * only what changed. The client applies the delta onto its own baseline to
 * reconstruct an identical full `SerializedState`, then hands it to the
 * existing `Game.deserialize()` path — so the delta layer is purely a
 * transport optimization and both ends keep working with whole states.
 *
 * Transport is WebSocket (ordered, reliable), so deltas never arrive out of
 * order or get dropped. The only divergence risk is a bug in apply; periodic
 * keyframes (`state_full`) re-baseline and self-heal.
 *
 * Big static fields (`map`, `wallDamage`, `levels`, depth/level descriptors)
 * are only re-sent when they actually change. A change in map length or depth
 * means a level transition, which forces a fresh keyframe rather than a delta.
 */

import {
  SerializedState,
  Player,
  Entity,
  Effect,
  LevelKind,
  WallSet,
  TileType,
} from "../types";

export interface StateDelta {
  /** Monotonic id of this delta (per client). */
  seq: number;
  /** Baseline seq this delta must be applied onto. */
  baseSeq: number;

  // Whole-value fields, present only when changed since the baseline.
  depth?: number;
  levelKind?: LevelKind;
  floorVariant?: number;
  wallSet?: WallSet;
  stairsDown?: [number, number];
  stairsUp?: [number, number] | null;
  enhancedVision?: boolean;
  godMode?: boolean;
  player?: Player;
  story?: string[];
  multiplayer?: SerializedState["multiplayer"];
  // `sim`, `effects` and `sounds` are tiny / ephemeral and always sent.
  sim: SerializedState["sim"];
  effects: Effect[];
  sounds: string[];

  // Array sub-diffs.
  entitiesUpserted?: Entity[];
  entitiesRemoved?: string[];
  playersUpserted?: Player[];
  playersRemoved?: string[];
  exploredAdded?: number[];
  exploredFull?: number[]; // sent instead of `added` when the set shrank
  mapChanges?: Array<[number, TileType]>;
  wallDamageChanges?: Array<[number, number]>;
}

/** True when the structural shape changed enough to require a keyframe. */
export function requiresKeyframe(
  base: SerializedState,
  next: SerializedState,
): boolean {
  return (
    base.depth !== next.depth ||
    base.map.length !== next.map.length ||
    (base.wallDamage?.length ?? 0) !== (next.wallDamage?.length ?? 0)
  );
}

export function computeStateDelta(
  base: SerializedState,
  next: SerializedState,
  seq: number,
  baseSeq: number,
): StateDelta {
  const delta: StateDelta = {
    seq,
    baseSeq,
    sim: next.sim,
    effects: next.effects ?? [],
    sounds: next.sounds ?? [],
  };

  if (base.depth !== next.depth) delta.depth = next.depth;
  if (base.levelKind !== next.levelKind) delta.levelKind = next.levelKind;
  if (base.floorVariant !== next.floorVariant) delta.floorVariant = next.floorVariant;
  if (base.wallSet !== next.wallSet) delta.wallSet = next.wallSet;
  if (!pairEqual(base.stairsDown, next.stairsDown)) delta.stairsDown = next.stairsDown;
  if (!pairEqual(base.stairsUp ?? null, next.stairsUp ?? null)) {
    delta.stairsUp = next.stairsUp ?? null;
  }
  if (base.enhancedVision !== next.enhancedVision) delta.enhancedVision = next.enhancedVision;
  if (base.godMode !== next.godMode) delta.godMode = next.godMode;
  if (!shallowJsonEqual(base.player, next.player)) delta.player = next.player;
  if (!arraysEqual(base.story, next.story)) delta.story = next.story;
  if (!shallowJsonEqual(base.multiplayer, next.multiplayer)) {
    delta.multiplayer = next.multiplayer;
  }

  const entityDiff = diffById(base.entities ?? [], next.entities ?? []);
  if (entityDiff.upserted.length > 0) delta.entitiesUpserted = entityDiff.upserted;
  if (entityDiff.removed.length > 0) delta.entitiesRemoved = entityDiff.removed;

  const playerDiff = diffById(base.players ?? [], next.players ?? []);
  if (playerDiff.upserted.length > 0) delta.playersUpserted = playerDiff.upserted as Player[];
  if (playerDiff.removed.length > 0) delta.playersRemoved = playerDiff.removed;

  const exploredDiff = diffExplored(base.explored ?? [], next.explored ?? []);
  if (exploredDiff.full) delta.exploredFull = next.explored ?? [];
  else if (exploredDiff.added.length > 0) delta.exploredAdded = exploredDiff.added;

  const mapChanges = diffIndexed(base.map, next.map);
  if (mapChanges.length > 0) delta.mapChanges = mapChanges as Array<[number, TileType]>;

  if (base.wallDamage && next.wallDamage) {
    const wallChanges = diffIndexed(base.wallDamage, next.wallDamage);
    if (wallChanges.length > 0) delta.wallDamageChanges = wallChanges;
  }

  return delta;
}

export function applyStateDelta(
  base: SerializedState,
  delta: StateDelta,
): SerializedState {
  const next: SerializedState = {
    ...base,
    sim: delta.sim,
    effects: delta.effects,
    sounds: delta.sounds,
  };

  if (delta.depth !== undefined) next.depth = delta.depth;
  if (delta.levelKind !== undefined) next.levelKind = delta.levelKind;
  if (delta.floorVariant !== undefined) next.floorVariant = delta.floorVariant;
  if (delta.wallSet !== undefined) next.wallSet = delta.wallSet;
  if (delta.stairsDown !== undefined) next.stairsDown = delta.stairsDown;
  if (delta.stairsUp !== undefined) next.stairsUp = delta.stairsUp;
  if (delta.enhancedVision !== undefined) next.enhancedVision = delta.enhancedVision;
  if (delta.godMode !== undefined) next.godMode = delta.godMode;
  if (delta.player !== undefined) next.player = delta.player;
  if (delta.story !== undefined) next.story = delta.story;
  if (delta.multiplayer !== undefined) next.multiplayer = delta.multiplayer;

  if (delta.entitiesUpserted || delta.entitiesRemoved) {
    next.entities = applyById(
      base.entities ?? [],
      delta.entitiesUpserted,
      delta.entitiesRemoved,
    );
  }
  if (delta.playersUpserted || delta.playersRemoved) {
    next.players = applyById(
      base.players ?? [],
      delta.playersUpserted,
      delta.playersRemoved,
    ) as Player[];
  }

  if (delta.exploredFull !== undefined) {
    next.explored = delta.exploredFull;
  } else if (delta.exploredAdded && delta.exploredAdded.length > 0) {
    next.explored = [...(base.explored ?? []), ...delta.exploredAdded];
  }

  if (delta.mapChanges && delta.mapChanges.length > 0) {
    const map = base.map.slice();
    for (const [index, value] of delta.mapChanges) map[index] = value;
    next.map = map;
  }

  if (delta.wallDamageChanges && delta.wallDamageChanges.length > 0 && base.wallDamage) {
    const wallDamage = base.wallDamage.slice();
    for (const [index, value] of delta.wallDamageChanges) wallDamage[index] = value;
    next.wallDamage = wallDamage;
  }

  return next;
}

// ─── Diff helpers ────────────────────────────────────────────────────────────

function diffById(
  base: Entity[],
  next: Entity[],
): { upserted: Entity[]; removed: string[] } {
  const baseById = new Map<string, Entity>();
  for (const entity of base) baseById.set(entity.id, entity);
  const nextIds = new Set<string>();

  const upserted: Entity[] = [];
  for (const entity of next) {
    nextIds.add(entity.id);
    const prior = baseById.get(entity.id);
    if (!prior || !shallowJsonEqual(prior, entity)) upserted.push(entity);
  }

  const removed: string[] = [];
  for (const entity of base) {
    if (!nextIds.has(entity.id)) removed.push(entity.id);
  }

  return { upserted, removed };
}

function applyById(
  base: Entity[],
  upserted: Entity[] | undefined,
  removed: string[] | undefined,
): Entity[] {
  const byId = new Map<string, Entity>();
  for (const entity of base) byId.set(entity.id, entity);
  if (removed) for (const id of removed) byId.delete(id);
  if (upserted) for (const entity of upserted) byId.set(entity.id, entity);
  return Array.from(byId.values());
}

function diffExplored(
  base: number[],
  next: number[],
): { added: number[]; full: boolean } {
  const baseSet = new Set(base);
  const added: number[] = [];
  for (const index of next) {
    if (!baseSet.has(index)) added.push(index);
  }
  // If the set shrank (e.g. a level swap that didn't trip the keyframe path)
  // we can't express it as additions — fall back to sending the whole set.
  const full = next.length < base.length;
  return { added, full };
}

function diffIndexed(
  base: number[],
  next: number[],
): Array<[number, number]> {
  const changes: Array<[number, number]> = [];
  for (let i = 0; i < next.length; i++) {
    if (next[i] !== base[i]) changes.push([i, next[i]]);
  }
  return changes;
}

function pairEqual(
  a: [number, number] | null,
  b: [number, number] | null,
): boolean {
  if (a === null || b === null) return a === b;
  return a[0] === b[0] && a[1] === b[1];
}

function arraysEqual<T>(a: T[] | undefined, b: T[] | undefined): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function shallowJsonEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
