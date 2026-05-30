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
  LevelKind,
} from "../types";
import { generateDungeon } from "./map";
import { createOutsideLevel } from "./outside-level";
import { EntityManager } from "./entity-manager";
import { FlatTileSource } from "./tile-source";
import { PlayerEntity } from "../entities/player-entity";
import { MonsterEntity } from "../entities/monster-entity";
import { ItemEntity } from "../entities/item-entity";
import { ExplosiveEntity } from "../entities/explosive-entity";
import { BulletEntity } from "../entities/bullet-entity";
import { RNG } from "../utils/rng";
import {
  dist,
  passableFor,
  setPositionFromGrid,
  setTile,
} from "../utils/helpers";
import { computeFOV, computeFOVFrom } from "../systems/fov";
import { GameEntity } from "../entities/game-entity";
import { Sound, SoundEffect } from "../systems/sound";

const EXPLORATION_COMPLETION_THRESHOLD = 0.9;
const MIN_COMPLETION_REACHABLE_TILES = 50;
const MAX_CORPSES_PER_LEVEL = 8;

interface LevelSnapshot {
  depth: number;
  levelKind: LevelKind;
  map: TileType[];
  mapWidth: number;
  mapHeight: number;
  floorVariant: number;
  wallSet: WallSet;
  wallDamage: number[];
  explored: Set<number>;
  exploredByPlayer: Map<string, Set<number>>;
  entities: Entity[];
  stairsDown: [number, number];
  stairsUp: [number, number] | null;
  enhancedVision: boolean;
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

    const entities: Entity[] = [];
    const map: TileType[] = new Array(MAP_WIDTH * MAP_HEIGHT).fill(TileType.WALL);

