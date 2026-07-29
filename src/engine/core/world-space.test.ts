/** Tests for stable world-space and plane identities. */

import { describe, expect, it } from "vitest";
import { Game } from "./game";
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
});
