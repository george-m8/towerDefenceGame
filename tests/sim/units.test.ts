import { describe, expect, it } from "vitest";
import {
  ENEMY_KINDS,
  RESOURCES,
  TICK_RATE,
  UNIT_KINDS,
  STRUCTURES,
  UNIT_PATH_SEARCHES_PER_TICK,
  type ResourceTerrain,
  type SpawnerStats,
  type StructureStats,
  type UnitKind,
  type UnitKindId,
} from "../../src/sim/config";
import { spawnEnemy } from "../../src/sim/enemies";
import { applyCommand, createGame, tick } from "../../src/sim/game";
import { blocksAt, placeStructure, removeStructure } from "../../src/sim/grid";
import { placeResource, resourceAt } from "../../src/sim/resources";
import { damageUnit, spawnTileOf, spawnUnit } from "../../src/sim/units";
import type { Enemy, Facing, GameState } from "../../src/sim/types";
import { buildAt, createGameWithoutWaves, goldOf, paintTerrain, ring } from "./helpers";

const militia = UNIT_KINDS.militia;
const hitTicks = militia.attackInterval * TICK_RATE;

function run(state: GameState, ticks: number) {
  for (let i = 0; i < ticks; i++) tick(state);
}

/** An enemy that stays put and doesn't hit back, so only the unit's attacks count. */
function dummy(state: GameState, x: number, y: number): Enemy {
  const enemy = spawnEnemy(state, x, y, { hp: 1000 });
  enemy.speed = 0;
  enemy.damage = 0;
  return enemy;
}

describe("units", () => {
  it("militia have the spec's test numbers", () => {
    expect(militia).toMatchObject({
      glyph: "i",
      hp: 30,
      armour: 0,
      damage: 4,
      attackInterval: 1,
      range: 1,
      speed: 1,
      behaviour: "hold",
    });
  });

  it("spawns for a player on open ground, but not on water, rock, structures or the keep", () => {
    const state = createGameWithoutWaves();
    const unit = spawnUnit(state, "militia", 1, 5, 5);
    expect(unit).toMatchObject({ kind: "militia", owner: 1, home: null, x: 5, y: 5, hp: 30 });
    expect(state.units).toEqual([unit]);

    paintTerrain(state, [{ x: 6, y: 5 }], "river");
    paintTerrain(state, [{ x: 7, y: 5 }], "rock");
    placeStructure(state, "wall", 8, 5);
    const keep = state.keeps[0];
    for (const [x, y] of [
      [6, 5],
      [7, 5],
      [8, 5],
      [keep.x, keep.y],
    ]) {
      expect(spawnUnit(state, "militia", 1, x, y)).toBeNull();
    }
    expect(state.units).toHaveLength(1);
  });

  it("armour takes damage off each hit, never below 1", () => {
    const state = createGameWithoutWaves();
    const unit = spawnUnit(state, "militia", 1, 5, 5)!;
    damageUnit(unit, 10);
    expect(unit.hp).toBe(20);

    const kind: UnitKind = UNIT_KINDS.militia;
    kind.armour = 3;
    try {
      damageUnit(unit, 10);
      expect(unit.hp).toBe(13);
      damageUnit(unit, 2);
      expect(unit.hp).toBe(12);
    } finally {
      kind.armour = 0;
    }
  });

  it("a dead unit is gone after the tick, and nobody is paid for it", () => {
    const state = createGameWithoutWaves();
    const unit = spawnUnit(state, "militia", 1, 5, 5)!;
    const gold = goldOf(state);
    damageUnit(unit, 100);
    tick(state);
    expect(state.units).toEqual([]);
    expect(goldOf(state)).toBe(gold);
  });

  it("bursts apart in its owner's colour when it dies", () => {
    const state = createGameWithoutWaves();
    const unit = spawnUnit(state, "militia", 1, 5, 5)!;
    damageUnit(unit, 100);
    tick(state);
    expect(state.effects).toContainEqual(
      expect.objectContaining({ kind: "burst", x: 5, y: 5, unit: "militia", owner: 1 }),
    );
  });

  it("a holding militia hits an adjacent enemy every interval, paying the bounty to its owner", () => {
    const state = createGameWithoutWaves();
    const unit = spawnUnit(state, "militia", 1, 5, 5)!;
    const enemy = dummy(state, 6, 5);

    tick(state);
    expect(enemy.hp).toBe(1000 - militia.damage);
    run(state, hitTicks - 1);
    expect(enemy.hp).toBe(1000 - militia.damage);
    tick(state);
    expect(enemy.hp).toBe(1000 - 2 * militia.damage);

    enemy.hp = 1;
    const gold = goldOf(state);
    run(state, hitTicks);
    expect(state.enemies).not.toContain(enemy);
    expect(goldOf(state)).toBe(gold + enemy.bounty);
    expect(unit.x).toBe(5); // holds its tile
  });

  it("ignores an enemy 2 tiles away", () => {
    const state = createGameWithoutWaves();
    spawnUnit(state, "militia", 1, 5, 5);
    const enemy = dummy(state, 7, 5);
    run(state, 3 * hitTicks);
    expect(enemy.hp).toBe(1000);
  });

  it("goes for the nearest enemy first", () => {
    const state = createGameWithoutWaves();
    spawnUnit(state, "militia", 1, 5, 5);
    const diagonal = dummy(state, 6, 6);
    const sameTile = dummy(state, 5, 5);
    tick(state);
    expect(sameTile.hp).toBe(1000 - militia.damage);
    expect(diagonal.hp).toBe(1000);
  });

  it("debugUnit spawns for the player who sent it, only where a unit can stand", () => {
    const state = createGameWithoutWaves();
    expect(applyCommand(state, 1, { type: "debugUnit", kind: "militia", x: 5, y: 5 })).toEqual({
      ok: true,
    });
    expect(state.units[0]).toMatchObject({ owner: 1, x: 5, y: 5 });
    paintTerrain(state, [{ x: 6, y: 5 }], "sea");
    expect(applyCommand(state, 1, { type: "debugUnit", kind: "militia", x: 6, y: 5 })).toEqual({
      ok: false,
      reason: "A unit can't stand there",
    });
  });
});

