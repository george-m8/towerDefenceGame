import { describe, expect, it } from "vitest";
import { createGame } from "../../src/sim/game";
import { isExplored, teamOf } from "../../src/sim/fog";
import { blocksAt, placeStructure } from "../../src/sim/grid";
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

describe("findPath over explored land only", () => {
  it("never crosses an unexplored tile, and finds nothing when the goal lies beyond one", () => {
    const state = createGame(1, { blankMap: true }); // fog on: only the keep's surroundings explored
    const keep = state.keeps[0];
    const from = { x: keep.x - 3, y: keep.y + 1 };
    const inside = { x: keep.x - 8, y: keep.y + 1 };
    const outside = { x: 2, y: keep.y + 1 };
    const team = teamOf(state, 1);

    const path = findPath(state, from, at(inside), { exploredBy: team })!;
    expect(path.every((p) => isExplored(state, p.x, p.y, 1))).toBe(true);
    expect(findPath(state, from, at(outside), { exploredBy: team })).toBeNull();
    expect(findPath(state, from, at(outside))).not.toBeNull(); // without the option it goes
  });
});

describe("findPath breaking through a rival's walls", () => {
  /** A PvP map with a column of player 2's walls at x = 30, open only at row `gap`. */
  function walled(gap: number, weakAt?: number) {
    const state = createGame(1, { blankMap: true, fog: false, mode: "pvp", players: ["A", "B"] });
    for (let y = 0; y < state.height; y++) {
      if (y === gap) continue;
      const wall = placeStructure(state, "wall", 30, y, "N", 2);
      wall.hp = wall.maxHp = y === weakAt ? 5 : 200;
    }
    return state;
  }
  const breach = { owner: 1, dps: 10 };
  const crossesWall = (path: Point[]) =>
    path.some((p) => p.x === 30 && blocksAt(stateRef!, p.x, p.y));
  let stateRef: ReturnType<typeof walled> | undefined;

  it("goes round when the way round is cheap", () => {
    stateRef = walled(22);
    const path = findPath(stateRef, { x: 25, y: 20 }, at({ x: 35, y: 20 }), { breach })!;
    expect(crossesWall(path)).toBe(false);
  });

  it("goes through the weakest wall when the way round is long", () => {
    stateRef = walled(0, 44); // the weak wall is 4 rows off the straight line
    const path = findPath(stateRef, { x: 25, y: 40 }, at({ x: 35, y: 40 }), { breach })!;
    expect(path).toContainEqual({ x: 30, y: 44 });
  });

  it("never crosses its own side's walls", () => {
    const state = createGame(1, { blankMap: true, fog: false, mode: "pvp", players: ["A", "B"] });
    for (let y = 0; y < state.height; y++) placeStructure(state, "wall", 30, y, "N", 1);
    expect(findPath(state, { x: 25, y: 20 }, at({ x: 35, y: 20 }), { breach })).toBeNull();
  });
});
