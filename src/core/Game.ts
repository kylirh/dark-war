// Debug flag. TODO: Create a function to toggle debugging the entire game that can be triggered at runtime and also set as a build option.
const DEBUG = false;

import {
  GameState,
  EntityKind,
  Entity,
  Monster,
  MonsterType,
  Item,
  ItemType,
  TileType,
  SerializedState,
  MAP_WIDTH,
  MAP_HEIGHT,
  CELL_CONFIG,
} from "../types";
import { generateDungeon } from "./Map";
import { createPlayer, PlayerEntity } from "../entities/Player";
import { createMutant, createRat, MonsterEntity } from "../entities/Monster";
import { createItem, ItemEntity } from "../entities/Item";
import { createExplosive, ExplosiveEntity } from "../entities/Explosive";
import { RNG } from "../utils/RNG";
import { dist, passable, setPositionFromGrid } from "../utils/helpers";
import { computeFOV } from "../systems/FOV";
import { GameObject } from "../entities/GameObject";

/**
 * Main state manager
 * Orchestrates all systems and manages state
 */
export class Game {
  private state: GameState;
  private isDead = false;

  constructor() {
    this.state = this.createInitialState();
  }

  /**
   * Create initial game state
   */
  private createInitialState(): GameState {
    return {
      depth: 1,
      map: new Array(MAP_WIDTH * MAP_HEIGHT).fill(TileType.WALL),
      wallDamage: new Array(MAP_WIDTH * MAP_HEIGHT).fill(0),
      mapDirty: false,
      visible: new Set(),
      explored: new Set(),
      entities: [],
      player: createPlayer(0, 0),
      stairs: [0, 0],
      log: [],
      options: { fov: true },
      effects: [],
      sim: {
        nowTick: 0,
        mode: "REALTIME",
        timeScale: 0.01, // Start in slow motion
        targetTimeScale: 0.01,
        accumulatorMs: 0,
        lastFrameMs: performance.now(),
        pauseReasons: new Set(),
      },
      commandsByTick: new Map(),
      eventQueue: [],
      shouldDescend: false,
      changedTiles: new Set(),
    };
  }

