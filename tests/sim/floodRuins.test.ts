import { describe, expect, it } from "vitest";
import { KEEP_SIZE } from "../../src/sim/config";
import { withRuins } from "../../src/sim/floodRuins";
import type { Terrain } from "../../src/sim/types";

const N = 80;
const H = 30;

function ruinsOn(seed: number, options: Partial<Parameters<typeof withRuins>[3]> = {}) {
  const land = { terrain: new Array<Terrain>(N * H).fill("ground"), ruins: [], chests: [] };
  return withRuins(land, N, H, { seed, keep: null, count: 12, ...options });
}

/** Whether a chest can be walked to from the land's edge, round ruins. */
function reachable(out: ReturnType<typeof ruinsOn>, from: { x: number; y: number }): boolean {
  const ruin = new Set(out.ruins.map((r) => r.y * N + r.x));
  const seen = new Set([from.y * N + from.x]);
  const queue = [from];
  for (let head = 0; head < queue.length; head++) {
    const { x, y } = queue[head];
    if (x === 0 || y === 0 || x === N - 1 || y === H - 1) return true;
    for (const [nx, ny] of [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ]) {
      const i = ny * N + nx;
      if (seen.has(i) || ruin.has(i)) continue;
      seen.add(i);
      queue.push({ x: nx, y: ny });
    }
  }
  return false;
}

describe("No looking back's ruins", () => {
  it("are the same for the same seed", () => {
    expect(ruinsOn(4)).toEqual(ruinsOn(4));
    expect(ruinsOn(4)).not.toEqual(ruinsOn(5));
  });

  it("make a mix: rooms shut in (forts, compounds) and rooms with ways in (halls)", () => {
    let shut = 0;
    let open = 0;
    for (let seed = 0; seed < 10; seed++) {
      const out = ruinsOn(seed);
      for (const chest of out.chests) {
        if (reachable(out, chest)) open++;
        else shut++;
      }
    }
    expect(shut).toBeGreaterThan(5);
    expect(open).toBeGreaterThan(2);
  });

  it("put resources in some rooms, and swarms in some", () => {
    const kinds = new Set<Terrain>();
    let swarms = 0;
    for (let seed = 0; seed < 10; seed++) {
      const out = ruinsOn(seed);
      for (const t of out.terrain) if (t !== "ground") kinds.add(t);
      swarms += out.ruinSwarms.length;
    }
    expect([...kinds].sort()).toEqual(["berries", "goldRock", "tree"]);
    expect(swarms).toBeGreaterThan(5);
  });

  it("keep clear of a goal's keep and of where they're told to", () => {
    for (let seed = 0; seed < 10; seed++) {
      const keep = { x: 40, y: 14 };
      const out = ruinsOn(seed, { keep, clear: [{ x: 10, y: 15, radius: 8 }] });
      for (const r of out.ruins) {
        expect(Math.hypot(r.x - 10, r.y - 15)).toBeGreaterThan(8);
        const inKeep =
          r.x >= keep.x - 1 &&
          r.x <= keep.x + KEEP_SIZE &&
          r.y >= keep.y - 1 &&
          r.y <= keep.y + KEEP_SIZE;
        expect(inKeep).toBe(false);
      }
    }
  });
});
