import { describe, expect, it } from "vitest";
import { STRUCTURES, TICK_RATE, UNIT_KINDS } from "../../src/sim/config";
import { isExplored } from "../../src/sim/fog";
import { spawnEnemy } from "../../src/sim/enemies";
import { applyCommand, createGame, tick } from "../../src/sim/game";
import { canBuild, placeStructure } from "../../src/sim/grid";
import { spawnTileOf, spawnUnit } from "../../src/sim/units";
import type { GameState } from "../../src/sim/types";
import { buildAt, column, createGameWithoutWaves, ring } from "./helpers";

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

describe("PvP siege", () => {
  /** A PvP map with no fog (so Bo's keep is known) and an attacker of Ann's near it. */
  function siege(kind: "soldier" | "ranger" = "soldier") {
    const state = createGame(1, {
      blankMap: true,
      fog: false,
      mode: "pvp",
      players: ["Ann", "Bo"],
    });
    const keep = state.keeps[1];
    const unit = spawnUnit(state, kind, 1, keep.x - 10, keep.y + 1)!;
    return { state, keep, unit };
  }

  function until(state: GameState, done: () => boolean, limit = 90 * TICK_RATE) {
    for (let i = 0; i < limit && !done(); i++) tick(state);
    expect(done()).toBe(true);
  }

  /** Bo's walls in a ring two tiles out from her keep, one of them weak. */
  function ring2(state: GameState, keep: { x: number; y: number; size: number }) {
    const walls = ring(keep.x - 2, keep.y - 2, keep.x + keep.size + 1, keep.y + keep.size + 1).map(
      (p) => placeStructure(state, "wall", p.x, p.y, "N", 2),
    );
    for (const wall of walls) wall.hp = wall.maxHp = 400;
    // The middle of the bottom side: off the attacker's straight line, and it opens inwards.
    const weak = walls.find((w) => w.x === keep.x + 1 && w.y === keep.y + keep.size + 1)!;
    weak.hp = 5;
    return { walls, weak };
  }

  it("soldiers march on a known rival keep and hit it", () => {
    const { state, keep } = siege();
    until(state, () => keep.hp < keep.maxHp);
  });

  it("they break through the weakest wall of a ring and get at the keep", () => {
    const { state, keep } = siege();
    const { walls, weak } = ring2(state, keep);
    until(state, () => keep.hp < keep.maxHp);
    expect(state.structures[weak.id]).toBeUndefined();
    expect(walls.filter((w) => w !== weak).every((w) => w.hp === 400)).toBe(true);
  });

  it("they hit the wall before the tower on it, and wrecking it pays the bounty", () => {
    const { state, keep, unit } = siege();
    const wall = placeStructure(state, "wall", unit.x + 1, unit.y, "N", 2);
    // Neutral walls fill the rest of the column, so the only way on is through Bo's wall.
    buildAt(state, column(state, unit.x + 1, [unit.y]));
    const tower = placeStructure(state, "archer", wall.x, wall.y, "W", 2);
    tower.hp = tower.maxHp = 1000;
    state.players[2].gold = 0;
    const gold = state.players[1].gold;
    until(state, () => !state.structures[wall.id]);
    expect(state.players[1].gold).toBeGreaterThan(gold);
    expect(keep.hp).toBe(keep.maxHp);
  });

  it("never hit their own side's buildings or neutral ruins", () => {
    const { state, unit } = siege();
    const own = ring(unit.x - 1, unit.y - 1, unit.x + 1, unit.y + 1).map((p) =>
      placeStructure(
        state,
        p.x === unit.x + 1 ? "ruin" : "wall",
        p.x,
        p.y,
        "N",
        p.x === unit.x + 1 ? null : 1,
      ),
    );
    run(state, 10 * TICK_RATE);
    expect(own.every((s) => state.structures[s.id] && s.hp === s.maxHp)).toBe(true);
  });
});

describe("performance", () => {
  // Spec target: a tick under 50 ms, measured standalone. Here: the median within it and the
  // 95th percentile within a loose bound, since other test files share the CPU.
  it("keeps a tick quick with 20 offensive buildings (about 60 units) and 200 enemies on XL", () => {
    const state = createGame(3, { size: "XL" });
    state.wave.countdown = Infinity;
    const kinds = ["scoutCamp", "barracks", "archeryRange"] as const;
    state.fog = false; // so they can go down anywhere; fog comes back on for the run
    let built = 0;
    for (let y = 6; y < state.height - 6 && built < 20; y += 8) {
      for (let x = state.keeps[0].x - 30; x < state.keeps[0].x + 30 && built < 20; x += 10) {
        const kind = kinds[built % 3];
        if (!canBuild(state, 1, kind, x, y).ok) continue;
        placeStructure(state, kind, x, y, "W", 1).buildLeft = 0;
        built++;
      }
    }
    expect(built).toBe(20);
    state.fog = true;
    run(state, 4 * 45 * TICK_RATE); // every building fills up
    expect(state.units.length).toBeGreaterThanOrEqual(50);
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
  }, 60_000);
});
