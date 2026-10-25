import { describe, expect, it } from "vitest";
import { buildFractionAt, buildProgress, buildTicksAt } from "../../src/sim/building";
import { BUILD_TIME, STRUCTURES, TICK_RATE } from "../../src/sim/config";
import { spawnEnemy } from "../../src/sim/enemies";
import { applyCommand, createGame, tick } from "../../src/sim/game";
import { blocksAt, isBuilt, isWalkable, topAt } from "../../src/sim/grid";
import type { GameState } from "../../src/sim/types";
import { createGameWithoutWaves, paintTerrain } from "./helpers";

const FULL_TICKS = BUILD_TIME.maxSeconds * TICK_RATE;
const TOUGH = 10_000;

/** A tile `distance` tiles left of the keep, level with its top row. */
function leftOfKeep(state: GameState, distance: number) {
  const keep = state.keeps[0];
  return { x: keep.x - distance, y: keep.y };
}

/** An enemy that stays where it's put. */
function standing(state: GameState, x: number, y: number) {
  const enemy = spawnEnemy(state, x, y, { hp: TOUGH });
  enemy.speed = 0;
  return enemy;
}

function build(state: GameState, kind: "wall" | "archer" | "bridge", p: { x: number; y: number }) {
  expect(applyCommand(state, 1, { type: "build", kind, ...p, facing: "E" })).toEqual({ ok: true });
  return topAt(state, p.x, p.y)!;
}

describe("build time", () => {
  it("is nothing right next to the keep and grows to the full time far away", () => {
    const state = createGameWithoutWaves();
    const keep = state.keeps[0];
    expect(buildTicksAt(state, keep.x - 1, keep.y - 1)).toBe(0); // diagonally touching
    const half = leftOfKeep(state, 1 + (BUILD_TIME.fullDistance - 1) / 2);
    expect(buildFractionAt(state, half.x, half.y)).toBeCloseTo(0.5);
    const far = leftOfKeep(state, BUILD_TIME.fullDistance);
    expect(buildTicksAt(state, far.x, far.y)).toBe(FULL_TICKS);
    const further = leftOfKeep(state, BUILD_TIME.fullDistance + 5);
    expect(buildFractionAt(state, further.x, further.y)).toBe(1);
  });

  it("builds next to the keep straight away", () => {
    const state = createGameWithoutWaves();
    const wall = build(state, "wall", leftOfKeep(state, 1));
    expect(isBuilt(wall)).toBe(true);
    expect(blocksAt(state, wall.x, wall.y)).toBe(true);
  });

  it("leaves a wall far away open until it's finished", () => {
    const state = createGameWithoutWaves();
    const wall = build(state, "wall", leftOfKeep(state, BUILD_TIME.fullDistance));
    expect(wall.buildTicks).toBe(FULL_TICKS);
    expect(blocksAt(state, wall.x, wall.y)).toBe(false);
    for (let i = 0; i < FULL_TICKS - 1; i++) tick(state);
    expect(buildProgress(wall)).toBeCloseTo((FULL_TICKS - 1) / FULL_TICKS);
    expect(blocksAt(state, wall.x, wall.y)).toBe(false);
    const version = state.gridVersion;
    tick(state);
    expect(isBuilt(wall)).toBe(true);
    expect(blocksAt(state, wall.x, wall.y)).toBe(true);
    expect(state.gridVersion).toBeGreaterThan(version); // so enemies re-route
  });

  it("waits to finish a blocking structure while an enemy stands on it", () => {
    const state = createGameWithoutWaves();
    const wall = build(state, "wall", leftOfKeep(state, 3));
    wall.buildLeft = 1;
    const enemy = standing(state, wall.x, wall.y);
    tick(state);
    expect(isBuilt(wall)).toBe(false);
    state.enemies = state.enemies.filter((e) => e !== enemy);
    tick(state);
    expect(isBuilt(wall)).toBe(true);
  });

  it("keeps a tower from firing until it's built", () => {
    const state = createGameWithoutWaves();
    const archer = build(state, "archer", leftOfKeep(state, 20));
    const enemy = standing(state, archer.x + 2, archer.y);
    while (!isBuilt(archer)) {
      tick(state);
      if (!isBuilt(archer)) expect(enemy.hp).toBe(TOUGH);
    }
    tick(state);
    expect(enemy.hp).toBe(TOUGH - STRUCTURES.archer.tower.damage);
  });

  it("keeps a bridge from being crossed until it's built", () => {
    const state = createGameWithoutWaves();
    const p = leftOfKeep(state, 10);
    paintTerrain(state, [p], "river");
    const bridge = build(state, "bridge", p);
    expect(isWalkable(state, p.x, p.y)).toBe(false);
    while (!isBuilt(bridge)) tick(state);
    expect(isWalkable(state, p.x, p.y)).toBe(true);
  });

  it("counts from your own keep in PvP", () => {
    const state = createGame(1, { blankMap: true, mode: "pvp", players: ["Ann", "Bo"] });
    const [ann, bo] = state.keeps;
    const nextToBo = { x: bo.x - 1, y: bo.y };
    expect(buildTicksAt(state, nextToBo.x, nextToBo.y, bo.owner!)).toBe(0);
    expect(buildTicksAt(state, nextToBo.x, nextToBo.y, ann.owner!)).toBeGreaterThan(0);
  });
});
