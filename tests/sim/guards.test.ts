import { describe, expect, it } from "vitest";
import {
  ENEMY_KINDS,
  STRUCTURES,
  TICK_RATE,
  UNIT_KINDS,
  type StructureStats,
} from "../../src/sim/config";
import { spawnEnemy } from "../../src/sim/enemies";
import { applyCommand, tick } from "../../src/sim/game";
import { placeStructure } from "../../src/sim/grid";
import { guardSpotOf, guardSpots } from "../../src/sim/guards";
import { spawnUnit } from "../../src/sim/units";
import { toolsInTab } from "../../src/ui/state";
import type { GameState } from "../../src/sim/types";
import { buildAt, createGameWithoutWaves } from "./helpers";

function run(state: GameState, ticks: number) {
  for (let i = 0; i < ticks; i++) tick(state);
}

const buildings = [
  ["guardhouse", "swordsman"],
  ["archeryPost", "archer"],
  ["paladinHall", "paladin"],
] as const;

describe("guard buildings", () => {
  it("each spawns its own guards, one per interval, up to its quota", () => {
    for (const [kind, guard] of buildings) {
      const { spawner } = STRUCTURES[kind];
      expect(spawner.unit).toBe(guard);
      const state = createGameWithoutWaves();
      placeStructure(state, kind, 10, 10, "E", 1);
      tick(state);
      expect(state.units.map((u) => u.kind)).toEqual([guard]);
      run(state, spawner.quota * spawner.intervalSeconds * TICK_RATE);
      expect(state.units).toHaveLength(spawner.quota);
    }
  });

  it("are placed facing a direction, from the Defence tab", () => {
    const state = createGameWithoutWaves();
    for (const [kind] of buildings) {
      const stats: StructureStats = STRUCTURES[kind];
      expect(stats.directional).toBe(true);
      expect(toolsInTab("defence").map((t) => t.tool)).toContain(kind);
    }
    expect(
      applyCommand(state, 1, { type: "build", kind: "guardhouse", x: 10, y: 10, facing: "W" }),
    ).toEqual({ ok: true });
    expect(Object.values(state.structures)[0].facing).toBe("W");
  });

  it("selling one leaves its guards alive with no home", () => {
    const state = createGameWithoutWaves();
    placeStructure(state, "guardhouse", 10, 10, "E", 1);
    tick(state);
    expect(applyCommand(state, 1, { type: "sell", x: 10, y: 10 })).toEqual({ ok: true });
    run(state, 2 * STRUCTURES.guardhouse.spawner.intervalSeconds * TICK_RATE);
    expect(state.units).toHaveLength(1);
    expect(state.units[0].home).toBeNull();
  });
});

describe("guard spots", () => {
  /** A guardhouse at (10, 10) facing east, with `n` guards of its own (oldest first). */
  function post(state: GameState, n = 0) {
    const building = placeStructure(state, "guardhouse", 10, 10, "E", 1);
    const guards = Array.from({ length: n }, () =>
      spawnUnit(state, "swordsman", 1, 9, 10, building.id)!,
    );
    return { building, guards };
  }

  it("run straight ahead, then the sides, then the same one row further out", () => {
    const state = createGameWithoutWaves();
    const { building } = post(state);
    expect(guardSpots(state, building)).toEqual([
      { x: 11, y: 10 },
      { x: 11, y: 9 },
      { x: 11, y: 11 },
      { x: 12, y: 10 },
      { x: 12, y: 9 },
      { x: 12, y: 11 },
    ]);
  });

  it("skip tiles that are built on, or that can't be walked to", () => {
    const state = createGameWithoutWaves();
    const { building } = post(state);
    buildAt(state, [{ x: 11, y: 9 }]);
    buildAt(state, [
      { x: 11, y: 10 },
      { x: 12, y: 9 },
      { x: 13, y: 10 },
      { x: 12, y: 11 },
    ]); // walls (12, 10) in
    expect(guardSpots(state, building)).toEqual([{ x: 11, y: 11 }]);
  });

  it("guards take spots oldest first, and share when there are too few", () => {
    const state = createGameWithoutWaves();
    const { guards } = post(state, 3);
    expect(guards.map((g) => guardSpotOf(state, g))).toEqual([
      { x: 11, y: 10 },
      { x: 11, y: 9 },
      { x: 11, y: 11 },
    ]);
    buildAt(state, [
      { x: 11, y: 9 },
      { x: 11, y: 11 },
      { x: 12, y: 10 },
      { x: 12, y: 9 },
      { x: 12, y: 11 },
    ]);
    expect(guards.map((g) => guardSpotOf(state, g))).toEqual(Array(3).fill({ x: 11, y: 10 }));
  });

  it("building over a spot moves its guard to the next one", () => {
    const state = createGameWithoutWaves();
    const { guards } = post(state, 1);
    expect(guardSpotOf(state, guards[0])).toEqual({ x: 11, y: 10 });
    buildAt(state, [{ x: 11, y: 10 }]);
    expect(guardSpotOf(state, guards[0])).toEqual({ x: 11, y: 9 });
  });

  it("a guard with no home keeps its last spot; with no open spot it stays put", () => {
    const state = createGameWithoutWaves();
    const { guards } = post(state, 1);
    guards[0].home = null;
    guards[0].goal = { x: 20, y: 20 };
    expect(guardSpotOf(state, guards[0])).toEqual({ x: 20, y: 20 });

    const boxed = createGameWithoutWaves();
    const {
      guards: [g],
    } = post(boxed, 1);
    buildAt(
      boxed,
      [11, 12].flatMap((x) => [9, 10, 11].map((y) => ({ x, y }))),
    );
    expect(guardSpotOf(boxed, g)).toBeNull();
  });
});