describe("enemies fight units", () => {
  /** A tile in the keep's row, `dx` tiles to its left: enemies there walk straight east. */
  function lane(state: GameState, dx: number) {
    return { x: state.keeps[0].x - dx, y: state.keeps[0].y + 1 };
  }
  const goblinHit = ENEMY_KINDS.goblin.damage;

  it("a goblin stops to fight a unit on its next tile, and walks on once it's dead", () => {
    const state = createGameWithoutWaves();
    const p = lane(state, 20);
    const goblin = spawnEnemy(state, p.x, p.y, { hp: 1000 });
    const unit = spawnUnit(state, "militia", 1, p.x + 1, p.y)!;

    tick(state);
    expect(goblin.x).toBe(p.x);
    expect(unit.hp).toBe(militia.hp - goblinHit);

    for (let i = 0; i < 400 && state.units.length > 0; i++) tick(state);
    expect(state.units).toEqual([]);
    run(state, TICK_RATE);
    expect(goblin.x).toBeGreaterThan(p.x);
  });

  it("stops for a unit on a tile beside it, but not one 2 tiles off its path", () => {
    const state = createGameWithoutWaves();
    const p = lane(state, 20);
    const goblin = spawnEnemy(state, p.x, p.y, { hp: 1000 });
    const beside = spawnUnit(state, "militia", 1, p.x + 2, p.y - 1)!;
    const offPath = spawnUnit(state, "militia", 1, p.x + 1, p.y + 2)!;

    run(state, 3 * TICK_RATE);

    expect(goblin.x).toBe(p.x + 2);
    expect(beside.hp).toBeLessThan(militia.hp);
    expect(offPath.hp).toBe(militia.hp);
  });

  it("hits the unit in its way before one beside it, even a weaker one", () => {
    const state = createGameWithoutWaves();
    const p = lane(state, 20);
    spawnEnemy(state, p.x, p.y, { hp: 1000 });
    const inTheWay = spawnUnit(state, "militia", 1, p.x + 1, p.y)!;
    const beside = spawnUnit(state, "militia", 1, p.x, p.y - 1)!;
    beside.hp = 5;

    tick(state);

    expect(inTheWay.hp).toBe(militia.hp - goblinHit);
    expect(beside.hp).toBe(5);
  });

  it("a battering ram walks straight through a unit", () => {
    const state = createGameWithoutWaves();
    const p = lane(state, 20);
    const ram = spawnEnemy(state, p.x, p.y, { kind: "batteringRam" });
    const unit = spawnUnit(state, "militia", 1, p.x + 1, p.y)!;

    run(state, 4 * TICK_RATE);

    expect(ram.x).toBeGreaterThan(p.x + 1);
    expect(unit.hp).toBe(militia.hp);
  });

  it("a bomber's blast hurts units in it", () => {
    const state = createGameWithoutWaves();
    const p = lane(state, 20);
    const wall = placeStructure(state, "wall", p.x + 1, p.y + 1, "N", 1);
    wall.hp = wall.maxHp = 1000;
    // It steps east next to the wall and explodes there, so the blast covers x .. x + 2.
    spawnEnemy(state, p.x, p.y, { kind: "dwarfBomber" });
    const caught = spawnUnit(state, "militia", 1, p.x, p.y - 1)!;
    caught.hp = caught.maxHp = 1000;
    const clear = spawnUnit(state, "militia", 1, p.x - 1, p.y)!;
    clear.hp = clear.maxHp = 1000;

    for (let i = 0; i < 40 && wall.hp === 1000; i++) tick(state);

    expect(wall.hp).toBeLessThan(1000);
    expect(caught.hp).toBe(1000 - ENEMY_KINDS.dwarfBomber.ability.amount);
    expect(clear.hp).toBe(1000);
  });
});

