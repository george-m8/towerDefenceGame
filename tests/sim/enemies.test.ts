import { describe, expect, it } from "vitest";
import { ENEMY, STRUCTURES, TICK_RATE } from "../../src/sim/config";
import { spawnEnemy } from "../../src/sim/enemies";
import { applyCommand, tick } from "../../src/sim/game";
import { topAt } from "../../src/sim/grid";
import type { GameState } from "../../src/sim/types";
import { buildAt, createGameWithoutWaves, ring } from "./helpers";

const ticksPerTile = TICK_RATE / ENEMY.speed;

function run(state: GameState, ticks: number, each?: () => void) {
  for (let i = 0; i < ticks; i++) {
    tick(state);
    each?.();
  }
}

describe("enemy movement", () => {
  it("walks to the keep in the expected time and deals damage on arrival", () => {
    const state = createGameWithoutWaves();
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
    const state = createGameWithoutWaves();
    const y = state.keep.y + 1;
    spawnEnemy(state, 0, y);
    run(state, Math.ceil(2 * ticksPerTile));
    buildAt(state, [{ x: 10, y }]);

    run(state, 600, () => {
      for (const e of state.enemies) {
        expect(topAt(state, Math.round(e.x), Math.round(e.y))).toBeUndefined();
      }
    });
    expect(state.enemies).toHaveLength(0);
    expect(state.keep.hp).toBe(state.keep.maxHp - ENEMY.keepDamage);
  });

  it("ends the game when keep HP reaches 0, and stops ticking", () => {
    const state = createGameWithoutWaves();
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
    const state = createGameWithoutWaves();
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

describe("breaking through", () => {
  const hitsToBreakWall = Math.ceil(STRUCTURES.wall.maxHp / ENEMY.structureDps);

  it("attacks only the structure on the cheapest route when the keep is enclosed", () => {
    const state = createGameWithoutWaves();
    const { keep } = state;
    const walls = ring(keep.x - 1, keep.y - 1, keep.x + keep.size, keep.y + keep.size);
    buildAt(state, walls);
    const y = keep.y + 1;
    spawnEnemy(state, keep.x - 3, y); // two tiles from the ring's left side
    const target = { x: keep.x - 1, y };

    // Walk 1 tile (the first hit lands on the arrival tick), then all but the last hit.
    run(state, Math.ceil(ticksPerTile) + (hitsToBreakWall - 1) * TICK_RATE - 1);
    expect(topAt(state, target.x, target.y)?.hp).toBe(ENEMY.structureDps);
    const damaged = walls.filter((p) => {
      const s = topAt(state, p.x, p.y);
      return s && s.hp < s.maxHp;
    });
    expect(damaged).toEqual([target]);

    run(state, TICK_RATE);
    expect(topAt(state, target.x, target.y)).toBeUndefined();

    // The enemy continues through the gap to the keep.
    run(state, Math.ceil(3 * ticksPerTile));
    expect(state.enemies).toHaveLength(0);
    expect(state.keep.hp).toBe(state.keep.maxHp - ENEMY.keepDamage);
  });

  it("never damages structures when an open route exists", () => {
    const state = createGameWithoutWaves();
    const { keep } = state;
    // Enclose the keep except for one gap on the far (right) side.
    const gap = { x: keep.x + keep.size, y: keep.y + 1 };
    const walls = ring(keep.x - 1, keep.y - 1, keep.x + keep.size, keep.y + keep.size).filter(
      (p) => p.x !== gap.x || p.y !== gap.y,
    );
    buildAt(state, walls);
    spawnEnemy(state, 0, keep.y + 1);
    run(state, 1000);
    expect(state.keep.hp).toBe(state.keep.maxHp - ENEMY.keepDamage);
    for (const p of walls) {
      const s = topAt(state, p.x, p.y)!;
      expect(s.hp).toBe(s.maxHp);
    }
  });
});
