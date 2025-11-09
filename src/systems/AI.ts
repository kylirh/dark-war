import { Path } from "rot-js";
import {
  Monster,
  Player,
  Entity,
  TileType,
  TILE_DEFINITIONS,
  MAP_WIDTH,
  MAP_HEIGHT,
} from "../types";
import { inBounds, entityAt, idx, passable, tileAt } from "../utils/helpers";
import { RNG } from "../utils/RNG";
import { monsterAttack } from "./Combat";

/**
 * Execute AI for all monsters
 */
export function runMonsterAI(
  monsters: Monster[],
  player: Player,
  entities: Entity[],
  map: TileType[],
  onMessage: (msg: string) => void
): boolean {
  let playerDied = false;

  for (const monster of monsters) {
    const dx = player.x - monster.x;
    const dy = player.y - monster.y;
    const distance = Math.max(Math.abs(dx), Math.abs(dy)); // Chebyshev distance for 8-directional

    // Adjacent to player attack
    if (distance === 1) {
      const damage = monsterAttack(monster, player);
      const monsterName = monster.type === "rat" ? "Rat" : "Mutant";
      onMessage(`${monsterName} hits you for ${damage}.`);
      if (player.hp <= 0) {
        playerDied = true;
        return playerDied;
      }
      continue;
    }

    // Check line of sight to player
    const hasLOS = checkLineOfSight(
      monster.x,
      monster.y,
      player.x,
      player.y,
      map
    );

    if (hasLOS && distance < 12) {
      // Chase player using A* pathfinding from rot.js
      const step = aStarStep(monster, player, entities, map);

      if (step) {
        monster.x = step[0];
        monster.y = step[1];
      }
    } else {
      // Idle wander
      if (RNG.chance(0.2)) {
        const dirs: [number, number][] = [
          [1, 0], // right
          [-1, 0], // left
          [0, 1], // down
          [0, -1], // up
          [1, 1], // down-right
          [1, -1], // up-right
          [-1, 1], // down-left
          [-1, -1], // up-left
        ];
        const [dirX, dirY] = RNG.choose(dirs);
        const nx = monster.x + dirX;
        const ny = monster.y + dirY;

        if (
          inBounds(nx, ny) &&
          passable(map, nx, ny) &&
          !entityAt(entities, nx, ny)
        ) {
          monster.x = nx;
          monster.y = ny;
        }
      }
    }
  }

  return playerDied;
}

/**
 * Check if there's line of sight between two points using simple Bresenham
 */
function checkLineOfSight(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  map: TileType[]
): boolean {
  // Use simple Bresenham line algorithm for LOS check
  const dx = Math.abs(x2 - x1);
  const dy = Math.abs(y2 - y1);
  const sx = x1 < x2 ? 1 : -1;
  const sy = y1 < y2 ? 1 : -1;
  let err = dx - dy;
  let x = x1;
  let y = y1;

  while (true) {
    // Skip start point, check all other points
    if (!(x === x1 && y === y1)) {
      if (x < 0 || y < 0 || x >= MAP_WIDTH || y >= MAP_HEIGHT) {
        return false;
      }

      const tile = TILE_DEFINITIONS[tileAt(map, x, y)];
      if (tile && tile.opaque) {
        return false;
      }
    }

    if (x === x2 && y === y2) break;

    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }

  return true;
}

/**
 * A* pathfinding using rot.js - more efficient than BFS
 */
function aStarStep(
  monster: Monster,
  player: Player,
  entities: Entity[],
  map: TileType[]
): [number, number] | null {
  // Passable callback for rot.js pathfinding
  // Allow pathing through monsters for planning, but we'll check actual step later
  const passableCallback = (x: number, y: number): boolean => {
    if (!inBounds(x, y)) return false;
    if (!passable(map, x, y)) return false;
    return true;
  };

  // Create A* pathfinder - target is player position
  const astar = new Path.AStar(player.x, player.y, passableCallback, {
    topology: 8, // 8-directional movement
  });

  const path: [number, number][] = [];

  // Compute path from monster to player
  astar.compute(monster.x, monster.y, (x, y) => {
    path.push([x, y]);
  });

  // Path includes monster position as first element, so take second element
  if (path.length > 1) {
    const nextStep = path[1];

    // Verify the next step is actually walkable (no entity there)
    if (entityAt(entities, nextStep[0], nextStep[1])) {
      // Blocked by another entity, don't move this turn
      return null;
    }

    return nextStep;
  }

  return null;
}
