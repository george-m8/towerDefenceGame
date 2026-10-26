import { describe, expect, it } from "vitest";
import { STRUCTURES, TICK_RATE, UNIT_KINDS } from "../../src/sim/config";
import { isExplored } from "../../src/sim/fog";
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

describe("soldiers and rangers", () => {
  function until(state: GameState, done: () => boolean, limit = 60 * TICK_RATE) {
    for (let i = 0; i < limit && !done(); i++) tick(state);
    expect(done()).toBe(true);
  }

  function dummy(state: GameState, x: number, y: number, hp = 50) {
    const enemy = spawnEnemy(state, x, y, { hp });
    enemy.speed = 0;
    enemy.damage = 0;
    return enemy;
  }

  it("a soldier walks to an enemy its side can see and kills it", () => {
    const state = createGameWithoutWaves(); // no fog: everything in sight
    spawnUnit(state, "soldier", 1, 10, 10);
    const enemy = dummy(state, 25, 12);
    until(state, () => !state.enemies.includes(enemy));
  });

  it("a ranger shoots one from range", () => {
    const state = createGameWithoutWaves();
    const ranger = spawnUnit(state, "ranger", 1, 10, 10)!;
    const enemy = dummy(state, 25, 10, 1000);
    until(state, () => enemy.hp < 1000);
    expect(25 - ranger.x).toBeGreaterThanOrEqual(UNIT_KINDS.ranger.range - 1);
    expect(state.effects.some((e) => e.kind === "shot")).toBe(true);
  });

  it("with no enemy in sight it patrols the fog's edge, never stepping on unexplored land", () => {
    const state = createGame(1, { blankMap: true, size: "XS" });
    state.wave.countdown = Infinity;
    const keep = state.keeps[0];
    const soldier = spawnUnit(state, "soldier", 1, keep.x - 2, keep.y + 1)!;
    const hidden = dummy(state, 1, 1); // far off in the fog
    const before = state.explored.filter((b) => b & 1).length;

    for (let i = 0; i < 20 * TICK_RATE; i++) {
      tick(state);
      expect(isExplored(state, soldier.tx, soldier.ty, 1)).toBe(true);
    }

    expect(state.explored.filter((b) => b & 1).length).toBeGreaterThan(before);
    expect(hidden.hp).toBe(hidden.maxHp);
  });
});
