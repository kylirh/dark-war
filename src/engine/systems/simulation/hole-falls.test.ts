import { describe, it, expect } from "vitest";
import { stepSimulationTick } from "./tick";
import { GameState, TileType, EntityKind, CELL_CONFIG } from "../../types";
import { PlayerEntity } from "../../entities/player-entity";
import { EntityManager } from "../../core/entity-manager";
import { FlatTileSource } from "../../core/tile-source";

describe("processHoleFalls player bug", () => {
  it("players fall into pre-existing holes when walking onto them", () => {
    const player = new PlayerEntity(1, 1);
    player.id = "player1";
    player.hp = 100;

    // Simulate walking onto a hole: previous coordinates were on an adjacent tile
    player.prevWorldX = 0 * CELL_CONFIG.w;
    player.prevWorldY = 1 * CELL_CONFIG.h;

    // Setup state where tile 1,1 is a hole
    const state = {
      sim: { nowTick: 0, mode: "REALTIME" as const },
      mapWidth: 3,
      mapHeight: 3,
      levelKind: "dungeon",
      tiles: {
        getTile: (x: number, y: number) => {
          if (x === 1 && y === 1) return TileType.HOLE;
          return TileType.FLOOR;
        },
      } as FlatTileSource,
      entities: [player],
      players: [player],
      entityManager: new EntityManager([player]),
      holeCreatedTiles: new Set<number>(), // No new holes
      pendingSounds: [],
      pendingAlerts: [],
      eventQueue: [],
      shouldDescend: false,
      conversations: new Map(),
      commandsByTick: new Map(),
      effects: [],
      projectiles: [],
      portals: [],
      options: { godMode: false },
    } as unknown as GameState;

    stepSimulationTick(state);

    // Check if shouldDescend was set
    expect(state.shouldDescend).toBe(true);
  });
});
