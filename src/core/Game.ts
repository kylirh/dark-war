// Debug flag. TODO: Create a function to toggle debugging the entire game that can be triggered at runtime and also set as a build option.
const DEBUG = false;

import {
  GameState,
  EntityKind,
  Entity,
  Monster,
  Player,
  MonsterType,
  Item,
  ItemType,
  TileType,
  SerializedState,
  MAP_WIDTH,
  MAP_HEIGHT,
  CELL_CONFIG,
  MultiplayerMode,
  WallSet,
} from "../types";
import { generateDungeon } from "./Map";
import { PlayerEntity } from "../entities/PlayerEntity";
import { MonsterEntity } from "../entities/MonsterEntity";
import { ItemEntity } from "../entities/ItemEntity";
import { ExplosiveEntity } from "../entities/ExplosiveEntity";
import { BulletEntity } from "../entities/BulletEntity";
import { RNG } from "../utils/RNG";
import { dist, passable, setPositionFromGrid, setTile } from "../utils/helpers";
import { computeFOV } from "../systems/FOV";
import { GameEntity } from "../entities/GameEntity";

interface LevelSnapshot {
  depth: number;
  map: TileType[];
  floorVariant: number;
  wallSet: WallSet;
  wallDamage: number[];
  explored: Set<number>;
  entities: Entity[];
  stairsDown: [number, number];
  stairsUp: [number, number] | null;
}

/**
 * Main state manager
 * Orchestrates all systems and manages state
 */
export class Game {
  private state: GameState;
  private isDead = false;
  private levels = new Map<number, LevelSnapshot>();
  private multiplayerMode: MultiplayerMode;
  private localPlayerId?: string;

  constructor(options?: { mode?: MultiplayerMode; localPlayerId?: string }) {
    this.multiplayerMode = options?.mode ?? "offline";
    this.localPlayerId = options?.localPlayerId;
    this.state = this.createInitialState();
  }

  /**
   * Create initial game state
   */
  private createInitialState(): GameState {
    const player = new PlayerEntity(0, 0);
    const localPlayerId = this.localPlayerId ?? player.id;
    this.localPlayerId = localPlayerId;
    const explored = new Set<number>();
    const visibilityByPlayer = new Map<string, Set<number>>([
      [localPlayerId, new Set<number>()],
    ]);
    const exploredByPlayer = new Map<string, Set<number>>([
      [localPlayerId, explored],
    ]);

    return {
      depth: 1,
      map: new Array(MAP_WIDTH * MAP_HEIGHT).fill(TileType.WALL),
      floorVariant: 0,
      wallSet: "concrete",
      wallDamage: new Array(MAP_WIDTH * MAP_HEIGHT).fill(0),
      mapDirty: false,
      visible: new Set(),
      explored,
      visibilityByPlayer,
      exploredByPlayer,
      entities: [],
      players: [player],
      player,
      stairsDown: [0, 0],
      stairsUp: null,
      log: [],
      options: { fov: true },
      effects: [],
      multiplayer: {
        mode: this.multiplayerMode,
        localPlayerId,
      },
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
      shouldAscend: false,
      descendTarget: undefined,
      changedTiles: new Set(),
      holeCreatedTiles: new Set(),
      pendingSounds: [],
    };
  }