describe("unit movement", () => {
  const ticksPerTile = TICK_RATE / militia.speed;

  it("walks to its goal at its kind's speed, then holds there", () => {
    const state = createGameWithoutWaves();
    const unit = spawnUnit(state, "militia", 1, 5, 5)!;
    unit.goal = { x: 9, y: 5 };

    run(state, 3 * ticksPerTile);
    expect(unit.x).toBeCloseTo(8);
    run(state, ticksPerTile);
    expect({ x: unit.x, y: unit.y }).toEqual({ x: 9, y: 5 });
    run(state, 2 * ticksPerTile);
    expect({ x: unit.x, y: unit.y }).toEqual({ x: 9, y: 5 });
  });

  it("finds a new way when a wall goes up across its path, never standing on it", () => {
    const state = createGameWithoutWaves();
    const unit = spawnUnit(state, "militia", 1, 5, 10)!;
    unit.goal = { x: 15, y: 10 };
    run(state, ticksPerTile);
    buildAt(
      state,
      [7, 8, 9, 10, 11, 12].map((y) => ({ x: 10, y })),
    );

    for (let i = 0; i < 30 * ticksPerTile && unit.x !== 15; i++) {
      tick(state);
      expect(blocksAt(state, Math.round(unit.x), Math.round(unit.y))).toBe(false);
    }
    expect({ x: unit.x, y: unit.y }).toEqual({ x: 15, y: 10 });
  });

  it("stands still when there's no way to its goal", () => {
    const state = createGameWithoutWaves();
    const unit = spawnUnit(state, "militia", 1, 5, 5)!;
    buildAt(state, ring(8, 3, 12, 7));
    unit.goal = { x: 10, y: 5 };
    run(state, 2 * ticksPerTile);
    expect({ x: unit.x, y: unit.y }).toEqual({ x: 5, y: 5 });
  });

  it("searches for at most the budget of paths a tick; those left waiting go first next tick", () => {
    const state = createGameWithoutWaves();
    const units = Array.from({ length: 10 }, (_, i) => {
      const unit = spawnUnit(state, "militia", 1, 5, 5 + i)!;
      unit.goal = { x: 40, y: 5 + i };
      return unit;
    });

    tick(state);
    expect(units.filter((u) => u.path !== null)).toHaveLength(UNIT_PATH_SEARCHES_PER_TICK);
    const waiting = units.filter((u) => u.path === null);
    expect(waiting.every((u) => u.waitingForPath)).toBe(true);

    placeStructure(state, "wall", 30, 40); // every stored path is now out of date
    tick(state);
    for (const unit of waiting) expect(unit.path).not.toBeNull();
  });

  it("a blocking construction site waits to finish while a unit stands on it", () => {
    const state = createGameWithoutWaves();
    const unit = spawnUnit(state, "militia", 1, 5, 5)!;
    const wall = placeStructure(state, "wall", 5, 5, "N", 1);
    wall.buildLeft = 1;
    wall.buildTicks = 10;

    run(state, 5);
    expect(wall.buildLeft).toBe(1);

    unit.goal = { x: 8, y: 5 };
    run(state, ticksPerTile + 1); // building moves on before units do, so one tick after it steps off
    expect(wall.buildLeft).toBe(0);
  });
});

