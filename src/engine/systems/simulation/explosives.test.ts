/**
 * Coverage for the explosive simulation: fuse countdown, proximity triggering,
 * landed-grenade jitter, and effect lifetime.
 *
 * These run against a real Game so the entity manager, event queue and level
 * are the production ones; only RNG is pinned, since bounce direction is
 * deliberately random.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { Game } from "../../core/game";
import {
  ItemType,
  EventType,
  EntityKind,
  MonsterType,
  Effect,
} from "../../types";
import { ExplosiveEntity } from "../../entities/explosive-entity";
import { MonsterEntity } from "../../entities/monster-entity";
import {
  triggerExplosion,
  updateExplosives,
  updateLandedGrenadeBounce,
  updateEffects,
} from "./explosives";
import { EXPLOSIVE_CONFIG, SIM_DT_MS } from "./constants";
import { RNG } from "../../utils/rng";

describe("explosives simulation", () => {
  let game: Game;

  beforeEach(() => {
    RNG.reseed(2024);
    game = new Game({ mode: "offline" });
    game.reset(1);
  });

  describe("triggerExplosion", () => {
    it("pushes an EXPLOSION event to the state", () => {
      const state = game.getState();
      const initialEventsCount = state.eventQueue.length;
      const x = 100;
      const y = 200;

      triggerExplosion(state, x, y, ItemType.GRENADE, "test_cause");

      expect(state.eventQueue.length).toBeGreaterThan(initialEventsCount);
      const explosionEvent = state.eventQueue[state.eventQueue.length - 1];

      expect(explosionEvent.type).toBe(EventType.EXPLOSION);
      if (
        explosionEvent.type === EventType.EXPLOSION &&
        explosionEvent.data.type === "EXPLOSION"
      ) {
        expect(explosionEvent.data.x).toBe(Math.floor(x / 32));
        expect(explosionEvent.data.y).toBe(Math.floor(y / 32));
        expect(explosionEvent.data.radius).toBe(
          EXPLOSIVE_CONFIG[ItemType.GRENADE].radius,
        );
        expect(explosionEvent.data.damage).toBe(
          EXPLOSIVE_CONFIG[ItemType.GRENADE].damage,
        );
        expect(explosionEvent.cause).toBe("test_cause");
      } else {
        expect.fail("Expected an EXPLOSION event");
      }
    });
  });

  describe("updateExplosives", () => {
    describe("Grenades", () => {
      it("decrements fuseTicks and does not explode if fuse > 0", () => {
        const state = game.getState();
        const initialEventsCount = state.eventQueue.length;

        const grenade = new ExplosiveEntity(
          100,
          100,
          ItemType.GRENADE,
          true,
          5,
        );
        state.entityManager.spawn(grenade);

        updateExplosives(state);

        expect(grenade.fuseTicks).toBe(4);
        expect(state.eventQueue.length).toBe(initialEventsCount); // No explosion yet
        expect(state.entityManager.getById(grenade.id)).toBeDefined();
      });

      it("triggers explosion and destroys entity when fuse reaches 0", () => {
        const state = game.getState();

        const grenade = new ExplosiveEntity(
          100,
          100,
          ItemType.GRENADE,
          true,
          1,
        );
        state.entityManager.spawn(grenade);

        updateExplosives(state); // fuse goes to 0 -> explosion

        const explosionEvent = state.eventQueue.find(
          (e) => e.type === EventType.EXPLOSION,
        );
        expect(explosionEvent).toBeDefined();

        // Entity should be removed
        expect(state.entityManager.getById(grenade.id)).toBeUndefined();
      });

      it("calls updateLandedGrenadeBounce if grenade has landed", () => {
        const state = game.getState();
        const grenade = new ExplosiveEntity(
          100,
          100,
          ItemType.GRENADE,
          true,
          5,
        );
        grenade.hasLanded = true;
        grenade.landingWorldX = 100;
        grenade.landingWorldY = 100;
        grenade.velocityX = 0;
        grenade.velocityY = 0;
        state.entityManager.spawn(grenade);

        // Mock RNG for deterministic test
        const rMock = vi.spyOn(RNG, "int").mockReturnValue(0);

        updateExplosives(state);

        // Should have updated bounce velocity based on RNG mock logic
        // Because speed was < 10, bounce triggers
        expect(grenade.landingBounceCooldownTicks).toBeGreaterThan(0);

        rMock.mockRestore();
      });
    });

    describe("Land Mines", () => {
      it("does not trigger if no actor is nearby", () => {
        const state = game.getState();
        // Move player away
        state.player.worldX = 1000;
        state.player.worldY = 1000;

        // Remove monsters near 100,100
        state.entityManager.destroyWhere((e) => e.kind === EntityKind.MONSTER);

        const mine = new ExplosiveEntity(100, 100, ItemType.LAND_MINE, true);
        state.entityManager.spawn(mine);

        updateExplosives(state);

        // Mine should still be there
        expect(state.entityManager.getById(mine.id)).toBeDefined();
      });

      it("triggers when an actor enters the radius", () => {
        const state = game.getState();

        const mine = new ExplosiveEntity(100, 100, ItemType.LAND_MINE, true);
        state.entityManager.spawn(mine);

        // Place monster exactly at the mine to trigger it
        const monster = new MonsterEntity(100, 100, MonsterType.MUTANT, 1);
        monster.worldX = 100;
        monster.worldY = 100;
        state.entityManager.spawn(monster);

        updateExplosives(state);

        // Mine should be destroyed and explosion triggered
        expect(state.entityManager.getById(mine.id)).toBeUndefined();
        const explosionEvent = state.eventQueue.find(
          (e) => e.type === EventType.EXPLOSION,
        );
        expect(explosionEvent).toBeDefined();
      });

      it("ignores the owner if ignoreOwnerTicks > 0", () => {
        const state = game.getState();
        const player = state.player;
        player.worldX = 100;
        player.worldY = 100;

        // Remove other actors to isolate test
        state.entityManager.destroyWhere((e) => e.kind === EntityKind.MONSTER);

        const mine = new ExplosiveEntity(
          100,
          100,
          ItemType.LAND_MINE,
          true,
          undefined,
          player.id,
          5,
        );
        state.entityManager.spawn(mine);

        updateExplosives(state);

        // Mine should not trigger for owner
        expect(state.entityManager.getById(mine.id)).toBeDefined();
      });

      it("triggers on owner if ignoreOwnerTicks is 0", () => {
        const state = game.getState();
        const player = state.player;
        player.worldX = 100;
        player.worldY = 100;

        state.entityManager.destroyWhere((e) => e.kind === EntityKind.MONSTER);

        const mine = new ExplosiveEntity(
          100,
          100,
          ItemType.LAND_MINE,
          true,
          undefined,
          player.id,
          0,
        );
        state.entityManager.spawn(mine);

        updateExplosives(state);

        // Mine SHOULD trigger for owner since ignore ticks expired
        expect(state.entityManager.getById(mine.id)).toBeUndefined();
      });
    });
  });

  describe("updateLandedGrenadeBounce", () => {
    it("returns early if no landing position is set", () => {
      const explosive = new ExplosiveEntity(100, 100, ItemType.GRENADE, true);
      explosive.velocityX = 0;
      explosive.velocityY = 0;
      // Intentionally not setting landingWorldX/Y

      updateLandedGrenadeBounce(explosive);

      expect(explosive.velocityX).toBe(0);
      expect(explosive.landingBounceCooldownTicks).toBe(0);
    });

    it("does nothing if speed > 10", () => {
      const explosive = new ExplosiveEntity(100, 100, ItemType.GRENADE, true);
      explosive.landingWorldX = 100;
      explosive.landingWorldY = 100;
      explosive.velocityX = 15;
      explosive.velocityY = 0;

      updateLandedGrenadeBounce(explosive);

      // Velocity shouldn't be altered by bounce logic
      expect(explosive.velocityX).toBe(15);
      expect(explosive.landingBounceCooldownTicks).toBe(0);
    });

    it("decrements landingBounceCooldownTicks if > 0", () => {
      const explosive = new ExplosiveEntity(100, 100, ItemType.GRENADE, true);
      explosive.landingWorldX = 100;
      explosive.landingWorldY = 100;
      explosive.velocityX = 0;
      explosive.velocityY = 0;
      explosive.landingBounceCooldownTicks = 2;

      updateLandedGrenadeBounce(explosive);

      expect(explosive.landingBounceCooldownTicks).toBe(1);
      expect(explosive.velocityX).toBe(0); // No bounce yet
    });

    it("applies bounce velocity based on offset and random chance", () => {
      const explosive = new ExplosiveEntity(115, 100, ItemType.GRENADE, true);
      explosive.landingWorldX = 100;
      explosive.landingWorldY = 100;
      explosive.velocityX = 0;
      explosive.velocityY = 0;
      explosive.landingBounceCooldownTicks = 0;

      const rMock = vi.spyOn(RNG, "int").mockReturnValue(0);

      updateLandedGrenadeBounce(explosive);

      expect(explosive.velocityX).not.toBe(0);
      expect(explosive.landingBounceCooldownTicks).toBeGreaterThan(0);

      rMock.mockRestore();
    });
  });

  describe("updateEffects", () => {
    it("keeps surviving effects in order when one in the middle expires", () => {
      // updateEffects compacts in place with a write index. An off-by-one there
      // duplicates or drops a survivor, which a two-effect test cannot see.
      const state = game.getState();
      state.effects = [
        {
          id: "a",
          type: "spark",
          worldX: 0,
          worldY: 0,
          ageTicks: 0,
          durationTicks: 9,
        },
        {
          id: "b",
          type: "spark",
          worldX: 0,
          worldY: 0,
          ageTicks: 8,
          durationTicks: 9,
        },
        {
          id: "c",
          type: "spark",
          worldX: 0,
          worldY: 0,
          ageTicks: 0,
          durationTicks: 9,
        },
      ] as Effect[];

      updateEffects(state);

      expect(state.effects.map((e) => e.id)).toEqual(["a", "c"]);
    });

    it("increments ageTicks and removes expired effects", () => {
      const state = game.getState();

      const effect1: Effect = {
        id: "e1",
        type: "explosion",
        worldX: 100,
        worldY: 100,
        ageTicks: 0,
        durationTicks: 2,
      };

      const effect2: Effect = {
        id: "e2",
        type: "hit_flash",
        worldX: 100,
        worldY: 100,
        ageTicks: 1, // Will become 2, so it expires since duration = 2
        durationTicks: 2,
      };

      state.effects = [effect1, effect2];

      updateEffects(state);

      expect(state.effects.length).toBe(1);
      expect(state.effects[0].id).toBe("e1");
      expect(state.effects[0].ageTicks).toBe(1);
    });

    it("updates position of spark effects based on velocity", () => {
      const state = game.getState();
      const dt = SIM_DT_MS / 1000;

      const spark: Effect = {
        id: "s1",
        type: "spark",
        worldX: 100,
        worldY: 100,
        ageTicks: 0,
        durationTicks: 10,
        velocityX: 100,
        velocityY: -50,
      };

      state.effects = [spark];

      updateEffects(state);

      expect(state.effects[0].worldX).toBe(100 + 100 * dt);
      expect(state.effects[0].worldY).toBe(100 - 50 * dt);
    });
  });

  describe("land mine trigger radius", () => {
    /** Isolate a mine at the origin with no other actors in range. */
    function armedMineAt(
      x: number,
      y: number,
    ): {
      state: ReturnType<Game["getState"]>;
      mine: ExplosiveEntity;
    } {
      const state = game.getState();
      state.entityManager.destroyWhere((e) => e.kind === EntityKind.MONSTER);
      state.player.worldX = 5000;
      state.player.worldY = 5000;
      const mine = new ExplosiveEntity(0, 0, ItemType.LAND_MINE, true);
      mine.worldX = x;
      mine.worldY = y;
      state.entityManager.spawn(mine);
      return { state, mine };
    }

    const TRIGGER_RADIUS = 32 * 0.45;

    it("triggers just inside the radius", () => {
      const { state, mine } = armedMineAt(100, 100);
      const monster = new MonsterEntity(0, 0, MonsterType.MUTANT, 1);
      monster.worldX = 100 + TRIGGER_RADIUS - 0.5;
      monster.worldY = 100;
      state.entityManager.spawn(monster);

      updateExplosives(state);

      expect(state.entityManager.getById(mine.id)).toBeUndefined();
    });

    it("does not trigger just outside the radius", () => {
      const { state, mine } = armedMineAt(100, 100);
      const monster = new MonsterEntity(0, 0, MonsterType.MUTANT, 1);
      monster.worldX = 100 + TRIGGER_RADIUS + 0.5;
      monster.worldY = 100;
      state.entityManager.spawn(monster);

      updateExplosives(state);

      expect(state.entityManager.getById(mine.id)).toBeDefined();
    });
  });
});
