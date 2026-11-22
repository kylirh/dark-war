import { describe, it, expect } from "vitest";
import { RNG, RandomNumberGenerator } from "./rng";

describe("RandomNumberGenerator", () => {
  it("produces the same sequence for the same seed", () => {
    const a = new RandomNumberGenerator(42);
    const b = new RandomNumberGenerator(42);
    const seqA = Array.from({ length: 20 }, () => a.float());
    const seqB = Array.from({ length: 20 }, () => b.float());
    expect(seqA).toEqual(seqB);
  });

  it("produces different sequences for different seeds", () => {
    const a = new RandomNumberGenerator(1);
    const b = new RandomNumberGenerator(2);
    const seqA = Array.from({ length: 20 }, () => a.float());
    const seqB = Array.from({ length: 20 }, () => b.float());
    expect(seqA).not.toEqual(seqB);
  });

  // SFC32 seeds only its first state word, so without a warm-up the opening
  // draws of a fresh generator carry almost none of the seed: every seed in a
  // contiguous run returned the identical first value. Callers that take one or
  // two draws from a per-key generator depend on this.
  it("varies its very first draw across nearby seeds", () => {
    for (const index of [0, 1, 2]) {
      const values = new Set<number>();
      for (let seed = 0; seed < 1000; seed++) {
        const rng = new RandomNumberGenerator(seed);
        for (let skip = 0; skip < index; skip++) rng.int(1000);
        values.add(rng.int(1000));
      }
      expect(values.size).toBeGreaterThan(100);
    }
  });

  it("differs from a neighbouring seed on the first draw alone", () => {
    const first = (seed: number): number =>
      new RandomNumberGenerator(seed).int(1000);
    expect(first(1)).not.toBe(first(2));
    expect(first(1000)).not.toBe(first(1001));
  });

  it("reseed resets the stream to match a fresh instance", () => {
    const a = new RandomNumberGenerator(7);
    a.float();
    a.float();
    a.reseed(7);
    const b = new RandomNumberGenerator(7);
    expect(a.float()).toBe(b.float());
  });

  it("int stays within [0, n)", () => {
    const rng = new RandomNumberGenerator(123);
    for (let i = 0; i < 1000; i++) {
      const v = rng.int(10);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(10);
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it("int rejects non-positive or non-integer n", () => {
    const rng = new RandomNumberGenerator(1);
    expect(() => rng.int(0)).toThrow();
    expect(() => rng.int(-3)).toThrow();
    expect(() => rng.int(2.5)).toThrow();
  });

  it("float stays within [0, 1)", () => {
    const rng = new RandomNumberGenerator(99);
    for (let i = 0; i < 1000; i++) {
      const v = rng.float();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("choose returns an element and rejects an empty array", () => {
    const rng = new RandomNumberGenerator(5);
    const arr = ["a", "b", "c"];
    for (let i = 0; i < 50; i++) expect(arr).toContain(rng.choose(arr));
    expect(() => rng.choose([])).toThrow();
  });

  it("chance(0) is never true and chance(1) is always true", () => {
    const rng = new RandomNumberGenerator(11);
    for (let i = 0; i < 100; i++) {
      expect(rng.chance(0)).toBe(false);
      expect(rng.chance(1)).toBe(true);
    }
  });

  it("exports a shared singleton instance", () => {
    expect(RNG).toBeInstanceOf(RandomNumberGenerator);
  });
});
