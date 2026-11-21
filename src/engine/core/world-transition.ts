/** Shared destination and safe-landing policy for offline and authoritative travel. */
import { GameState, TileType } from "../types";
import { TileSource } from "./tile-source";
import { wrapValue } from "../utils/wrap";
import {
  depthForWorldAddress,
  portalAt,
  WorldPortalDestination,
  worldAddressForDepth,
} from "./world-space";

/** Authored holes own their destination; generated floors pair falls with stairs. */
export function holeDestinationFor(
  state: Pick<
    GameState,
    "worldSpaceId" | "worldPlaneId" | "depth" | "portals" | "stairsDown"
  >,
  position: readonly [number, number],
): WorldPortalDestination {
  const address = { spaceId: state.worldSpaceId, planeId: state.worldPlaneId };
  const hole = portalAt(state.portals, address, ...position, ["hole"]);
  if (hole) return hole.destination;
  const downstairs = portalAt(state.portals, address, ...state.stairsDown, [
    "stairs",
    "ladder",
  ]);
  if (
    downstairs &&
    depthForWorldAddress(downstairs.destination) === state.depth + 1
  ) {
    return downstairs.destination;
  }
  return { ...worldAddressForDepth(state.depth + 1), entry: "stairs-up" };
}

export interface LandingWorld {
  readonly tiles: TileSource;
  readonly stairsUp: readonly [number, number] | null;
  readonly stairsDown: readonly [number, number];
  readonly start: readonly [number, number];
  readonly wraps: boolean;
}

/** Resolve metadata first, then search in stable east/west/south/north order. */
export function resolveWorldLanding(
  world: LandingWorld,
  destination: WorldPortalDestination,
  sourcePosition: readonly [number, number],
  occupied: (x: number, y: number) => boolean = (): boolean => false,
): [number, number] | null {
  const preferred =
    Number.isSafeInteger(destination.x) && Number.isSafeInteger(destination.y)
      ? ([destination.x!, destination.y!] as const)
      : destination.entry === "same"
        ? sourcePosition
        : destination.entry === "stairs-up"
          ? (world.stairsUp ?? world.start)
          : destination.entry === "stairs-down"
            ? world.stairsDown
            : world.start;
  const { width, height } = world.tiles;
  const normalize = (value: number, span: number): number =>
    world.wraps
      ? wrapValue(value, span)
      : Math.max(0, Math.min(span - 1, value));
  const visited = new Uint8Array(width * height);
  const queue: [number, number][] = [];
  const enqueue = (x: number, y: number): void => {
    if (world.wraps) {
      x = wrapValue(x, width);
      y = wrapValue(y, height);
    }
    if (!world.tiles.inBounds(x, y)) return;
    const index = x + y * width;
    if (visited[index]) return;
    visited[index] = 1;
    queue.push([x, y]);
  };
  enqueue(normalize(preferred[0], width), normalize(preferred[1], height));
  for (let head = 0; head < queue.length; head++) {
    const [x, y] = queue[head];
    if (
      world.tiles.passable(x, y) &&
      world.tiles.getTile(x, y) !== TileType.HOLE &&
      !occupied(x, y)
    ) {
      return [x, y];
    }
    enqueue(x + 1, y);
    enqueue(x - 1, y);
    enqueue(x, y + 1);
    enqueue(x, y - 1);
  }
  return null;
}
