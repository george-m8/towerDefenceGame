import { describe, expect, it } from "vitest";
import { STRUCTURES, TICK_RATE } from "../../src/sim/config";
import { spawnEnemy } from "../../src/sim/enemies";
import { createGame, tick } from "../../src/sim/game";
import { placeStructure } from "../../src/sim/grid";
import { spawnTileOf, spawnUnit } from "../../src/sim/units";
import type { GameState } from "../../src/sim/types";
import { createGameWithoutWaves } from "./helpers";

function run(state: GameState, ticks: number) {
  for (let i = 0; i < ticks; i++) tick(state);
}

describe("offensive buildings", () => {
  const buildings = [
    ["scoutCamp", "scout"],
    ["barracks", "soldier"],
    ["archeryRange", "ranger"],
  ] as const;

  it("each spawns its own kind, one per interval, up to its quota", () => {
    for (const [kind, unit] of buildings) {
      const { spawner } = STRUCTURES[kind];
      expect(spawner.unit).toBe(unit);
      const state = createGameWithoutWaves();
      placeStructure(state, kind, 10, 10, "E", 1);
      tick(state);
      expect(state.units.map((u) => u.kind)).toEqual([unit]);
      run(state, spawner.quota * spawner.intervalSeconds * TICK_RATE);
      expect(state.units.filter((u) => u.kind === unit)).toHaveLength(spawner.quota);
    }
  });
});

describe("scouts", () => {
  const exploredCount = (state: GameState) => state.explored.filter((bits) => bits & 1).length;

  /** A small foggy map with no waves and a scout camp beside the keep. */
  function scoutCamp() {
    const state = createGame(1, { blankMap: true, size: "XS" });
    state.wave.countdown = Infinity;
    const keep = state.keeps[0];
    const camp = placeStructure(state, "scoutCamp", keep.x - 2, keep.y + 1, "W", 1);
    camp.cooldown = 0;
    return { state, camp };
  }

  it("run out to the edge of the fog and keep pushing it back", () => {
    const { state } = scoutCamp();
    const before = exploredCount(state);
    run(state, 10 * TICK_RATE);
    const after10 = exploredCount(state);
    run(state, 10 * TICK_RATE);
    expect(after10).toBeGreaterThan(before);
    expect(exploredCount(state)).toBeGreaterThan(after10);
  });

  it("walk home and wait once there's nothing left to explore", () => {
    const { state, camp } = scoutCamp();
    const door = spawnTileOf(state, camp)!;
    for (let i = 0; i < 600 * TICK_RATE && exploredCount(state) < state.explored.length; i++) {
      tick(state);
    }
    expect(exploredCount(state)).toBe(state.explored.length);
    run(state, 60 * TICK_RATE);
    for (const scout of state.units) expect({ x: scout.x, y: scout.y }).toEqual(door);
  });

  it("never attack", () => {
    const state = createGameWithoutWaves();
    spawnUnit(state, "scout", 1, 10, 10);
    const enemy = spawnEnemy(state, 11, 10, { hp: 100 });
    enemy.speed = 0;
    enemy.damage = 0;
    run(state, 5 * TICK_RATE);
    expect(enemy.hp).toBe(100);
  });
});