describe("spawners", () => {
  const spawner: SpawnerStats = { unit: "militia", quota: 2, intervalSeconds: 3 };
  const interval = spawner.intervalSeconds * TICK_RATE;

  /** Walls become test spawners for the length of `body` (no real kind spawns yet). */
  function withSpawner(body: () => void) {
    const wall: StructureStats = STRUCTURES.wall;
    wall.spawner = spawner;
    try {
      body();
    } finally {
      delete wall.spawner;
    }
  }

  function spawnerAt(state: GameState, x: number, y: number, facing?: Facing) {
    const s = placeStructure(state, "wall", x, y, "N", 1);
    s.facing = facing; // walls have no facing of their own; spawners face south without one
    return s;
  }

  it("spawns its first unit straight away, then one every interval", () =>
    withSpawner(() => {
      const state = createGameWithoutWaves();
      const home = spawnerAt(state, 10, 10);

      tick(state);
      expect(state.units).toEqual([
        expect.objectContaining({ kind: "militia", owner: 1, home: home.id, x: 10, y: 11 }),
      ]);
      run(state, interval - 1);
      expect(state.units).toHaveLength(1);
      tick(state);
      expect(state.units).toHaveLength(2);
    }));

  it("never has more than its quota alive, and replaces a death straight away", () =>
    withSpawner(() => {
      const state = createGameWithoutWaves();
      spawnerAt(state, 10, 10);
      run(state, 5 * interval);
      expect(state.units).toHaveLength(2);

      const dead = state.units[0];
      damageUnit(dead, 100);
      tick(state); // replaced on the same tick the dead one is cleared away
      expect(state.units).toHaveLength(2);
      expect(state.units).not.toContain(dead);
    }));

  it("does nothing while it's a construction site", () =>
    withSpawner(() => {
      const state = createGameWithoutWaves();
      const home = spawnerAt(state, 10, 10);
      home.buildLeft = home.buildTicks = 5;
      run(state, 4);
      expect(state.units).toHaveLength(0);
      tick(state);
      expect(state.units).toHaveLength(1);
    }));

  it("spawns on the tile it faces, else the next open one clockwise, else waits", () =>
    withSpawner(() => {
      const state = createGameWithoutWaves();
      const home = spawnerAt(state, 10, 10, "E");
      const spawnedAt = () => state.units.map((u) => ({ x: u.x, y: u.y }));

      tick(state);
      expect(spawnedAt()).toEqual([{ x: 11, y: 10 }]);

      state.units = [];
      buildAt(state, [{ x: 11, y: 10 }], "house");
      run(state, interval);
      expect(spawnedAt()).toEqual([{ x: 10, y: 11 }]); // east is taken: south is next clockwise

      state.units = [];
      buildAt(
        state,
        [
          { x: 10, y: 11 },
          { x: 9, y: 10 },
          { x: 10, y: 9 },
        ],
        "house",
      );
      run(state, 2 * interval);
      expect(state.units).toHaveLength(0);
      expect(home.cooldown).toBe(0); // ready, waiting for room

      sellAt(state, 10, 9);
      tick(state);
      expect(spawnedAt()).toEqual([{ x: 10, y: 9 }]);
    }));

  it("leaves its units alive with no home when sold; a new one starts counting from zero", () =>
    withSpawner(() => {
      const state = createGameWithoutWaves();
      const home = spawnerAt(state, 10, 10);
      tick(state);
      const unit = state.units[0];

      expect(applyCommand(state, 1, { type: "sell", x: 10, y: 10 })).toEqual({ ok: true });
      run(state, 3 * interval);
      expect(state.units).toEqual([unit]);
      expect(unit.home).toBeNull();
      expect(unit.hp).toBe(militia.hp);

      const next = spawnerAt(state, 20, 10);
      run(state, interval + 1);
      expect(state.units.filter((u) => u.home === next.id)).toHaveLength(2);
      expect(next.id).not.toBe(home.id);
    }));
});

