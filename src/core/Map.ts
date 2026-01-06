import { TileType, DungeonData, Room, MAP_WIDTH, MAP_HEIGHT } from "../types";
import { RNG } from "../utils/RNG";
import { setTile, tileAt } from "../utils/helpers";

/**
 * Generate a dungeon using BSP-lite algorithm with rooms and corridors
 */
export function generateDungeon(): DungeonData {
  const map: TileType[] = new Array(MAP_WIDTH * MAP_HEIGHT).fill(TileType.WALL);
  const rooms: Room[] = [];

  // Generate rooms
  const tries = 120;
  for (let i = 0; i < tries; i++) {
    const w = 5 + RNG.int(10);
    const h = 4 + RNG.int(8);
    const x = 2 + RNG.int(MAP_WIDTH - w - 4);
    const y = 2 + RNG.int(MAP_HEIGHT - h - 4);
    const room: Room = { x, y, w, h };

    // Check for collisions with existing rooms
    const collides = rooms.some((other) => roomsOverlap(room, other));

    if (!collides) {
      rooms.push(room);
      // Carve out the room
      for (let ry = y; ry < y + h; ry++) {
        for (let rx = x; rx < x + w; rx++) {
          setTile(map, rx, ry, TileType.FLOOR);
        }
      }
    }
  }

  // Connect rooms with corridors
  rooms.sort((a, b) => a.x + b.y - (b.x + a.y));
  for (let i = 1; i < rooms.length; i++) {
    const roomA = rooms[i - 1];
    const roomB = rooms[i];
    const ax = Math.floor(roomA.x + roomA.w / 2);
    const ay = Math.floor(roomA.y + roomA.h / 2);
    const bx = Math.floor(roomB.x + roomB.w / 2);
    const by = Math.floor(roomB.y + roomB.h / 2);

    // Randomly choose L-shaped corridor direction
    if (RNG.chance(0.5)) {
      carveHorizontal(map, ax, bx, ay);
    } else {
      carveVertical(map, ay, by, ax);
    }
    carveVertical(map, ay, by, bx);
    carveHorizontal(map, ax, bx, by);
  }

  // Add doors at corridor-room transitions
  addDoors(map);

  // Place starting position and stairs
  const startRoom = rooms[0];
  const stairRoom = RNG.choose(rooms.slice(Math.max(1, rooms.length - 6)));

  const start: [number, number] = [
    Math.floor(startRoom.x + startRoom.w / 2),
    Math.floor(startRoom.y + startRoom.h / 2),
  ];

  const stairs: [number, number] = [
    Math.floor(stairRoom.x + stairRoom.w / 2),
    Math.floor(stairRoom.y + stairRoom.h / 2),
  ];

  setTile(map, stairs[0], stairs[1], TileType.STAIRS);

  return { map, start, stairs, rooms };
}

/**
 * Check if two rooms overlap
 */
function roomsOverlap(a: Room, b: Room): boolean {
  return !(
    a.x + a.w < b.x ||
    b.x + b.w < a.x ||
    a.y + a.h < b.y ||
    b.y + b.h < a.y
  );
}

/**
 * Carve horizontal corridor
 */
function carveHorizontal(
  map: TileType[],
  x1: number,
  x2: number,
  y: number
): void {
  const startX = Math.min(x1, x2);
  const endX = Math.max(x1, x2);
  for (let x = startX; x <= endX; x++) {
    setTile(map, x, y, TileType.FLOOR);
  }
}

/**
 * Carve vertical corridor
 */
function carveVertical(
  map: TileType[],
  y1: number,
  y2: number,
  x: number
): void {
  const startY = Math.min(y1, y2);
  const endY = Math.max(y1, y2);
  for (let y = startY; y <= endY; y++) {
    setTile(map, x, y, TileType.FLOOR);
  }
}

/**
 * Add doors at floor-wall-floor transitions
 */
function addDoors(map: TileType[]): void {
  const width = MAP_WIDTH;
  for (let y = 1; y < MAP_HEIGHT - 1; y++) {
    for (let x = 1; x < MAP_WIDTH - 1; x++) {
      const idx = x + y * width;
      if (map[idx] !== TileType.WALL) continue;

      const north = map[x + (y - 1) * width];
      const south = map[x + (y + 1) * width];
      const east = map[(x + 1) + y * width];
      const west = map[(x - 1) + y * width];

      const verticalCorridor =
        north === TileType.FLOOR && south === TileType.FLOOR;
      const horizontalCorridor =
        east === TileType.FLOOR && west === TileType.FLOOR;

      // XOR: only one direction should be a corridor
      if (verticalCorridor !== horizontalCorridor) {
        if (RNG.chance(0.25)) {
          const doorType = RNG.chance(0.85)
            ? TileType.DOOR_CLOSED
            : TileType.DOOR_LOCKED;
          map[idx] = doorType;
        }
      }
    }
  }
}
