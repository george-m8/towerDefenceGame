import { describe, expect, it } from "vitest";
import { ENEMY_KINDS, STRUCTURES, TICK_RATE, type FarmStats } from "../../src/sim/config";
import { incomePerMinute } from "../../src/sim/economy";
import { spawnEnemy } from "../../src/sim/enemies";
import { enclosureAt, NONE } from "../../src/sim/enclosures";
import { tick } from "../../src/sim/game";
import { blocksAt, canBuild, placeStructure } from "../../src/sim/grid";
import { farmFields } from "../../src/sim/farms";
import { placeResource } from "../../src/sim/resources";
import { spawnUnit } from "../../src/sim/units";
import type { GameState, PlayerId, Point, Structure } from "../../src/sim/types";
import { createGameWithoutWaves, goldOf, ring } from "./helpers";

const farm: FarmStats = STRUCTURES.farmhouse.farm;
const interval = farm.intervalSeconds * TICK_RATE;

function run(state: GameState, ticks: number) {
  for (let i = 0; i < ticks; i++) tick(state);
}

function farmhouse(state: GameState, x: number, y: number, owner: PlayerId = 1): Structure {
  return placeStructure(state, "farmhouse", x, y, "N", owner);
}

function fields(state: GameState, points: Point[], owner: PlayerId = 1): Structure[] {
  return points.map((p) => placeStructure(state, "farmland", p.x, p.y, "N", owner));
}

/** Tiles (x0..x1, y) in a row. */
const row = (x0: number, x1: number, y: number) =>
  Array.from({ length: x1 - x0 + 1 }, (_, i) => ({ x: x0 + i, y }));

const counted = (state: GameState, house: Structure) => farmFields(state).get(house.id) ?? [];

describe("farm income", () => {
  it("a farmhouse with no fields earns nothing", () => {
    const state = createGameWithoutWaves();
    farmhouse(state, 10, 10);
    const gold = goldOf(state);
    run(state, 2 * interval);
    expect(goldOf(state)).toBe(gold);
  });

  it("pays goldPerField for every field joined to it, each interval", () => {
    const state = createGameWithoutWaves();
    farmhouse(state, 10, 10);
    fields(state, row(11, 13, 10)); // touching, then joined through each other
    fields(state, [{ x: 15, y: 10 }]); // loose: a gap at 14
    const gold = goldOf(state);

    run(state, interval - 1);
    expect(goldOf(state)).toBe(gold);
    tick(state);
    expect(goldOf(state)).toBe(gold + 3 * farm.goldPerField);
  });

  it("counts at most maxFields", () => {
    const state = createGameWithoutWaves();
    const house = farmhouse(state, 10, 10);
    fields(state, row(11, 11 + farm.maxFields + 3, 10));
    expect(counted(state, house)).toHaveLength(farm.maxFields);
  });

  it("doesn't count another player's fields", () => {
    const state = createGameWithoutWaves();
    const house = farmhouse(state, 10, 10);
    fields(state, row(11, 13, 10), 2);
    expect(counted(state, house)).toHaveLength(0);
  });

  it("a field joined to two farmhouses counts once, for the nearer (the older on a tie)", () => {
    const state = createGameWithoutWaves();
    const older = farmhouse(state, 10, 10);
    const newer = farmhouse(state, 16, 10);
    fields(state, row(11, 15, 10)); // 13 is three fields from each
    expect(counted(state, older).map((f) => f.x)).toEqual([11, 12, 13]);
    expect(
      counted(state, newer)
        .map((f) => f.x)
        .sort(),
    ).toEqual([14, 15]);
  });

  it("unfinished fields neither count nor join", () => {
    const state = createGameWithoutWaves();
    const house = farmhouse(state, 10, 10);
    const [, middle] = fields(state, row(11, 13, 10));
    middle.buildLeft = middle.buildTicks = 50;
    expect(counted(state, house).map((f) => f.x)).toEqual([11]);
  });

  it("the income stat counts farms at their current fields", () => {
    const state = createGameWithoutWaves();
    farmhouse(state, 10, 10);
    fields(state, row(11, 14, 10));
    expect(incomePerMinute(state, 1)).toBe(4 * farm.goldPerField * (60 / farm.intervalSeconds));
  });
});

