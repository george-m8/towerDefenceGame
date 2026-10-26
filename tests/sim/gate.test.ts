import { describe, expect, it } from "vitest";
import { discountAt } from "../../src/sim/enclosures";
import { blocksAt, canBuild, keepAt, placeStructure } from "../../src/sim/grid";
import { nextStep } from "../../src/sim/pathfinding";
import type { GameState, Point } from "../../src/sim/types";
import { column, createGameWithoutWaves, ring } from "./helpers";

/** Follows the enemies' path from `start`; the tiles walked, or null if it never gets there. */
function pathToKeep(state: GameState, start: Point): Point[] | null {
  const path: Point[] = [];
  let at: Point | null = start;
  for (let i = 0; i < state.width * state.height && at; i++) {
    if (keepAt(state, at.x, at.y)) return path;
    path.push(at);
    at = nextStep(state, at.x, at.y);
  }
  return null;
}

/** A wall ring round (10, 5)-(14, 9), with a gate in its top side when `gate` is set. */
function walledPen(gate: boolean) {
  const state = createGameWithoutWaves();
  for (const p of ring(10, 5, 14, 9)) {
    if (!(p.x === 12 && p.y === 5)) placeStructure(state, "wall", p.x, p.y);
  }
  if (gate) placeStructure(state, "gate", 12, 5);
  return state;
}

describe("gates", () => {
  it("let enemies walk through a wall", () => {
    const state = createGameWithoutWaves();
    const gateRow = 10;
    for (const p of column(state, 20, [gateRow])) placeStructure(state, "wall", p.x, p.y);
    placeStructure(state, "gate", 20, gateRow);
    expect(blocksAt(state, 20, gateRow)).toBe(false);
    const path = pathToKeep(state, { x: 2, y: 30 });
    expect(path).toContainEqual({ x: 20, y: gateRow });
  });

  it("close a ring of walls, so it's still an enclosure with its discount", () => {
    expect(discountAt(walledPen(false), 12, 7)).toBe(0); // a gap: not enclosed
    expect(discountAt(walledPen(true), 12, 7)).toBe(0.25);
  });

  it("are part of the enclosure's wall, so building on one is discounted too", () => {
    expect(discountAt(walledPen(true), 12, 5)).toBe(0.25);
  });

  it("don't close anything until they're built", () => {
    const state = walledPen(true);
    const gate = Object.values(state.structures).find((s) => s.kind === "gate")!;
    gate.buildLeft = gate.buildTicks = 100;
    state.gridVersion++;
    expect(discountAt(state, 12, 7)).toBe(0);
  });

  it("can't hold a tower", () => {
    const state = createGameWithoutWaves();
    placeStructure(state, "gate", 10, 10);
    expect(canBuild(state, 1, "archer", 10, 10)).toEqual({
      ok: false,
      reason: "Can't put a tower on gate",
    });
  });
});
