import {
  TileType,
  DungeonData,
  MAP_WIDTH,
  MAP_HEIGHT,
  WallSet,
} from "../types";
import { RNG } from "../utils/rng";
import { idxFor, setTileFor } from "../utils/helpers";
import { CHUNK_SIZE, createDungeonChunkGenerator } from "./chunked-map";

/**
 * Materialize a finite, legacy-size dungeon using the same chunk generator the
 * streamed dungeon uses in normal gameplay.
 *
 * The active game path is `Game.createStreamedLevel()` plus `LevelStreamer`, not
 * this helper. Keeping `generateDungeon()` as a compatibility wrapper prevents
 * tests/tools from drifting onto an older dungeon style.
 */
export function generateDungeon(): DungeonData {
  const seed = RNG.int(0x40000000);
  const generateChunk = createDungeonChunkGenerator(seed);
  const map: TileType[] = new Array(MAP_WIDTH * MAP_HEIGHT).fill(TileType.WALL);
  const floorVariant = RNG.int(3);
  const wallSet: WallSet = RNG.chance(0.5) ? "wood" : "concrete";
  const chunksX = Math.ceil(MAP_WIDTH / CHUNK_SIZE);
  const chunksY = Math.ceil(MAP_HEIGHT / CHUNK_SIZE);

  for (let chunkY = 0; chunkY < chunksY; chunkY++) {
    for (let chunkX = 0; chunkX < chunksX; chunkX++) {
      const chunk = generateChunk(chunkX, chunkY);
      const baseX = chunkX * CHUNK_SIZE;
      const baseY = chunkY * CHUNK_SIZE;
      for (let localY = 0; localY < CHUNK_SIZE; localY++) {
        for (let localX = 0; localX < CHUNK_SIZE; localX++) {
          const x = baseX + localX;
          const y = baseY + localY;
          if (x <= 0 || y <= 0 || x >= MAP_WIDTH - 1 || y >= MAP_HEIGHT - 1) {
            continue;
          }
          if (x >= MAP_WIDTH || y >= MAP_HEIGHT) continue;
          const tile = chunk[localX + localY * CHUNK_SIZE];
          if (tile !== TileType.WALL) setTileFor(map, x, y, MAP_WIDTH, tile);
        }
      }
    }
  }

  const halfChunk = CHUNK_SIZE >> 1;
  const start: [number, number] = [CHUNK_SIZE + halfChunk, CHUNK_SIZE + halfChunk];
  const stairsDown = findDistantPassableTile(map, start) ?? [
    MAP_WIDTH - halfChunk,
    MAP_HEIGHT - halfChunk,
  ];

  setTileFor(map, start[0], start[1], MAP_WIDTH, TileType.FLOOR);
  setTileFor(map, stairsDown[0], stairsDown[1], MAP_WIDTH, TileType.STAIRS_DOWN);

  return {
    map,
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
    floorVariant,
    wallSet,
    start,
    stairsDown,
    rooms: [],
  };
}

function findDistantPassableTile(
  map: TileType[],
  start: [number, number],
): [number, number] | null {
  let best: [number, number] | null = null;
  let bestDistance = -1;

  for (let y = 1; y < MAP_HEIGHT - 1; y++) {
    for (let x = 1; x < MAP_WIDTH - 1; x++) {
      const tile = map[idxFor(x, y, MAP_WIDTH)];
      if (tile !== TileType.FLOOR && tile !== TileType.DOOR_OPEN) continue;
      const distance = Math.abs(x - start[0]) + Math.abs(y - start[1]);
      if (distance > bestDistance) {
        bestDistance = distance;
        best = [x, y];
      }
    }
  }

  return best;
}
