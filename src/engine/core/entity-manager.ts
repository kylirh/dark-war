import { Entity } from "../types";

/**
 * Owns the canonical list of game entities and tracks spawn/despawn
 * lifecycle so downstream systems (physics bodies, network deltas) can react
 * to changes without rescanning the whole world every frame.
 *
 * The manager mutates the entity array in place and never reassigns it, so
 * `GameState.entities` and `manager.entities` always reference the same array.
 * All entity additions and removals must go through this class — direct
 * `entities.push(...)` / `entities = entities.filter(...)` is what previously
 * left physics bodies and network state out of sync.
 *
 * Lifecycle tracking (`spawnedIds` / `removedIds`) accumulates until a consumer
 * applies it and calls {@link clearLifecycle}. Whole-list swaps via
 * {@link replaceAll} (level transitions, deserialize) reset tracking — callers
 * must rebuild physics bodies wholesale via `Physics.rebuildAll()` instead.
 */
export class EntityManager {
  private readonly _entities: Entity[];

  /** Ids added since the last {@link clearLifecycle}. */
  readonly spawnedIds = new Set<string>();
  /** Ids removed since the last {@link clearLifecycle}. */
  readonly removedIds = new Set<string>();

  constructor(entities: Entity[] = []) {
    this._entities = entities;
  }

  /** The canonical entity array. Read freely; mutate only via this class. */
  get entities(): Entity[] {
    return this._entities;
  }

  /** Add an entity to the world. */
  spawn<T extends Entity>(entity: T): T {
    this._entities.push(entity);
    this.markSpawned(entity.id);
    return entity;
  }

  /** Add several entities at once. */
  spawnAll(entities: Entity[]): void {
    for (const entity of entities) this.spawn(entity);
  }

  /** Remove an entity (by reference or id) from the world. No-op if absent. */
  destroy(entityOrId: Entity | string): void {
    const id = typeof entityOrId === "string" ? entityOrId : entityOrId.id;
    const index = this._entities.findIndex((entity) => entity.id === id);
    if (index === -1) return;
    this._entities.splice(index, 1);
    this.markRemoved(id);
  }

  /** Remove every entity matching a predicate. */
  destroyWhere(predicate: (entity: Entity) => boolean): void {
    for (let i = this._entities.length - 1; i >= 0; i--) {
      const entity = this._entities[i];
      if (predicate(entity)) {
        this._entities.splice(i, 1);
        this.markRemoved(entity.id);
      }
    }
  }

  /** Remove every entity whose id is contained in `ids`. */
  destroyByIds(ids: ReadonlySet<string>): void {
    if (ids.size === 0) return;
    this.destroyWhere((entity) => ids.has(entity.id));
  }

  getById(id: string): Entity | undefined {
    return this._entities.find((entity) => entity.id === id);
  }

  has(id: string): boolean {
    return this._entities.some((entity) => entity.id === id);
  }

  /**
   * Replace the entire entity list in place (level transition, deserialize).
   * Lifecycle tracking is reset; callers must rebuild physics bodies wholesale.
   */
  replaceAll(entities: Entity[]): void {
    this._entities.length = 0;
    for (const entity of entities) this._entities.push(entity);
    this.clearLifecycle();
  }

  /** Clear spawn/remove tracking once every consumer has reacted. */
  clearLifecycle(): void {
    this.spawnedIds.clear();
    this.removedIds.clear();
  }

  private markSpawned(id: string): void {
    this.removedIds.delete(id);
    this.spawnedIds.add(id);
  }

  private markRemoved(id: string): void {
    this.spawnedIds.delete(id);
    this.removedIds.add(id);
  }
}
