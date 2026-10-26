import { describe, expect, it } from "vitest";
import { blockHeight, enemyDrawRow } from "../../src/render/canvas";
import { FOG } from "../../src/render/palette";
import { spawnEnemy } from "../../src/sim/enemies";
import { createGameWithoutWaves } from "../sim/helpers";

describe("enemy draw order", () => {
  it("draws an enemy with its own row", () => {
    const state = createGameWithoutWaves();
    expect(enemyDrawRow(state, spawnEnemy(state, 3, 4))).toBe(4);
    expect(enemyDrawRow(state, spawnEnemy(state, 3, 4.4))).toBe(4);
  });

  it("draws an enemy against the back of the keep in front of the keep, not under its top", () => {
    const state = createGameWithoutWaves();
    const keep = state.keeps[0];
    expect(enemyDrawRow(state, spawnEnemy(state, keep.x + 1, keep.y - 1))).toBe(keep.y);
  });
});

describe("keep height", () => {
  it("raises the keep's corners above its edges, with its middle much lower, under the fog", () => {
    const state = createGameWithoutWaves();
    const keep = state.keeps[0];
    const last = keep.size - 1;
    const centre = Math.floor(keep.size / 2);
    const corner = blockHeight(state, keep.x + last, keep.y);
    const edge = blockHeight(state, keep.x + 1, keep.y);
    const middle = blockHeight(state, keep.x + centre, keep.y + centre);
    expect(blockHeight(state, keep.x, keep.y + last)).toBe(corner);
    expect(corner).toBeGreaterThan(edge);
    expect(middle).toBeGreaterThan(0);
    expect(middle).toBeLessThan(edge / 2);
    expect(FOG.unexplored.height).toBeGreaterThan(corner);
  });
});
