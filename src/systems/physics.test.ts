import { describe, it, expect } from "vitest";
import { Physics } from "./physics";
import { PlayerEntity } from "../entities/player-entity";
import { TileType, GameState } from "../types";

const W = 10;
const H = 10;

function makeMap(): TileType[] {
  const map = new Array(W * H).fill(TileType.FLOOR);
  for (let x = 0; x < W; x++) {
    map[x] = TileType.WALL;
    map[x + (H - 1) * W] = TileType.WALL;
  }
  for (let y = 0; y < H; y++) {
    map[y * W] = TileType.WALL;
    map[W - 1 + y * W] = TileType.WALL;
  }
  map[4 + 3 * W] = TileType.WALL; // interior wall at grid (4,3)
  return map;
}

function fakeState(map: TileType[]): GameState {
  return { map, mapWidth: W, mapHeight: H } as unknown as GameState;
}

describe("Physics.predictLocalMovement", () => {
  it("blocks a player moving straight into a wall", () => {
    const physics = new Physics();
    const map = makeMap();
    physics.initializeMap(map, W, H);
    const player = new PlayerEntity(3, 3); // worldX = 112
    player.velocityX = 300;
    player.velocityY = 0;
    // Wall (4,3) spans worldX 128..160; radius 8 => stop near x=120.
    for (let i = 0; i < 10; i++) {
      physics.predictLocalMovement(fakeState(map), player, 1 / 60);
    }
    expect(player.worldX).toBeLessThan(128);
    expect(player.worldX).toBeGreaterThan(110);
  });

  it("slides along a wall when moving diagonally into it", () => {
    const physics = new Physics();
    const map = makeMap();
    physics.initializeMap(map, W, H);
    const player = new PlayerEntity(3, 3);
    player.velocityX = 300;
    player.velocityY = 150; // down
    const startY = player.worldY;
    for (let i = 0; i < 6; i++) {
      physics.predictLocalMovement(fakeState(map), player, 1 / 60);
    }
    expect(player.worldX).toBeLessThan(128); // X blocked
    expect(player.worldY).toBeGreaterThan(startY + 5); // Y slides
  });

  it("advances freely when no wall is in the way", () => {
    const physics = new Physics();
    const map = makeMap();
    physics.initializeMap(map, W, H);
    const player = new PlayerEntity(2, 5);
    const startX = player.worldX;
    player.velocityX = 0;
    player.velocityY = -120;
    physics.predictLocalMovement(fakeState(map), player, 1 / 60);
    expect(player.worldY).toBeLessThan(player.prevWorldY);
    expect(player.worldX).toBe(startX);
  });

  it("creates a physics body on demand for a fresh entity", () => {
    const physics = new Physics();
    const map = makeMap();
    physics.initializeMap(map, W, H);
    const player = new PlayerEntity(2, 5);
    expect(player.physicsBody).toBeUndefined();
    physics.predictLocalMovement(fakeState(map), player, 1 / 60);
    expect(player.physicsBody).toBeDefined();
  });
});
