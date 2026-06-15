import { describe, it, expect } from "vitest";
import { Game } from "../../core/game";
import { Physics } from "../physics";
import { MonsterEntity } from "../../entities/monster-entity";
import { ItemEntity } from "../../entities/item-entity";
import {
  EntityKind,
  MonsterType,
  ItemType,
  TileType,
  CommandType,
  EventType,
} from "../../types";
import { idxFor } from "../../utils/helpers";
import { RNG } from "../../utils/rng";
import { enqueueCommand } from "./commands";
import { stepSimulationTick } from "./tick";
import { pushEvent } from "./sim-helpers";
import { processEventQueue } from "./events";

function clearMonsters(game: Game) {
  game
    .getState()
    .entityManager.destroyWhere((e) => e.kind === EntityKind.MONSTER);
}

describe("snagglepuss", () => {
  it("can be befriended by eating a cookie nearby", () => {
    let befriended = false;
    for (let seed = 1; seed <= 20 && !befriended; seed++) {
      RNG.reseed(seed);
      const game = new Game({ mode: "offline" });
      game.reset(2);
      clearMonsters(game);
      const state = game.getState();
      const player = state.player;
      player.itemCounts[ItemType.COOKIE] = 1;
      player.selectedBarSlot = 0;
      player.inventorySlots[0] = { type: ItemType.COOKIE };

      const snagg = new MonsterEntity(
        player.gridX + 1,
        player.gridY,
        MonsterType.SNAGGLEPUSS,
        2,
      );
      state.entityManager.spawn(snagg);

      enqueueCommand(state, {
        tick: state.sim.nowTick,
        actorId: player.id,
        type: CommandType.USE_ITEM,
        data: { type: "USE_ITEM", dx: 1, dy: 0 },
        priority: 0,
        source: "PLAYER",
      });
      stepSimulationTick(state);
      if (snagg.friendly) {
        befriended = true;
        expect(snagg.ownerId).toBe(player.id);
      }
    }
    expect(befriended).toBe(true);
  });

  it("a friendly snagglepuss fetches loose loot", () => {
    RNG.reseed(3);
    const game = new Game({ mode: "offline" });
    game.reset(2);
    clearMonsters(game);
    const state = game.getState();
    const player = state.player;

    // Clear a floor lane so the pet can walk to the loot.
    for (let dx = 0; dx <= 5; dx++) {
      state.map[idxFor(player.gridX + dx, player.gridY, state.mapWidth)] =
        TileType.FLOOR;
    }

    const snagg = new MonsterEntity(
      player.gridX + 2,
      player.gridY,
      MonsterType.SNAGGLEPUSS,
      2,
    );
    snagg.friendly = true;
    snagg.ownerId = player.id;
    state.entityManager.spawn(snagg);

    // A coin a couple of tiles past the pet, away from the player.
    const loot = new ItemEntity(player.gridX + 4, player.gridY, ItemType.COIN);
    state.entityManager.spawn(loot);
    const lootId = loot.id;

    const physics = new Physics();
    physics.rebuildAll(state);
    for (let i = 0; i < 200; i++) {
      stepSimulationTick(state);
      physics.updatePhysics(state, 1 / 20);
    }

    // The original loot has been collected (fetched) by the pet.
    expect(state.entities.some((e) => e.id === lootId)).toBe(false);
  });
});

describe("snagglepuss theft only takes count-backed items", () => {
  function setup() {
    RNG.reseed(1);
    const game = new Game({ mode: "offline" });
    game.reset(2);
    clearMonsters(game);
    const state = game.getState();
    const player = state.player;
    player.itemCounts = {}; // start with no count-backed trinkets
    player.selectedBarSlot = 0; // equipped weapon slot (never stolen)
    const snagg = new MonsterEntity(
      player.gridX + 1,
      player.gridY,
      MonsterType.SNAGGLEPUSS,
      2,
    );
    state.entityManager.spawn(snagg);
    return { state, player, snagg };
  }

  function snaggHits(
    state: ReturnType<Game["getState"]>,
    snagg: MonsterEntity,
  ) {
    pushEvent(state, {
      type: EventType.DAMAGE,
      data: {
        type: "DAMAGE",
        targetId: state.player.id,
        sourceId: snagg.id,
        amount: 1,
      },
    });
    processEventQueue(state);
  }

  it("does not steal stateful gear (grenades stay with the player)", () => {
    const { state, player, snagg } = setup();
    player.grenades = 3;
    player.inventorySlots[1] = { type: ItemType.GRENADE };

    snaggHits(state, snagg);

    // Grenade state lives in player.grenades, not itemCounts, so it's off-limits.
    expect(snagg.carriedItems.length).toBe(0);
    expect(player.grenades).toBe(3);
    expect(player.inventorySlots[1].type).toBe(ItemType.GRENADE);
    expect(snagg.fleeing).toBeFalsy();
  });

  it("steals a count-backed trinket (bone) and removes it from the player", () => {
    const { state, player, snagg } = setup();
    player.itemCounts[ItemType.BONE] = 1;
    player.inventorySlots[1] = { type: ItemType.BONE };

    snaggHits(state, snagg);

    expect(snagg.carriedItems.some((c) => c.type === ItemType.BONE)).toBe(true);
    expect(player.itemCounts[ItemType.BONE]).toBeUndefined();
    expect(snagg.fleeing).toBe(true);
  });
});
