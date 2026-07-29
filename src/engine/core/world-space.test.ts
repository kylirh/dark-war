/** Tests for stable world-space and plane identities. */

import { describe, expect, it } from "vitest";
import { Game } from "./game";
import { ItemEntity } from "../entities/item-entity";
import { setPositionFromGrid } from "../utils/helpers";
import { ItemType } from "../types";
import { OUTSIDE_CAVE_MOUTH, parkWorkshopDoor } from "./outside-level";
import { WORKSHOP_INTERIOR_ADDRESS } from "./world-space-content";
import {
  createProgressionPortals,
  depthForWorldAddress,
  portalAt,
  worldAddressForDepth,
  worldAddressKey,
} from "./world-space";

describe("world addresses", () => {
  it("maps progression depth to stable semantic identities", () => {
    expect(worldAddressForDepth(0)).toEqual({
      spaceId: "outside",
      planeId: "surface",
    });
    expect(worldAddressForDepth(3)).toEqual({
      spaceId: "megacorp",
      planeId: "floor-3",
    });
    expect(depthForWorldAddress(worldAddressForDepth(3))).toBe(3);
    expect(worldAddressKey(worldAddressForDepth(3))).toBe("megacorp/floor-3");
  });

  it("serializes the active plane and cached planes by identity", () => {
    const game = new Game({ mode: "offline" });
    game.reset(0);
    game.descend();
    const state = game.getState();
    expect([state.worldSpaceId, state.worldPlaneId]).toEqual([
      "megacorp",
      "floor-1",
    ]);

    const serialized = game.serialize();
    expect([serialized.worldSpaceId, serialized.worldPlaneId]).toEqual([
      "megacorp",
      "floor-1",
    ]);
    expect(serialized.levels).toContainEqual(
      expect.objectContaining({
        worldSpaceId: "outside",
        worldPlaneId: "surface",
      }),
    );
    expect(serialized.portals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "megacorp/floor-1:stairs-down",
          kind: "stairs",
        }),
      ]),
    );
  });

  it("creates reversible progression portals discoverable by source cell", () => {
    const address = worldAddressForDepth(2);
    const portals = createProgressionPortals(address, 2, [8, 9], [2, 3]);

    expect(portalAt(portals, address, 8, 9)?.destination).toEqual({
      spaceId: "megacorp",
      planeId: "floor-3",
      entry: "stairs-up",
    });
    expect(portalAt(portals, address, 2, 3)?.destination).toEqual({
      spaceId: "megacorp",
      planeId: "floor-1",
      entry: "stairs-down",
    });
    expect(portalAt(portals, address, 4, 4)).toBeNull();
  });

  it("moves between the surface and an independently addressed cave", () => {
    const game = new Game({ mode: "offline" });
    game.reset(0);
    const outside = game.getState();
    setPositionFromGrid(
      outside.player,
      OUTSIDE_CAVE_MOUTH[0],
      OUTSIDE_CAVE_MOUTH[1],
    );
    outside.pendingPortalId = "outside/surface:park-grotto";

    game.descend();
    const cave = game.getState();
    expect([cave.worldSpaceId, cave.worldPlaneId]).toEqual([
      "caves",
      "park-grotto",
    ]);

    cave.pendingPortalId = "caves/park-grotto:exit";
    game.ascend();
    expect([
      game.getState().worldSpaceId,
      game.getState().worldPlaneId,
    ]).toEqual(["outside", "surface"]);
  });

  it("moves between the park and the workshop interior", () => {
    const game = new Game({ mode: "offline" });
    game.reset(0);
    const outside = game.getState();
    outside.itemsFellThrough = [{ type: ItemType.ROCK }];
    game.harvestFallenItems();
    const workshopDoor = parkWorkshopDoor();
    setPositionFromGrid(outside.player, workshopDoor[0], workshopDoor[1]);
    outside.pendingPortalId = "outside/surface:park-workshop";

    game.descend();
    const workshop = game.getState();
    expect([workshop.worldSpaceId, workshop.worldPlaneId]).toEqual([
      WORKSHOP_INTERIOR_ADDRESS.spaceId,
      WORKSHOP_INTERIOR_ADDRESS.planeId,
    ]);
    expect(workshop.depth).toBe(0);
    expect(
      workshop.entities.some(
        (entity) =>
          entity instanceof ItemEntity && entity.type === ItemType.ROCK,
      ),
    ).toBe(false);
    expect(workshop.worldPlane.passable(...workshop.stairsUp!)).toBe(true);

    workshop.pendingPortalId = "settlement/park-workshop:exit";
    game.ascend();
    expect([
      game.getState().worldSpaceId,
      game.getState().worldPlaneId,
    ]).toEqual(["outside", "surface"]);
    expect([
      game.getState().player.gridX,
      game.getState().player.gridY,
    ]).toEqual([workshopDoor[0], workshopDoor[1] + 1]);
  });
});
