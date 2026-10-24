import { describe, expect, it } from "vitest";
import { applyCommand, createGame, tick } from "../../src/sim/game";
import {
  FAST_FORWARD_SPEED,
  GRID_HEIGHT,
  GRID_WIDTH,
  KEEP_HP,
  KEEP_SIZE,
  STARTING_GOLD,
} from "../../src/sim/config";
import { isKeepTile, isSpawnTile } from "../../src/sim/grid";

describe("createGame", () => {
  const state = createGame(1);

  it("creates a grid of the configured size", () => {
    expect(state.width).toBe(GRID_WIDTH);
    expect(state.height).toBe(GRID_HEIGHT);
    for (const layer of [state.terrain, state.base, state.mount]) {
      expect(layer).toHaveLength(GRID_WIDTH * GRID_HEIGHT);
    }
  });

  it("places a 3x3 keep at the centre with full HP", () => {
    const { keep } = state;
    expect(keep.size).toBe(KEEP_SIZE);
    expect(keep.hp).toBe(KEEP_HP);
    const cx = Math.floor(GRID_WIDTH / 2);
    const cy = Math.floor(GRID_HEIGHT / 2);
    expect(isKeepTile(state, cx, cy)).toBe(true);
    let count = 0;
    for (let y = 0; y < state.height; y++)
      for (let x = 0; x < state.width; x++) if (isKeepTile(state, x, y)) count++;
    expect(count).toBe(KEEP_SIZE * KEEP_SIZE);
  });

  it("marks a spawn zone on the left edge", () => {
    expect(state.spawnTiles.length).toBeGreaterThan(0);
    for (const p of state.spawnTiles) {
      expect(p.x).toBeLessThan(3);
      expect(isSpawnTile(state, p.x, p.y)).toBe(true);
    }
    expect(isSpawnTile(state, GRID_WIDTH - 1, 0)).toBe(false);
  });

  it("starts with the configured gold, unpaused", () => {
    expect(state.gold).toBe(STARTING_GOLD);
    expect(state.paused).toBe(false);
    expect(state.tick).toBe(0);
  });
});

describe("tick and pause", () => {
  it("advances the tick count when not paused", () => {
    const state = createGame(1);
    tick(state);
    tick(state);
    expect(state.tick).toBe(2);
  });

  it("does not advance while paused, and resumes after unpausing", () => {
    const state = createGame(1);
    expect(applyCommand(state, { type: "togglePause" })).toEqual({ ok: true });
    tick(state);
    expect(state.tick).toBe(0);
    applyCommand(state, { type: "togglePause" });
    tick(state);
    expect(state.tick).toBe(1);
  });
});

describe("fast forward", () => {
  it("starts at normal speed and toggles between normal and fast", () => {
    const state = createGame(1);
    expect(state.speed).toBe(1);
    expect(applyCommand(state, { type: "toggleFastForward" })).toEqual({ ok: true });
    expect(state.speed).toBe(FAST_FORWARD_SPEED);
    applyCommand(state, { type: "toggleFastForward" });
    expect(state.speed).toBe(1);
  });
});

describe("determinism", () => {
  it("produces identical state for the same seed and commands", () => {
    const run = () => {
      const s = createGame(99);
      for (let i = 0; i < 50; i++) tick(s);
      applyCommand(s, { type: "togglePause" });
      tick(s);
      return JSON.stringify(s);
    };
    expect(run()).toBe(run());
  });
});