  /**
   * Initialize a new game or level
   */
  public reset(depth: number = 1): void {
    if (DEBUG) console.time("reset: total");
    this.isDead = false;
    const dungeon = generateDungeon();

    this.state = {
      depth,
      map: dungeon.map,
      wallDamage: new Array(MAP_WIDTH * MAP_HEIGHT).fill(0),
      mapDirty: false,
      visible: new Set(),
      explored: new Set(),
      entities: [],
      player: createPlayer(dungeon.start[0], dungeon.start[1]),
      stairs: dungeon.stairs,
      log: [],
      options: { fov: true },
      effects: [],
      // NEW: Simulation system
      sim: {
        nowTick: 0,
        mode: "REALTIME",
        timeScale: 0.01, // Start in slow motion
        targetTimeScale: 0.01,
        accumulatorMs: 0,
        lastFrameMs: performance.now(),
        pauseReasons: new Set(),
      },
      commandsByTick: new Map(),
      eventQueue: [],
      shouldDescend: false,
      changedTiles: new Set(),
    };

    // Add player to entities
    this.state.entities.push(this.state.player);

    // Get free tiles once, upfront (optimized for performance)
    const freeTiles = this.getFreeTilesOptimized(dungeon.start);

    // Spawn monsters
    let ratCount = 0;
    let mutantCount = 0;
    for (let i = 0; i < 30 && freeTiles.length > 0; i++) {
      const tileIndex = RNG.int(freeTiles.length);
      const [x, y] = freeTiles[tileIndex];

      if (dist([x, y], dungeon.start) > 8) {
        const spawnRat = RNG.chance(0.5);
        if (spawnRat) {
          this.state.entities.push(createRat(x, y, depth));
          ratCount++;
        } else {
          this.state.entities.push(createMutant(x, y, depth));
          mutantCount++;
        }
        // Remove tile from available pool
        freeTiles.splice(tileIndex, 1);
      }
    }
    if (DEBUG) console.log(`Spawned ${ratCount} rats, ${mutantCount} mutants`);

    // Spawn items
    for (let i = 0; i < 10 && freeTiles.length > 0; i++) {
      const tileIndex = RNG.int(freeTiles.length);
      const [x, y] = freeTiles[tileIndex];
      this.state.entities.push(createItem(x, y, ItemType.AMMO));
      freeTiles.splice(tileIndex, 1);
    }

    for (let i = 0; i < 6 && freeTiles.length > 0; i++) {
      const tileIndex = RNG.int(freeTiles.length);
      const [x, y] = freeTiles[tileIndex];
      this.state.entities.push(createItem(x, y, ItemType.MEDKIT));
      freeTiles.splice(tileIndex, 1);
    }

    for (let i = 0; i < 3 && freeTiles.length > 0; i++) {
      const tileIndex = RNG.int(freeTiles.length);
      const [x, y] = freeTiles[tileIndex];
      this.state.entities.push(createItem(x, y, ItemType.KEYCARD));
      freeTiles.splice(tileIndex, 1);
    }

    for (let i = 0; i < 4 && freeTiles.length > 0; i++) {
      const tileIndex = RNG.int(freeTiles.length);
      const [x, y] = freeTiles[tileIndex];
      this.state.entities.push(createItem(x, y, ItemType.GRENADE));
      freeTiles.splice(tileIndex, 1);
    }

    for (let i = 0; i < 3 && freeTiles.length > 0; i++) {
      const tileIndex = RNG.int(freeTiles.length);
      const [x, y] = freeTiles[tileIndex];
      this.state.entities.push(createItem(x, y, ItemType.LAND_MINE));
      freeTiles.splice(tileIndex, 1);
    }

    this.addLog(`You descend into level ${depth}.`);

    this.updateFOV();
    if (DEBUG) console.timeEnd("reset: total");
  }

  /**
   * Get all walkable tiles (optimized - doesn't check entities)
   */
  private getFreeTilesOptimized(_start: [number, number]): [number, number][] {
    const tiles: [number, number][] = [];
    for (let y = 1; y < MAP_HEIGHT - 1; y++) {
      for (let x = 1; x < MAP_WIDTH - 1; x++) {
        if (passable(this.state.map, x, y)) {
          tiles.push([x, y]);
        }
      }
    }
    return tiles;
  }

  /**
   * Add message to log (newest first)
   */
  public addLog(message: string): void {
    this.state.log.unshift(message);
    if (this.state.log.length > 200) {
      this.state.log.pop();
    }
  }

  /**
   * Update field of view
   */
  public updateFOV(): void {
    this.state.visible = computeFOV(
      this.state.map,
      this.state.player,
      this.state.explored,
    );
  }

  /**
   * Toggle FOV option
   */
  public toggleFOV(): void {
    this.state.options.fov = !this.state.options.fov;
    // When toggling, recompute FOV to update visibility
    this.updateFOV();
  }

  /**
   * Resume from a specific pause reason (e.g., NPC dialog, death screen)
   * When all pause reasons are cleared, game unpauses automatically
   */
  public resumeFromPause(reason: string): void {
    this.state.sim.pauseReasons.delete(reason);
    if (this.state.sim.pauseReasons.size === 0) {
      this.state.sim.targetTimeScale = 1.0;
    }
  }

