import { describe, it, expect, beforeEach } from "vitest";
import { Entity, EntityKind } from "../types";
import { EntityManager } from "./entity-manager";

function ent(id: string): Entity {
  return { id } as unknown as Entity;
}

/** An ITEM-kind entity, which the manager mirrors into its `items` index. */
function item(id: string): Entity {
  return { id, kind: EntityKind.ITEM } as unknown as Entity;
}

/** A MONSTER-kind entity, which must never appear in the `items` index. */
function monster(id: string): Entity {
  return { id, kind: EntityKind.MONSTER } as unknown as Entity;
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

  describe("items index", () => {
    /**
     * The index is a denormalized view, so the only thing worth testing is that
     * it never disagrees with the entity array it mirrors.
     */
    function expectIndexConsistent(m: EntityManager): void {
      const fromEntities = m.entities.filter(
        (entity) => entity.kind === EntityKind.ITEM,
      );
      expect([...m.items]).toEqual(fromEntities);
    }

    it("starts from the entities passed to the constructor", () => {
      const seeded = new EntityManager([item("i1"), monster("m1"), item("i2")]);
      expect(seeded.items.map((i) => i.id)).toEqual(["i1", "i2"]);
      expectIndexConsistent(seeded);
    });

    it("stays consistent through spawn", () => {
      manager.spawn(item("i1"));
      manager.spawn(monster("m1"));
      manager.spawn(item("i2"));
      expect(manager.items.map((i) => i.id)).toEqual(["i1", "i2"]);
      expectIndexConsistent(manager);
    });

    it("keeps items in entity-array order across interleaved removals", () => {
      // Per-tick item scans (magnetic pickup, hole falls, monster pickup) read
      // this index instead of filtering `entities`, and some of them draw from
      // the shared RNG as they go. Equal *order* — not just equal membership —
      // is what keeps those scans deterministic, so a future swap-and-pop
      // removal here would be a silent behavior change, not an optimization.
      manager.spawnAll([
        item("i1"),
        monster("m1"),
        item("i2"),
        item("i3"),
        monster("m2"),
        item("i4"),
      ]);
      manager.destroy("i2");
      manager.destroy("m1");

      expect(manager.items.map((i) => i.id)).toEqual(["i1", "i3", "i4"]);
      expectIndexConsistent(manager);
    });

    it("stays consistent through spawnAll", () => {
      manager.spawnAll([item("i1"), monster("m1"), item("i2")]);
      expect(manager.items).toHaveLength(2);
      expectIndexConsistent(manager);
    });

    it("stays consistent through destroy by id and by reference", () => {
      manager.spawnAll([item("i1"), item("i2"), monster("m1")]);
      const i2 = manager.getById("i2")!;

      manager.destroy("i1");
      expectIndexConsistent(manager);

      manager.destroy(i2);
      expect(manager.items).toHaveLength(0);
      expectIndexConsistent(manager);
    });

    it("leaves the index alone when a non-item is destroyed", () => {
      manager.spawnAll([item("i1"), monster("m1")]);
      manager.destroy("m1");
      expect(manager.items.map((i) => i.id)).toEqual(["i1"]);
      expectIndexConsistent(manager);
    });

    it("stays consistent through destroyWhere removing several items at once", () => {
      manager.spawnAll([
        item("i1"),
        monster("m1"),
        item("i2"),
        item("i3"),
        monster("m2"),
      ]);

      // Reverse-iterating removal is where a parallel index most easily slips.
      manager.destroyWhere((entity) => entity.kind === EntityKind.ITEM);

      expect(manager.items).toHaveLength(0);
      expectIndexConsistent(manager);
    });

    it("stays consistent through destroyByIds", () => {
      manager.spawnAll([item("i1"), item("i2"), item("i3")]);
      manager.destroyByIds(new Set(["i1", "i3"]));
      expect(manager.items.map((i) => i.id)).toEqual(["i2"]);
      expectIndexConsistent(manager);
    });

    it("rebuilds the index on replaceAll", () => {
      manager.spawnAll([item("old1"), item("old2")]);
      manager.replaceAll([monster("m1"), item("new1")]);
      expect(manager.items.map((i) => i.id)).toEqual(["new1"]);
      expectIndexConsistent(manager);
    });

    it("empties the index when replaceAll is given no items", () => {
      manager.spawnAll([item("i1"), item("i2")]);
      manager.replaceAll([monster("m1")]);
      expect(manager.items).toHaveLength(0);
      expectIndexConsistent(manager);
    });

    it("survives a long mixed sequence of spawns and removals", () => {
      // Churn the way a real level does, then check the index still agrees.
      for (let i = 0; i < 40; i++) {
        manager.spawn(i % 3 === 0 ? monster(`m${i}`) : item(`i${i}`));
      }
      manager.destroyByIds(new Set(["i1", "i2", "m0", "i44"]));
      manager.destroyWhere((e) => e.id.endsWith("7"));
      manager.spawn(item("late"));
      manager.destroy("late");
      manager.spawn(item("last"));

      expectIndexConsistent(manager);
      expect(manager.items.some((i) => i.id === "last")).toBe(true);
      expect(manager.items.some((i) => i.id === "i1")).toBe(false);
    });
  });

  describe("id lookup", () => {
    /** getById/has are index-backed; they must agree with a linear scan. */
    function expectLookupConsistent(m: EntityManager): void {
      for (const entity of m.entities) {
        expect(m.getById(entity.id)).toBe(entity);
        expect(m.has(entity.id)).toBe(true);
      }
      expect(m.getById("definitely-absent")).toBeUndefined();
      expect(m.has("definitely-absent")).toBe(false);
    }

    it("resolves entities seeded through the constructor", () => {
      const seeded = new EntityManager([ent("a"), item("b")]);
      expectLookupConsistent(seeded);
    });

    it("stops resolving an entity once it is destroyed", () => {
      manager.spawnAll([ent("a"), ent("b")]);
      manager.destroy("a");

      expect(manager.getById("a")).toBeUndefined();
      expect(manager.has("a")).toBe(false);
      expect(manager.getById("b")?.id).toBe("b");
      expectLookupConsistent(manager);
    });

    it("stops resolving entities removed by destroyWhere and destroyByIds", () => {
      manager.spawnAll([item("i1"), monster("m1"), item("i2"), ent("e1")]);

      manager.destroyWhere((e) => e.kind === EntityKind.ITEM);
      expect(manager.getById("i1")).toBeUndefined();
      expect(manager.getById("i2")).toBeUndefined();

      manager.destroyByIds(new Set(["m1"]));
      expect(manager.getById("m1")).toBeUndefined();
      expectLookupConsistent(manager);
    });

    it("drops the old world's ids on replaceAll", () => {
      manager.spawnAll([ent("old")]);
      manager.replaceAll([ent("new")]);

      expect(manager.getById("old")).toBeUndefined();
      expect(manager.getById("new")?.id).toBe("new");
      expectLookupConsistent(manager);
    });

    it("resolves a respawned id to the new entity", () => {
      // Level transitions rebuild entities that keep stable ids (the player,
      // authored actors), so the map must point at the current instance.
      manager.spawn(ent("stable"));
      const replacement = ent("stable");
      manager.replaceAll([replacement]);

      expect(manager.getById("stable")).toBe(replacement);
    });

    it("stays consistent through a long mixed sequence", () => {
      for (let i = 0; i < 40; i++) {
        manager.spawn(i % 2 === 0 ? monster(`m${i}`) : item(`i${i}`));
      }
      manager.destroyByIds(new Set(["m0", "i1", "m2"]));
      manager.destroyWhere((e) => e.id.endsWith("9"));
      expectLookupConsistent(manager);
      expect(manager.getById("m0")).toBeUndefined();
      expect(manager.getById("m4")?.id).toBe("m4");
    });
  });
});
