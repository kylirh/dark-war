import { describe, it, expect } from "vitest";
import { Physics } from "./physics";
import { PlayerEntity } from "../entities/player-entity";
import { MonsterEntity } from "../entities/monster-entity";
import { BulletEntity } from "../entities/bullet-entity";
import { EntityManager } from "../core/entity-manager";
import { FlatTileSource } from "../core/tile-source";
import { TileType, GameState, MonsterType, EventType, Entity } from "../types";

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
    physics.initializeMap(new FlatTileSource(map, W, H));
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

  it("wraps a player around the seam on the toroidal outside world", () => {
    const physics = new Physics();
    const map = new Array(W * H).fill(TileType.FLOOR); // open world, no border
    physics.initializeMap(new FlatTileSource(map, W, H));
    const outside = {
      map,
      mapWidth: W,
      mapHeight: H,
      levelKind: "outside",
    } as unknown as GameState;

    // Grid 8 → worldX 272; worldW = W*32 = 320. Drive right past the seam.
    const player = new PlayerEntity(8, 5);
    player.velocityX = 300; // +5px per 1/60s step
    for (let i = 0; i < 20; i++) {
      physics.predictLocalMovement(outside, player, 1 / 60);
    }

    // Crossed x=320 and reappeared near the left edge, still moving (not clamped).
    expect(player.worldX).toBeGreaterThanOrEqual(0);
    expect(player.worldX).toBeLessThan(W * 32);
    expect(player.worldX).toBeLessThan(100);
    expect(player.velocityX).toBe(300);
  });

  it("slides along a wall when moving diagonally into it", () => {
    const physics = new Physics();
    const map = makeMap();
    physics.initializeMap(new FlatTileSource(map, W, H));
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
    physics.initializeMap(new FlatTileSource(map, W, H));
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
    physics.initializeMap(new FlatTileSource(map, W, H));
    const player = new PlayerEntity(2, 5);
    expect(player.physicsBody).toBeUndefined();
    physics.predictLocalMovement(fakeState(map), player, 1 / 60);
    expect(player.physicsBody).toBeDefined();
  });
});

describe("Physics.updateBullets (anti-tunnel)", () => {
  function bulletState(map: TileType[]): GameState {
    const entities: Entity[] = [];
    return {
      entities,
      entityManager: new EntityManager(entities),
      effects: [],
      eventQueue: [],
      map,
      mapWidth: W,
      mapHeight: H,
      tiles: new FlatTileSource(map, W, H),
    } as unknown as GameState;
  }

  it("hits an enemy even when the bullet would jump past it in one big step", () => {
    const physics = new Physics();
    const map = makeMap(); // open interior
    const state = bulletState(map);

    // Monster at grid (5,5) → world (176,176).
    const monster = new MonsterEntity(5, 5, MonsterType.RAT, 1);
    state.entityManager.spawn(monster);

    // Bullet starts left of it, moving right fast enough to leap clear past it
    // in a single 0.2s tick (600px/s * 0.2s = 120px, monster is mid-path).
    const bullet = new BulletEntity(
      120,
      176,
      600,
      0,
      5,
      "shooter",
      640,
      2,
      0,
      0,
    );
    state.entityManager.spawn(bullet);

    physics.rebuildAll(state);
    physics.updateBullets(state, 0.2);

    const damage = state.eventQueue.find(
      (e) =>
        e.type === EventType.DAMAGE &&
        (e.data as { targetId: string }).targetId === monster.id,
    );
    expect(damage).toBeDefined(); // no tunnelling — the hit registered
    expect(state.entities.some((e) => e.id === bullet.id)).toBe(false); // bullet consumed
  });
});
