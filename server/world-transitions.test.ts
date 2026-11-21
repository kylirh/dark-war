/** Exercise real authoritative migration and wire snapshots with deterministic worlds. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RawData, WebSocket } from "ws";
import { Game } from "../src/engine/core/game";
import { WorldAddress, worldAddressKey } from "../src/engine/core/world-space";
import {
  EntityKind,
  HOLE_FALL_DAMAGE,
  ItemType,
  SerializedState,
  TileType,
} from "../src/engine/types";
import { RNG } from "../src/engine/utils/rng";
import { setPositionFromGrid } from "../src/engine/utils/helpers";
import { setStateTile } from "../src/engine/utils/state-tiles";
import { startMultiplayerServer } from "./multiplayer-server";

type Server = Awaited<ReturnType<typeof startMultiplayerServer>>;
let server: Server | undefined;
const worlds = new Map<string, Game>();
let configureWorld: (game: Game, address: WorldAddress) => void;

beforeEach(() => {
  RNG.reseed(17);
  worlds.clear();
  configureWorld = (): void => {};
  const reset = Game.prototype.resetToWorld;
  vi.spyOn(Game.prototype, "resetToWorld").mockImplementation(function (
    this: Game,
    address: WorldAddress,
  ): void {
    reset.call(this, address);
    this.getState().entityManager.destroyWhere(
      (entity) => entity.kind !== EntityKind.PLAYER,
    );
    configureWorld(this, address);
    worlds.set(worldAddressKey(address), this);
  });
});
afterEach(async () => {
  await server?.close();
  server = undefined;
  vi.restoreAllMocks();
});

function receive(
  socket: WebSocket,
  type: string,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`timeout waiting for ${type}`));
    }, 3000);
    const onMessage = (raw: RawData): void => {
      const message = JSON.parse(raw.toString()) as Record<string, unknown>;
      if (message.type === type) {
        cleanup();
        resolve(message);
      }
    };
    const cleanup = (): void => {
      clearTimeout(timer);
      socket.off("message", onMessage);
    };
    socket.on("message", onMessage);
  });
}
function send(socket: WebSocket, message: unknown): void {
  socket.send(JSON.stringify(message));
}
async function snapshot(socket: WebSocket): Promise<SerializedState> {
  const response = receive(socket, "state_full");
  send(socket, { type: "request_keyframe" });
  return (await response).state as SerializedState;
}
async function join(name: string): Promise<WebSocket> {
  const socket = new WebSocket(
    `ws://localhost:${server!.port}/?room=transitions&name=${name}`,
  );
  await receive(socket, "welcome");
  return socket;
}
async function start(): Promise<WebSocket> {
  server = await startMultiplayerServer(0);
  const socket = await join("Host");
  const response = receive(socket, "state_full");
  send(socket, { type: "start_game" });
  await response;
  return socket;
}
async function inWorld(
  socket: WebSocket,
  key: string,
): Promise<SerializedState> {
  for (let attempt = 0; attempt < 30; attempt++) {
    const state = await snapshot(socket);
    if (`${state.worldSpaceId}/${state.worldPlaneId}` === key) return state;
  }
  throw new Error(`did not reach ${key}`);
}
async function travel(
  socket: WebSocket,
  game: Game,
  portalId: string,
  type: "DESCEND" | "ASCEND",
): Promise<SerializedState> {
  const current = await snapshot(socket);
  const player = game.getPlayerById(current.player.id)!;
  const portal = game
    .getState()
    .portals.find((candidate) => candidate.id === portalId)!;
  setPositionFromGrid(player, portal.source.x, portal.source.y);
  send(socket, { type: "action", action: { type } });
  return inWorld(socket, worldAddressKey(portal.destination));
}
function position(state: SerializedState): [number, number] {
  return [
    Math.floor(state.player.worldX / 32),
    Math.floor(state.player.worldY / 32),
  ];
}

describe("authoritative world transitions", () => {
  it("pairs a hole beside downstairs with upstairs and moves only the falling player", async () => {
    const host = await start();
    const guest = await join("Guest");
    const surface = worlds.get("outside/surface")!;
    await travel(host, surface, "outside/surface:stairs-down", "DESCEND");
    const floor = worlds.get("megacorp/floor-1")!;
    const current = await snapshot(host);
    const player = floor.getPlayerById(current.player.id)!;
    player.hp = 50;
    player.itemCounts[ItemType.COIN] = 7;
    floor.getState().exploredByPlayer.get(player.id)!.add(42);
    floor
      .getState()
      .playerSocialFacts.set(
        player.id,
        new Map([["remembered-speaker", { flags: { met: true } }]]),
      );
    const [x, y] = floor.getState().stairsDown;
    setStateTile(floor.getState(), x - 1, y, TileType.HOLE);
    setPositionFromGrid(player, x - 1, y);
    const landed = await inWorld(host, "megacorp/floor-2");
    expect(position(landed)).toEqual(landed.stairsUp);
    expect(landed.player.id).toBe(player.id);
    expect(landed.player.hp).toBe(50 - HOLE_FALL_DAMAGE);
    expect(landed.player.itemCounts[ItemType.COIN]).toBe(7);
    expect((await snapshot(guest)).worldSpaceId).toBe("outside");
    expect(floor.getPlayerById(player.id)).toBeUndefined();
    await travel(
      host,
      worlds.get("megacorp/floor-2")!,
      "megacorp/floor-2:stairs-up",
      "ASCEND",
    );
    expect(floor.getState().tiles.getTile(x - 1, y)).toBe(TileType.HOLE);
    const returned = await snapshot(host);
    expect(returned.explored).toContain(42);
    expect(returned.socialFacts?.["remembered-speaker"].flags?.met).toBe(true);
  });

  it("uses the same deterministic fallback when destination upstairs is blocked", async () => {
    configureWorld = (game, address): void => {
      if (worldAddressKey(address) !== "megacorp/floor-1") return;
      const state = game.getState();
      const [x, y] = state.stairsUp!;
      setStateTile(state, x, y, TileType.WALL);
      setStateTile(state, x + 1, y, TileType.FLOOR);
    };
    const host = await start();
    const state = await travel(
      host,
      worlds.get("outside/surface")!,
      "outside/surface:stairs-down",
      "DESCEND",
    );
    expect(position(state)).toEqual([
      state.stairsUp![0] + 1,
      state.stairsUp![1],
    ]);
    expect(
      worlds
        .get("megacorp/floor-1")!
        .getState()
        .tiles.passable(...position(state)),
    ).toBe(true);
  });

  it.each(["park-grotto", "park-workshop"])(
    "round-trips the authored %s portal with exact landing coordinates",
    async (name) => {
      const host = await start();
      const surface = worlds.get("outside/surface")!;
      const portal = surface
        .getState()
        .portals.find(
          (candidate) => candidate.id === `outside/surface:${name}`,
        )!;
      const interior = await travel(host, surface, portal.id, "DESCEND");
      const interiorGame = worlds.get(
        `${interior.worldSpaceId}/${interior.worldPlaneId}`,
      )!;
      const exit = interiorGame
        .getState()
        .portals.find((candidate) => candidate.id.endsWith(":exit"))!;
      const returned = await travel(host, interiorGame, exit.id, "ASCEND");
      expect(position(returned)).toEqual([
        exit.destination.x,
        exit.destination.y,
      ]);
      expect(returned.player.id).toBe(interior.player.id);
    },
  );
});

it("honors an authored hole destination in the authoritative host", async () => {
  const host = await start();
  const source = worlds.get("outside/surface")!;
  const current = await snapshot(host);
  const player = source.getPlayerById(current.player.id)!;
  const [x, y] = [player.gridX + 2, player.gridY];
  source.getState().portals.push({
    id: "grotto-hole",
    kind: "hole",
    source: { spaceId: "outside", planeId: "surface", x, y },
    destination: { spaceId: "caves", planeId: "park-grotto", entry: "start" },
  });
  setStateTile(source.getState(), x, y, TileType.HOLE);
  setPositionFromGrid(player, x, y);
  const landed = await inWorld(host, "caves/park-grotto");
  expect(position(landed)).toEqual(landed.stairsUp);
  expect(landed.player.hp).toBe(current.player.hp - HOLE_FALL_DAMAGE);
});

it("does not detach a player when no destination landing is available", async () => {
  configureWorld = (game, address): void => {
    if (worldAddressKey(address) !== "megacorp/floor-1") return;
    const state = game.getState();
    for (let y = 0; y < state.mapHeight; y++)
      for (let x = 0; x < state.mapWidth; x++)
        setStateTile(state, x, y, TileType.WALL);
  };
  const host = await start();
  const source = worlds.get("outside/surface")!;
  const current = await snapshot(host);
  const player = source.getPlayerById(current.player.id)!;
  setPositionFromGrid(player, ...source.getState().stairsDown);
  send(host, { type: "action", action: { type: "DESCEND" } });
  const unchanged = await snapshot(host);
  expect(unchanged.worldSpaceId).toBe("outside");
  expect(source.getPlayerById(player.id)).toBe(player);
  expect(worlds.get("megacorp/floor-1")!.getState().players).toHaveLength(0);
});
