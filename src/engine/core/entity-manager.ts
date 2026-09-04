import { Entity, EntityKind, Item } from "../types";

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
 * An `items` index and an id lookup map are maintained alongside the entity
 * array, so item-heavy hot paths (pickup radius checks) and id lookups
 * ({@link getById}, {@link has}) do not rescan every entity. They are kept correct
 * by the fact that every mutation funnels through {@link spawn}, {@link destroy},
 * {@link destroyWhere} and {@link replaceAll} — one more reason direct mutation
 * of the entity array is forbidden, since it would desync the index silently.
 *
 * Lifecycle tracking (`spawnedIds` / `removedIds`) accumulates until a consumer
 * applies it and calls {@link clearLifecycle}. Whole-list swaps via
 * {@link replaceAll} (level transitions, deserialize) reset tracking — callers
 * must rebuild physics bodies wholesale via `Physics.rebuildAll()` instead.
 */
export class EntityManager {
  private readonly _entities: Entity[];
  private readonly _items: Item[];
  /** id -> entity, so getById/has are O(1). Entity ids are unique. */
  private readonly _byId = new Map<string, Entity>();

  /** Ids added since the last {@link clearLifecycle}. */
  readonly spawnedIds = new Set<string>();
  /** Ids removed since the last {@link clearLifecycle}. */
  readonly removedIds = new Set<string>();

  constructor(entities: Entity[] = []) {
    this._entities = entities;
    this._items = [];
    for (const entity of entities) this.index(entity);
  }

  /** The canonical entity array. Read freely; mutate only via this class. */
  get entities(): Entity[] {
    return this._entities;
  }

  /**
   * Index of every {@link EntityKind.ITEM} entity, in spawn order.
   *
   * Typed readonly because mutating it would desync it from `entities`; add and
   * remove through {@link spawn} / {@link destroy} like any other entity.
   */
  get items(): readonly Item[] {
    return this._items;
  }

  /** Add an entity to the world. */
  spawn<T extends Entity>(entity: T): T {
    this._entities.push(entity);
    this.index(entity);
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
    const entity = this._entities[index];
    this._entities.splice(index, 1);
    this.unindex(entity);
    this.markRemoved(id);
  }

  /** Remove every entity matching a predicate. */
  destroyWhere(predicate: (entity: Entity) => boolean): void {
    for (const entity of [...this._entities]) {
      if (!this.has(entity.id)) continue;
      if (predicate(entity)) {
        this.destroy(entity);
      }
    }
  }

  /** Remove every entity whose id is contained in `ids`. */
  destroyByIds(ids: ReadonlySet<string>): void {
    if (ids.size === 0) return;
    this.destroyWhere((entity) => ids.has(entity.id));
  }

  getById(id: string): Entity | undefined {
    return this._byId.get(id);
  }

  has(id: string): boolean {
    return this._byId.has(id);
  }

  /**
   * Replace the entire entity list in place (level transition, deserialize).
   * Lifecycle tracking is reset; callers must rebuild physics bodies wholesale.
   */
  replaceAll(entities: Entity[]): void {
    this._entities.length = 0;
    this._items.length = 0;
    this._byId.clear();
    for (const entity of entities) {
      this._entities.push(entity);
      this.index(entity);
    }
    this.clearLifecycle();
  }

  /** Clear spawn/remove tracking once every consumer has reacted. */
  clearLifecycle(): void {
    this.spawnedIds.clear();
    this.removedIds.clear();
  }

  /** Add an entity to the lookup map and any kind index it belongs to. */
  private index(entity: Entity): void {
    this._byId.set(entity.id, entity);
    if (entity.kind === EntityKind.ITEM) this._items.push(entity as Item);
  }

  /** Remove an entity from the lookup map and any kind index it belongs to. */
  private unindex(entity: Entity): void {
    this._byId.delete(entity.id);
    if (entity.kind !== EntityKind.ITEM) return;
    const at = this._items.indexOf(entity as Item);
    if (at !== -1) this._items.splice(at, 1);
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