describe("farmland", () => {
  it("is walkable and doesn't close a wall ring", () => {
    const state = createGameWithoutWaves();
    fields(state, ring(20, 20, 26, 26));
    expect(blocksAt(state, 20, 20)).toBe(false);
    expect(enclosureAt(state, 23, 23)).toBe(NONE);
  });

  it("only goes on open ground, and can't hold a tower", () => {
    const state = createGameWithoutWaves();
    placeResource(state, 5, 5, "berries", 10);
    expect(canBuild(state, 1, "farmland", 5, 5).ok).toBe(false);
    expect(canBuild(state, 1, "farmland", 6, 6).ok).toBe(true);
    fields(state, [{ x: 6, y: 6 }]);
    expect(canBuild(state, 1, "archer", 6, 6).ok).toBe(false);
  });
});

describe("trampling", () => {
  /** A tile in the keep's row, `dx` tiles to its left: enemies there walk straight east. */
  const lane = (state: GameState, dx: number) => ({
    x: state.keeps[0].x - dx,
    y: state.keeps[0].y + 1,
  });

  /** Runs until every enemy has gone past x (or a time limit). */
  function crossed(state: GameState, x: number) {
    for (let i = 0; i < 60 * TICK_RATE && state.enemies.some((e) => e.x <= x); i++) tick(state);
  }

  it("a light enemy walks over a field without harming it", () => {
    const state = createGameWithoutWaves();
    const p = lane(state, 20);
    const [field] = fields(state, [{ x: p.x + 2, y: p.y }]);
    expect(ENEMY_KINDS.goblin.weight).toBe(0);
    spawnEnemy(state, p.x, p.y);
    crossed(state, field.x);
    expect(field.hp).toBe(field.maxHp);
  });

  it("a heavier enemy takes its weight off each field it steps on, and enough steps remove one", () => {
    const state = createGameWithoutWaves();
    const p = lane(state, 20);
    const [field] = fields(state, [{ x: p.x + 2, y: p.y }]);
    spawnEnemy(state, p.x, p.y, { kind: "golem" });
    crossed(state, field.x);
    expect(field.hp).toBe(field.maxHp - ENEMY_KINDS.golem.weight);

    const steps = Math.ceil(field.hp / ENEMY_KINDS.golem.weight);
    for (let i = 0; i < steps; i++) spawnEnemy(state, p.x - i * 2, p.y, { kind: "golem" });
    crossed(state, field.x);
    expect(state.structures[field.id]).toBeUndefined();
  });

  it("units don't trample", () => {
    const state = createGameWithoutWaves();
    const [field] = fields(state, [{ x: 7, y: 5 }]);
    const unit = spawnUnit(state, "militia", 1, 5, 5)!;
    unit.goal = { x: 9, y: 5 };
    run(state, 6 * TICK_RATE);
    expect(unit.x).toBe(9);
    expect(field.hp).toBe(field.maxHp);
  });

  it("a trampled-away field stops counting, and fields joined only through it come loose", () => {
    const state = createGameWithoutWaves();
    const p = lane(state, 20);
    const house = farmhouse(state, p.x + 2, p.y - 1);
    const [first] = fields(state, row(p.x + 2, p.x + 4, p.y));
    expect(counted(state, house)).toHaveLength(3);

    first.hp = 1;
    spawnEnemy(state, p.x, p.y, { kind: "golem" });
    for (let i = 0; i < 30 * TICK_RATE && state.structures[first.id]; i++) tick(state);

    expect(state.structures[first.id]).toBeUndefined();
    expect(counted(state, house)).toHaveLength(0);
  });
});
