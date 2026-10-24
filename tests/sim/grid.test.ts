import { describe, expect, it } from "vitest";
import { applyCommand, createGame } from "../../src/sim/game";
import { STRUCTURES, STARTING_GOLD } from "../../src/sim/config";
import { topAt } from "../../src/sim/grid";

const WALL_COST = STRUCTURES.wall.cost;

describe("building walls", () => {
  it("places a wall and deducts its cost", () => {
    const state = createGame(1);
    const result = applyCommand(state, { type: "build", kind: "wall", x: 5, y: 5 });
    expect(result).toEqual({ ok: true });
    expect(state.gold).toBe(STARTING_GOLD - WALL_COST);
    const wall = topAt(state, 5, 5);
    expect(wall?.kind).toBe("wall");
    expect(wall?.hp).toBe(STRUCTURES.wall.maxHp);
  });

  it("bumps the grid version so pathfinding knows to recompute", () => {
    const state = createGame(1);
    const before = state.gridVersion;
    applyCommand(state, { type: "build", kind: "wall", x: 5, y: 5 });
    expect(state.gridVersion).toBe(before + 1);
  });

  it("rejects an occupied tile", () => {
    const state = createGame(1);
    applyCommand(state, { type: "build", kind: "wall", x: 5, y: 5 });
    expect(applyCommand(state, { type: "build", kind: "wall", x: 5, y: 5 })).toEqual({
      ok: false,
      reason: "Tile is occupied",
    });
    expect(state.gold).toBe(STARTING_GOLD - WALL_COST);
  });

  it("rejects the keep", () => {
    const state = createGame(1);
    const result = applyCommand(state, {
      type: "build",
      kind: "wall",
      x: state.keep.x,
      y: state.keep.y,
    });
    expect(result).toEqual({ ok: false, reason: "Can't build on the keep" });
  });

  it("rejects the spawn zone", () => {
    const state = createGame(1);
    const { x, y } = state.spawnTiles[0];
    expect(applyCommand(state, { type: "build", kind: "wall", x, y })).toEqual({
      ok: false,
      reason: "Can't build in the spawn zone",
    });
  });

  it("rejects out of bounds tiles", () => {
    const state = createGame(1);
    for (const [x, y] of [
      [-1, 0],
      [0, -1],
      [state.width, 0],
      [0, state.height],
    ]) {
      expect(applyCommand(state, { type: "build", kind: "wall", x, y })).toEqual({
        ok: false,
        reason: "Out of bounds",
      });
    }
  });

  it("rejects when there is not enough gold", () => {
    const state = createGame(1);
    state.gold = WALL_COST - 1;
    expect(applyCommand(state, { type: "build", kind: "wall", x: 5, y: 5 })).toEqual({
      ok: false,
      reason: "Not enough gold",
    });
    expect(topAt(state, 5, 5)).toBeUndefined();
  });

  it("allows building while paused", () => {
    const state = createGame(1);
    applyCommand(state, { type: "togglePause" });
    expect(applyCommand(state, { type: "build", kind: "wall", x: 5, y: 5 }).ok).toBe(true);
  });

  it("rejects building after game over", () => {
    const state = createGame(1);
    state.gameOver = true;
    expect(applyCommand(state, { type: "build", kind: "wall", x: 5, y: 5 })).toEqual({
      ok: false,
      reason: "Game over",
    });
  });
});
