import { describe, it, expect } from "vitest";
import { SerializedState, EntityKind } from "../engine/types";
import {
  FixtureType,
  GroundType,
  StructureType,
} from "../engine/core/world-semantics";
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
    worldSpaceId: "megacorp",
    worldPlaneId: "floor-1",
    levelKind: "dungeon",
    simulationSeed: 12345,
    relationships: [],
    portals: [],
    plane: {
      width: 2,
      height: 2,
      ground: [
        GroundType.FLOOR,
        GroundType.FLOOR,
        GroundType.FLOOR,
        GroundType.FLOOR,
      ],
      structure: [
        StructureType.WALL,
        StructureType.NONE,
        StructureType.NONE,
        StructureType.WALL,
      ],
      fixture: [
        FixtureType.NONE,
        FixtureType.NONE,
        FixtureType.NONE,
        FixtureType.NONE,
      ],
      elevation: [0, 0, 0, 0],
      damage: [0, 0, 0, 0],
    },
    floorVariant: 0,
    wallSet: "concrete",
    stairsDown: [1, 1],
    stairsUp: null,
    player: player("p1", 10),
    players: [player("p1", 10)],
    entities: [player("p1", 10), entity("e1", 5), entity("e2", 7)],
    explored: [0, 1],
    exploredByPlayer: { p1: [0, 1] },
    enhancedVision: false,
    godMode: false,
    story: ["hello"],
    levels: [],
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

  it("round-trips changes in every world-plane layer", () => {
    const next = baseState();
    next.plane.ground[0] = GroundType.WATER_SHALLOW;
    next.plane.structure[1] = StructureType.WALL;
    next.plane.fixture[2] = FixtureType.STAIRS_DOWN;
    next.plane.elevation[2] = 3;
    next.plane.damage[3] = 2;
    roundTrip(baseState(), next);
  });

  it("round-trips scalar changes", () => {
    const next = baseState();
    next.godMode = true;
    next.floorVariant = 2;
    next.story = ["new", "hello"];
    roundTrip(baseState(), next);
  });

  it("round-trips spatial sound metadata", () => {
    const next = baseState();
    next.sounds = [
      {
        effect: "mutant-eat",
        worldX: 320,
        worldY: 640,
        maxDistancePx: 480,
        minimumVolumeScale: 0.2,
      },
    ];
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
    expect(delta.planeChanges).toBeUndefined();
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

  it("requires a keyframe when identity changes at the same depth", () => {
    const next = baseState();
    next.worldSpaceId = "caves";
    next.worldPlaneId = "entry";
    expect(requiresKeyframe(baseState(), next)).toBe(true);
  });

  it("requires a keyframe when the plane shape changes", () => {
    const next = baseState();
    next.plane.width = 1;
    next.plane.height = 1;
    next.plane.ground = [GroundType.FLOOR];
    next.plane.structure = [StructureType.NONE];
    next.plane.fixture = [FixtureType.NONE];
    next.plane.elevation = [0];
    next.plane.damage = [0];
    expect(requiresKeyframe(baseState(), next)).toBe(true);
  });

  it("requires a keyframe when a plane layer is malformed", () => {
    const next = baseState();
    next.plane.damage = [0];
    expect(requiresKeyframe(baseState(), next)).toBe(true);
  });

  it("does not require a keyframe for same-shape changes", () => {
    const next = baseState();
    next.entities[1] = entity("e1", 6);
    expect(requiresKeyframe(baseState(), next)).toBe(false);
  });
});