    return {
      depth: 0,
      levelKind: "outside",
      map,
      mapWidth: MAP_WIDTH,
      mapHeight: MAP_HEIGHT,
      floorVariant: 0,
      wallSet: "concrete",
      wallDamage: new Array(MAP_WIDTH * MAP_HEIGHT).fill(0),
      mapDirty: false,
      tiles: new FlatTileSource(map, MAP_WIDTH, MAP_HEIGHT),
      visible: new Set(),
      explored,
      accessible: new Set(),
      enhancedVision: false,
      visibilityByPlayer,
      exploredByPlayer,
      entities,
      entityManager: new EntityManager(entities),
      players: [player],
      player,
      stairsDown: [0, 0],
      stairsUp: null,
      playerStart: [player.gridX, player.gridY],
      story: [],
      options: { fov: true, godMode: false },
      effects: [],
      multiplayer: {
        mode: this.multiplayerMode,
        localPlayerId,
      },
      sim: {
        nowTick: 0,
        mode: "REALTIME",
        timeScale: 0.85,
        targetTimeScale: 0.85,
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
  public reset(depth: number = 0): void {
    if (DEBUG) console.time("reset: total");
    this.isDead = false;
    this.levels = new Map();
    const outside = depth === 0 ? createOutsideLevel() : null;
    const dungeon = outside ?? generateDungeon();

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

    const entities: Entity[] = [];

    this.state = {
      depth,
      levelKind: depth === 0 ? "outside" : "dungeon",
      map: dungeon.map,
      mapWidth: dungeon.width,
      mapHeight: dungeon.height,
      floorVariant: dungeon.floorVariant,
      wallSet: dungeon.wallSet,
      wallDamage:
        outside?.wallDamage ?? new Array(dungeon.width * dungeon.height).fill(0),
      mapDirty: false,
      tiles: new FlatTileSource(dungeon.map, dungeon.width, dungeon.height),
      visible: new Set(),
      explored,
      accessible: new Set(),
      enhancedVision: false,
      visibilityByPlayer,
      exploredByPlayer,
      entities,
      entityManager: new EntityManager(entities),
      players: [player],
      player,
      stairsDown: dungeon.stairsDown,
      stairsUp: null,
      playerStart: [dungeon.start[0], dungeon.start[1]],
      story: [],
      options: { fov: true, godMode: false },
      effects: [],
      multiplayer: {
        mode: this.multiplayerMode,
        localPlayerId,
      },
      // NEW: Simulation system
      sim: {
        nowTick: 0,
        mode: "REALTIME",
        timeScale: 0.85,
        targetTimeScale: 0.85,
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
    this.state.entityManager.spawn(this.state.player);

    if (outside) {
      // The CTDM (time-dilation device) has no place in multiplayer — online
      // play is always real-time — so don't spawn it as a findable item there.
      const outsideEntities =
        this.multiplayerMode === "online"
          ? outside.entities.filter(
              (e) => !(e.kind === EntityKind.ITEM && (e as Item).type === ItemType.CTDM),
            )
          : outside.entities;
      this.state.entityManager.spawnAll(outsideEntities);
      this.addStory("The city is quiet. Megacorp waits to the northeast.");
      this.updateFOV();
      if (DEBUG) console.timeEnd("reset: total");
      return;
    }

    // Get free tiles once, upfront (optimized for performance)
    const freeTiles = this.getFreeTilesOptimized(
      dungeon.map,
      dungeon.width,
      dungeon.height,
    );

    // Spawn monsters
    let ratCount = 0;
    let mutantCount = 0;
    for (let i = 0; i < 30 && freeTiles.length > 0; i++) {
      const tileIndex = RNG.int(freeTiles.length);
      const [x, y] = freeTiles[tileIndex];

        if (dist([x, y], dungeon.start) > 8) {
        const roll = RNG.int(10);
        if (roll < 3) {
          this.state.entityManager.spawn(
            new MonsterEntity(x, y, MonsterType.RAT, depth),
          );
          ratCount++;
        } else if (roll < 5) {
          this.state.entityManager.spawn(
            new MonsterEntity(x, y, MonsterType.SKULKER, depth),
          );
        } else {
          this.state.entityManager.spawn(
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
      this.state.entityManager.spawn(new ItemEntity(x, y, ItemType.AMMO));
      freeTiles.splice(tileIndex, 1);
    }

    for (let i = 0; i < 6 && freeTiles.length > 0; i++) {
      const tileIndex = RNG.int(freeTiles.length);
      const [x, y] = freeTiles[tileIndex];
      this.state.entityManager.spawn(new ItemEntity(x, y, ItemType.MEDKIT));
      freeTiles.splice(tileIndex, 1);
    }

    for (let i = 0; i < 3 && freeTiles.length > 0; i++) {
      const tileIndex = RNG.int(freeTiles.length);
      const [x, y] = freeTiles[tileIndex];
      this.state.entityManager.spawn(new ItemEntity(x, y, ItemType.KEYCARD));
      freeTiles.splice(tileIndex, 1);
    }

    for (let i = 0; i < 4 && freeTiles.length > 0; i++) {
      const tileIndex = RNG.int(freeTiles.length);
      const [x, y] = freeTiles[tileIndex];
      this.state.entityManager.spawn(new ItemEntity(x, y, ItemType.GRENADE));
      freeTiles.splice(tileIndex, 1);
    }

    for (let i = 0; i < 3 && freeTiles.length > 0; i++) {
      const tileIndex = RNG.int(freeTiles.length);
      const [x, y] = freeTiles[tileIndex];
      this.state.entityManager.spawn(new ItemEntity(x, y, ItemType.LAND_MINE));
      freeTiles.splice(tileIndex, 1);
    }

    const spawnItems = (count: number, type: ItemType): void => {
      for (let i = 0; i < count && freeTiles.length > 0; i++) {
        const tileIndex = RNG.int(freeTiles.length);
        const [x, y] = freeTiles[tileIndex];
        this.state.entityManager.spawn(new ItemEntity(x, y, type));
        freeTiles.splice(tileIndex, 1);
      }
    };

    spawnItems(2 + Math.floor(depth / 4), ItemType.POWERCELL);

    this.addStory(`You descend into level ${depth}.`);

    this.updateFOV();
    if (DEBUG) console.timeEnd("reset: total");
  }

  /**
   * Get all walkable tiles (optimized - doesn't check entities)
   */
  private getFreeTilesOptimized(
    map: TileType[],
    width: number = this.state.mapWidth,
    height: number = this.state.mapHeight,
  ): [number, number][] {
    const tiles: [number, number][] = [];
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        if (passableFor(map, x, y, width, height)) {
          tiles.push([x, y]);
        }
      }
    }
    return tiles;
  }

  public addStory(message: string): void {
    this.state.story.unshift(message);
    if (this.state.story.length > 200) {
      this.state.story.pop();
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

    const accessible = this.computeAccessibleTiles(player.gridX, player.gridY);
    let visible = computeFOV(
      this.state.map,
      player,
      explored,
      this.state.mapWidth,
      this.state.mapHeight,
    );

    if (this.checkExplorationCompletion(player, explored)) {
      explored = this.completeLevelExploration(player);
      visible = computeFOV(
        this.state.map,
        player,
        explored,
        this.state.mapWidth,
        this.state.mapHeight,
      );
    }

    this.state.visibilityByPlayer.set(playerId, visible);

    if (playerId === this.state.multiplayer.localPlayerId) {
      this.state.visible = visible;
      this.state.explored = explored;
      this.state.accessible = accessible;
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

    // Spawn at the level's entry tile — the same place single-player starts —
    // so multiplayer placement matches single-player.
    const reference: [number, number] = [
      this.state.playerStart[0],
      this.state.playerStart[1],
    ];
    const [spawnX, spawnY] = this.findSpawnTile(reference);

    const player = new PlayerEntity(spawnX, spawnY);
    player.id = playerId;
    player.nextActTick = this.state.sim.nowTick;

    this.state.players.push(player);
    this.state.entityManager.spawn(player);
    this.state.exploredByPlayer.set(playerId, new Set<number>());
    this.state.visibilityByPlayer.set(playerId, new Set<number>());

    this.updateFOVForPlayer(playerId);
    return player;
  }

  /**
   * Detach an existing player entity from this world without destroying it, so
   * it can be re-attached to another world (level) with its stats intact.
   * Used by the multiplayer server to move a player between per-depth worlds.
   */
  public detachPlayer(playerId: string): Player | null {
    const player = this.getPlayerById(playerId);
    if (!player) return null;
    this.state.players = this.state.players.filter((p) => p.id !== playerId);
    this.state.entityManager.destroy(playerId);
    this.state.exploredByPlayer.delete(playerId);
    this.state.visibilityByPlayer.delete(playerId);
    if (this.state.player?.id === playerId) {
      this.state.player = this.state.players[0] ?? this.state.player;
    }
    return player;
  }

  /**
   * Attach a pre-existing player entity (carried over from another world) at a
   * grid position, giving it a fresh fog-of-war on this level and a new body.
   */
  public attachExistingPlayer(
    player: Player,
    position: [number, number],
  ): void {
    const [spawnX, spawnY] = this.findSpawnTile(position);
    setPositionFromGrid(player, spawnX, spawnY);
    player.velocityX = 0;
    player.velocityY = 0;
    player.nextActTick = this.state.sim.nowTick;
    player.physicsBody = undefined;
    this.state.players.push(player);
    this.state.entityManager.spawn(player);
    this.state.exploredByPlayer.set(player.id, new Set<number>());
    this.state.visibilityByPlayer.set(player.id, new Set<number>());
    this.updateFOVForPlayer(player.id);
  }

  /**
   * Leave a cosmetic corpse where a player died. It lives in `players` with
   * hp 0 (so it renders as a dead body and is ignored by AI / alive checks) but
   * is never controlled. Capped per level so corpses can't grow unbounded.
   */
  public spawnCorpse(source: Player): void {
    const corpse = new PlayerEntity(source.gridX, source.gridY);
    corpse.id = `corpse-${crypto.randomUUID()}`;
    corpse.worldX = source.worldX;
    corpse.worldY = source.worldY;
    corpse.prevWorldX = source.worldX;
    corpse.prevWorldY = source.worldY;
    corpse.facingAngle = source.facingAngle;
    corpse.hp = 0;
    corpse.velocityX = 0;
    corpse.velocityY = 0;
    this.state.players.push(corpse);

    const corpses = this.state.players.filter(
      (p) => p.hp <= 0 && p.id.startsWith("corpse-"),
    );
    if (corpses.length > MAX_CORPSES_PER_LEVEL) {
      const oldest = corpses[0];
      this.state.players = this.state.players.filter((p) => p !== oldest);
    }
  }

  public removeNetworkPlayer(playerId: string): void {
    const removedPlayer = this.getPlayerById(playerId);
    if (!removedPlayer) return;

    this.state.players = this.state.players.filter(
      (player) => player.id !== playerId,
    );
    this.state.entityManager.destroy(playerId);
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
    // Drop this player's own shoot sound — their client predicts it locally on
    // fire, so echoing it back would double up the audio.
    state.sounds = this.state.pendingSounds
      .filter((s) => !(s.effect === SoundEffect.SHOOT && s.sourceId === playerId))
      .map((s) => s.effect);
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
   * Toggle God Mode for debugging.
   */
  public toggleGodMode(): void {
    this.state.options.godMode = !this.state.options.godMode;
    this.addStory(
      this.state.options.godMode
        ? "God Mode enabled."
        : "God Mode disabled.",
    );
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
      levelKind: this.state.levelKind,
      map: this.state.map,
      mapWidth: this.state.mapWidth,
      mapHeight: this.state.mapHeight,
      floorVariant: this.state.floorVariant,
      wallSet: this.state.wallSet,
      wallDamage: this.state.wallDamage,
      explored: new Set(this.state.explored),
      exploredByPlayer: this.cloneExploredByPlayerMap(
        this.state.exploredByPlayer,
      ),
      entities: this.state.entities.filter(
        (entity) => entity.kind !== EntityKind.PLAYER,
      ),
      stairsDown: this.state.stairsDown,
      stairsUp: this.state.stairsUp,
      enhancedVision: this.state.enhancedVision,
    };
    this.levels.set(currentDepth, snapshot);
  }

  /**
   * Rebuild the canonical tile accessor after the backing map array or its
   * dimensions are swapped (level transitions). For finite levels this wraps
   * the flat `map` array; a streaming dungeon would install a chunk source.
   */
  private refreshTileSource(): void {
    this.state.tiles = new FlatTileSource(
      this.state.map,
      this.state.mapWidth,
      this.state.mapHeight,
    );
  }

  private applyLevelSnapshot(
    snapshot: LevelSnapshot,
    playerEntry: [number, number],
  ): void {
    this.state.playerStart = [playerEntry[0], playerEntry[1]];
    this.state.map = snapshot.map;
    this.state.levelKind = snapshot.levelKind;
    this.state.mapWidth = snapshot.mapWidth;
    this.state.mapHeight = snapshot.mapHeight;
    this.state.floorVariant = snapshot.floorVariant;
    this.state.wallSet = snapshot.wallSet;
    this.state.wallDamage = snapshot.wallDamage;
    this.refreshTileSource();
    this.state.explored = new Set(snapshot.explored);
    this.state.exploredByPlayer = this.cloneExploredByPlayerMap(
      snapshot.exploredByPlayer,
    );
    for (const player of this.state.players) {
      if (!this.state.exploredByPlayer.has(player.id)) {
        this.state.exploredByPlayer.set(player.id, new Set(snapshot.explored));
      }
    }
    this.state.visibilityByPlayer = new Map();
    this.state.visible.clear();
    this.state.accessible.clear();
    this.state.stairsDown = snapshot.stairsDown;
    this.state.stairsUp = snapshot.stairsUp;
    this.state.enhancedVision = snapshot.enhancedVision;

    for (const player of this.state.players) {
      setPositionFromGrid(
        player as PlayerEntity,
        playerEntry[0],
        playerEntry[1],
      );
      player.nextActTick = this.state.sim.nowTick;
    }

    this.state.entityManager.replaceAll([
      ...this.state.players,
      ...snapshot.entities,
    ]);
    this.syncLocalExploredState();
    this.normalizeCurrentCompletedExploration();
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
      levelKind: "dungeon",
      map: dungeon.map,
      mapWidth: dungeon.width,
      mapHeight: dungeon.height,
      floorVariant: dungeon.floorVariant,
      wallSet: dungeon.wallSet,
      wallDamage: new Array(dungeon.width * dungeon.height).fill(0),
      explored: new Set(),
      exploredByPlayer: new Map(
        this.state.players.map((player) => [player.id, new Set<number>()]),
      ),
      entities: this.spawnLevelEntities(
        dungeon.map,
        dungeon.start,
        depth,
        dungeon.width,
        dungeon.height,
      ),
      stairsDown: dungeon.stairsDown,
      stairsUp: stairsUpPosition,
      enhancedVision: false,
    };
  }

  private spawnLevelEntities(
    map: TileType[],
    start: [number, number],
    depth: number,
    width: number = MAP_WIDTH,
    height: number = MAP_HEIGHT,
  ): Entity[] {
    const entities: Entity[] = [];
    const freeTiles = this.getFreeTilesOptimized(map, width, height);

    // Spawn monsters
    const monsterCount = depth === 1 ? 30 : 8 + depth;
    let ratCount = 0;
    let mutantCount = 0;
    for (let i = 0; i < monsterCount && freeTiles.length > 0; i++) {
      const tileIndex = RNG.int(freeTiles.length);
      const [x, y] = freeTiles[tileIndex];

      if (dist([x, y], start) > 8) {
        const roll = RNG.int(10);
        if (roll < 3) {
          entities.push(new MonsterEntity(x, y, MonsterType.RAT, depth));
          ratCount++;
        } else if (roll < 5) {
          entities.push(new MonsterEntity(x, y, MonsterType.SKULKER, depth));
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
        entities.push(new ItemEntity(x, y, type, amount));
        freeTiles.splice(tileIndex, 1);
      }
    };

    spawnItems(10, ItemType.AMMO);
    spawnItems(6, ItemType.MEDKIT);
    spawnItems(3, ItemType.KEYCARD);
    spawnItems(4, ItemType.GRENADE);
    spawnItems(3, ItemType.LAND_MINE);
    spawnItems(2 + Math.floor(depth / 4), ItemType.POWERCELL);

    // Spawn utility bot: 0 or 1 per floor (50% chance), far from start
    if (RNG.chance(0.5)) {
      for (let attempt = 0; attempt < 20 && freeTiles.length > 0; attempt++) {
        const tileIndex = RNG.int(freeTiles.length);
        const [x, y] = freeTiles[tileIndex];
        if (dist([x, y], start) > 10) {
          entities.push(new MonsterEntity(x, y, MonsterType.UTILITY_BOT, depth));
          freeTiles.splice(tileIndex, 1);
          break;
        }
      }
    }

    return entities.filter(
      (entity) =>
        !(
          depth > 0 &&
          entity.kind === EntityKind.ITEM &&
          (entity as Item).type === ItemType.CTDM
        ),
    );
  }

  private pluckNearbyUtilityBots(): MonsterEntity[] {
    const player = this.state.player;
    const bots = this.state.entities.filter((e) => {
      if (e.kind !== EntityKind.MONSTER) return false;
      const m = e as MonsterEntity;
      if (m.type !== MonsterType.UTILITY_BOT) return false;
      const dx = m.gridX - player.gridX;
      const dy = m.gridY - player.gridY;
      return Math.abs(dx) + Math.abs(dy) <= 4;
    }) as MonsterEntity[];

    if (bots.length > 0) {
      const botIds = new Set(bots.map((b) => b.id));
      this.state.entityManager.destroyByIds(botIds);
    }
    return bots;
  }

  /**
   * Descend to next level (called after tick completes with descend flag)
   */
  public descend(): void {
    const nextDepth = this.state.depth + 1;
    const fallPosition = this.state.descendTarget;

    const followingBots = this.pluckNearbyUtilityBots();

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
        snapshot.mapWidth,
        snapshot.mapHeight,
      );
      landingPosition = nearestTile ?? snapshot.stairsUp ?? snapshot.stairsDown;
    } else {
      landingPosition = snapshot.stairsUp ?? snapshot.stairsDown;
    }

    this.applyLevelSnapshot(snapshot, landingPosition);

    for (const bot of followingBots) {
      setPositionFromGrid(bot, landingPosition[0], landingPosition[1]);
      this.state.entityManager.spawn(bot);
    }

    this.updateFOV();
    this.addStory(
      nextDepth === 1
        ? "You enter the Megacorp research facility."
        : `You descend into level ${this.state.depth}.`,
    );
  }

  /**
   * Ascend to previous level (called after tick completes with ascend flag)
   */
  public ascend(): void {
    if (this.state.depth <= 0) {
      return;
    }

    const previousDepth = this.state.depth - 1;

    const followingBots = this.pluckNearbyUtilityBots();

    this.saveCurrentLevelSnapshot();
    this.state.depth = previousDepth;

    const snapshot = this.levels.get(previousDepth);
    if (!snapshot) {
      return;
    }

    this.applyLevelSnapshot(snapshot, snapshot.stairsDown);

    const landingPos = snapshot.stairsDown ?? snapshot.stairsUp;
    if (landingPos) {
      for (const bot of followingBots) {
        setPositionFromGrid(bot, landingPos[0], landingPos[1]);
        this.state.entityManager.spawn(bot);
      }
    }
    this.updateFOV();
    this.addStory(
      previousDepth === 0
        ? "You step back out into the abandoned city."
        : `You ascend to level ${this.state.depth}.`,
    );
  }

  private findNearestPassableTile(
    map: TileType[],
    target: [number, number],
    width: number,
    height: number,
  ): [number, number] | null {
    const [startX, startY] = target;
    if (
      startX >= 0 &&
      startY >= 0 &&
      startX < width &&
      startY < height &&
      passableFor(map, startX, startY, width, height)
    ) {
      return [startX, startY];
    }

    const visited = new Array(width * height).fill(false);
    const queue: [number, number][] = [];
    const enqueue = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= width || y >= height) return;
      const index = x + y * width;
      if (visited[index]) return;
      visited[index] = true;
      queue.push([x, y]);
    };

    enqueue(
      Math.min(Math.max(startX, 0), width - 1),
      Math.min(Math.max(startY, 0), height - 1),
    );

    let head = 0;
    while (head < queue.length) {
      const [x, y] = queue[head++];
      if (x >= 0 && y >= 0 && x < width && y < height) {
        if (passableFor(map, x, y, width, height)) {
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
    if (this.state.options.godMode) {
      return false;
    }

    if (this.state.player.hp <= 0 && !this.isDead) {
      this.isDead = true;

      // Stop player movement immediately
      const player = this.state.player;
      if ("velocityX" in player && "velocityY" in player) {
        (player as any).velocityX = 0;
        (player as any).velocityY = 0;
      }

      // Keep the post-death board simulation running in real time.
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
      levelKind: snapshot.levelKind,
      map: snapshot.map,
      mapWidth: snapshot.mapWidth,
      mapHeight: snapshot.mapHeight,
      floorVariant: snapshot.floorVariant,
      wallSet: snapshot.wallSet,
      wallDamage: snapshot.wallDamage,
      stairsDown: snapshot.stairsDown,
      stairsUp: snapshot.stairsUp,
      explored: Array.from(snapshot.explored),
      exploredByPlayer: this.serializeExploredByPlayer(
        snapshot.exploredByPlayer,
      ),
      entities: snapshot.entities.map((entity) =>
        this.stripRuntimeEntityState(entity),
      ),
      enhancedVision: snapshot.enhancedVision,
    }));

    const exploredByPlayer: Record<string, number[]> = {};
    for (const [playerId, explored] of this.state.exploredByPlayer.entries()) {
      exploredByPlayer[playerId] = Array.from(explored);
    }

    return {
      depth: this.state.depth,
      levelKind: this.state.levelKind,
      // Copy map/wallDamage: the delta encoder keeps the previous serialized
      // snapshot as a baseline and diffs against it, so these must be distinct
      // arrays each tick or wall changes are invisible to deltas (and only
      // surface on the periodic keyframe — the "delayed wall damage" bug).
      map: this.state.map.slice(),
      mapWidth: this.state.mapWidth,
      mapHeight: this.state.mapHeight,
      floorVariant: this.state.floorVariant,
      wallSet: this.state.wallSet,
      wallDamage: this.state.wallDamage.slice(),
      stairsDown: this.state.stairsDown,
      stairsUp: this.state.stairsUp,
      player: this.stripRuntimeEntityState(this.state.player) as Player,
      players: this.state.players.map(
        (player) => this.stripRuntimeEntityState(player) as Player,
      ),
      entities: this.state.entities
        .filter((entity) => entity.kind !== EntityKind.PLAYER)
        .map((entity) => this.stripRuntimeEntityState(entity)),
      explored: Array.from(this.state.explored),
      enhancedVision: this.state.enhancedVision,
      godMode: this.state.options.godMode,
      exploredByPlayer,
      story: this.state.story.slice(0, 50),
      levels,
      multiplayer: this.state.multiplayer,
      sim: {
        nowTick: this.state.sim.nowTick,
        mode: this.state.sim.mode,
        timeScale: this.state.sim.timeScale,
        targetTimeScale: this.state.sim.targetTimeScale,
      },
      sounds: this.state.pendingSounds.map((s) => s.effect),
      effects: this.state.effects,
    };
  }

  /**
   * Load game state from serialized data
   */
  public deserialize(data: SerializedState): void {
    const partial = data as Partial<SerializedState>;
    if (!Array.isArray(partial.map)) {
      throw new Error("Invalid save: missing map data");
    }
    const serializedPlayers =
      Array.isArray(partial.players) && partial.players.length > 0
        ? partial.players
        : partial.player
          ? [partial.player]
          : [];
    if (serializedPlayers.length === 0) {
      throw new Error("Invalid save: missing player data");
    }
    const serializedEntities = Array.isArray(partial.entities)
      ? partial.entities
      : [];
    const exploredTiles = Array.isArray(partial.explored)
      ? partial.explored
      : [];
    const sim = partial.sim ?? { nowTick: 0, mode: "REALTIME" as const };
    const floorVariant =
      typeof data.floorVariant === "number" ? data.floorVariant : RNG.int(3);
    const wallSet = data.wallSet === "wood" ? "wood" : "concrete";
    const mapWidth = data.mapWidth ?? (data.depth === 0 ? 128 : MAP_WIDTH);
    const mapHeight = data.mapHeight ?? (data.depth === 0 ? 72 : MAP_HEIGHT);
    const wallDamage =
      data.wallDamage && data.wallDamage.length === data.map.length
        ? data.wallDamage.slice()
        : new Array(data.map.length).fill(0);
    const players = this.hydratePlayers(serializedPlayers, data.depth);
    const localPlayerId =
      data.multiplayer?.localPlayerId ?? players[0].id;
    this.localPlayerId = localPlayerId;
    const player =
      players.find((candidate) => candidate.id === localPlayerId) ?? players[0];

    const nonPlayerEntities = serializedEntities.filter(
      (entity) => entity.kind !== EntityKind.PLAYER,
    );
    const entities: Entity[] = [
      ...players,
      ...this.hydrateEntities(nonPlayerEntities, data.depth),
    ];

    const exploredByPlayer = this.deserializeExploredByPlayer(
      data.exploredByPlayer,
    );
    if (!exploredByPlayer.has(localPlayerId)) {
      exploredByPlayer.set(localPlayerId, new Set(exploredTiles));
    }
    const visibilityByPlayer = new Map<string, Set<number>>();

    this.state = {
      depth: data.depth,
      levelKind: data.levelKind ?? (data.depth === 0 ? "outside" : "dungeon"),
      map: data.map,
      mapWidth,
      mapHeight,
      floorVariant,
      wallSet,
      wallDamage,
      mapDirty: false,
      tiles: new FlatTileSource(data.map, mapWidth, mapHeight),
      stairsDown: data.stairsDown ??
        (data as { stairs?: [number, number] }).stairs ?? [0, 0],
      stairsUp: data.stairsUp ?? null,
      playerStart: data.stairsUp ?? data.stairsDown ?? [0, 0],
      visible: new Set(),
      explored: new Set(exploredTiles),
      accessible: new Set(),
      enhancedVision: data.enhancedVision ?? false,
      visibilityByPlayer,
      exploredByPlayer,
      entities,
      entityManager: new EntityManager(entities),
      players,
      player,
      story: data.story || [],
      options: { fov: true, godMode: data.godMode ?? false },
      effects: data.effects || [],
      multiplayer: {
        mode: data.multiplayer?.mode ?? this.multiplayerMode,
        localPlayerId,
      },
      sim: {
        nowTick: sim.nowTick,
        mode: sim.mode,
        timeScale: sim.timeScale ?? 1.0,
        targetTimeScale: sim.targetTimeScale ?? 1.0,
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
        levelKind:
          level.levelKind ?? (level.depth === 0 ? "outside" : "dungeon"),
        map: level.map,
        mapWidth: level.mapWidth ?? (level.depth === 0 ? 128 : MAP_WIDTH),
        mapHeight: level.mapHeight ?? (level.depth === 0 ? 72 : MAP_HEIGHT),
        floorVariant: level.floorVariant,
        wallSet: level.wallSet === "wood" ? "wood" : "concrete",
        wallDamage: level.wallDamage,
        stairsDown: level.stairsDown,
        stairsUp: level.stairsUp ?? null,
        explored: new Set(level.explored),
        exploredByPlayer: this.deserializeExploredByPlayer(
          level.exploredByPlayer,
        ),
        entities: this.hydrateEntities(level.entities, level.depth),
        enhancedVision: level.enhancedVision ?? false,
      });
    }

    this.isDead = false;
    this.normalizeCurrentCompletedExploration();
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
        const savedType = (entity as Monster).type;
        const monsterType =
          savedType === MonsterType.RAT
            ? MonsterType.RAT
            : savedType === MonsterType.SKULKER
              ? MonsterType.SKULKER
              : savedType === MonsterType.UTILITY_BOT
                ? MonsterType.UTILITY_BOT
                : MonsterType.MUTANT;
        const monster = new MonsterEntity(gridX, gridY, monsterType, depth);
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
          (entity as Item).amount,
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

  private cloneExploredByPlayerMap(
    source: Map<string, Set<number>>,
  ): Map<string, Set<number>> {
    const clone = new Map<string, Set<number>>();
    for (const [playerId, explored] of source.entries()) {
      clone.set(playerId, new Set(explored));
    }
    return clone;
  }

  private serializeExploredByPlayer(
    source: Map<string, Set<number>>,
  ): Record<string, number[]> {
    const serialized: Record<string, number[]> = {};
    for (const [playerId, explored] of source.entries()) {
      serialized[playerId] = Array.from(explored);
    }
    return serialized;
  }

  private deserializeExploredByPlayer(
    source?: Record<string, number[]>,
  ): Map<string, Set<number>> {
    const exploredByPlayer = new Map<string, Set<number>>();
    if (!source) {
      return exploredByPlayer;
    }

    for (const [playerId, explored] of Object.entries(source)) {
      exploredByPlayer.set(
        playerId,
        new Set(Array.isArray(explored) ? explored : []),
      );
    }

    return exploredByPlayer;
  }

  private computeAccessibleTiles(startX: number, startY: number): Set<number> {
    const accessible = new Set<number>();
    const queue: Array<[number, number]> = [[startX, startY]];
    const visited = new Set<number>();

    let head = 0;
    while (head < queue.length) {
      const [x, y] = queue[head++];

      if (x < 0 || y < 0 || x >= this.state.mapWidth || y >= this.state.mapHeight) {
        continue;
      }

      const index = x + y * this.state.mapWidth;
      if (visited.has(index)) {
        continue;
      }
      visited.add(index);
      accessible.add(index);

      if (
        !passableFor(
          this.state.map,
          x,
          y,
          this.state.mapWidth,
          this.state.mapHeight,
        )
      ) {
        continue;
      }

      queue.push([x + 1, y]);
      queue.push([x - 1, y]);
      queue.push([x, y + 1]);
      queue.push([x, y - 1]);
    }

    return accessible;
  }

  private checkExplorationCompletion(
    player: Player,
    explored: Set<number>,
  ): boolean {
    if (this.state.enhancedVision) {
      return false;
    }

    const reachable = this.computeReachablePassableTiles(
      player.gridX,
      player.gridY,
    );
    const reachableCount = reachable.size;
    if (reachableCount < MIN_COMPLETION_REACHABLE_TILES) return false;

    let exploredAccessibleCount = 0;
    for (const index of reachable) {
      if (explored.has(index)) {
        exploredAccessibleCount += 1;
      }
    }

    if (
      exploredAccessibleCount / reachableCount <
      EXPLORATION_COMPLETION_THRESHOLD
    ) {
      return false;
    }

    this.state.enhancedVision = true;
    this.addStory("Level successfully explored!");
    Sound.play(SoundEffect.LEVEL_EXPLORED);
    return true;
  }

  private normalizeCurrentCompletedExploration(): void {
    if (!this.state.enhancedVision) return;

    const player = this.state.player;
    const explored =
      this.state.exploredByPlayer.get(this.state.multiplayer.localPlayerId) ??
      this.state.explored;

    if (
      !passableFor(
        this.state.map,
        player.gridX,
        player.gridY,
        this.state.mapWidth,
        this.state.mapHeight,
      )
    ) {
      return;
    }

    const reachable = this.computeReachablePassableTiles(
      player.gridX,
      player.gridY,
    );
    if (reachable.size === 0) return;

    const completed = this.computeCompletedExploration(player, reachable);
    if (this.includesAllExploredTiles(explored, completed)) {
      return;
    }

    this.applyCompletedExploration(completed);
  }

  private completeLevelExploration(player: Player): Set<number> {
    const reachable = this.computeReachablePassableTiles(
      player.gridX,
      player.gridY,
    );
    const completed = this.computeCompletedExploration(player, reachable);
    return this.applyCompletedExploration(completed);
  }

  private computeCompletedExploration(
    player: Player,
    reachable: Set<number>,
  ): Set<number> {
    const completed = new Set<number>();

    for (const index of reachable) {
      const x = index % this.state.mapWidth;
      const y = Math.floor(index / this.state.mapWidth);
      const visibleFromTile = computeFOVFrom(
        this.state.map,
        x,
        y,
        player.sight,
        this.state.mapWidth,
        this.state.mapHeight,
      );
      for (const visibleIndex of visibleFromTile) {
        completed.add(visibleIndex);
      }
    }

    return completed;
  }

  private applyCompletedExploration(completed: Set<number>): Set<number> {
    for (const player of this.state.players) {
      this.state.exploredByPlayer.set(player.id, new Set(completed));
    }

    const localPlayerId = this.state.multiplayer.localPlayerId;
    let localExplored = this.state.exploredByPlayer.get(localPlayerId);
    if (!localExplored) {
      localExplored = new Set(completed);
      this.state.exploredByPlayer.set(localPlayerId, localExplored);
    }
    this.state.explored = localExplored;

    return localExplored;
  }

  private includesAllExploredTiles(
    explored: Set<number>,
    completed: Set<number>,
  ): boolean {
    for (const index of completed) {
      if (!explored.has(index)) return false;
    }
    return true;
  }

  private computeReachablePassableTiles(
    startX: number,
    startY: number,
  ): Set<number> {
    const reachable = new Set<number>();
    if (
      !passableFor(
        this.state.map,
        startX,
        startY,
        this.state.mapWidth,
        this.state.mapHeight,
      )
    ) {
      return reachable;
    }

    const queue: Array<[number, number]> = [[startX, startY]];

    let head = 0;
    while (head < queue.length) {
      const [x, y] = queue[head++];
      if (x < 0 || y < 0 || x >= this.state.mapWidth || y >= this.state.mapHeight) continue;

      const index = x + y * this.state.mapWidth;
      if (reachable.has(index)) continue;
      if (
        !passableFor(
          this.state.map,
          x,
          y,
          this.state.mapWidth,
          this.state.mapHeight,
        )
      ) {
        continue;
      }

      reachable.add(index);
      queue.push([x + 1, y]);
      queue.push([x - 1, y]);
      queue.push([x, y + 1]);
      queue.push([x, y - 1]);
    }

    return reachable;
  }

  private findSpawnTile(preferred: [number, number]): [number, number] {
    const visited = new Set<number>();
    const queue: [number, number][] = [];
    const enqueue = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= this.state.mapWidth || y >= this.state.mapHeight) return;
      const index = x + y * this.state.mapWidth;
      if (visited.has(index)) return;
      visited.add(index);
      queue.push([x, y]);
    };

    enqueue(preferred[0], preferred[1]);
    let head = 0;
    while (head < queue.length) {
      const [x, y] = queue[head++];
      if (
        passableFor(
          this.state.map,
          x,
          y,
          this.state.mapWidth,
          this.state.mapHeight,
        ) &&
        !this.isActorOccupied(x, y)
      ) {
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
    let explored = this.state.exploredByPlayer.get(localPlayerId);
    if (!explored) {
      explored = new Set<number>();
      this.state.exploredByPlayer.set(localPlayerId, explored);
    }
    this.state.explored = explored;
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
