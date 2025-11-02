/**
 * Deterministic random number generator using SFC32 algorithm
 * Allows for reproducible dungeon generation with seed control
 */
class RandomNumberGenerator {
  private seed: number;
  private rand: () => number;

  constructor(initialSeed?: number) {
    this.seed = initialSeed ?? (Date.now() ^ 0x9e3779b1) >>> 0;
    this.rand = this.sfc32();
  }

  /**
   * SFC32 (Simple Fast Counter) PRNG algorithm
   * Fast, high-quality random number generation
   */
  private sfc32(): () => number {
    let a = this.seed;
    let b = 0x6c8e9cf5;
    let c = 0xb5297a4d;
    let d = 0x1b56c4e9;

    return function (): number {
      a |= 0;
      b |= 0;
      c |= 0;
      d |= 0;
      const t = (((a + b) | 0) + d) | 0;
      d = (d + 1) | 0;
      a = b ^ (b >>> 9);
      b = (c + (c << 3)) | 0;
      c = (c << 21) | (c >>> 11);
      c = (c + t) | 0;
      return (t >>> 0) / 4294967296;
    };
  }

  /**
   * Reseed the random number generator
   */
  reseed(newSeed: number): void {
    this.seed = newSeed >>> 0 || this.seed;
    this.rand = this.sfc32();
  }

  /**
   * Generate random integer from 0 to n-1
   */
  int(n: number): number {
    return (this.rand() * n) | 0;
  }

  /**
   * Generate random float from 0 to 1
   */
  float(): number {
    return this.rand();
  }

  /**
   * Choose random element from array
   */
  choose<T>(arr: T[]): T {
    return arr[(this.rand() * arr.length) | 0];
  }

  /**
   * Return true with probability p (0 to 1)
   */
  chance(p: number): boolean {
    return this.rand() < p;
  }
}

// Export singleton instance
export const RNG = new RandomNumberGenerator();
