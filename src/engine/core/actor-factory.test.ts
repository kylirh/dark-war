/**
 * Coverage for the authored social-actor factories.
 *
 * Actors are ordinary MONSTER-kind entities wearing social/interactable
 * components, and their identity is what keeps a regenerating level from
 * spawning duplicates. These tests pin the stable ids, the once-only spawn
 * ledger, and the component wiring each builder depends on to be talkable.
 */

import { describe, it, expect, vi } from "vitest";
import {
  WORKSHOP_BUILDER_ID,
  consumeSpawnMarker,
  createParkBuilder,
  createWorkshopBuilder,
  stableSpawnMarkerId,
} from "./actor-factory";
import { WorldAddress } from "./world-space";
import { EntityKind, MonsterType } from "../types";
import { SOCIAL_DEFS } from "../content/social-defs";

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

    it("is stable across calls and distinct per input", () => {
      const address: WorldAddress = { spaceId: "outside", planeId: "surface" };
      const other: WorldAddress = { spaceId: "outside", planeId: "cave" };

      expect(stableSpawnMarkerId(address, "p", 1)).toBe(
        stableSpawnMarkerId(address, "p", 1),
      );
      expect(stableSpawnMarkerId(address, "p", 1)).not.toBe(
        stableSpawnMarkerId(other, "p", 1),
      );
      expect(stableSpawnMarkerId(address, "p", 1)).not.toBe(
        stableSpawnMarkerId(address, "q", 1),
      );
      expect(stableSpawnMarkerId(address, "p", 1)).not.toBe(
        stableSpawnMarkerId(address, "p", 2),
      );
    });

    it("accepts numeric marker ids", () => {
      const address: WorldAddress = { spaceId: "outside", planeId: "surface" };
      expect(stableSpawnMarkerId(address, "prefab", 7)).toBe(
        "outside/surface:prefab:marker:7",
      );
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

    it("consumes a marker exactly once across repeated calls", () => {
      // The whole point of the ledger: a level regenerating under the same
      // world address must not spawn a second copy of an authored actor.
      const ledger = new Set<string>();
      const create = vi.fn(() => ({ type: "test-entity" }));

      expect(consumeSpawnMarker(ledger, "m", create)).not.toBeNull();
      expect(consumeSpawnMarker(ledger, "m", create)).toBeNull();
      expect(consumeSpawnMarker(ledger, "m", create)).toBeNull();
      expect(create).toHaveBeenCalledOnce();
      expect(ledger.size).toBe(1);
    });

    it("keeps distinct markers independent", () => {
      const ledger = new Set<string>();
      const create = vi.fn(() => ({ type: "test-entity" }));

      expect(consumeSpawnMarker(ledger, "a", create)).not.toBeNull();
      expect(consumeSpawnMarker(ledger, "b", create)).not.toBeNull();
      expect(create).toHaveBeenCalledTimes(2);
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

  describe("both builders", () => {
    it("are peaceful, talkable MONSTER-kind entities with a decision agent", () => {
      for (const builder of [
        createWorkshopBuilder(1, 2),
        createParkBuilder(3, 4, "id"),
      ]) {
        expect(builder.kind).toBe(EntityKind.MONSTER);
        expect(builder.peaceful).toBe(true);
        expect(builder.interactable?.affordances).toContain("talk");
        expect(builder.agent).toBeDefined();
        expect(builder.occupation?.workRadius).toBeGreaterThan(0);
      }
    });

    it("reference social defs that actually exist", () => {
      // A dangling defId does not crash - it produces a silent NPC that cannot
      // be talked to, which is easy to ship without noticing.
      for (const builder of [
        createWorkshopBuilder(1, 2),
        createParkBuilder(3, 4, "id"),
      ]) {
        const defId = builder.social?.defId;
        expect(defId, "builder has no social defId").toBeDefined();
        expect(
          SOCIAL_DEFS[defId!],
          `${defId} is not present in SOCIAL_DEFS`,
        ).toBeDefined();
      }
    });

    it("stagger their work schedules so the two are not in lockstep", () => {
      const marda = createWorkshopBuilder(1, 2);
      const bram = createParkBuilder(3, 4, "id");
      expect(bram.occupation?.schedule.phaseOffset).not.toBe(
        marda.occupation?.schedule.phaseOffset,
      );
      expect(marda.occupation?.schedule.workTicks).toBe(
        bram.occupation?.schedule.workTicks,
      );
    });

    it("gives Marda a fixed id and Bram a caller-supplied one", () => {
      // Marda is placed by the level generator, so her id is derived from the
      // plane; Bram comes from a prefab marker, so his id comes from that.
      expect(createWorkshopBuilder(1, 2).id).toBe(
        createWorkshopBuilder(9, 9).id,
      );
      expect(createParkBuilder(1, 2, "marker-a").id).toBe("marker-a");
      expect(createParkBuilder(1, 2, "marker-b").id).toBe("marker-b");
    });
  });
});
