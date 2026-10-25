import { describe, expect, it } from "vitest";
import { enemyDrawRow } from "../../src/render/canvas";
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
