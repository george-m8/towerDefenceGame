import { describe, expect, it } from "vitest";
import { blocksAt } from "../../src/sim/grid";
import { findPath } from "../../src/sim/unitPaths";
import type { Point } from "../../src/sim/types";
import { buildAt, createGameWithoutWaves, ring } from "./helpers";

const at = (goal: Point) => (x: number, y: number) => x === goal.x && y === goal.y;

describe("findPath", () => {
  it("finds the shortest route round a wall, one open step at a time", () => {
    const state = createGameWithoutWaves();
    buildAt(
      state,
      [3, 4, 5, 6, 7].map((y) => ({ x: 7, y })),
    );

    const path = findPath(state, { x: 5, y: 5 }, at({ x: 9, y: 5 }))!;

    expect(path).toHaveLength(10); // 3 round the end of the wall, 4 across, 3 back
    expect(path.at(-1)).toEqual({ x: 9, y: 5 });
    let from = { x: 5, y: 5 };
    for (const step of path) {
      expect(Math.abs(step.x - from.x) + Math.abs(step.y - from.y)).toBe(1);
      expect(blocksAt(state, step.x, step.y)).toBe(false);
      from = step;
    }
  });

  it("is null when the goal is walled off", () => {
    const state = createGameWithoutWaves();
    buildAt(state, ring(8, 3, 12, 7));
    expect(findPath(state, { x: 5, y: 5 }, at({ x: 10, y: 5 }))).toBeNull();
  });

  it("stops at the nearest of several goal tiles", () => {
    const state = createGameWithoutWaves();
    const goals = (x: number, y: number) => x === 5 && (y === 7 || y === 12);
    expect(findPath(state, { x: 5, y: 5 }, goals)).toEqual([
      { x: 5, y: 6 },
      { x: 5, y: 7 },
    ]);
  });

  it("is empty when it's already there", () => {
    const state = createGameWithoutWaves();
    expect(findPath(state, { x: 5, y: 5 }, at({ x: 5, y: 5 }))).toEqual([]);
  });
});
