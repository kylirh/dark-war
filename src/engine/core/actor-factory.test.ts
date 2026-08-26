import { describe, it, expect, vi } from "vitest";
import {
  WORKSHOP_BUILDER_ID,
  consumeSpawnMarker,
  createParkBuilder,
  createWorkshopBuilder,
  stableSpawnMarkerId,
} from "./actor-factory";
import { WorldAddress } from "./world-space";
import { MonsterType } from "../types";

describe("actor-factory", () => {
  describe("stableSpawnMarkerId", () => {
    it("generates a predictable string based on address, instance ID, and marker ID", () => {
      const address: WorldAddress = {
        spaceId: "test-space",
        planeId: "test-plane",
      };
      const result = stableSpawnMarkerId(address, "prefab-123", "marker-456");
      expect(result).toBe("test-space/test-plane:prefab-123:marker:marker-456");
    });
  });

  describe("consumeSpawnMarker", () => {
    it("adds the marker to the ledger and calls create() if the marker is not present", () => {
      const ledger = new Set<string>();
      const createMock = vi.fn(() => ({ type: "test-entity" }));

      const result = consumeSpawnMarker(ledger, "marker-1", createMock);

      expect(ledger.has("marker-1")).toBe(true);
      expect(createMock).toHaveBeenCalledOnce();
      expect(result).toEqual({ type: "test-entity" });
    });

    it("returns null and does not call create() if the marker is already in the ledger", () => {
      const ledger = new Set<string>(["marker-1"]);
      const createMock = vi.fn(() => ({ type: "test-entity" }));

      const result = consumeSpawnMarker(ledger, "marker-1", createMock);

      expect(ledger.has("marker-1")).toBe(true);
      expect(createMock).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });
  });

  describe("createWorkshopBuilder", () => {
    it("creates the Marda entity with the correct configuration", () => {
      const builder = createWorkshopBuilder(10, 20);

      expect(builder.gridX).toBe(10);
      expect(builder.gridY).toBe(20);
      expect(builder.type).toBe(MonsterType.WORKSHOP_BUILDER);
      expect(builder.id).toBe(WORKSHOP_BUILDER_ID);
      expect(builder.name).toBe("Marda");
      expect(builder.peaceful).toBe(true);
      expect(builder.interactable).toEqual({ affordances: ["talk"] });
      expect(builder.social).toEqual({ defId: "settler.workshop-builder" });

      // Verify occupation
      expect(builder.occupation?.type).toBe("builder");
      expect(builder.occupation?.home).toEqual({
        worldSpaceId: "outside",
        worldPlaneId: "surface",
        x: 10,
        y: 20,
      });
      expect(builder.occupation?.schedule.phaseOffset).toBe(0);
    });
  });

  describe("createParkBuilder", () => {
    it("creates the Bram entity with the correct configuration", () => {
      const builder = createParkBuilder(15, 25, "custom-stable-id");

      expect(builder.gridX).toBe(15);
      expect(builder.gridY).toBe(25);
      expect(builder.type).toBe(MonsterType.WORKSHOP_BUILDER);
      expect(builder.id).toBe("custom-stable-id");
      expect(builder.name).toBe("Bram");
      expect(builder.peaceful).toBe(true);
      expect(builder.interactable).toEqual({ affordances: ["talk"] });
      expect(builder.social).toEqual({ defId: "settler.park-builder" });

      // Verify occupation
      expect(builder.occupation?.type).toBe("builder");
      expect(builder.occupation?.home).toEqual({
        worldSpaceId: "outside",
        worldPlaneId: "surface",
        x: 15,
        y: 25,
      });
      expect(builder.occupation?.schedule.phaseOffset).toBe(600);
    });
  });
});
