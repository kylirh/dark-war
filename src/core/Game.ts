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
import {
  dist,
  isWalkable,
  entityAt,
  entitiesAt,
  removeEntity,
  tileAt,
  passable,
} from "../utils/helpers";
import { computeFOV } from "../systems/FOV";
import {
  meleeAttack,
  fireWeapon,
  reloadWeapon,
  interactWithDoor,
} from "../systems/Combat";
import { runMonsterAI } from "../systems/AI";

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
   * Add message to log
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
  private updateFOV(): void {
    this.state.visible = computeFOV(
      this.state.map,
      this.state.player,
      this.state.explored
    );
  }

  /**
   * Handle player movement or bump attack
   */
  public handleMove(dx: number, dy: number): void {
    if (this.isDead) return;

    const nx = this.state.player.x + dx;
    const ny = this.state.player.y + dy;
    const tile = tileAt(this.state.map, nx, ny);

    // Check for closed/locked doors
    if (tile === TileType.DOOR_CLOSED) {
      this.addLog("The closed door blocks your way. Press O to open.");
      return;
    }

    if (tile === TileType.DOOR_LOCKED) {
      this.addLog("A locked door. You need a keycard.");
      return;
    }

    // Try melee attack
    const foe = entityAt(
      this.state.entities,
      nx,
      ny,
      (e) => e.kind === EntityKind.MONSTER
    );
    if (foe) {
      const result = meleeAttack(
        this.state.player,
        this.state.entities,
        nx,
        ny
      );
      if (result.success) {
        this.addLog(result.message);
        this.endTurn();
      }
      return;
    }

    // Move if passable
    if (passable(this.state.map, nx, ny)) {
      this.state.player.x = nx;
      this.state.player.y = ny;
      this.endTurn();
    }
  }

  /**
   * Handle player firing weapon
   */
  public handleFire(dx: number, dy: number): void {
    if (this.isDead) return;

    // Signal to enter fire mode (dx=0, dy=0)
    if (dx === 0 && dy === 0) {
      this.addLog("Choose a direction to fire.");
      return;
    }

    const result = fireWeapon(
      this.state.player,
      this.state.entities,
      this.state.map,
      dx,
      dy
    );
    this.addLog(result.message);

    if (result.success) {
      this.endTurn();
    }
  }

  /**
   * Handle player waiting/resting
   */
  public handleWait(): void {
    if (this.isDead) return;
    this.endTurn();
  }

  /**
   * Handle pickup action
   */
  public handlePickup(): void {
    if (this.isDead) return;

    const items = entitiesAt(
      this.state.entities,
      this.state.player.x,
      this.state.player.y
    ).filter((e) => e.kind === EntityKind.ITEM) as Item[];

    if (items.length === 0) {
      this.addLog("Nothing to pick up.");
      return;
    }

    for (const item of items) {
      switch (item.type) {
        case ItemType.AMMO:
          this.state.player.ammoReserve += item.amount!;
          this.addLog(`Picked up ${item.amount} ammo.`);
          break;

        case ItemType.MEDKIT:
          this.state.player.hp = Math.min(
            this.state.player.hpMax,
            this.state.player.hp + item.heal!
          );
          this.addLog(`Used a medkit (+${item.heal} HP).`);
          break;

        case ItemType.KEYCARD:
          this.state.player.keys++;
          this.addLog("Picked up a keycard.");
          break;

        case ItemType.PISTOL:
          this.addLog("You already have a pistol.");
          break;
      }

      removeEntity(this.state.entities, item);
    }
  }

  /**
   * Handle door interaction
   */
  public handleInteract(): void {
    if (this.isDead) return;

    const directions: [number, number][] = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];

    for (const [dx, dy] of directions) {
      const x = this.state.player.x + dx;
      const y = this.state.player.y + dy;
      const result = interactWithDoor(this.state.map, this.state.player, x, y);

      if (result.success) {
        this.addLog(result.message);
        this.endTurn();
        return;
      } else if (result.message) {
        this.addLog(result.message);
        return;
      }
    }

    this.addLog("No door adjacent.");
  }

  /**
   * Handle descending stairs
   */
  public handleDescend(): void {
    if (this.isDead) return;

    if (
      this.state.player.x === this.state.stairs[0] &&
      this.state.player.y === this.state.stairs[1]
    ) {
      this.reset(this.state.depth + 1);
    } else {
      this.addLog("You are not standing on the stairs.");
    }
  }

  /**
   * Handle reload action
   */
  public handleReload(): void {
    if (this.isDead) return;

    const result = reloadWeapon(this.state.player);
    this.addLog(result.message);
  }

  /**
   * Toggle FOV option
   */
  public toggleFOV(): void {
    this.state.options.fov = !this.state.options.fov;
  }

  /**
   * End player turn and run monster AI
   */
  private endTurn(): void {
    this.updateFOV();

    // Get only monsters
    const monsters = this.state.entities.filter(
      (e) => e.kind === EntityKind.MONSTER
    ) as Monster[];

    const playerDied = runMonsterAI(
      monsters,
      this.state.player,
      this.state.entities,
      this.state.map,
      (msg) => this.addLog(msg)
    );

    if (playerDied) {
      this.gameOver();
      return;
    }

    this.updateFOV();
  }

  /**
   * Handle player death
   */
  private gameOver(): void {
    this.isDead = true;
    this.addLog("You died. Press 'New run' to try again.");
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
    };

    this.isDead = false;
    this.updateFOV();
  }
}
