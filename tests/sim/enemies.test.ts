import { describe, expect, it } from "vitest";
import { ENEMY, TICK_RATE } from "../../src/sim/config";
import { spawnEnemy } from "../../src/sim/enemies";
import { applyCommand, createGame, tick } from "../../src/sim/game";
import { structureAt } from "../../src/sim/grid";
import type { GameState } from "../../src/sim/types";
import { buildAt } from "./helpers";

const ticksPerTile = TICK_RATE / ENEMY.speed;

function run(state: GameState, ticks: number, each?: () => void) {
  for (let i = 0; i < ticks; i++) {
    tick(state);
    each?.();
  }
}

describe("enemy movement", () => {
  it("walks to the keep in the expected time and deals damage on arrival", () => {
    const state = createGame(1);
    const start = { x: 0, y: state.keep.y + 1 };
    const tiles = state.keep.x - start.x; // straight line to the keep's left edge
    spawnEnemy(state, start.x, start.y);

    run(state, Math.floor((tiles - 1) * ticksPerTile));
    expect(state.enemies).toHaveLength(1);
    expect(state.keep.hp).toBe(state.keep.maxHp);

    run(state, Math.ceil(2 * ticksPerTile));
    expect(state.enemies).toHaveLength(0);
    expect(state.keep.hp).toBe(state.keep.maxHp - ENEMY.keepDamage);
  });

  it("reroutes around a wall placed in its path and never walks through it", () => {
    const state = createGame(1);
    const y = state.keep.y + 1;
    spawnEnemy(state, 0, y);
    run(state, Math.ceil(2 * ticksPerTile));
    buildAt(state, [{ x: 10, y }]);

    run(state, 600, () => {
      for (const e of state.enemies) {
        expect(structureAt(state, Math.round(e.x), Math.round(e.y))).toBeUndefined();
      }
    });
    expect(state.enemies).toHaveLength(0);
    expect(state.keep.hp).toBe(state.keep.maxHp - ENEMY.keepDamage);
  });

  it("ends the game when keep HP reaches 0, and stops ticking", () => {
    const state = createGame(1);
    state.keep.hp = ENEMY.keepDamage;
    spawnEnemy(state, state.keep.x - 1, state.keep.y);
    run(state, Math.ceil(2 * ticksPerTile));
    expect(state.keep.hp).toBe(0);
    expect(state.gameOver).toBe(true);
    const frozen = state.tick;
    tick(state);
    expect(state.tick).toBe(frozen);
  });
});

describe("building near enemies", () => {
  it("rejects building on a tile an enemy is standing on or moving into", () => {
    const state = createGame(1);
    const y = state.keep.y + 1;
    spawnEnemy(state, 10, y);
    expect(applyCommand(state, { type: "build", kind: "wall", x: 10, y })).toEqual({
      ok: false,
      reason: "An enemy is in the way",
    });
    tick(state); // now moving from (10, y) towards (11, y)
    expect(applyCommand(state, { type: "build", kind: "wall", x: 11, y }).ok).toBe(false);
    expect(applyCommand(state, { type: "build", kind: "wall", x: 12, y }).ok).toBe(true);
  });
});
