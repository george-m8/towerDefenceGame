import { describe, expect, it } from "vitest";
import { canBuild, isKeepTile, isWalkable, terrainAt } from "../../src/sim/grid";
import { nextStep } from "../../src/sim/pathfinding";
import type { GameState, Point } from "../../src/sim/types";
import { column, createGameWithoutWaves, paintTerrain } from "./helpers";

function pathToKeep(state: GameState, start: Point): Point[] | null {
  const path = [start];
  let p = start;
  while (!isKeepTile(state, p.x, p.y)) {
    const next = nextStep(state, p.x, p.y);
    if (!next) return null;
    path.push(next);
    p = next;
    if (path.length > state.width * state.height) throw new Error("Path loops");
  }
  return path;
}

describe("walking on terrain", () => {
  it.each(["river", "sea", "rock", "tree"] as const)("never routes through %s", (terrain) => {
    const state = createGameWithoutWaves();
    const gap = state.height - 1;
    paintTerrain(state, column(state, 10, [gap]), terrain);
    expect(isWalkable(state, 10, 5)).toBe(false);
    const path = pathToKeep(state, { x: 2, y: 5 })!;
    expect(path).toContainEqual({ x: 10, y: gap });
    expect(path.every((p) => terrainAt(state, p.x, p.y) !== terrain)).toBe(true);
  });

  it("crosses a river at a ford", () => {
    const state = createGameWithoutWaves();
    const fordRow = 3;
    paintTerrain(state, column(state, 10, [fordRow]), "river");
    paintTerrain(state, [{ x: 10, y: fordRow }], "ford");
    expect(isWalkable(state, 10, fordRow)).toBe(true);
    expect(pathToKeep(state, { x: 2, y: 20 })).toContainEqual({ x: 10, y: fordRow });
  });

  it("finds no route when terrain cuts the keep off completely", () => {
    const state = createGameWithoutWaves();
    paintTerrain(state, column(state, 10), "sea");
    expect(pathToKeep(state, { x: 2, y: 5 })).toBeNull();
  });
});

describe("building on terrain", () => {
  it.each([
    ["sea", "Can't build on sea"],
    ["rock", "Can't build on rock"],
    ["tree", "Can't build on tree"],
    ["river", "Only bridges can be built on rivers"],
  ] as const)("rejects building on %s", (terrain, reason) => {
    const state = createGameWithoutWaves();
    paintTerrain(state, [{ x: 10, y: 10 }], terrain);
    expect(canBuild(state, "wall", 10, 10)).toEqual({ ok: false, reason });
    expect(canBuild(state, "archer", 10, 10)).toEqual({ ok: false, reason });
  });

  it("allows building on fords like ground", () => {
    const state = createGameWithoutWaves();
    paintTerrain(state, [{ x: 10, y: 10 }], "ford");
    expect(canBuild(state, "wall", 10, 10)).toEqual({ ok: true });
  });
});
