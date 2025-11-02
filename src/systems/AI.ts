import { Monster, Player, Entity, TileType, TILE_DEFINITIONS } from "../types";
import { line, inBounds, entityAt, idx, passable } from "../utils/helpers";
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
    const distance = Math.abs(dx) + Math.abs(dy);

    // Adjacent to player - attack
    if (distance === 1) {
      const damage = monsterAttack(monster, player);
      onMessage(`Mutant hits you for ${damage}.`);
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
      // Chase player using greedy pathfinding with BFS fallback
      const step =
        greedyStep(monster, player, entities, map) ||
        bfsStep(monster, player, entities, map, 10);

      if (step) {
        monster.x = step[0];
        monster.y = step[1];
      }
    } else {
      // Idle wander
      if (RNG.chance(0.2)) {
        const dirs: [number, number][] = [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
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
 * Check if there's line of sight between two points
 */
function checkLineOfSight(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  map: TileType[]
): boolean {
  const points = line(x1, y1, x2, y2);

  for (let i = 1; i < points.length; i++) {
    const [px, py] = points[i];
    const tile = TILE_DEFINITIONS[map[idx(px, py)]];
    if (tile.opaque) {
      return false;
    }
  }

  return true;
}

/**
 * Greedy step towards target (simple, fast)
 */
function greedyStep(
  monster: Monster,
  player: Player,
  entities: Entity[],
  map: TileType[]
): [number, number] | null {
  const directions: [number, number][] = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];

  const candidates = directions
    .map(([dx, dy]) => [monster.x + dx, monster.y + dy] as [number, number])
    .filter(
      ([x, y]) =>
        inBounds(x, y) && passable(map, x, y) && !entityAt(entities, x, y)
    );

  // Sort by distance to player
  candidates.sort((a, b) => {
    const distA = Math.abs(a[0] - player.x) + Math.abs(a[1] - player.y);
    const distB = Math.abs(b[0] - player.x) + Math.abs(b[1] - player.y);
    return distA - distB;
  });

  return candidates[0] || null;
}

/**
 * BFS pathfinding with limited search depth
 */
function bfsStep(
  monster: Monster,
  player: Player,
  entities: Entity[],
  map: TileType[],
  limit = 14
): [number, number] | null {
  const queue: [number, number][] = [[monster.x, monster.y]];
  const cameFrom = new Map<number, [number, number]>();
  const seen = new Set<number>([idx(monster.x, monster.y)]);

  while (queue.length > 0) {
    const [x, y] = queue.shift()!;

    // Found player
    if (x === player.x && y === player.y) break;

    const directions: [number, number][] = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];

    for (const [dx, dy] of directions) {
      const nx = x + dx;
      const ny = y + dy;
      const id = idx(nx, ny);

      if (
        !inBounds(nx, ny) ||
        seen.has(id) ||
        !passable(map, nx, ny) ||
        entityAt(entities, nx, ny)
      ) {
        continue;
      }

      seen.add(id);
      cameFrom.set(id, [x, y]);
      queue.push([nx, ny]);

      // Limit search depth
      if (seen.size > limit * limit) break;
    }
  }

  // Reconstruct path
  if (cameFrom.size === 0) return null;

  let current: [number, number] | undefined = [player.x, player.y];
  const path: [number, number][] = [];

  while (current && (current[0] !== monster.x || current[1] !== monster.y)) {
    path.push(current);
    current = cameFrom.get(idx(current[0], current[1]));
    if (!current) break;
  }

  return path.length > 0 ? path[path.length - 1] : null;
}
