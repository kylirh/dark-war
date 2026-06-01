import { describe, it, expect, beforeEach } from "vitest";
import { Game } from "../../core/game";
import { Physics } from "../physics";
import { BulletEntity } from "../../entities/bullet-entity";
import { EntityKind, ItemType, CommandType } from "../../types";
import { RNG } from "../../utils/rng";
import { enqueueCommand } from "./commands";
import { stepSimulationTick } from "./tick";

describe("throwing bones and rocks", () => {
  beforeEach(() => RNG.reseed(8));

  it("throws the active item as a thrown projectile and consumes one", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    const state = game.getState();
    const player = state.player;
    player.itemCounts[ItemType.ROCK] = 2;
    player.selectedBarSlot = 0;
    player.inventorySlots[0] = { type: ItemType.ROCK };
    player.facingAngle = 0;

    enqueueCommand(state, {
      tick: state.sim.nowTick,
      actorId: player.id,
      type: CommandType.USE_ITEM,
      data: { type: "USE_ITEM", dx: 1, dy: 0 },
      priority: 0,
      source: "PLAYER",
    });
    stepSimulationTick(state);

    const thrown = state.entities.find(
      (e): e is BulletEntity =>
        e.kind === EntityKind.BULLET &&
        (e as BulletEntity).thrownItem === ItemType.ROCK,
    );
    expect(thrown).toBeDefined();
    expect(thrown!.velocityX).toBeGreaterThan(0);
    expect(player.itemCounts[ItemType.ROCK]).toBe(1);
  });

  it("comes to rest and drops back as a pickable item", () => {
    const game = new Game({ mode: "offline" });
    game.reset(1);
    const state = game.getState();
    const physics = new Physics();

    // A rock flying to the right, well clear of walls near the player start.
    const rock = new BulletEntity(
      state.player.worldX + 24,
      state.player.worldY,
      200,
      0,
      3,
      state.player.id,
      2000,
      6,
      0,
    );
    rock.thrownItem = ItemType.ROCK;
    state.entityManager.spawn(rock);
    const rockId = rock.id;

    physics.rebuildAll(state);
    // Friction brings it to rest within a couple of seconds.
    for (let i = 0; i < 120; i++) physics.updateBullets(state, 1 / 20);

    // The projectile is gone and a rock item is on the floor again.
    expect(state.entities.some((e) => e.id === rockId)).toBe(false);
    expect(
      state.entities.some(
        (e) => e.kind === EntityKind.ITEM && (e as any).type === ItemType.ROCK,
      ),
    ).toBe(true);
  });
});
