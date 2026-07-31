import { describe, it, expect } from "vitest";
import { RelationshipGraph, isWonOver } from "./relationship-graph";

describe("RelationshipGraph", () => {
  it("returns neutral for unknown edges", () => {
    const g = new RelationshipGraph();
    expect(g.get("a", "b")).toEqual({ affinity: 0, fear: 0, grievance: 0 });
  });

  it("is directional (a→b differs from b→a)", () => {
    const g = new RelationshipGraph();
    g.adjust("a", "b", { affinity: 30 });
    expect(g.get("a", "b").affinity).toBe(30);
    expect(g.get("b", "a").affinity).toBe(0);
  });

  it("accumulates and clamps deltas", () => {
    const g = new RelationshipGraph();
    g.adjust("a", "b", { affinity: 80 });
    const state = g.adjust("a", "b", { affinity: 80 });
    expect(state.affinity).toBe(100); // clamped
    const low = g.adjust("a", "b", { affinity: -300 });
    expect(low.affinity).toBe(-100); // clamped
    expect(g.adjust("a", "b", { fear: -50 }).fear).toBe(0); // fear floor
  });

  it("does not alias returned state with internal storage", () => {
    const g = new RelationshipGraph();
    const returned = g.adjust("a", "b", { affinity: 10 });
    returned.affinity = 999;
    expect(g.get("a", "b").affinity).toBe(10);
  });

  it("round-trips through serialize/deserialize", () => {
    const g = new RelationshipGraph();
    g.adjust("player-1", "snag-9", { affinity: 90, fear: 10, grievance: 5 });
    const restored = RelationshipGraph.deserialize(g.serialize());
    expect(restored.get("player-1", "snag-9")).toEqual({
      affinity: 90,
      fear: 10,
      grievance: 5,
    });
  });

  it("recognises a won-over state", () => {
    expect(isWonOver({ affinity: 90, fear: 0, grievance: 0 })).toBe(true);
    expect(isWonOver({ affinity: 40, fear: 0, grievance: 0 })).toBe(false);
    expect(isWonOver({ affinity: 90, fear: 0, grievance: 80 })).toBe(false);
  });
});
