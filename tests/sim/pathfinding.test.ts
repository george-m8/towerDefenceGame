import { describe, expect, it } from "vitest";
import { BREACH, STRUCTURES, type MovementProfile } from "../../src/sim/config";
import { createGame } from "../../src/sim/game";
import { isKeepTile, topAt } from "../../src/sim/grid";
import { canCross, getFlowField, nextStep } from "../../src/sim/pathfinding";
import type { GameState, Point } from "../../src/sim/types";
import { buildAt, column, createGameWithoutWaves, paintTerrain, ring } from "./helpers";

function pathToKeep(
  state: GameState,
  start: Point,
  profile: MovementProfile = "follower",
): Point[] {
  const path: Point[] = [start];
  let p = start;
  while (!isKeepTile(state, p.x, p.y)) {
    const next = nextStep(state, p.x, p.y, undefined, profile);
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
  const keep = state.keeps[0];
  const dx = Math.max(keep.x - p.x, 0, p.x - (keep.x + keep.size - 1));
  const dy = Math.max(keep.y - p.y, 0, p.y - (keep.y + keep.size - 1));
  return dx + dy;
}

describe("flow field", () => {
  it("on an open grid, every tile is its Manhattan distance from the keep", () => {
    const state = createGame(1, { blankMap: true, fog: false });
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
    const state = createGame(1, { blankMap: true, fog: false });
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
    const state = createGame(1, { blankMap: true, fog: false });
    const keep = state.keeps[0];
    buildAt(state, ring(keep.x - 1, keep.y - 1, keep.x + keep.size, keep.y + keep.size));
    const path = pathToKeep(state, state.spawnTiles[0]);
    expect(blockedTilesOn(state, path)).toBe(1);
  });

  it("with two rings, the path crosses exactly two structures", () => {
    const state = createGame(1, { blankMap: true, fog: false });
    const keep = state.keeps[0];
    buildAt(state, ring(keep.x - 1, keep.y - 1, keep.x + keep.size, keep.y + keep.size));
    buildAt(state, ring(keep.x - 3, keep.y - 3, keep.x + keep.size + 2, keep.y + keep.size + 2));
    expect(blockedTilesOn(state, pathToKeep(state, state.spawnTiles[0]))).toBe(2);
  });

  it("recomputes after the grid changes", () => {
    const state = createGame(1, { blankMap: true, fog: false });
    const start = { x: 0, y: 16 };
    const before = pathToKeep(state, start);
    const blocker = before[5];
    buildAt(state, [blocker]);
    const after = pathToKeep(state, start);
    expect(after).not.toContainEqual(blocker);
    expect(getFlowField(state).version).toBe(state.gridVersion);
  });

  it("does not recompute when nothing changed", () => {
    const state = createGame(1, { blankMap: true, fog: false });
    expect(getFlowField(state)).toBe(getFlowField(state));
  });

  it("breaks ties in a fixed N, E, S, W order", () => {
    const state = createGame(1, { blankMap: true, fog: false });
    // From the top-left corner, moving E or S is equally good; E comes first.
    expect(nextStep(state, 0, 0)).toEqual({ x: 1, y: 0 });
  });

  it("on a tie, prefers any other tile over the one to avoid", () => {
    const state = createGame(1, { blankMap: true, fog: false });
    expect(nextStep(state, 0, 0, { x: 1, y: 0 })).toEqual({ x: 0, y: 1 });
  });

  it("still returns the avoided tile when it is the only best step", () => {
    const state = createGame(1, { blankMap: true, fog: false });
    const y = state.keeps[0].y + 1; // straight row into the keep: only E gets closer
    expect(nextStep(state, 5, y, { x: 6, y })).toEqual({ x: 6, y });
  });

  it("returns null when already on the keep", () => {
    const state = createGame(1, { blankMap: true, fog: false });
    expect(nextStep(state, state.keeps[0].x, state.keeps[0].y)).toBeNull();
  });
});

describe("fields per movement profile", () => {
  it("builds a profile's field only when first asked for, and caches each separately", () => {
    const state = createGameWithoutWaves();
    expect(state.flows).toEqual({});
    const follower = getFlowField(state);
    expect(Object.keys(state.flows)).toEqual(["follower"]);
    const breacher = getFlowField(state, "breacher");
    expect(breacher).not.toBe(follower);
    expect(getFlowField(state, "breacher")).toBe(breacher);
    expect(getFlowField(state, "follower")).toBe(follower);
  });

  it("rebuilds a field after the grid changes", () => {
    const state = createGameWithoutWaves();
    const before = getFlowField(state, "marine");
    buildAt(state, [{ x: 5, y: 5 }]);
    expect(getFlowField(state, "marine")).not.toBe(before);
  });

  it("lets followers cross only walkable land", () => {
    const state = createGameWithoutWaves();
    paintTerrain(state, [{ x: 3, y: 3 }], "rock");
    expect(canCross(state, "follower", 3, 3)).toBe(false);
    expect(canCross(state, "follower", 4, 3)).toBe(true);
    expect(canCross(state, "follower", -1, 3)).toBe(false);
  });
});

describe("breacher profile", () => {
  /** A wall line down column x, leaving gaps at the given rows. */
  function wallLine(state: GameState, x: number, gaps: number[] = []) {
    buildAt(state, column(state, x, gaps));
  }

  it("breaks a wall when walking round is much longer; followers walk round", () => {
    const state = createGameWithoutWaves();
    const keep = state.keeps[0];
    const wallX = keep.x - 4;
    wallLine(state, wallX, [0]); // the only gap is at the top edge: a long detour
    const start = { x: wallX - 2, y: keep.y + 1 };
    // The breacher's route goes into the wall; the follower's goes round through the gap.
    expect(pathToKeep(state, start, "breacher").some((p) => p.x === wallX && p.y !== 0)).toBe(true);
    expect(pathToKeep(state, start, "follower").some((p) => p.x === wallX && p.y === 0)).toBe(true);
  });

  it("walks round a short wall like everyone else", () => {
    const state = createGameWithoutWaves();
    const keep = state.keeps[0];
    const y = keep.y + 1;
    const wallX = keep.x - 4;
    buildAt(
      state,
      [y - 1, y, y + 1].map((wy) => ({ x: wallX, y: wy })),
    ); // 4 tiles longer round
    const start = { x: wallX - 2, y };
    expect(pathToKeep(state, start, "breacher").some((p) => topAt(state, p.x, p.y))).toBe(false);
  });

  it("prefers a damaged wall once its field is rebuilt", () => {
    const state = createGameWithoutWaves();
    const keep = state.keeps[0];
    const y = keep.y + 1;
    const wallX = keep.x - 4;
    wallLine(state, wallX);
    topAt(state, wallX, y + 2)!.hp = 1;
    state.gridVersion++; // as a build or sale elsewhere would
    const route = pathToKeep(state, { x: wallX - 2, y }, "breacher");
    expect(route).toContainEqual({ x: wallX, y: y + 2 });
  });

  it("costs a full wall 1 + ceil(HP / dps x speed) tiles", () => {
    const state = createGameWithoutWaves();
    const keep = state.keeps[0];
    const wallX = keep.x - 4;
    wallLine(state, wallX);
    const y = keep.y + 1;
    const through = getFlowField(state, "breacher").dist;
    const at = (x: number) => through[y * state.width + x];
    const wallCost =
      1 + Math.ceil((STRUCTURES.wall.maxHp / BREACH.referenceDps) * BREACH.referenceSpeed);
    expect(at(wallX - 1) - at(wallX + 1)).toBe(wallCost + 1);
  });
});

const PROFILES = ["follower", "breacher", "marine"] as const;

describe("marine profile", () => {
  /** A wall line down column x with the given rows left as water instead of wall. */
  function wallWithWater(
    state: GameState,
    x: number,
    water: { y: number; terrain: "river" | "sea" }[],
  ) {
    buildAt(
      state,
      column(
        state,
        x,
        water.map((w) => w.y),
      ),
    );
    for (const w of water) paintTerrain(state, [{ x, y: w.y }], w.terrain);
  }

  it("crosses a river where land walkers can't", () => {
    const state = createGameWithoutWaves();
    const keep = state.keeps[0];
    const y = keep.y + 1;
    const wallX = keep.x - 4;
    wallWithWater(state, wallX, [{ y, terrain: "river" }]);
    const start = { x: wallX - 2, y };
    expect(pathToKeep(state, start, "marine")).toContainEqual({ x: wallX, y });
    expect(pathToKeep(state, start, "follower")).not.toContainEqual({ x: wallX, y });
    expect(canCross(state, "follower", wallX, y)).toBe(false);
    expect(canCross(state, "breacher", wallX, y)).toBe(false);
  });

  it("prefers river to sea for the same distance", () => {
    const state = createGameWithoutWaves();
    const keep = state.keeps[0];
    const y = keep.y + 1;
    const wallX = keep.x - 4;
    wallWithWater(state, wallX, [
      { y: y - 2, terrain: "sea" },
      { y: y + 2, terrain: "river" },
    ]);
    const route = pathToKeep(state, { x: wallX - 2, y }, "marine");
    expect(route).toContainEqual({ x: wallX, y: y + 2 });
    expect(route).not.toContainEqual({ x: wallX, y: y - 2 });
  });

  // Standalone this is 24-34 ms, within one 50 ms tick. The parallel test run is noisy, so the
  // bound here only catches a large regression (e.g. the search going quadratic).
  it("builds all three fields on an XL map quickly", () => {
    const state = createGame(1, { size: "XL", fog: false });
    const times: number[] = [];
    for (let run = 0; run < 6; run++) {
      state.gridVersion++;
      const start = performance.now();
      for (const p of PROFILES) getFlowField(state, p);
      times.push(performance.now() - start);
    }
    // Median of the last five (the first run warms up).
    const median = times.slice(1).sort((a, b) => a - b)[2];
    expect(median).toBeLessThan(250);
  });
});