describe("holding a spot", () => {
  /** Ticks until `done` holds (at most `limit`). */
  function until(state: GameState, done: () => boolean, limit = 60 * TICK_RATE) {
    for (let i = 0; i < limit && !done(); i++) tick(state);
    expect(done()).toBe(true);
  }
  const at = (u: { x: number; y: number }) => ({ x: u.x, y: u.y });

  it("guards walk out to their spots, oldest first, and stay there", () => {
    const state = createGameWithoutWaves();
    const hall = placeStructure(state, "paladinHall", 10, 10, "E", 1);
    const { quota, intervalSeconds } = STRUCTURES.paladinHall.spawner;
    run(state, (quota - 1) * intervalSeconds * TICK_RATE + 1);
    const spots = guardSpots(state, hall);
    until(state, () => state.units.every((u, i) => u.x === spots[i].x && u.y === spots[i].y));
    run(state, 5 * TICK_RATE);
    expect(state.units.map(at)).toEqual(spots.slice(0, quota));
  });

  it("a paladin holds its spot: a goblin stops there, and armour takes the edge off each hit", () => {
    const state = createGameWithoutWaves();
    const lane = { x: state.keeps[0].x - 20, y: state.keeps[0].y + 1 };
    const hall = placeStructure(state, "paladinHall", lane.x, lane.y - 1, "S", 1);
    const paladin = spawnUnit(state, "paladin", 1, lane.x, lane.y, hall.id)!;
    const goblin = spawnEnemy(state, lane.x - 6, lane.y, { hp: 10_000 });
    const hit = ENEMY_KINDS.goblin.damage - UNIT_KINDS.paladin.armour;

    until(state, () => paladin.hp < paladin.maxHp);
    expect(paladin.maxHp - paladin.hp).toBe(Math.max(1, hit));
    run(state, 5 * TICK_RATE);
    expect(at(paladin)).toEqual({ x: lane.x, y: lane.y });
    expect(goblin.x).toBeLessThan(lane.x);
  });

  it("a guard whose spot is built over walks to its new one", () => {
    const state = createGameWithoutWaves();
    const hall = placeStructure(state, "paladinHall", 10, 10, "E", 1);
    const paladin = spawnUnit(state, "paladin", 1, 11, 10, hall.id)!;
    buildAt(state, [{ x: 11, y: 10 }]);
    until(state, () => paladin.x === 11 && paladin.y === 9);
  });
});

describe("swordsmen", () => {
  const chase = UNIT_KINDS.swordsman.chase;

  function until(state: GameState, done: () => boolean, limit = 60 * TICK_RATE) {
    for (let i = 0; i < limit && !done(); i++) tick(state);
    expect(done()).toBe(true);
  }

  /** A guardhouse at (10, 10) facing east, with one swordsman already on its spot (11, 10). */
  function post(state: GameState) {
    const house = placeStructure(state, "guardhouse", 10, 10, "E", 1);
    return spawnUnit(state, "swordsman", 1, 11, 10, house.id)!;
  }

  /** An enemy that stands still and doesn't hit back. */
  function dummy(state: GameState, x: number, y: number) {
    const enemy = spawnEnemy(state, x, y);
    enemy.speed = 0;
    enemy.damage = 0;
    return enemy;
  }

  it("chase an enemy that comes within range of their spot, kill it, and walk back", () => {
    const state = createGameWithoutWaves();
    const swordsman = post(state);
    const enemy = dummy(state, 11 + chase, 10);

    until(state, () => !state.enemies.includes(enemy));
    until(state, () => swordsman.x === 11 && swordsman.y === 10);
  });

  it("ignore an enemy further than that from their spot", () => {
    const state = createGameWithoutWaves();
    const swordsman = post(state);
    const enemy = dummy(state, 11 + chase + 1, 10);
    run(state, 5 * TICK_RATE);
    expect({ x: swordsman.x, y: swordsman.y }).toEqual({ x: 11, y: 10 });
    expect(enemy.hp).toBe(enemy.maxHp);
  });

  it("follow an enemy on the move", () => {
    const state = createGameWithoutWaves();
    const lane = { x: state.keeps[0].x - 20, y: state.keeps[0].y + 1 };
    const house = placeStructure(state, "guardhouse", lane.x, lane.y - 3, "S", 1);
    const swordsman = spawnUnit(state, "swordsman", 1, lane.x, lane.y - 2, house.id)!;
    const goblin = spawnEnemy(state, lane.x - 6, lane.y);

    until(state, () => !state.enemies.includes(goblin));
    until(state, () => swordsman.x === lane.x && swordsman.y === lane.y - 2);
  });
});
