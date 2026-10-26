import { describe, expect, it } from "vitest";
import { DEBUG_DAMAGE, RESOURCES, TICK_RATE } from "../../src/sim/config";
import { spawnEnemy } from "../../src/sim/enemies";
import { applyCommand, tick } from "../../src/sim/game";
import { baseAt, mountAt, placeStructure, terrainAt } from "../../src/sim/grid";
import { placeResource, resourceAt } from "../../src/sim/resources";
import { isDebugCommand, type GameState } from "../../src/sim/types";
import { spawnUnit } from "../../src/sim/units";
import { createGameWithoutWaves, goldOf } from "./helpers";

const damage = (state: GameState, x: number, y: number) =>
  applyCommand(state, 1, { type: "debugDamage", x, y });

/** Clicks needed to take something from full to 0 (35% a click: 3 leave 5%, the 4th). */
const CLICKS_TO_DESTROY = Math.ceil(1 / DEBUG_DAMAGE);

describe("the debug Damage tool", () => {
  it("is a debug command (refused online)", () => {
    expect(isDebugCommand({ type: "debugDamage", x: 0, y: 0 })).toBe(true);
  });

  it("takes 35% of full HP off a structure each click, and destroys it at 0", () => {
    const state = createGameWithoutWaves();
    const wall = placeStructure(state, "wall", 5, 5);
    expect(damage(state, 5, 5)).toEqual({ ok: true });
    expect(wall.hp).toBeCloseTo(wall.maxHp * (1 - DEBUG_DAMAGE));
    for (let i = 1; i < CLICKS_TO_DESTROY - 1; i++) damage(state, 5, 5);
    expect(baseAt(state, 5, 5)).toBe(wall);
    damage(state, 5, 5);
    expect(baseAt(state, 5, 5)).toBeUndefined();
    expect(state.effects.some((e) => e.kind === "burst")).toBe(true);
  });

  it("hits the tower before the wall under it; the tower falls with its wall", () => {
    const state = createGameWithoutWaves();
    const wall = placeStructure(state, "wall", 5, 5);
    const tower = placeStructure(state, "archer", 5, 5);
    damage(state, 5, 5);
    expect(tower.hp).toBeLessThan(tower.maxHp);
    expect(wall.hp).toBe(wall.maxHp);
    for (let i = 1; i < CLICKS_TO_DESTROY; i++) damage(state, 5, 5);
    expect(mountAt(state, 5, 5)).toBeUndefined();
    expect(baseAt(state, 5, 5)).toBe(wall);
  });

  it("kills an enemy or unit at 0 straight away, paying nobody", () => {
    const state = createGameWithoutWaves();
    const gold = goldOf(state);
    const enemy = spawnEnemy(state, 6, 6);
    damage(state, 6, 6);
    expect(enemy.hp).toBeCloseTo(enemy.maxHp * (1 - DEBUG_DAMAGE));
    for (let i = 1; i < CLICKS_TO_DESTROY; i++) damage(state, 6, 6);
    expect(state.enemies).not.toContain(enemy);
    expect(goldOf(state)).toBe(gold);
    spawnUnit(state, "militia", 1, 8, 8);
    for (let i = 0; i < CLICKS_TO_DESTROY; i++) damage(state, 8, 8);
    expect(state.units).toHaveLength(0);
  });

  it("brings the keep down, ending the game (unless its health is infinite)", () => {
    const state = createGameWithoutWaves();
    const keep = state.keeps[0];
    damage(state, keep.x, keep.y);
    expect(keep.hp).toBeCloseTo(keep.maxHp * (1 - DEBUG_DAMAGE));
    for (let i = 1; i < CLICKS_TO_DESTROY; i++) damage(state, keep.x, keep.y);
    expect(keep.hp).toBe(0);
    tick(state);
    expect(state.gameOver).toBe(true);

    const safe = createGameWithoutWaves();
    safe.debug.infiniteKeep = true;
    damage(safe, safe.keeps[0].x, safe.keeps[0].y);
    expect(safe.keeps[0].hp).toBe(safe.keeps[0].maxHp);
  });

  it("uses up 35% of a resource each click, leaving ground at the end, paying nobody", () => {
    const state = createGameWithoutWaves();
    const gold = goldOf(state);
    placeResource(state, 4, 4, "tree", 10);
    const full = RESOURCES.tree.seconds * TICK_RATE;
    damage(state, 4, 4);
    expect(resourceAt(state, 4, 4)!.workLeft).toBe(full - Math.round(full * DEBUG_DAMAGE));
    for (let i = 1; i < CLICKS_TO_DESTROY; i++) damage(state, 4, 4);
    expect(resourceAt(state, 4, 4)).toBeNull();
    expect(terrainAt(state, 4, 4)).toBe("ground");
    expect(goldOf(state)).toBe(gold);
  });

  it("says so when there's nothing there", () => {
    const state = createGameWithoutWaves();
    expect(damage(state, 2, 2)).toEqual({ ok: false, reason: "Nothing to damage there" });
  });
});
