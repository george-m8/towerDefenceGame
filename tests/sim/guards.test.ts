import { describe, expect, it } from "vitest";
import {
  ENEMY_KINDS,
  STRUCTURES,
  TICK_RATE,
  UNIT_KINDS,
  type StructureStats,
} from "../../src/sim/config";
import { spawnEnemy } from "../../src/sim/enemies";
import { applyCommand, createGame, tick } from "../../src/sim/game";
import { canBuild, placeStructure } from "../../src/sim/grid";
import { guardSpotOf, guardSpots } from "../../src/sim/guards";
import { spawnUnit } from "../../src/sim/units";
import { toolsInTab } from "../../src/ui/state";
import type { GameState } from "../../src/sim/types";
import { buildAt, column, createGameWithoutWaves } from "./helpers";

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

  it("are placed facing a direction, from the Units tab", () => {
    const state = createGameWithoutWaves();
    for (const [kind] of buildings) {
      const stats: StructureStats = STRUCTURES[kind];
      expect(stats.directional).toBe(true);
      expect(toolsInTab("units").map((t) => t.tool)).toContain(kind);
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

describe("archers", () => {
  const archer = UNIT_KINDS.archer;

  function post(state: GameState) {
    const building = placeStructure(state, "archeryPost", 10, 10, "E", 1);
    building.cooldown = Infinity; // no more archers of its own: just the one placed here
    return spawnUnit(state, "archer", 1, 11, 10, building.id)!;
  }

  it("shoot an enemy in range from their spot, with an arrow and a hit sound", () => {
    const state = createGameWithoutWaves();
    const unit = post(state);
    const enemy = spawnEnemy(state, 11 + archer.range, 10, { hp: 1000 });
    enemy.speed = 0;

    tick(state);

    expect(enemy.hp).toBe(1000 - archer.damage);
    expect(state.effects).toContainEqual(
      expect.objectContaining({
        kind: "shot",
        fromX: 11,
        fromY: 10,
        toX: enemy.x,
        toY: enemy.y,
        projectile: archer.projectile,
      }),
    );
    expect(state.cues.some((c) => c.kind === "enemyHit")).toBe(true);
    expect({ x: unit.x, y: unit.y }).toEqual({ x: 11, y: 10 });
  });

  it("never leave their spot, even for an enemy just out of range", () => {
    const state = createGameWithoutWaves();
    const unit = post(state);
    const enemy = spawnEnemy(state, 11 + archer.range + 2, 10);
    enemy.speed = 0;
    run(state, 5 * TICK_RATE);
    expect({ x: unit.x, y: unit.y }).toEqual({ x: 11, y: 10 });
    expect(enemy.hp).toBe(enemy.maxHp);
  });

  it("in PvP, shoot a rival's units in range but never their own side's", () => {
    const state = createGame(1, { blankMap: true, mode: "pvp", players: ["Ann", "Bo"] });
    const p = { x: Math.floor(state.width / 2), y: 5 };
    spawnUnit(state, "archer", 1, p.x, p.y);
    const rival = spawnUnit(state, "militia", 2, p.x + 3, p.y)!;
    const friend = spawnUnit(state, "militia", 1, p.x - 2, p.y)!;
    tick(state);
    expect(rival.hp).toBe(rival.maxHp - archer.damage);
    expect(friend.hp).toBe(friend.maxHp);
  });
});

describe("checkpoint A", () => {
  it("paladins hold a gap in the wall with archers behind them, and the goblins die there", () => {
    const state = createGameWithoutWaves();
    const keep = state.keeps[0];
    const gap = { x: keep.x - 12, y: keep.y + 1 };
    buildAt(state, column(state, gap.x, [gap.y]));
    placeStructure(state, "paladinHall", gap.x + 2, gap.y, "W", 1);
    placeStructure(state, "archeryPost", gap.x + 4, gap.y - 2, "W", 1);
    const { quota, intervalSeconds } = STRUCTURES.paladinHall.spawner;
    run(state, quota * intervalSeconds * TICK_RATE); // both buildings fill up and take their spots

    const goblins = Array.from({ length: 6 }, (_, i) => spawnEnemy(state, gap.x - 8 - i, gap.y));
    for (let i = 0; i < 90 * TICK_RATE && goblins.some((g) => state.enemies.includes(g)); i++) {
      tick(state);
    }

    expect(goblins.filter((g) => state.enemies.includes(g))).toEqual([]);
    expect(keep.hp).toBe(keep.maxHp);
    expect(state.units.filter((u) => u.kind === "paladin")).toHaveLength(quota);
    expect(state.units.every((u) => u.x > gap.x - 2)).toBe(true); // nobody wandered off
  });
});

describe("performance", () => {
  // Spec target: a tick under 50 ms, measured standalone. Here: the median within it, and the
  // 95th percentile within a loose bound, since other test files share the CPU.
  it("keeps a tick quick with 30 guard buildings (90 guards) and 200 enemies on an XL map", () => {
    const state = createGame(3, { size: "XL", fog: false });
    state.wave.countdown = Infinity;
    const kinds = ["guardhouse", "archeryPost", "paladinHall"] as const;
    let built = 0;
    for (let y = 4; y < state.height - 4 && built < 30; y += 6) {
      for (let x = 10; x < state.keeps[0].x - 6 && built < 30; x += 12) {
        const kind = kinds[built % 3];
        if (!canBuild(state, 1, kind, x, y).ok) continue;
        placeStructure(state, kind, x, y, "W", 1);
        built++;
      }
    }
    run(state, 3 * STRUCTURES.guardhouse.spawner.intervalSeconds * TICK_RATE); // all 90 out
    expect(state.units.length).toBeGreaterThanOrEqual(80);
    applyCommand(state, 1, { type: "debugSpawn", count: 200 });
    tick(state); // warm-up
    const times: number[] = [];
    for (let i = 0; i < 60; i++) {
      const start = performance.now();
      tick(state);
      times.push(performance.now() - start);
    }
    times.sort((a, b) => a - b);
    expect(times[30]).toBeLessThan(50);
    expect(times[57]).toBeLessThan(250);
  });
});
