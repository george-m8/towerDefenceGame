import { describe, expect, it } from "vitest";
import { ENEMY, STRUCTURES, TICK_RATE } from "../../src/sim/config";
import { incomePerMinute } from "../../src/sim/economy";
import { spawnEnemy } from "../../src/sim/enemies";
import { applyCommand, tick } from "../../src/sim/game";
import { placeStructure, removeStructure } from "../../src/sim/grid";
import { createGameWithoutWaves } from "./helpers";

describe("bounties", () => {
  it("pays the enemy's bounty when a tower kills it", () => {
    const state = createGameWithoutWaves();
    placeStructure(state, "archer", 10, 10);
    spawnEnemy(state, 11, 10, 1, 7);
    const gold = state.gold;
    tick(state);
    expect(state.enemies).toHaveLength(0);
    expect(state.gold).toBe(gold + 7);
  });

  it("pays nothing when an enemy reaches the keep", () => {
    const state = createGameWithoutWaves();
    spawnEnemy(state, state.keep.x - 1, state.keep.y);
    const gold = state.gold;
    for (let i = 0; i < 40; i++) tick(state);
    expect(state.enemies).toHaveLength(0);
    expect(state.keep.hp).toBe(state.keep.maxHp - ENEMY.keepDamage);
    expect(state.gold).toBe(gold);
  });
});

describe("house income", () => {
  const HOUSE = STRUCTURES.house.income;
  const interval = HOUSE.intervalSeconds * TICK_RATE;

  it("pays its income every interval after being built", () => {
    const state = createGameWithoutWaves();
    placeStructure(state, "house", 10, 10);
    const gold = state.gold;
    for (let i = 0; i < interval - 1; i++) tick(state);
    expect(state.gold).toBe(gold);
    tick(state);
    expect(state.gold).toBe(gold + HOUSE.gold);
    for (let i = 0; i < interval; i++) tick(state);
    expect(state.gold).toBe(gold + 2 * HOUSE.gold);
  });

  it("pays nothing while paused", () => {
    const state = createGameWithoutWaves();
    placeStructure(state, "house", 10, 10);
    applyCommand(state, { type: "togglePause" });
    const gold = state.gold;
    for (let i = 0; i < interval * 3; i++) tick(state);
    expect(state.gold).toBe(gold);
  });

  it("stops paying once destroyed", () => {
    const state = createGameWithoutWaves();
    const house = placeStructure(state, "house", 10, 10);
    removeStructure(state, house);
    const gold = state.gold;
    for (let i = 0; i < interval * 2; i++) tick(state);
    expect(state.gold).toBe(gold);
  });

  it("reports total income per minute", () => {
    const state = createGameWithoutWaves();
    placeStructure(state, "house", 10, 10);
    placeStructure(state, "house", 12, 10);
    expect(incomePerMinute(state)).toBe(2 * HOUSE.gold * (60 / HOUSE.intervalSeconds));
  });
});