/** Removes whatever is built on (x, y), bypassing gold and ownership. */
function sellAt(state: GameState, x: number, y: number) {
  const structure = Object.values(state.structures).find((s) => s.x === x && s.y === y)!;
  removeStructure(state, structure);
}

describe("performance", () => {
  // Spec target: one tick under 50 ms, measured standalone. The parallel test run is too noisy
  // for that, so this guards against a large regression only (as the flow-field timing test does).
  it("keeps a tick quick with 200 units and 200 enemies on an XL map", () => {
    const state = createGame(3, { size: "XL", fog: false });
    state.wave.countdown = Infinity;
    const keep = state.keeps[0];
    for (let y = 2; y < state.height - 2 && state.units.length < 200; y += 3) {
      for (let x = 2; x < keep.x - 4 && state.units.length < 200; x += 9) {
        const unit = spawnUnit(state, "militia", 1, x, y);
        if (unit) unit.goal = { x: x + 20, y: state.height - 1 - y };
      }
    }
    applyCommand(state, 1, { type: "debugSpawn", count: 200 });
    expect(state.units).toHaveLength(200);

    tick(state); // warm-up: the first tick builds the enemy flow fields from scratch
    const times: number[] = [];
    for (let i = 0; i < 60; i++) {
      const start = performance.now();
      tick(state);
      times.push(performance.now() - start);
    }
    // Typical ticks, not the single slowest: one tick can stall while other tests hog the CPU.
    times.sort((a, b) => a - b);
    expect(times[30]).toBeLessThan(50); // median
    expect(times[57]).toBeLessThan(250); // 95th percentile
  });
});

