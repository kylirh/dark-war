import { describe, it, expect } from "vitest";
import { SerializedState, TileType, EntityKind } from "../types";
import {
  computeStateDelta,
  applyStateDelta,
  requiresKeyframe,
} from "./state-delta";

type AnyEntity = SerializedState["entities"][number];

function entity(id: string, x: number, hp = 10): AnyEntity {
  return {
    id,
    kind: EntityKind.MONSTER,
    worldX: x,
    worldY: 0,
    hp,
    type: "RAT",
  } as unknown as AnyEntity;
}
function player(id: string, x: number, hp = 100): SerializedState["player"] {
  return {
    id,
    kind: EntityKind.PLAYER,
    worldX: x,
    worldY: 0,
    hp,
    weapon: 1,
  } as unknown as SerializedState["player"];
}

function baseState(): SerializedState {
  return {
    depth: 1,
    levelKind: "dungeon",
    map: [TileType.WALL, TileType.FLOOR, TileType.FLOOR, TileType.WALL],
    mapWidth: 2,
    mapHeight: 2,
    floorVariant: 0,
    wallSet: "concrete",
    wallDamage: [0, 0, 0, 0],
    stairsDown: [1, 1],
    stairsUp: null,
    player: player("p1", 10),
    players: [player("p1", 10)],
    entities: [player("p1", 10), entity("e1", 5), entity("e2", 7)],
    explored: [0, 1],
    enhancedVision: false,
    godMode: false,
    story: ["hello"],
    sim: { nowTick: 100, mode: "REALTIME", timeScale: 1, targetTimeScale: 1 },
    multiplayer: { mode: "online", localPlayerId: "p1" },
    sounds: [],
    effects: [],
  };
}

/** Apply a computed delta and assert it reconstructs `next` (order-independent). */
function roundTrip(base: SerializedState, next: SerializedState): void {
  const delta = computeStateDelta(base, next, 2, 1);
  const got = applyStateDelta(base, delta);

  const byId = (arr: Array<{ id: string }>) =>
    new Map(arr.map((o) => [o.id, JSON.stringify(o)]));
  for (const key of ["entities", "players"] as const) {
    expect(byId(got[key] as Array<{ id: string }>)).toEqual(
      byId(next[key] as Array<{ id: string }>),
    );
  }
  expect(new Set(got.explored)).toEqual(new Set(next.explored));

  const strip = (s: SerializedState) => {
    const { entities, players, explored, ...rest } = s;
    void entities;
    void players;
    void explored;
    return rest;
  };
  expect(strip(got)).toEqual(strip(next));
}

describe("computeStateDelta / applyStateDelta", () => {
  it("round-trips an unchanged state", () => {
    roundTrip(baseState(), baseState());
  });

  it("round-trips a moved/damaged entity", () => {
    const next = baseState();
    next.entities[1] = entity("e1", 6, 8);
    next.sim = { ...next.sim, nowTick: 101 };
    roundTrip(baseState(), next);
  });

  it("round-trips entity add and removal", () => {
    const next = baseState();
    next.entities = [player("p1", 10), entity("e2", 7), entity("e3", 9)];
    roundTrip(baseState(), next);
  });

  it("round-trips local player movement", () => {
    const next = baseState();
    next.player = player("p1", 12);
    next.players = [player("p1", 12)];
    roundTrip(baseState(), next);
  });

  it("round-trips explored growth", () => {
    const next = baseState();
    next.explored = [0, 1, 2, 3];
    roundTrip(baseState(), next);
  });

  it("round-trips map and wall-damage changes", () => {
    const next = baseState();
    next.map = [TileType.WALL, TileType.FLOOR, TileType.HOLE, TileType.WALL];
    next.wallDamage = [0, 0, 0, 2];
    roundTrip(baseState(), next);
  });

  it("round-trips scalar changes", () => {
    const next = baseState();
    next.godMode = true;
    next.floorVariant = 2;
    next.story = ["new", "hello"];
    roundTrip(baseState(), next);
  });

  it("round-trips a joining player", () => {
    const next = baseState();
    next.players = [player("p1", 10), player("p2", 20)];
    next.entities = [...baseState().entities, player("p2", 20)];
    roundTrip(baseState(), next);
  });

  it("omits unchanged fields from the delta", () => {
    const next = baseState();
    next.entities[1] = entity("e1", 6);
    const delta = computeStateDelta(baseState(), next, 2, 1);
    expect(delta.mapChanges).toBeUndefined();
    expect(delta.entitiesRemoved).toBeUndefined();
    expect(delta.entitiesUpserted).toHaveLength(1);
    expect(delta.baseSeq).toBe(1);
    expect(delta.seq).toBe(2);
  });
});

describe("requiresKeyframe", () => {
  it("requires a keyframe when depth changes", () => {
    const next = baseState();
    next.depth = 2;
    expect(requiresKeyframe(baseState(), next)).toBe(true);
  });

  it("requires a keyframe when the map length changes", () => {
    const next = baseState();
    next.map = [TileType.FLOOR];
    expect(requiresKeyframe(baseState(), next)).toBe(true);
  });

  it("does not require a keyframe for same-shape changes", () => {
    const next = baseState();
    next.entities[1] = entity("e1", 6);
    expect(requiresKeyframe(baseState(), next)).toBe(false);
  });
});
