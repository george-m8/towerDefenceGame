import { describe, expect, it } from "vitest";
import { keepRing, rampartOn } from "../../src/render/three";
import { createGame } from "../../src/sim/game";
import { baseAt, placeStructure } from "../../src/sim/grid";
import type { GameState } from "../../src/sim/types";

const SIDES = { north: [0, -1], south: [0, 1], west: [-1, 0], east: [1, 0] } as const;

/** Which sides of (x, y) have ramparts. */
function sides(state: GameState, x: number, y: number) {
  const ring = keepRing(state);
  return Object.entries(SIDES)
    .filter(([, [dx, dy]]) => rampartOn(state, ring, x, y, dx, dy))
    .map(([side]) => side);
}

const isWall = (state: GameState, x: number, y: number) => baseAt(state, x, y)?.kind === "wall";

/** A keep wall in a run along the ring's top or bottom: walls east and west, none north or south. */
function keepWallInARow() {
  const state = createGame(7);
  const ring = keepRing(state);
  for (const i of ring) {
    const x = i % state.width;
    const y = Math.floor(i / state.width);
    const along = isWall(state, x - 1, y) && isWall(state, x + 1, y);
    if (along && isWall(state, x, y) && !isWall(state, x, y - 1) && !isWall(state, x, y + 1)) {
      return { state, x, y };
    }
  }
  throw new Error("No keep wall in a row");
}

describe("ramparts", () => {
  it("a keep's walls have them on their open sides, not between walls", () => {
    const { state, x, y } = keepWallInARow();
    expect(sides(state, x, y)).toEqual(["north", "south"]);
  });

  it("a keep wall stops at a tower on the ring, which has them on its own open sides", () => {
    const { state, x, y } = keepWallInARow();
    placeStructure(state, "archer", x + 1, y, "N", 1);
    expect(sides(state, x, y)).toEqual(["north", "south"]);
    expect(sides(state, x + 1, y)).toEqual(["north", "south", "west", "east"]);
  });

  it("a wall built away from the keep has none, nor one still being built on the ring", () => {
    const { state, x, y } = keepWallInARow();
    const far = { x: 2, y: 2 };
    placeStructure(state, "wall", far.x, far.y, "N", 1);
    expect(sides(state, far.x, far.y)).toEqual([]);
    baseAt(state, x, y)!.buildLeft = 5;
    expect(sides(state, x, y)).toEqual([]);
  });
});
