/** Safe landing and authored destination rules shared by both hosts. */
import { describe, expect, it } from "vitest";
import { FlatTileSource } from "./tile-source";
import {
  LandingWorld,
  holeDestinationFor,
  resolveWorldLanding,
} from "./world-transition";
import {
  createProgressionPortals,
  WorldPortalDestination,
} from "./world-space";
import { TileType } from "../types";

function openWorld(wraps = false): LandingWorld {
  return {
    tiles: new FlatTileSource(
      new Array<TileType>(25).fill(TileType.FLOOR),
      5,
      5,
    ),
    stairsUp: [1, 1],
    stairsDown: [3, 3],
    start: [2, 2],
    wraps,
  };
}
const destination: WorldPortalDestination = {
  spaceId: "test",
  planeId: "landing",
  entry: "start",
};

describe("world landing", () => {
  it.each([
    ["start", [2, 2]],
    ["stairs-up", [1, 1]],
    ["stairs-down", [3, 3]],
    ["same", [4, 4]],
  ] as const)("honors %s entry metadata", (entry, expected) => {
    expect(
      resolveWorldLanding(openWorld(), { ...destination, entry }, [4, 4]),
    ).toEqual(expected);
  });

  it("gives authored coordinates precedence over entry policy", () => {
    expect(
      resolveWorldLanding(openWorld(), { ...destination, x: 0, y: 3 }, [4, 4]),
    ).toEqual([0, 3]);
  });

  it("skips blocked, occupied, and hole landing cells in deterministic order", () => {
    const world = openWorld();
    world.tiles.setTile(2, 2, TileType.WALL);
    world.tiles.setTile(1, 2, TileType.HOLE);
    expect(
      resolveWorldLanding(
        world,
        destination,
        [0, 0],
        (x, y) => x === 3 && y === 2,
      ),
    ).toEqual([2, 3]);
  });

  it("clamps out-of-bounds authored destinations before searching", () => {
    expect(
      resolveWorldLanding(
        openWorld(),
        { ...destination, x: 900, y: -20 },
        [0, 0],
      ),
    ).toEqual([4, 0]);
  });

  it("wraps authored coordinates and the safe-neighbor search outside", () => {
    const world = openWorld(true);
    world.tiles.setTile(4, 2, TileType.WALL);
    expect(
      resolveWorldLanding(world, { ...destination, x: -1, y: 2 }, [0, 0]),
    ).toEqual([0, 2]);
  });

  it("refuses a destination with no safe landing", () => {
    const world = openWorld();
    for (let y = 0; y < 5; y++)
      for (let x = 0; x < 5; x++) world.tiles.setTile(x, y, TileType.WALL);
    expect(resolveWorldLanding(world, destination, [0, 0])).toBeNull();
  });
});

describe("hole destinations", () => {
  it.each(["stairs", "ladder"] as const)(
    "uses the %s portal rather than assuming aligned floor coordinates",
    (kind) => {
      const address = { spaceId: "megacorp", planeId: "floor-1" };
      const portals = createProgressionPortals(
        address,
        1,
        [10, 10],
        [1, 1],
      ).map((portal) => ({ ...portal, kind }));
      expect(
        holeDestinationFor(
          {
            worldSpaceId: address.spaceId,
            worldPlaneId: address.planeId,
            depth: 1,
            portals,
            stairsDown: [10, 10],
          },
          [9, 10],
        ),
      ).toEqual(portals[0].destination);
    },
  );

  it("preserves an authored hole's explicit destination and landing policy", () => {
    const source = { spaceId: "outside", planeId: "surface", x: 3, y: 4 };
    expect(
      holeDestinationFor(
        {
          worldSpaceId: source.spaceId,
          worldPlaneId: source.planeId,
          depth: 0,
          stairsDown: [10, 10],
          portals: [{ id: "authored-hole", kind: "hole", source, destination }],
        },
        [3, 4],
      ),
    ).toEqual(destination);
  });
});
