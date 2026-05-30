import { describe, it, expect, beforeEach } from "vitest";
import { Entity } from "../types";
import { EntityManager } from "./entity-manager";

function ent(id: string): Entity {
  return { id } as unknown as Entity;
}

describe("EntityManager", () => {
  let entities: Entity[];
  let manager: EntityManager;

  beforeEach(() => {
    entities = [];
    manager = new EntityManager(entities);
  });

  it("shares its array in place with the one it was constructed from", () => {
    manager.spawn(ent("a"));
    expect(manager.entities).toBe(entities);
    expect(entities).toHaveLength(1);
  });

  it("tracks spawns and clears the matching removal", () => {
    manager.spawn(ent("a"));
    manager.spawn(ent("b"));
    expect([...manager.spawnedIds]).toEqual(["a", "b"]);
    expect(manager.has("a")).toBe(true);
    expect(manager.getById("b")?.id).toBe("b");
  });

  it("destroys by id or reference and records the removal", () => {
    const a = manager.spawn(ent("a"));
    manager.clearLifecycle();
    manager.destroy(a);
    expect(manager.has("a")).toBe(false);
    expect([...manager.removedIds]).toEqual(["a"]);
  });

  it("is a no-op when destroying an unknown id", () => {
    manager.spawn(ent("a"));
    manager.clearLifecycle();
    manager.destroy("nope");
    expect(manager.entities).toHaveLength(1);
    expect(manager.removedIds.size).toBe(0);
  });

  it("cancels spawn tracking when an entity is spawned then destroyed", () => {
    manager.spawn(ent("a"));
    manager.destroy("a");
    expect(manager.spawnedIds.has("a")).toBe(false);
    expect(manager.removedIds.has("a")).toBe(true);
  });

  it("destroys all entities matching a predicate", () => {
    manager.spawn(ent("keep1"));
    manager.spawn(ent("drop1"));
    manager.spawn(ent("drop2"));
    manager.clearLifecycle();
    manager.destroyWhere((e) => e.id.startsWith("drop"));
    expect(manager.entities.map((e) => e.id)).toEqual(["keep1"]);
    expect([...manager.removedIds].sort()).toEqual(["drop1", "drop2"]);
  });

  it("destroys a set of ids", () => {
    ["a", "b", "c"].forEach((id) => manager.spawn(ent(id)));
    manager.clearLifecycle();
    manager.destroyByIds(new Set(["a", "c"]));
    expect(manager.entities.map((e) => e.id)).toEqual(["b"]);
  });

  it("replaceAll swaps contents in place and resets lifecycle tracking", () => {
    manager.spawn(ent("old"));
    const replacement = [ent("x"), ent("y")];
    manager.replaceAll(replacement);
    expect(manager.entities).toBe(entities); // same array reference
    expect(manager.entities.map((e) => e.id)).toEqual(["x", "y"]);
    expect(manager.spawnedIds.size).toBe(0);
    expect(manager.removedIds.size).toBe(0);
  });

  it("clearLifecycle empties both diff sets", () => {
    manager.spawn(ent("a"));
    manager.destroy("a");
    manager.clearLifecycle();
    expect(manager.spawnedIds.size).toBe(0);
    expect(manager.removedIds.size).toBe(0);
  });
});