  /**
   * Descend to next level (called after tick completes with descend flag)
   */
  public descend(): void {
    this.state.depth++;

    const dungeon = generateDungeon();
    this.state.map = dungeon.map;
    this.state.stairs = dungeon.stairs;
    this.state.visible.clear();
    this.state.explored.clear();

    // Reset player position
    setPositionFromGrid(
      this.state.player as PlayerEntity,
      dungeon.start[0],
      dungeon.start[1],
    );
    this.state.player.nextActTick = this.state.sim.nowTick;

    // Remove monsters and items
    this.state.entities = this.state.entities.filter(
      (e) => e.kind === EntityKind.PLAYER,
    );

    // Get free tiles once, upfront
    const freeTiles = this.getFreeTilesOptimized(dungeon.start);

    // Spawn new monsters
    const monsterCount = 8 + this.state.depth;
    for (let i = 0; i < monsterCount && freeTiles.length > 0; i++) {
      const tileIndex = RNG.int(freeTiles.length);
      const [x, y] = freeTiles[tileIndex];

      if (dist([x, y], dungeon.start) > 8) {
        const spawnRat = RNG.chance(0.5);
        if (spawnRat) {
          this.state.entities.push(createRat(x, y, this.state.depth));
        } else {
          this.state.entities.push(createMutant(x, y, this.state.depth));
        }
        freeTiles.splice(tileIndex, 1);
      }
    }

    // Spawn items
    for (let i = 0; i < 10 && freeTiles.length > 0; i++) {
      const tileIndex = RNG.int(freeTiles.length);
      const [x, y] = freeTiles[tileIndex];
      this.state.entities.push(createItem(x, y, ItemType.AMMO));
      freeTiles.splice(tileIndex, 1);
    }

    for (let i = 0; i < 6 && freeTiles.length > 0; i++) {
      const tileIndex = RNG.int(freeTiles.length);
      const [x, y] = freeTiles[tileIndex];
      this.state.entities.push(createItem(x, y, ItemType.MEDKIT));
      freeTiles.splice(tileIndex, 1);
    }

    for (let i = 0; i < 3 && freeTiles.length > 0; i++) {
      const tileIndex = RNG.int(freeTiles.length);
      const [x, y] = freeTiles[tileIndex];
      this.state.entities.push(createItem(x, y, ItemType.KEYCARD));
      freeTiles.splice(tileIndex, 1);
    }

    this.updateFOV();
    this.addLog(`Level ${this.state.depth}`);
  }

  /**
   * Get current game state
   */
  public getState(): GameState {
    return this.state;
  }

  /**
   * Check if player is dead
   */
  public isPlayerDead(): boolean {
    return this.isDead;
  }

  /**
   * Update death status based on player HP
   * Returns true if player just died this check (for UI layer to handle)
   */
  public updateDeathStatus(): boolean {
    if (this.state.player.hp <= 0 && !this.isDead) {
      this.isDead = true;

      // Stop player movement immediately
      const player = this.state.player;
      if ("velocityX" in player && "velocityY" in player) {
        (player as any).velocityX = 0;
        (player as any).velocityY = 0;
      }

      // Speed up time to normal (remove time dilation)
      this.state.sim.targetTimeScale = 1.0;

      return true; // Signal that death just occurred
    }
    return false;
  }

  /**
   * Serialize game state for saving
   */
  public serialize(): SerializedState {
    return {
      depth: this.state.depth,
      map: this.state.map,
      wallDamage: this.state.wallDamage,
      stairs: this.state.stairs,
      player: this.state.player,
      entities: this.state.entities.filter((e) => e !== this.state.player),
      explored: Array.from(this.state.explored),
      log: this.state.log.slice(0, 50),
      sim: {
        nowTick: this.state.sim.nowTick,
        mode: this.state.sim.mode,
      },
    };
  }

