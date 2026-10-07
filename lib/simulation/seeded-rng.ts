/**
 * Deterministic seeded PRNG — mulberry32 algorithm.
 *
 * Produces a sequence of pseudo-random numbers in [0, 1) from a 32-bit seed.
 * Same seed → same sequence → same simulation result every time.
 * This is the only source of randomness in lib/simulation/.
 *
 * Usage:
 *   const rng = makeRng(42);
 *   const r1 = rng(); // 0.something, always the same for seed 42
 *   const r2 = rng(); // next value
 */
export function makeRng(seed: number): () => number {
  // mulberry32: fast, good distribution, fully deterministic
  let s = seed >>> 0; // ensure unsigned 32-bit
  return function next(): number {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Draw a uniform random number in [min, max) from the given rng.
 * Used to sample beta factors and noise values.
 */
export function uniform(rng: () => number, min: number, max: number): number {
  return min + rng() * (max - min);
}
