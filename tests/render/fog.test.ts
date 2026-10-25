import { describe, expect, it } from "vitest";
import { fogLevels, fogSpans } from "../../src/render/fog";
import { FOG, TILE_SIZE } from "../../src/render/palette";
import { IN_SIGHT, SEEN, UNEXPLORED } from "../../src/sim/fog";

describe("fogLevels", () => {
  it("has no fog in sight and a thin, low layer where seen", () => {
    const levels = fogLevels(Uint8Array.from([IN_SIGHT, SEEN]), 2, 1);
    expect(levels[0]).toBeUndefined();
    expect(levels[1]).toBe(FOG.seen);
  });

  it("steps up through the edge bands away from explored land, each as wide as set, then is full", () => {
    const bands = FOG.edgeBands.flatMap((band) => Array(band.tiles).fill(band));
    const tiles = 1 + bands.length + 2;
    const tier = new Uint8Array(tiles).fill(UNEXPLORED);
    tier[0] = SEEN;
    expect(fogLevels(tier, tiles, 1).slice(1)).toEqual([...bands, FOG.unexplored, FOG.unexplored]);
  });

  it("counts diagonals, so a corner of explored land gets the same steps", () => {
    // 3x3, explored only at the top-left corner.
    const tier = new Uint8Array(9).fill(UNEXPLORED);
    tier[0] = IN_SIGHT;
    const levels = fogLevels(tier, 3, 3);
    expect(levels[4]).toBe(levels[1]); // (1,1), diagonal neighbour, same as (1,0)
    expect(levels[8]).toBe(levels[2]); // (2,2), same as (2,0)
  });

  it("gets higher from seen, through the bands, to unexplored", () => {
    const heights = [FOG.seen, ...FOG.edgeBands, FOG.unexplored].map((l) => l.height);
    for (let i = 1; i < heights.length; i++) expect(heights[i]).toBeGreaterThan(heights[i - 1]);
  });
});

describe("fogSpans", () => {
  it("lifts the top by the fog's height", () => {
    const { top } = fogSpans(3, 6, 6);
    expect(top).toEqual({ top: 3 * TILE_SIZE - 6, bottom: 4 * TILE_SIZE - 6 });
  });

  it("adds a front face where the fog steps down toward the viewer, and none where it steps up", () => {
    expect(fogSpans(3, 9, 2).face).toEqual({ top: 4 * TILE_SIZE - 9, bottom: 4 * TILE_SIZE - 2 });
    expect(fogSpans(3, 2, 9).face).toBeNull();
    expect(fogSpans(3, 5, 5).face).toBeNull();
  });

  it("covers a column with no gaps or overlaps, whatever the heights", () => {
    const heights = [14, 9, 0, 2, 14, 5, 5, 0];
    let cursor = -heights[0];
    heights.forEach((h, row) => {
      if (h === 0) {
        // Clear land: the fog behind already reached its lifted start, from row's ground up.
        cursor = (row + 1) * TILE_SIZE - (heights[row + 1] ?? 0);
        return;
      }
      const { top, face } = fogSpans(row, h, heights[row + 1] ?? 0);
      expect(top.top).toBe(cursor);
      cursor = face ? face.bottom : top.bottom;
      if (face) expect(face.top).toBe(top.bottom);
    });
  });
});
