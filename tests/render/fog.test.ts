import { describe, expect, it } from "vitest";
import { fogOpacity } from "../../src/render/fog";
import { FOG } from "../../src/render/palette";
import { IN_SIGHT, SEEN, UNEXPLORED } from "../../src/sim/fog";

describe("fogOpacity", () => {
  it("is clear in sight and thin where seen", () => {
    const opacity = fogOpacity(Uint8Array.from([IN_SIGHT, SEEN]), 2, 1);
    expect(opacity[0]).toBe(0);
    expect(opacity[1]).toBeCloseTo(FOG.seen);
  });

  it("steps up through the edge bands away from explored land, each as wide as set, then is solid", () => {
    const bands = FOG.edgeBands.flatMap((band) => Array<number>(band.tiles).fill(band.opacity));
    const tiles = 1 + bands.length + 2;
    const tier = new Uint8Array(tiles).fill(UNEXPLORED);
    tier[0] = SEEN;
    const opacity = fogOpacity(tier, tiles, 1);
    expect(Array.from(opacity.slice(1))).toEqual(
      [...bands, FOG.unexplored, FOG.unexplored].map(Math.fround),
    );
  });

  it("counts diagonals, so a corner of explored land gets the same steps", () => {
    // 3x3, explored only at the top-left corner.
    const tier = new Uint8Array(9).fill(UNEXPLORED);
    tier[0] = IN_SIGHT;
    const opacity = fogOpacity(tier, 3, 3);
    expect(opacity[4]).toBe(opacity[1]); // (1,1), diagonal neighbour, same as (1,0)
    expect(opacity[8]).toBe(opacity[2]); // (2,2), same as (2,0)
  });

  it("is solid everywhere when nothing is explored", () => {
    const opacity = fogOpacity(new Uint8Array(25).fill(UNEXPLORED), 5, 5);
    for (const o of opacity) expect(o).toBe(FOG.unexplored);
  });
});