describe("workers", () => {
  const chopTicks = UNIT_KINDS.lumberjack.attackInterval * TICK_RATE;
  /** Hits one worker needs to clear a fresh tile of this kind. */
  const hitsFor = (terrain: ResourceTerrain, worker: UnitKindId) =>
    RESOURCES[terrain].seconds / UNIT_KINDS[worker].attackInterval;
  const work = (terrain: ResourceTerrain) => RESOURCES[terrain].seconds * TICK_RATE;

  /** Ticks until `done` holds (at most `limit`), so tests don't depend on walking speed. */
  function until(state: GameState, done: () => boolean, limit = 2000) {
    for (let i = 0; i < limit && !done(); i++) tick(state);
    expect(done()).toBe(true);
  }

  it("a lumberjack walks to the nearest tree and chops it on its interval, paying its owner", () => {
    const state = createGameWithoutWaves();
    const perHit = 2;
    placeResource(state, 12, 5, "tree", perHit * hitsFor("tree", "lumberjack"));
    placeResource(state, 8, 5, "rock", 100);
    placeResource(state, 6, 5, "berries", 100);
    spawnUnit(state, "lumberjack", 1, 5, 5);
    const gold = goldOf(state);
    const left = () => resourceAt(state, 12, 5)!.goldLeft;
    const full = left();

    until(state, () => left() < full);
    expect(goldOf(state)).toBe(gold + perHit);
    run(state, chopTicks - 1);
    expect(left()).toBe(full - perHit);
    tick(state);
    expect(left()).toBe(full - 2 * perHit);
    expect(resourceAt(state, 8, 5)!.workLeft).toBe(work("rock"));
    expect(resourceAt(state, 6, 5)!.workLeft).toBe(work("berries"));
  });

  it("a forager stands on its bush to forage it", () => {
    const state = createGameWithoutWaves();
    placeResource(state, 9, 5, "berries", 100);
    const forager = spawnUnit(state, "forager", 1, 5, 5)!;
    until(state, () => resourceAt(state, 9, 5)!.workLeft < work("berries"));
    expect({ x: forager.x, y: forager.y }).toEqual({ x: 9, y: 5 });
  });

  it("a miner works plain rock, then moves on to gold-veined rock when it's gone", () => {
    const state = createGameWithoutWaves();
    placeResource(state, 12, 5, "rock", 1);
    const perHit = 3;
    placeResource(state, 16, 5, "goldRock", perHit * hitsFor("goldRock", "miner"));
    spawnUnit(state, "miner", 1, 10, 5);

    until(state, () => resourceAt(state, 12, 5) === null, work("rock") + 20 * TICK_RATE);
    const gold = goldOf(state);
    until(state, () => resourceAt(state, 16, 5)!.workLeft < work("goldRock"));
    expect(goldOf(state)).toBe(gold + perHit);
  });

  it("stands still with nothing it can reach, and sets off once something can be reached", () => {
    const state = createGameWithoutWaves();
    buildAt(state, ring(8, 3, 12, 7));
    const worker = spawnUnit(state, "lumberjack", 1, 10, 5)!;
    placeResource(state, 20, 5, "tree", 100);
    run(state, 3 * TICK_RATE);
    expect({ x: worker.x, y: worker.y }).toEqual({ x: 10, y: 5 });

    sellAt(state, 12, 5);
    until(state, () => resourceAt(state, 20, 5)!.workLeft < work("tree"));
  });

  it("never attacks an enemy, and a goblin stops to kill one beside its path", () => {
    const state = createGameWithoutWaves();
    const p = { x: state.keeps[0].x - 20, y: state.keeps[0].y + 1 };
    placeResource(state, p.x + 3, p.y - 2, "tree", 100);
    const worker = spawnUnit(state, "lumberjack", 1, p.x + 3, p.y - 1)!;
    const enemy = dummy(state, p.x + 4, p.y - 1);
    run(state, 2 * chopTicks);
    expect(enemy.hp).toBe(1000);

    spawnEnemy(state, p.x, p.y);
    until(state, () => !state.units.includes(worker), 30 * TICK_RATE);
  });
});

describe("spawner doors", () => {
  it("are the tile the spawner faces, else the next open one clockwise, else none", () => {
    const state = createGameWithoutWaves();
    const yard = placeStructure(state, "timberYard", 10, 10, "E", 1);
    expect(spawnTileOf(state, yard)).toEqual({ x: 11, y: 10 });
    buildAt(state, [{ x: 11, y: 10 }]);
    expect(spawnTileOf(state, yard)).toEqual({ x: 10, y: 11 }); // south is next clockwise
    buildAt(state, [
      { x: 10, y: 11 },
      { x: 9, y: 10 },
      { x: 10, y: 9 },
    ]);
    expect(spawnTileOf(state, yard)).toBeNull();
  });

  it("every spawner is placed facing a way, so a timber yard facing west sends workers west", () => {
    for (const [kind, stats] of Object.entries(STRUCTURES) as [string, StructureStats][]) {
      if (stats.spawner) expect(stats.directional, kind).toBe(true);
    }
    const state = createGameWithoutWaves();
    expect(
      applyCommand(state, 1, { type: "build", kind: "timberYard", x: 10, y: 10, facing: "W" }),
    ).toEqual({ ok: true });
    Object.values(state.structures)[0].buildLeft = 0; // skip the build time out here
    tick(state);
    expect(state.units[0]).toMatchObject({ kind: "lumberjack", x: 9, y: 10 });
  });
});
