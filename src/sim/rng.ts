// Seeded PRNG (mulberry32). The simulation must use this instead of Math.random
// so that the same seed and commands always produce the same game.

export function nextRandom(s: { rngState: number }): number {
  s.rngState = (s.rngState + 0x6d2b79f5) | 0;
  let t = s.rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Random integer in [min, max] inclusive. */
export function randomInt(s: { rngState: number }, min: number, max: number): number {
  return min + Math.floor(nextRandom(s) * (max - min + 1));
}
