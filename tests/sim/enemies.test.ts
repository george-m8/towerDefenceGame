import { describe, expect, it } from "vitest";
import { ENEMY, STRUCTURES, TICK_RATE } from "../../src/sim/config";
import { damageEnemy, spawnEnemy } from "../../src/sim/enemies";
import { applyCommand, tick } from "../../src/sim/game";
import { topAt } from "../../src/sim/grid";
import { nextStep } from "../../src/sim/pathfinding";
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
    expect(applyCommand(state, 1, { type: "build", kind: "wall", x: 10, y })).toEqual({
      ok: false,
      reason: "An enemy is in the way",
    });
    tick(state); // now moving from (10, y) towards (11, y)
    expect(applyCommand(state, 1, { type: "build", kind: "wall", x: 11, y }).ok).toBe(false);
    expect(applyCommand(state, 1, { type: "build", kind: "wall", x: 12, y }).ok).toBe(true);
  });
});

describe("wandering", () => {
  it("steps sideways off the path when the wander roll succeeds, never backwards", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const state = createGameWithoutWaves(seed);
      state.wanderChance = 1;
      const y = state.keep.y + 1;
      const enemy = spawnEnemy(state, 5, y);
      expect(nextStep(state, enemy.x, enemy.y)).toEqual({ x: 6, y }); // path heads east
      tick(state);
      expect(enemy.tx).toBe(5);
      expect(Math.abs(enemy.ty - y)).toBe(1);
    }
  });

  it("never wanders into a structure", () => {
    const state = createGameWithoutWaves();
    state.wanderChance = 1;
    const y = state.keep.y + 1;
    // Walls on both sides, so the only open tiles are forward and back: it must go forward.
    buildAt(state, [
      { x: 5, y: y - 1 },
      { x: 5, y: y + 1 },
    ]);
    const enemy = spawnEnemy(state, 5, y);
    tick(state);
    expect({ x: enemy.tx, y: enemy.ty }).toEqual({ x: 6, y });
  });

  it("does not wander away from a structure it is attacking", () => {
    const state = createGameWithoutWaves();
    state.wanderChance = 1;
    const k = state.keep;
    buildAt(state, ring(k.x - 1, k.y - 1, k.x + k.size, k.y + k.size));
    const enemy = spawnEnemy(state, k.x - 2, k.y + 1);
    run(state, 3 * TICK_RATE);
    expect({ x: enemy.x, y: enemy.y }).toEqual({ x: k.x - 2, y: k.y + 1 });
    expect(topAt(state, k.x - 1, k.y + 1)!.hp).toBeLessThan(STRUCTURES.wall.maxHp);
  });

  it("never steps straight back onto the tile it just left", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const state = createGameWithoutWaves(seed);
      state.wanderChance = 0.5;
      const enemy = spawnEnemy(state, 2, state.keep.y + 1);
      const tiles = [`${enemy.x},${enemy.y}`];
      while (state.enemies.length > 0) {
        tick(state);
        const target = `${enemy.tx},${enemy.ty}`;
        if (target !== tiles[tiles.length - 1]) tiles.push(target);
      }
      for (let i = 2; i < tiles.length; i++) expect(tiles[i]).not.toBe(tiles[i - 2]);
    }
  });

  it("with the default chance, enemies still reach the keep", () => {
    const state = createGameWithoutWaves();
    state.wanderChance = ENEMY.wanderChance;
    for (let i = 0; i < 10; i++) spawnEnemy(state, 0, state.keep.y + 1);
    run(state, 60 * TICK_RATE);
    expect(state.enemies).toHaveLength(0);
    expect(state.keep.hp).toBe(state.keep.maxHp - 10 * ENEMY.keepDamage);
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

describe("damageEnemy", () => {
  it("records who struck the killing blow, not who hit first", () => {
    const state = createGameWithoutWaves();
    const enemy = spawnEnemy(state, 5, 5, 10);
    damageEnemy(enemy, 6, 1);
    expect(enemy.killedBy).toBeNull();
    damageEnemy(enemy, 4, 2);
    expect(enemy.hp).toBe(0);
    expect(enemy.killedBy).toBe(2);
  });

  it("ignores hits on an enemy that is already dead", () => {
    const state = createGameWithoutWaves();
    const enemy = spawnEnemy(state, 5, 5, 10);
    damageEnemy(enemy, 15, 1);
    damageEnemy(enemy, 15, 2);
    expect(enemy.hp).toBe(-5);
    expect(enemy.killedBy).toBe(1);
  });
});
