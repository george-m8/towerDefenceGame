import { describe, expect, it } from "vitest";
import { ENEMY_KINDS, TICK_RATE, UNIT_KINDS, type UnitKind } from "../../src/sim/config";
import { spawnEnemy } from "../../src/sim/enemies";
import { applyCommand, tick } from "../../src/sim/game";
import { placeStructure } from "../../src/sim/grid";
import { damageUnit, spawnUnit } from "../../src/sim/units";
import type { Enemy, GameState } from "../../src/sim/types";
import { createGameWithoutWaves, goldOf, paintTerrain } from "./helpers";

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