  /**
   * Initialize a new game or level
   */
  public reset(depth: number = 1): void {
    if (DEBUG) console.time("reset: total");
    this.isDead = false;
    this.levels = new Map();
    const dungeon = generateDungeon();

    const player = new PlayerEntity(dungeon.start[0], dungeon.start[1]);
    const localPlayerId = player.id;
    this.localPlayerId = localPlayerId;
    const explored = new Set<number>();
    const visibilityByPlayer = new Map<string, Set<number>>([
      [localPlayerId, new Set<number>()],
    ]);
    const exploredByPlayer = new Map<string, Set<number>>([
      [localPlayerId, explored],
    ]);

    this.state = {
      depth,
      map: dungeon.map,
      floorVariant: dungeon.floorVariant,
      wallSet: dungeon.wallSet,
      wallDamage: new Array(MAP_WIDTH * MAP_HEIGHT).fill(0),
      mapDirty: false,
      visible: new Set(),
      explored,
      visibilityByPlayer,
      exploredByPlayer,
      entities: [],
      players: [player],
      player,
      stairsDown: dungeon.stairsDown,
      stairsUp: null,
      log: [],
      options: { fov: true },
      effects: [],
      multiplayer: {
        mode: this.multiplayerMode,
        localPlayerId,
      },
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
      shouldAscend: false,
      descendTarget: undefined,
      changedTiles: new Set(),
      holeCreatedTiles: new Set(),
      pendingSounds: [],
    };

    // Add player to entities
    this.state.entities.push(this.state.player);

    // Get free tiles once, upfront (optimized for performance)
    const freeTiles = this.getFreeTilesOptimized(dungeon.map);

    // Spawn monsters
    let ratCount = 0;
    let mutantCount = 0;
    for (let i = 0; i < 30 && freeTiles.length > 0; i++) {
      const tileIndex = RNG.int(freeTiles.length);
      const [x, y] = freeTiles[tileIndex];

      if (dist([x, y], dungeon.start) > 8) {
        const spawnRat = RNG.chance(0.5);
        if (spawnRat) {
          this.state.entities.push(
            new MonsterEntity(x, y, MonsterType.RAT, depth),
          );
          ratCount++;
        } else {
          this.state.entities.push(
            new MonsterEntity(x, y, MonsterType.MUTANT, depth),
          );
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
      this.state.entities.push(new ItemEntity(x, y, ItemType.AMMO));
      freeTiles.splice(tileIndex, 1);
    }

    for (let i = 0; i < 6 && freeTiles.length > 0; i++) {
      const tileIndex = RNG.int(freeTiles.length);
      const [x, y] = freeTiles[tileIndex];
      this.state.entities.push(new ItemEntity(x, y, ItemType.MEDKIT));
      freeTiles.splice(tileIndex, 1);
    }

    for (let i = 0; i < 3 && freeTiles.length > 0; i++) {
      const tileIndex = RNG.int(freeTiles.length);
      const [x, y] = freeTiles[tileIndex];
      this.state.entities.push(new ItemEntity(x, y, ItemType.KEYCARD));
      freeTiles.splice(tileIndex, 1);
    }

    for (let i = 0; i < 4 && freeTiles.length > 0; i++) {
      const tileIndex = RNG.int(freeTiles.length);
      const [x, y] = freeTiles[tileIndex];
      this.state.entities.push(new ItemEntity(x, y, ItemType.GRENADE));
      freeTiles.splice(tileIndex, 1);
    }

    for (let i = 0; i < 3 && freeTiles.length > 0; i++) {
      const tileIndex = RNG.int(freeTiles.length);
      const [x, y] = freeTiles[tileIndex];
      this.state.entities.push(new ItemEntity(x, y, ItemType.LAND_MINE));
      freeTiles.splice(tileIndex, 1);
    }

    this.addLog(`You descend into level ${depth}.`);

    this.updateFOV();
    if (DEBUG) console.timeEnd("reset: total");
  }

  /**
   * Get all walkable tiles (optimized - doesn't check entities)
   */
  private getFreeTilesOptimized(map: TileType[]): [number, number][] {
    const tiles: [number, number][] = [];
    for (let y = 1; y < MAP_HEIGHT - 1; y++) {
      for (let x = 1; x < MAP_WIDTH - 1; x++) {
        if (passable(map, x, y)) {
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
    const playerId = this.state.multiplayer.localPlayerId;
    this.updateFOVForPlayer(playerId);
  }

  public updateFOVForPlayer(playerId: string): void {
    const player = this.getPlayerById(playerId);
    if (!player) return;
    let explored = this.state.exploredByPlayer.get(playerId);
    if (!explored) {
      explored = new Set<number>();
      this.state.exploredByPlayer.set(playerId, explored);
    }
    const visible = computeFOV(this.state.map, player, explored);
    this.state.visibilityByPlayer.set(playerId, visible);
    if (playerId === this.state.multiplayer.localPlayerId) {
      this.state.visible = visible;
      this.state.explored = explored;
    }
  }

  public setLocalPlayerId(playerId: string): boolean {
    const player = this.getPlayerById(playerId);
    if (!player) return false;

    this.localPlayerId = playerId;
    this.state.multiplayer.localPlayerId = playerId;
    this.state.player = player;
    this.syncLocalExploredState();
    this.updateFOVForPlayer(playerId);
    return true;
  }

  public addNetworkPlayer(playerId: string): Player {
    const existingPlayer = this.getPlayerById(playerId);
    if (existingPlayer) {
      if (!this.state.exploredByPlayer.has(playerId)) {
        this.state.exploredByPlayer.set(playerId, new Set<number>());
      }
      if (!this.state.visibilityByPlayer.has(playerId)) {
        this.state.visibilityByPlayer.set(playerId, new Set<number>());
      }
      return existingPlayer;
    }

    const reference: [number, number] = this.state.stairsUp
      ? [this.state.stairsUp[0], this.state.stairsUp[1]]
      : [this.state.stairsDown[0], this.state.stairsDown[1]];
    const [spawnX, spawnY] = this.findSpawnTile(reference);

    const player = new PlayerEntity(spawnX, spawnY);
    player.id = playerId;
    player.nextActTick = this.state.sim.nowTick;

    this.state.players.push(player);
    this.state.entities.push(player);
    this.state.exploredByPlayer.set(playerId, new Set<number>());
    this.state.visibilityByPlayer.set(playerId, new Set<number>());

    this.updateFOVForPlayer(playerId);
    return player;
  }

  public removeNetworkPlayer(playerId: string): void {
    const removedPlayer = this.getPlayerById(playerId);
    if (!removedPlayer) return;

    this.state.players = this.state.players.filter(
      (player) => player.id !== playerId,
    );
    this.state.entities = this.state.entities.filter(
      (entity) => entity.id !== playerId,
    );
    this.state.exploredByPlayer.delete(playerId);
    this.state.visibilityByPlayer.delete(playerId);

    const fallbackPlayer = this.state.players[0];

    if (this.state.player.id === playerId) {
      this.state.player = fallbackPlayer ?? removedPlayer;
    }

    if (this.state.multiplayer.localPlayerId === playerId) {
      this.state.multiplayer.localPlayerId =
        fallbackPlayer?.id ?? removedPlayer.id;
      this.localPlayerId = this.state.multiplayer.localPlayerId;
      this.syncLocalExploredState();
    }
  }

  public serializeForPlayer(playerId: string): SerializedState {
    const state = this.serialize();
    const player = this.getPlayerById(playerId);
    if (player) {
      state.player = this.stripRuntimeEntityState(player) as Player;
    }
    const explored = this.state.exploredByPlayer.get(playerId);
    if (explored) {
      state.explored = Array.from(explored);
    }
    state.multiplayer = {
      mode: this.state.multiplayer.mode,
      localPlayerId: playerId,
    };
    return state;
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

  private saveCurrentLevelSnapshot(): void {
    const currentDepth = this.state.depth;
    const snapshot: LevelSnapshot = {
      depth: currentDepth,
      map: this.state.map,
      floorVariant: this.state.floorVariant,
      wallSet: this.state.wallSet,
      wallDamage: this.state.wallDamage,
      explored: new Set(this.state.explored),
      entities: this.state.entities.filter(
        (entity) => entity.kind !== EntityKind.PLAYER,
      ),
      stairsDown: this.state.stairsDown,
      stairsUp: this.state.stairsUp,
    };
    this.levels.set(currentDepth, snapshot);
  }

  private applyLevelSnapshot(
    snapshot: LevelSnapshot,
    playerEntry: [number, number],
  ): void {
    this.state.map = snapshot.map;
    this.state.floorVariant = snapshot.floorVariant;
    this.state.wallSet = snapshot.wallSet;
    this.state.wallDamage = snapshot.wallDamage;
    this.state.explored = new Set(snapshot.explored);
    this.state.visible.clear();
    this.state.stairsDown = snapshot.stairsDown;
    this.state.stairsUp = snapshot.stairsUp;

    for (const player of this.state.players) {
      setPositionFromGrid(player as PlayerEntity, playerEntry[0], playerEntry[1]);
      player.nextActTick = this.state.sim.nowTick;
    }

    this.state.entities = [
      ...this.state.players,
      ...snapshot.entities.map((entity) => entity),
    ];
    this.syncLocalExploredState();
  }

  private buildNewLevel(depth: number): LevelSnapshot {
    const dungeon = generateDungeon();
    const stairsUpPosition: [number, number] = [
      dungeon.start[0],
      dungeon.start[1],
    ];

    setTile(
      dungeon.map,
      stairsUpPosition[0],
      stairsUpPosition[1],
      TileType.STAIRS_UP,
    );

    return {
      depth,
      map: dungeon.map,
      floorVariant: dungeon.floorVariant,
      wallSet: dungeon.wallSet,
      wallDamage: new Array(MAP_WIDTH * MAP_HEIGHT).fill(0),
      explored: new Set(),
      entities: this.spawnLevelEntities(dungeon.map, dungeon.start, depth),
      stairsDown: dungeon.stairsDown,
      stairsUp: stairsUpPosition,
    };
  }

  private spawnLevelEntities(
    map: TileType[],
    start: [number, number],
    depth: number,
  ): Entity[] {
    const entities: Entity[] = [];
    const freeTiles = this.getFreeTilesOptimized(map);

    // Spawn monsters
    const monsterCount = depth === 1 ? 30 : 8 + depth;
    let ratCount = 0;
    let mutantCount = 0;
    for (let i = 0; i < monsterCount && freeTiles.length > 0; i++) {
      const tileIndex = RNG.int(freeTiles.length);
      const [x, y] = freeTiles[tileIndex];

      if (dist([x, y], start) > 8) {
        const spawnRat = RNG.chance(0.5);
        if (spawnRat) {
          entities.push(new MonsterEntity(x, y, MonsterType.RAT, depth));
          ratCount++;
        } else {
          entities.push(new MonsterEntity(x, y, MonsterType.MUTANT, depth));
          mutantCount++;
        }
        freeTiles.splice(tileIndex, 1);
      }
    }
    if (DEBUG && depth === 1) {
      console.log(`Spawned ${ratCount} rats, ${mutantCount} mutants`);
    }

    // Spawn items
    const spawnItems = (
      count: number,
      type: ItemType,
      amount?: number,
    ): void => {
      for (let i = 0; i < count && freeTiles.length > 0; i++) {
        const tileIndex = RNG.int(freeTiles.length);
        const [x, y] = freeTiles[tileIndex];
        entities.push(new ItemEntity(x, y, type, amount ?? 0));
        freeTiles.splice(tileIndex, 1);
      }
    };

    spawnItems(10, ItemType.AMMO);
    spawnItems(6, ItemType.MEDKIT);
    spawnItems(3, ItemType.KEYCARD);
    spawnItems(4, ItemType.GRENADE);
    spawnItems(3, ItemType.LAND_MINE);

    return entities;
  }

  /**
   * Descend to next level (called after tick completes with descend flag)
   */
  public descend(): void {
    const nextDepth = this.state.depth + 1;
    const fallPosition = this.state.descendTarget;
    this.saveCurrentLevelSnapshot();
    this.state.depth = nextDepth;

    const existingLevel = this.levels.get(nextDepth);
    const snapshot = existingLevel ?? this.buildNewLevel(nextDepth);

    // If falling through a hole, land at nearest passable tile to fall position
    // Otherwise, land at stairs (normal stair descent)
    let landingPosition: [number, number];
    if (fallPosition) {
      const nearestTile = this.findNearestPassableTile(
        snapshot.map,
        fallPosition,
      );
      landingPosition = nearestTile ?? snapshot.stairsUp ?? snapshot.stairsDown;
    } else {
      landingPosition = snapshot.stairsUp ?? snapshot.stairsDown;
    }

    this.applyLevelSnapshot(snapshot, landingPosition);
    this.updateFOV();
    this.addLog(`You descend into level ${this.state.depth}.`);
  }

  /**
   * Ascend to previous level (called after tick completes with ascend flag)
   */
  public ascend(): void {
    if (this.state.depth <= 1) {
      return;
    }

    const previousDepth = this.state.depth - 1;

    this.saveCurrentLevelSnapshot();
    this.state.depth = previousDepth;

    const snapshot = this.levels.get(previousDepth);
    if (!snapshot) {
      return;
    }

    this.applyLevelSnapshot(snapshot, snapshot.stairsDown);
    this.updateFOV();
    this.addLog(`You ascend to level ${this.state.depth}.`);
  }

  private findNearestPassableTile(
    map: TileType[],
    target: [number, number],
  ): [number, number] | null {
    const [startX, startY] = target;
    if (
      startX >= 0 &&
      startY >= 0 &&
      startX < MAP_WIDTH &&
      startY < MAP_HEIGHT &&
      passable(map, startX, startY)
    ) {
      return [startX, startY];
    }

    const visited = new Array(MAP_WIDTH * MAP_HEIGHT).fill(false);
    const queue: [number, number][] = [];
    const enqueue = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= MAP_WIDTH || y >= MAP_HEIGHT) return;
      const index = x + y * MAP_WIDTH;
      if (visited[index]) return;
      visited[index] = true;
      queue.push([x, y]);
    };

    enqueue(startX, startY);

    while (queue.length > 0) {
      const [x, y] = queue.shift() as [number, number];
      if (x >= 0 && y >= 0 && x < MAP_WIDTH && y < MAP_HEIGHT) {
        if (passable(map, x, y)) {
          return [x, y];
        }
      }

      enqueue(x + 1, y);
      enqueue(x - 1, y);
      enqueue(x, y + 1);
      enqueue(x, y - 1);
    }

    return null;
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
    const levels = Array.from(this.levels.values()).map((snapshot) => ({
      depth: snapshot.depth,
      map: snapshot.map,
      floorVariant: snapshot.floorVariant,
      wallSet: snapshot.wallSet,
      wallDamage: snapshot.wallDamage,
      stairsDown: snapshot.stairsDown,
      stairsUp: snapshot.stairsUp,
      explored: Array.from(snapshot.explored),
      entities: snapshot.entities.map((entity) =>
        this.stripRuntimeEntityState(entity),
      ),
    }));

    const exploredByPlayer: Record<string, number[]> = {};
    for (const [playerId, explored] of this.state.exploredByPlayer.entries()) {
      exploredByPlayer[playerId] = Array.from(explored);
    }

    return {
      depth: this.state.depth,
      map: this.state.map,
      floorVariant: this.state.floorVariant,
      wallSet: this.state.wallSet,
      wallDamage: this.state.wallDamage,
      stairsDown: this.state.stairsDown,
      stairsUp: this.state.stairsUp,
      player: this.stripRuntimeEntityState(this.state.player) as Player,
      players: this.state.players.map((player) =>
        this.stripRuntimeEntityState(player) as Player,
      ),
      entities: this.state.entities
        .filter((entity) => entity.kind !== EntityKind.PLAYER)
        .map((entity) => this.stripRuntimeEntityState(entity)),
      explored: Array.from(this.state.explored),
      exploredByPlayer,
      log: this.state.log.slice(0, 50),
      levels,
      multiplayer: this.state.multiplayer,
      sim: {
        nowTick: this.state.sim.nowTick,
        mode: this.state.sim.mode,
        timeScale: this.state.sim.timeScale,
        targetTimeScale: this.state.sim.targetTimeScale,
      },
      sounds: this.state.pendingSounds.splice(0),
      effects: this.state.effects,
    };
  }

  /**
   * Load game state from serialized data
   */
  public deserialize(data: SerializedState): void {
    const floorVariant =
      typeof data.floorVariant === "number" ? data.floorVariant : RNG.int(3);
    const wallSet = data.wallSet === "wood" ? "wood" : "concrete";
    const wallDamage =
      data.wallDamage && data.wallDamage.length === data.map.length
        ? data.wallDamage.slice()
        : new Array(data.map.length).fill(0);
    const players = this.hydratePlayers(
      data.players ?? [data.player],
      data.depth,
    );
    const localPlayerId =
      data.multiplayer?.localPlayerId ?? players[0]?.id ?? data.player.id;
    this.localPlayerId = localPlayerId;
    const player =
      players.find((candidate) => candidate.id === localPlayerId) ??
      players[0];

    const nonPlayerEntities = data.entities.filter(
      (entity) => entity.kind !== EntityKind.PLAYER,
    );
    const entities: Entity[] = [
      ...players,
      ...this.hydrateEntities(nonPlayerEntities, data.depth),
    ];

    const exploredByPlayer = new Map<string, Set<number>>();
    if (data.exploredByPlayer) {
      for (const [playerId, explored] of Object.entries(
        data.exploredByPlayer,
      )) {
        exploredByPlayer.set(playerId, new Set(explored));
      }
    }
    if (!exploredByPlayer.has(localPlayerId)) {
      exploredByPlayer.set(localPlayerId, new Set(data.explored));
    }
    const visibilityByPlayer = new Map<string, Set<number>>();

    this.state = {
      depth: data.depth,
      map: data.map,
      floorVariant,
      wallSet,
      wallDamage,
      mapDirty: false,
      stairsDown: data.stairsDown ??
        (data as { stairs?: [number, number] }).stairs ?? [0, 0],
      stairsUp: data.stairsUp ?? null,
      visible: new Set(),
      explored: new Set(data.explored),
      visibilityByPlayer,
      exploredByPlayer,
      entities,
      players,
      player,
      log: data.log || [],
      options: { fov: true },
      effects: data.effects || [],
      multiplayer: {
        mode: data.multiplayer?.mode ?? this.multiplayerMode,
        localPlayerId,
      },
      sim: {
        nowTick: data.sim.nowTick,
        mode: data.sim.mode,
        timeScale: data.sim.timeScale ?? 1.0,
        targetTimeScale: data.sim.targetTimeScale ?? 1.0,
        accumulatorMs: 0,
        lastFrameMs: performance.now(),
        pauseReasons: new Set(),
      },
      commandsByTick: new Map(),
      eventQueue: [],
      shouldDescend: false,
      shouldAscend: false,
      descendTarget: undefined,
      changedTiles: new Set(),
      holeCreatedTiles: new Set(),
      pendingSounds: [],
    };

    this.levels = new Map();
    for (const level of data.levels ?? []) {
      this.levels.set(level.depth, {
        depth: level.depth,
        map: level.map,
        floorVariant: level.floorVariant,
        wallSet: level.wallSet === "wood" ? "wood" : "concrete",
        wallDamage: level.wallDamage,
        stairsDown: level.stairsDown,
        stairsUp: level.stairsUp ?? null,
        explored: new Set(level.explored),
        entities: this.hydrateEntities(level.entities, level.depth),
      });
    }

    this.isDead = false;
    this.updateFOV();
  }

  private hydratePlayers(players: Player[], depth: number): Player[] {
    return players.map((player) => {
      if (player instanceof PlayerEntity) {
        return player;
      }
      const [gridX, gridY] = this.getGridPositionFromSerialized(player);
      const p = new PlayerEntity(gridX, gridY);
      Object.assign(p, player);
      this.syncWorldPosition(p, player);
      return p;
    });
  }

  private hydrateEntities(entities: Entity[], depth: number): Entity[] {
    const hydrated: Entity[] = [];
    for (const entity of entities) {
      if (
        entity.kind === EntityKind.MONSTER &&
        !(entity instanceof MonsterEntity)
      ) {
        const [gridX, gridY] = this.getGridPositionFromSerialized(entity);
        const monster = new MonsterEntity(
          gridX,
          gridY,
          (entity as Monster).type === MonsterType.RAT
            ? MonsterType.RAT
            : MonsterType.MUTANT,
          depth,
        );
        Object.assign(monster, entity);
        if (typeof monster.hpMax !== "number") {
          monster.hpMax = Math.max(monster.hp, 1);
        }
        if (!monster.carriedItems) {
          monster.carriedItems = [];
        }
        this.syncWorldPosition(monster, entity);
        hydrated.push(monster);
      } else if (
        entity.kind === EntityKind.MONSTER &&
        entity instanceof MonsterEntity
      ) {
        if (typeof entity.hpMax !== "number") {
          entity.hpMax = Math.max(entity.hp, 1);
        }
        if (!entity.carriedItems) {
          entity.carriedItems = [];
        }
        this.syncWorldPosition(entity, entity);
        hydrated.push(entity);
      } else if (
        entity.kind === EntityKind.ITEM &&
        !(entity instanceof ItemEntity)
      ) {
        const [gridX, gridY] = this.getGridPositionFromSerialized(entity);
        const item = new ItemEntity(
          gridX,
          gridY,
          (entity as Item).type,
          (entity as Item).amount ?? 0,
        );
        Object.assign(item, entity);
        this.syncWorldPosition(item, entity);
        hydrated.push(item);
      } else if (
        entity.kind === EntityKind.ITEM &&
        entity instanceof ItemEntity
      ) {
        this.syncWorldPosition(entity, entity);
        hydrated.push(entity);
      } else if (
        entity.kind === EntityKind.EXPLOSIVE &&
        !(entity instanceof ExplosiveEntity)
      ) {
        const explosive = new ExplosiveEntity(
          (entity as any).worldX,
          (entity as any).worldY,
          (entity as any).type,
          (entity as any).armed,
          (entity as any).fuseTicks,
        );
        Object.assign(explosive, entity);
        this.syncWorldPosition(explosive, entity);
        hydrated.push(explosive);
      } else if (
        entity.kind === EntityKind.EXPLOSIVE &&
        entity instanceof ExplosiveEntity
      ) {
        this.syncWorldPosition(entity, entity);
        hydrated.push(entity);
      } else if (
        entity.kind === EntityKind.BULLET &&
        !(entity instanceof BulletEntity)
      ) {
        const bullet = new BulletEntity(
          (entity as any).worldX || 0,
          (entity as any).worldY || 0,
          (entity as any).velocityX || 0,
          (entity as any).velocityY || 0,
          (entity as any).damage || 0,
          (entity as any).ownerId || "",
          (entity as any).maxDistance || 640,
        );
        Object.assign(bullet, entity);
        this.syncWorldPosition(bullet, entity);
        hydrated.push(bullet);
      } else if (
        entity.kind === EntityKind.BULLET &&
        entity instanceof BulletEntity
      ) {
        this.syncWorldPosition(entity, entity);
        hydrated.push(entity);
      } else {
        hydrated.push(entity);
      }
    }
    return hydrated;
  }

  public getPlayerById(playerId: string): Player | undefined {
    return this.state.players.find((player) => player.id === playerId);
  }

  private stripRuntimeEntityState(entity: Entity): Entity {
    const plain = { ...(entity as object) } as Record<string, unknown>;
    delete plain.physicsBody;
    return plain as unknown as Entity;
  }

  private findSpawnTile(preferred: [number, number]): [number, number] {
    const visited = new Set<number>();
    const queue: [number, number][] = [];
    const enqueue = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= MAP_WIDTH || y >= MAP_HEIGHT) return;
      const index = x + y * MAP_WIDTH;
      if (visited.has(index)) return;
      visited.add(index);
      queue.push([x, y]);
    };

    enqueue(preferred[0], preferred[1]);
    while (queue.length > 0) {
      const [x, y] = queue.shift() as [number, number];
      if (passable(this.state.map, x, y) && !this.isActorOccupied(x, y)) {
        return [x, y];
      }
      enqueue(x + 1, y);
      enqueue(x - 1, y);
      enqueue(x, y + 1);
      enqueue(x, y - 1);
    }

    return [preferred[0], preferred[1]];
  }

  private isActorOccupied(x: number, y: number): boolean {
    return this.state.entities.some(
      (entity) =>
        (entity.kind === EntityKind.PLAYER ||
          entity.kind === EntityKind.MONSTER) &&
        entity.gridX === x &&
        entity.gridY === y,
    );
  }

  private syncLocalExploredState(): void {
    const localPlayerId = this.state.multiplayer.localPlayerId;
    const explored = this.state.exploredByPlayer.get(localPlayerId);
    if (explored) {
      this.state.explored = new Set(explored);
    }
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
    entity: GameEntity,
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
