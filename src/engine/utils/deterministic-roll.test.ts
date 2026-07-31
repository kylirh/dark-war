import { describe, it, expect } from "vitest";
import {
  RollKey,
  deterministicUnit,
  deterministicInt,
  deterministicChance,
  deterministicChoice,
} from "./deterministic-roll";

const base: RollKey = {
  simulationSeed: 12345,
  actorStableId: "actor-a",
  decisionEpoch: 0,
  purpose: "choose-target",
  ordinal: 0,
};

describe("deterministicUnit", () => {
  it("is stateless: identical keys give identical values", () => {
    expect(deterministicUnit({ ...base })).toBe(deterministicUnit({ ...base }));
  });

  it("returns a value in [0, 1)", () => {
    for (let i = 0; i < 500; i++) {
      const v = deterministicUnit({ ...base, ordinal: i });
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("depends only on the key, not on call order", () => {
    const k1: RollKey = { ...base, ordinal: 1 };
    const k2: RollKey = { ...base, ordinal: 2 };
    const a1 = deterministicUnit(k1);
    const b2 = deterministicUnit(k2);
    // Re-roll in the opposite order — values must be unchanged.
    expect(deterministicUnit(k2)).toBe(b2);
    expect(deterministicUnit(k1)).toBe(a1);
  });

  it("separates decision kinds by purpose", () => {
    const target = deterministicUnit({ ...base, purpose: "choose-target" });
    const bark = deterministicUnit({ ...base, purpose: "idle-bark" });
    expect(target).not.toBe(bark);
  });

  it("varies across actors, seeds, epochs, and ordinals", () => {
    expect(deterministicUnit({ ...base, actorStableId: "actor-b" })).not.toBe(
      deterministicUnit(base),
    );
    expect(deterministicUnit({ ...base, simulationSeed: 999 })).not.toBe(
      deterministicUnit(base),
    );
    expect(deterministicUnit({ ...base, decisionEpoch: 1 })).not.toBe(
      deterministicUnit(base),
    );
    expect(deterministicUnit({ ...base, ordinal: 1 })).not.toBe(
      deterministicUnit(base),
    );
  });

  it("is roughly uniform over a large sample", () => {
    const n = 5000;
    let sum = 0;
    const buckets = new Array(10).fill(0);
    for (let i = 0; i < n; i++) {
      const v = deterministicUnit({ ...base, ordinal: i });
      sum += v;
      buckets[Math.min(9, (v * 10) | 0)]++;
    }
    expect(sum / n).toBeGreaterThan(0.45);
    expect(sum / n).toBeLessThan(0.55);
    // No bucket should be wildly under/over-represented.
    for (const count of buckets) {
      expect(count).toBeGreaterThan(n / 10 / 2);
      expect(count).toBeLessThan((n / 10) * 2);
    }
  });
});

describe("deterministicInt", () => {
  it("stays in range and is deterministic", () => {
    for (let i = 0; i < 200; i++) {
      const v = deterministicInt({ ...base, ordinal: i }, 7);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(7);
    }
    expect(deterministicInt(base, 7)).toBe(deterministicInt(base, 7));
  });

  it("rejects non-positive n", () => {
    expect(() => deterministicInt(base, 0)).toThrow();
    expect(() => deterministicInt(base, -1)).toThrow();
  });
});

describe("deterministicChance", () => {
  it("is total at the boundaries", () => {
    expect(deterministicChance(base, 0)).toBe(false);
    expect(deterministicChance(base, 1)).toBe(true);
  });

  it("approximates the requested probability", () => {
    let hits = 0;
    const n = 4000;
    for (let i = 0; i < n; i++) {
      if (deterministicChance({ ...base, ordinal: i }, 0.25)) hits++;
    }
    expect(hits / n).toBeGreaterThan(0.2);
    expect(hits / n).toBeLessThan(0.3);
  });
});

describe("deterministicChoice", () => {
  it("returns an element and is deterministic", () => {
    const arr = ["a", "b", "c", "d"];
    const pick = deterministicChoice(base, arr);
    expect(arr).toContain(pick);
    expect(deterministicChoice(base, arr)).toBe(pick);
  });

  it("throws on an empty array", () => {
    expect(() => deterministicChoice(base, [])).toThrow();
  });
});