  /**
   * Load game state from serialized data
   */
  public deserialize(data: SerializedState): void {
    const wallDamage =
      data.wallDamage && data.wallDamage.length === data.map.length
        ? data.wallDamage.slice()
        : new Array(data.map.length).fill(0);
    // Reconstruct player entity (may be plain object from old save)
    let player = data.player;
    if (!(player instanceof PlayerEntity)) {
      const [gridX, gridY] = this.getGridPositionFromSerialized(player);
      const p = createPlayer(gridX, gridY);
      Object.assign(p, player);
      this.syncWorldPosition(p, player);
      player = p;
    }

    // Reconstruct other entities
    const entities: Entity[] = [player];
    for (const entity of data.entities) {
      if (
        entity.kind === EntityKind.MONSTER &&
        !(entity instanceof MonsterEntity)
      ) {
        const [gridX, gridY] = this.getGridPositionFromSerialized(entity);
        const monster =
          (entity as Monster).type === MonsterType.RAT
            ? createRat(gridX, gridY, data.depth)
            : createMutant(gridX, gridY, data.depth);
        Object.assign(monster, entity);
        this.syncWorldPosition(monster, entity);
        entities.push(monster);
      } else if (
        entity.kind === EntityKind.MONSTER &&
        entity instanceof MonsterEntity
      ) {
        this.syncWorldPosition(entity, entity);
        entities.push(entity);
      } else if (
        entity.kind === EntityKind.ITEM &&
        !(entity instanceof ItemEntity)
      ) {
        const [gridX, gridY] = this.getGridPositionFromSerialized(entity);
        const item = createItem(
          gridX,
          gridY,
          (entity as Item).type,
          (entity as Item).amount ?? 0,
        );
        Object.assign(item, entity);
        this.syncWorldPosition(item, entity);
        entities.push(item);
      } else if (
        entity.kind === EntityKind.ITEM &&
        entity instanceof ItemEntity
      ) {
        this.syncWorldPosition(entity, entity);
        entities.push(entity);
      } else if (
        entity.kind === EntityKind.EXPLOSIVE &&
        !(entity instanceof ExplosiveEntity)
      ) {
        const explosive = createExplosive(
          (entity as any).worldX,
          (entity as any).worldY,
          (entity as any).type,
          (entity as any).armed,
          (entity as any).fuseTicks,
        );
        Object.assign(explosive, entity);
        this.syncWorldPosition(explosive, entity);
        entities.push(explosive);
      } else if (
        entity.kind === EntityKind.EXPLOSIVE &&
        entity instanceof ExplosiveEntity
      ) {
        this.syncWorldPosition(entity, entity);
        entities.push(entity);
      } else {
        entities.push(entity);
      }
    }

    this.state = {
      depth: data.depth,
      map: data.map,
      wallDamage,
      mapDirty: false,
      stairs: data.stairs,
      visible: new Set(),
      explored: new Set(data.explored),
      entities,
      player,
      log: data.log || [],
      options: { fov: true },
      effects: [],
      sim: {
        nowTick: data.sim.nowTick,
        mode: data.sim.mode,
        timeScale: 1.0,
        targetTimeScale: 1.0,
        accumulatorMs: 0,
        lastFrameMs: performance.now(),
        pauseReasons: new Set(),
      },
      commandsByTick: new Map(),
      eventQueue: [],
      shouldDescend: false,
    };

    this.isDead = false;
    this.updateFOV();
  }

  private getGridPositionFromSerialized(entity: {
    worldX?: number;
    worldY?: number;
    gridX?: number;
    gridY?: number;
  }): [number, number] {
    if (
      typeof entity.worldX === "number" &&
      typeof entity.worldY === "number"
    ) {
      return [
        Math.floor(entity.worldX / CELL_CONFIG.w),
        Math.floor(entity.worldY / CELL_CONFIG.h),
      ];
    }
    if (typeof entity.gridX === "number" && typeof entity.gridY === "number") {
      return [entity.gridX, entity.gridY];
    }
    return [0, 0];
  }

  private syncWorldPosition(
    entity: GameObject,
    source: {
      worldX?: number;
      worldY?: number;
      prevWorldX?: number;
      prevWorldY?: number;
    },
  ): void {
    if (typeof source.worldX === "number") {
      entity.worldX = source.worldX;
    }
    if (typeof source.worldY === "number") {
      entity.worldY = source.worldY;
    }
    entity.prevWorldX =
      typeof source.prevWorldX === "number" ? source.prevWorldX : entity.worldX;
    entity.prevWorldY =
      typeof source.prevWorldY === "number" ? source.prevWorldY : entity.worldY;
  }
}
