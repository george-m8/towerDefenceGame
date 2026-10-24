import { describe, expect, it } from "vitest";
import { nextRandom, randomInt } from "../../src/sim/rng";

describe("rng", () => {
  it("produces the same sequence for the same seed", () => {
    const a = { rngState: 42 };
    const b = { rngState: 42 };
    const seqA = Array.from({ length: 5 }, () => nextRandom(a));
    const seqB = Array.from({ length: 5 }, () => nextRandom(b));
    expect(seqA).toEqual(seqB);
  });

  it("produces different sequences for different seeds", () => {
    expect(nextRandom({ rngState: 1 })).not.toBe(nextRandom({ rngState: 2 }));
  });

  it("returns values in [0, 1) and integers in range", () => {
    const s = { rngState: 7 };
    for (let i = 0; i < 1000; i++) {
      const r = nextRandom(s);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThan(1);
      const n = randomInt(s, 3, 5);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(5);
    }
  });
});
