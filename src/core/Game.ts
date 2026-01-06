import {
  GameState,
  EntityKind,
  Monster,
  Item,
  ItemType,
  TileType,
  SerializedState,
  MAP_WIDTH,
  MAP_HEIGHT,
} from "../types";
import { generateDungeon } from "./Map";
import { createPlayer } from "../entities/Player";
import { createMutant, createRat } from "../entities/Monster";
import { createItem } from "../entities/Item";
import { RNG } from "../utils/RNG";
import { dist, isWalkable } from "../utils/helpers";
import { computeFOV } from "../systems/FOV";

/**
 * Main game state manager
 * Orchestrates all game systems and manages game state
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
      visible: new Set(),
      explored: new Set(),
      entities: [],
      player: createPlayer(0, 0),
      stairs: [0, 0],
      log: [],
      options: { fov: true },
      sim: {
        nowTick: 0,
        mode: "PLANNING",
        isPaused: false,
        accumulatorMs: 0,
        lastFrameMs: performance.now(),
        pauseReasons: new Set(),
      },
      commandsByTick: new Map(),
      eventQueue: [],
    };
  }

  /**
   * Initialize a new game or level
   */
  public reset(depth: number = 1): void {
    this.isDead = false;
    const dungeon = generateDungeon();

    this.state = {
      depth,
      map: dungeon.map,
      visible: new Set(),
      explored: new Set(),
      entities: [],
      player: createPlayer(dungeon.start[0], dungeon.start[1]),
      stairs: dungeon.stairs,
      log: [],
      options: { fov: true },
      // NEW: Simulation system
      sim: {
        nowTick: 0,
        mode: "PLANNING",
        isPaused: false,
        accumulatorMs: 0,
        lastFrameMs: performance.now(),
        pauseReasons: new Set(),
      },
      commandsByTick: new Map(),
      eventQueue: [],
    };

    // Add player to entities
    this.state.entities.push(this.state.player);

    // Spawn monsters
    const freeTiles = this.getFreeTiles(dungeon.start);
    let ratCount = 0;
    let mutantCount = 0;
    for (let i = 0; i < 30; i++) {
      const [x, y] = RNG.choose(freeTiles);
      if (dist([x, y], dungeon.start) > 8) {
        const spawnRat = RNG.chance(0.5);
        if (spawnRat) {
          this.state.entities.push(createRat(x, y, depth));
          ratCount++;
        } else {
          this.state.entities.push(createMutant(x, y, depth));
          mutantCount++;
        }
      }
    }
    this.addLog(`Level ${depth}: ${ratCount} rats, ${mutantCount} mutants`);

    // Spawn items
    for (let i = 0; i < 10; i++) {
      const [x, y] = RNG.choose(freeTiles);
      this.state.entities.push(createItem(x, y, ItemType.AMMO));
    }

    for (let i = 0; i < 6; i++) {
      const [x, y] = RNG.choose(freeTiles);
      this.state.entities.push(createItem(x, y, ItemType.MEDKIT));
    }

    for (let i = 0; i < 3; i++) {
      const [x, y] = RNG.choose(freeTiles);
      this.state.entities.push(createItem(x, y, ItemType.KEYCARD));
    }

    this.addLog(`You descend into level ${depth}.`);
    this.updateFOV();
  }

  /**
   * Get all walkable tiles
   */
  private getFreeTiles(_start: [number, number]): [number, number][] {
    const tiles: [number, number][] = [];
    for (let y = 1; y < MAP_HEIGHT - 1; y++) {
      for (let x = 1; x < MAP_WIDTH - 1; x++) {
        if (isWalkable(this.state.map, this.state.entities, x, y)) {
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
      this.state.explored
    );
  }

  /**
   * Toggle FOV option
   */
  public toggleFOV(): void {
    this.state.options.fov = !this.state.options.fov;
  }

  /**
   * Toggle between Planning and Real-Time modes
   */
  public toggleMode(): void {
    this.state.sim.mode =
      this.state.sim.mode === "PLANNING" ? "REALTIME" : "PLANNING";

    if (this.state.sim.mode === "PLANNING") {
      this.state.sim.isPaused = false;
      this.addLog("Switched to Planning Mode.");
    } else {
      this.state.sim.isPaused = false;
      this.addLog("Switched to Real-Time Mode.");
    }
  }

  /**
   * Toggle pause in Real-Time mode
   */
  public togglePause(): void {
    if (this.state.sim.mode === "REALTIME") {
      this.state.sim.isPaused = !this.state.sim.isPaused;
      this.addLog(this.state.sim.isPaused ? "Paused." : "Resumed.");
    }
  }

  /**
   * Resume from a specific pause reason (e.g., NPC dialog)
   */
  public resumeFromPause(reason: string): void {
    this.state.sim.pauseReasons.delete(reason);
    if (this.state.sim.pauseReasons.size === 0) {
      this.state.sim.isPaused = false;
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
    this.state.player.x = dungeon.start[0];
    this.state.player.y = dungeon.start[1];
    this.state.player.nextActTick = this.state.sim.nowTick;

    // Remove monsters and items
    this.state.entities = this.state.entities.filter(
      (e) => e.kind === EntityKind.PLAYER
    );

    // Spawn new monsters
    const freeTiles = this.getFreeTiles(dungeon.start);
    const monsterCount = 8 + this.state.depth;
    for (let i = 0; i < monsterCount; i++) {
      const [x, y] = RNG.choose(freeTiles);
      if (dist([x, y], dungeon.start) > 8) {
        const spawnRat = RNG.chance(0.5);
        if (spawnRat) {
          this.state.entities.push(createRat(x, y, this.state.depth));
        } else {
          this.state.entities.push(createMutant(x, y, this.state.depth));
        }
      }
    }

    // Spawn items
    for (let i = 0; i < 10; i++) {
      const [x, y] = RNG.choose(freeTiles);
      this.state.entities.push(createItem(x, y, ItemType.AMMO));
    }

    for (let i = 0; i < 6; i++) {
      const [x, y] = RNG.choose(freeTiles);
      this.state.entities.push(createItem(x, y, ItemType.MEDKIT));
    }

    for (let i = 0; i < 3; i++) {
      const [x, y] = RNG.choose(freeTiles);
      this.state.entities.push(createItem(x, y, ItemType.KEYCARD));
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
   * Serialize game state for saving
   */
  public serialize(): SerializedState {
    return {
      depth: this.state.depth,
      map: this.state.map,
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
    this.state = {
      depth: data.depth,
      map: data.map,
      stairs: data.stairs,
      visible: new Set(),
      explored: new Set(data.explored),
      entities: [data.player, ...data.entities],
      player: data.player,
      log: data.log || [],
      options: { fov: true },
      sim: {
        nowTick: data.sim.nowTick,
        mode: data.sim.mode,
        isPaused: false,
        accumulatorMs: 0,
        lastFrameMs: performance.now(),
        pauseReasons: new Set(),
      },
      commandsByTick: new Map(),
      eventQueue: [],
    };

    this.isDead = false;
    this.updateFOV();
  }
}
