/** Seeded vertical stair anchors and connected excavation at exact fall coordinates. */
import { RandomNumberGenerator } from "../utils/rng";
import { TileType } from "../types";
import { WorldPlane } from "./world-plane";

/** The authored surface entrance is also floor one's upstairs. */
export const SURFACE_STAIRS_DOWN: readonly [number, number] = [16, 44];

/** Random per-boundary coordinates, independent of generation or visit order. */
export function stairBoundaryFor(
  seed: number,
  depth: number,
  width: number,
  height: number,
): [number, number] {
  if (depth === 0) return [...SURFACE_STAIRS_DOWN];
  const rng = new RandomNumberGenerator(
    (seed ^ Math.imul(depth, 0x9e3779b1)) >>> 0,
  );
  // Alternating x parity prevents adjacent floors' up/down anchors coinciding.
  return [
    4 + 2 * rng.int(Math.floor((width - 8) / 2)) + (depth % 2),
    4 + rng.int(height - 8),
  ];
}

/** Preserve a shaft; otherwise excavate its exact landing and connect it to entry. */
export function prepareFallLanding(
  plane: WorldPlane,
  position: readonly [number, number],
  entry: readonly [number, number],
): boolean {
  const [x, y] = position;
  if (
    !plane.inBounds(x, y) ||
    x <= 0 ||
    y <= 0 ||
    x >= plane.width - 1 ||
    y >= plane.height - 1
  )
    return false;
  if (plane.getTile(x, y) === TileType.HOLE) return true;
  // Find the existing region reachable from the level entry. The shortest
  // excavation into that region prevents isolated landing pockets.
  const seen = new Uint8Array(plane.width * plane.height);
  const queue: [number, number][] = [[entry[0], entry[1]]];
  let nearest: [number, number] = [entry[0], entry[1]];
  let distance = Infinity;
  for (let head = 0; head < queue.length; head++) {
    const [cx, cy] = queue[head];
    if (!plane.inBounds(cx, cy)) continue;
    const index = plane.indexFor(cx, cy);
    if (seen[index]) continue;
    seen[index] = 1;
    const tile = plane.getTile(cx, cy);
    if (!plane.passable(cx, cy) || tile === TileType.HOLE) continue;
    const d = Math.abs(cx - x) + Math.abs(cy - y);
    if (d < distance) {
      nearest = [cx, cy];
      distance = d;
    }
    queue.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
  }
  const clear = (cx: number, cy: number): void => {
    const tile = plane.getTile(cx, cy);
    if (!plane.passable(cx, cy) || tile === TileType.HOLE)
      plane.setTile(cx, cy, TileType.FLOOR);
  };
  let cx = x,
    cy = y;
  clear(cx, cy);
  while (cx !== nearest[0]) {
    cx += Math.sign(nearest[0] - cx);
    clear(cx, cy);
  }
  while (cy !== nearest[1]) {
    cy += Math.sign(nearest[1] - cy);
    clear(cx, cy);
  }
  return true;
}
