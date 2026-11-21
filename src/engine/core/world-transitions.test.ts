/** End-to-end offline transition contracts, including save-backed destinations. */
import { beforeEach, describe, expect, it } from "vitest";
import { Game } from "./game";
import { RNG } from "../utils/rng";
import { setPositionFromGrid } from "../utils/helpers";
import { setStateTile } from "../utils/state-tiles";
import { HOLE_FALL_DAMAGE, TileType } from "../types";
import { stepSimulationTick } from "../systems/simulation/tick";

function fallBesideDownstairs(game: Game): void {
  const state = game.getState();
  state.entityManager.destroyWhere((entity) => entity.id !== state.player.id);
  const [x, y] = state.stairsDown;
  setStateTile(state, x - 1, y, TileType.HOLE);
  setPositionFromGrid(state.player, x - 1, y);
  state.holeCreatedTiles = new Set([state.worldPlane.indexFor(x - 1, y)]);
  stepSimulationTick(state);
  expect(state.shouldDescend).toBe(true);
  game.descend();
}

describe("offline world transitions", () => {
  beforeEach(() => RNG.reseed(17));

  it("lands directly beneath a hole beside downstairs", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    const hp = game.getState().player.hp;
    const id = game.getState().player.id;
    const source = [
      game.getState().stairsDown[0] - 1,
      game.getState().stairsDown[1],
    ];
    fallBesideDownstairs(game);
    const state = game.getState();
    expect([state.worldSpaceId, state.worldPlaneId]).toEqual([
      "megacorp",
      "floor-2",
    ]);
    expect([state.player.gridX, state.player.gridY]).toEqual(source);
    expect(state.tiles.passable(state.player.gridX, state.player.gridY)).toBe(
      true,
    );
    expect(state.player.id).toBe(id);
    expect(state.player.hp).toBe(hp - HOLE_FALL_DAMAGE);
  });
});

it("preserves a cached landing and source exploration across save/load and a return", () => {
  RNG.reseed(17);
  const game = new Game({ mode: "offline" });
  game.reset(1);
  game.descend();
  const entry = game.getState().stairsUp!;
  setStateTile(game.getState(), entry[0], entry[1], TileType.WALL);
  setStateTile(game.getState(), entry[0] + 1, entry[1], TileType.FLOOR);
  game.ascend();
  game.getState().explored.add(42);
  const restored = new Game({ mode: "offline" });
  restored.deserialize(JSON.parse(JSON.stringify(game.serialize())));
  const source = [
    restored.getState().stairsDown[0] - 1,
    restored.getState().stairsDown[1],
  ];
  fallBesideDownstairs(restored);
  expect([
    restored.getState().player.gridX,
    restored.getState().player.gridY,
  ]).toEqual(source);
  restored.ascend();
  expect(restored.getState().depth).toBe(1);
  expect(restored.getState().explored.has(42)).toBe(true);
});

it.each(["outside/surface:park-grotto", "outside/surface:park-workshop"])(
  "round-trips authored portal %s through an interior save",
  (portalId) => {
    RNG.reseed(17);
    const game = new Game({ mode: "offline" });
    game.reset(0);
    const state = game.getState();
    const portal = state.portals.find(
      (candidate) => candidate.id === portalId,
    )!;
    const id = state.player.id;
    state.pendingPortalId = portal.id;
    setPositionFromGrid(state.player, portal.source.x, portal.source.y);
    game.descend();
    expect([state.worldSpaceId, state.worldPlaneId]).toEqual([
      portal.destination.spaceId,
      portal.destination.planeId,
    ]);
    expect(state.tiles.passable(state.player.gridX, state.player.gridY)).toBe(
      true,
    );
    const restored = new Game({ mode: "offline" });
    restored.deserialize(JSON.parse(JSON.stringify(game.serialize())));
    const exit = restored
      .getState()
      .portals.find((candidate) => candidate.id.endsWith(":exit"))!;
    restored.getState().pendingPortalId = exit.id;
    restored.ascend();
    const returned = restored.getState();
    expect([returned.worldSpaceId, returned.worldPlaneId]).toEqual([
      "outside",
      "surface",
    ]);
    expect([returned.player.gridX, returned.player.gridY]).toEqual([
      exit.destination.x,
      exit.destination.y,
    ]);
    expect(returned.player.id).toBe(id);
  },
);

it("honors an authored hole portal instead of forcing the next progression depth", () => {
  RNG.reseed(17);
  const game = new Game({ mode: "offline" });
  game.reset(0);
  const state = game.getState();
  const [x, y] = [10, 10];
  setPositionFromGrid(state.player, x, y);
  state.portals.push({
    id: "grotto-hole",
    kind: "hole",
    source: { spaceId: state.worldSpaceId, planeId: state.worldPlaneId, x, y },
    destination: { spaceId: "caves", planeId: "park-grotto", entry: "start" },
  });
  setStateTile(state, x, y, TileType.HOLE);
  state.holeCreatedTiles = new Set([state.worldPlane.indexFor(x, y)]);
  state.entityManager.destroyWhere((entity) => entity.id !== state.player.id);
  stepSimulationTick(state);
  game.descend();
  expect([state.worldSpaceId, state.worldPlaneId]).toEqual([
    "caves",
    "park-grotto",
  ]);
  expect([state.player.gridX, state.player.gridY]).toEqual([x, y]);
});

it("keeps the source world intact when the destination has no safe tile", () => {
  RNG.reseed(17);
  const game = new Game({ mode: "offline" });
  game.reset(1);
  game.descend();
  const state = game.getState();
  for (let y = 0; y < state.mapHeight; y++)
    for (let x = 0; x < state.mapWidth; x++)
      setStateTile(state, x, y, TileType.WALL);
  game.ascend();
  const ids = state.entities.map((entity) => entity.id);
  const entry = [state.player.gridX, state.player.gridY];
  game.descend();
  expect(state.depth).toBe(1);
  expect([state.player.gridX, state.player.gridY]).toEqual(entry);
  expect(state.entities.map((entity) => entity.id)).toEqual(ids);
});

it("continues through a stacked hole and preserves fall distance across save/load", () => {
  const game = new Game({ worldSeed: 17 });
  game.reset(1);
  const point: [number, number] = [50, 50];
  game.descend();
  setStateTile(game.getState(), ...point, TileType.HOLE);
  game.descend();
  setStateTile(game.getState(), ...point, TileType.FLOOR);
  game.ascend();
  game.ascend();
  const source = game.getState();
  source.entityManager.destroyWhere((entity) => entity.id !== source.player.id);
  source.player.hp = 100;
  setStateTile(source, ...point, TileType.HOLE);
  setPositionFromGrid(source.player, ...point);
  stepSimulationTick(source);
  expect(source.player.hp).toBe(100);
  game.descend();
  expect(source.depth).toBe(2);
  expect([source.player.gridX, source.player.gridY]).toEqual(point);
  expect(source.player.hp).toBe(100);
  expect(source.player.fallDistance).toBe(1);
  const restored = new Game();
  restored.deserialize(JSON.parse(JSON.stringify(game.serialize())));
  const shaft = restored.getState();
  shaft.shouldDescend = false;
  shaft.entityManager.destroyWhere((entity) => entity.id !== shaft.player.id);
  stepSimulationTick(shaft);
  expect(shaft.shouldDescend).toBe(true);
  restored.descend();
  expect(shaft.depth).toBe(3);
  expect([shaft.player.gridX, shaft.player.gridY]).toEqual(point);
  expect(shaft.player.hp).toBe(100 - 4 * HOLE_FALL_DAMAGE);
  expect(shaft.player.fallDistance).toBeUndefined();
});
