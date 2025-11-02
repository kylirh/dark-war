import { TileType, TILE_DEFINITIONS, Player } from "../types";
import { line, tileAt, inBounds, idx } from "../utils/helpers";

/**
 * Compute field of view using ray casting
 * Returns set of visible tile indices
 */
export function computeFOV(
  map: TileType[],
  player: Player,
  explored: Set<number>
): Set<number> {
  const visible = new Set<number>();
  const radius = player.sight;

  for (let y = player.y - radius; y <= player.y + radius; y++) {
    for (let x = player.x - radius; x <= player.x + radius; x++) {
      if (!inBounds(x, y)) continue;

      // Check if within circular radius
      const distSq = (x - player.x) ** 2 + (y - player.y) ** 2;
      if (distSq > radius * radius) continue;

      // Cast ray from player to this tile
      const ray = line(player.x, player.y, x, y);
      let canSee = false;

      for (let i = 0; i < ray.length; i++) {
        const [px, py] = ray[i];
        const tile = TILE_DEFINITIONS[tileAt(map, px, py)];

        // Can see the final tile
        if (i === ray.length - 1) {
          canSee = true;
          break;
        }

        // Ray blocked by opaque tile (unless it's the player's position)
        if (tile && tile.opaque && !(px === player.x && py === player.y)) {
          break;
        }
      }

      if (canSee) {
        const index = idx(x, y);
        visible.add(index);
        explored.add(index);
      }
    }
  }

  return visible;
}
