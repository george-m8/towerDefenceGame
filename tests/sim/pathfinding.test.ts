import { describe, expect, it } from "vitest";
import { createGame } from "../../src/sim/game";
import { isKeepTile, topAt } from "../../src/sim/grid";
import { getFlowField, nextStep } from "../../src/sim/pathfinding";
import type { GameState, Point } from "../../src/sim/types";
import { buildAt, ring } from "./helpers";

function pathToKeep(state: GameState, start: Point): Point[] {
  const path: Point[] = [start];
  let p = start;
  while (!isKeepTile(state, p.x, p.y)) {
    const next = nextStep(state, p.x, p.y);
    if (!next) throw new Error(`No step from ${p.x},${p.y}`);
    path.push(next);
    p = next;
    if (path.length > state.width * state.height) throw new Error("Path loops");
  }
  return path;
}

const blockedTilesOn = (state: GameState, path: Point[]) =>
  path.filter((p) => topAt(state, p.x, p.y)).length;

function manhattanToKeep(state: GameState, p: Point): number {
  const { keep } = state;
  const dx = Math.max(keep.x - p.x, 0, p.x - (keep.x + keep.size - 1));
  const dy = Math.max(keep.y - p.y, 0, p.y - (keep.y + keep.size - 1));
  return dx + dy;
}

describe("flow field", () => {
  it("on an open grid, every tile is its Manhattan distance from the keep", () => {
    const state = createGame(1);
    const field = getFlowField(state);
    for (const p of [
      { x: 0, y: 0 },
      { x: 47, y: 31 },
      { x: 0, y: 16 },
      { x: 30, y: 2 },
    ]) {
      expect(field.dist[p.y * state.width + p.x]).toBe(manhattanToKeep(state, p));
      expect(pathToKeep(state, p)).toHaveLength(manhattanToKeep(state, p) + 1);
    }
  });

  it("prefers a long open detour over a short route through a wall", () => {
    const state = createGame(1);
    // Vertical wall at x = 10, with a single gap at the very bottom row.
    buildAt(
      state,
      Array.from({ length: state.height - 1 }, (_, y) => ({ x: 10, y })),
    );
    const path = pathToKeep(state, { x: 5, y: 0 });
    expect(blockedTilesOn(state, path)).toBe(0);
    expect(path).toContainEqual({ x: 10, y: state.height - 1 });
  });

  it("when the keep is fully enclosed, the path crosses exactly one structure", () => {
    const state = createGame(1);
    const { keep } = state;
    buildAt(state, ring(keep.x - 1, keep.y - 1, keep.x + keep.size, keep.y + keep.size));
    const path = pathToKeep(state, state.spawnTiles[0]);
    expect(blockedTilesOn(state, path)).toBe(1);
  });

  it("with two rings, the path crosses exactly two structures", () => {
    const state = createGame(1);
    const { keep } = state;
    buildAt(state, ring(keep.x - 1, keep.y - 1, keep.x + keep.size, keep.y + keep.size));
    buildAt(state, ring(keep.x - 3, keep.y - 3, keep.x + keep.size + 2, keep.y + keep.size + 2));
    expect(blockedTilesOn(state, pathToKeep(state, state.spawnTiles[0]))).toBe(2);
  });

  it("recomputes after the grid changes", () => {
    const state = createGame(1);
    const start = { x: 0, y: 16 };
    const before = pathToKeep(state, start);
    const blocker = before[5];
    buildAt(state, [blocker]);
    const after = pathToKeep(state, start);
    expect(after).not.toContainEqual(blocker);
    expect(getFlowField(state).version).toBe(state.gridVersion);
  });

  it("does not recompute when nothing changed", () => {
    const state = createGame(1);
    expect(getFlowField(state)).toBe(getFlowField(state));
  });

  it("breaks ties in a fixed N, E, S, W order", () => {
    const state = createGame(1);
    // From the top-left corner, moving E or S is equally good; E comes first.
    expect(nextStep(state, 0, 0)).toEqual({ x: 1, y: 0 });
  });

  it("on a tie, prefers any other tile over the one to avoid", () => {
    const state = createGame(1);
    expect(nextStep(state, 0, 0, { x: 1, y: 0 })).toEqual({ x: 0, y: 1 });
  });

  it("still returns the avoided tile when it is the only best step", () => {
    const state = createGame(1);
    const y = state.keep.y + 1; // straight row into the keep: only E gets closer
    expect(nextStep(state, 5, y, { x: 6, y })).toEqual({ x: 6, y });
  });

  it("returns null when already on the keep", () => {
    const state = createGame(1);
    expect(nextStep(state, state.keep.x, state.keep.y)).toBeNull();
  });
});
