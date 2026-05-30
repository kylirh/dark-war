/**
 * Throwaway check that Physics.predictLocalMovement resolves walls correctly.
 * Run: npx tsx scripts/predict-wall-check.ts
 */
import { webcrypto } from "node:crypto";
// Entities use the global crypto.randomUUID (present in browser/Electron).
(globalThis as { crypto?: unknown }).crypto ??= webcrypto;
import { Physics } from "../src/systems/physics";
import { PlayerEntity } from "../src/entities/player-entity";
import { TileType, GameState } from "../src/types";

const W = 10;
const H = 10;

function makeMap(): TileType[] {
  const map = new Array(W * H).fill(TileType.FLOOR);
  // Solid border walls.
  for (let x = 0; x < W; x++) {
    map[x] = TileType.WALL;
    map[x + (H - 1) * W] = TileType.WALL;
  }
  for (let y = 0; y < H; y++) {
    map[y * W] = TileType.WALL;
    map[W - 1 + y * W] = TileType.WALL;
  }
  // A single interior wall at grid (4,3).
  map[4 + 3 * W] = TileType.WALL;
  return map;
}

function fakeState(map: TileType[]): GameState {
  return { map, mapWidth: W, mapHeight: H } as unknown as GameState;
}

let failures = 0;
function assert(name: string, cond: boolean, detail: string): void {
  if (cond) console.log(`ok   ${name}`);
  else {
    failures++;
    console.log(`FAIL ${name}: ${detail}`);
  }
}

// Test 1: moving straight right into the wall at grid (4,3) is blocked.
{
  const physics = new Physics();
  const map = makeMap();
  physics.initializeMap(map, W, H);
  const player = new PlayerEntity(3, 3); // worldX = 3*32+16 = 112
  player.velocityX = 300;
  player.velocityY = 0;
  // Wall (4,3) spans worldX 128..160; player radius 8 => stop near x=120.
  for (let i = 0; i < 10; i++) physics.predictLocalMovement(fakeState(map), player, 1 / 60);
  assert("blocked-x", player.worldX < 128, `worldX=${player.worldX.toFixed(1)} should stay left of wall face 128`);
  assert("blocked-x-near", player.worldX > 110 && player.worldX < 124, `worldX=${player.worldX.toFixed(1)} expected ~120`);
}

// Test 2: moving diagonally into the same wall slides (Y preserved, X stopped).
{
  const physics = new Physics();
  const map = makeMap();
  physics.initializeMap(map, W, H);
  const player = new PlayerEntity(3, 3);
  player.velocityX = 300;
  player.velocityY = 150; // down
  const startY = player.worldY;
  for (let i = 0; i < 6; i++) physics.predictLocalMovement(fakeState(map), player, 1 / 60);
  assert("slide-x-blocked", player.worldX < 128, `worldX=${player.worldX.toFixed(1)} should be blocked`);
  assert("slide-y-moved", player.worldY > startY + 5, `worldY moved from ${startY} to ${player.worldY.toFixed(1)} (should slide down)`);
}

// Test 3: free movement (no wall in the way) advances normally.
{
  const physics = new Physics();
  const map = makeMap();
  physics.initializeMap(map, W, H);
  const player = new PlayerEntity(2, 5); // open area, moving up toward (2,4) floor
  const startX = player.worldX;
  player.velocityX = 0;
  player.velocityY = -120;
  physics.predictLocalMovement(fakeState(map), player, 1 / 60);
  assert("free-move", player.worldY < player.prevWorldY && player.worldX === startX, `moved up freely`);
}

console.log(failures === 0 ? "\nALL PASSED" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
