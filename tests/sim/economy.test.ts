import { describe, expect, it } from "vitest";
import { ENEMY, STRUCTURES, TICK_RATE } from "../../src/sim/config";
import { incomePerMinute } from "../../src/sim/economy";
import { spawnEnemy } from "../../src/sim/enemies";
import { applyCommand, tick } from "../../src/sim/game";
import { placeStructure, removeStructure, structureAt } from "../../src/sim/grid";
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

describe("selling", () => {
  it("removes the structure and refunds half its cost at full HP", () => {
    const state = createGameWithoutWaves();
    placeStructure(state, "archer", 10, 10);
    const gold = state.gold;
    expect(applyCommand(state, { type: "sell", x: 10, y: 10 })).toEqual({ ok: true });
    expect(structureAt(state, 10, 10)).toBeUndefined();
    expect(state.gold).toBe(gold + Math.floor(STRUCTURES.archer.cost * 0.5));
  });

  it("refunds proportionally less for damaged structures", () => {
    const state = createGameWithoutWaves();
    const archer = placeStructure(state, "archer", 10, 10);
    archer.hp = archer.maxHp / 2;
    const gold = state.gold;
    applyCommand(state, { type: "sell", x: 10, y: 10 });
    expect(state.gold).toBe(gold + Math.floor(STRUCTURES.archer.cost * 0.5 * 0.5));
  });

  it("always refunds half for floor spikes, which have no HP", () => {
    const state = createGameWithoutWaves();
    placeStructure(state, "floorSpikes", 10, 10);
    const gold = state.gold;
    applyCommand(state, { type: "sell", x: 10, y: 10 });
    expect(state.gold).toBe(gold + Math.floor(STRUCTURES.floorSpikes.cost * 0.5));
  });

  it("rejects selling the keep or an empty tile", () => {
    const state = createGameWithoutWaves();
    expect(applyCommand(state, { type: "sell", x: state.keep.x, y: state.keep.y })).toEqual({
      ok: false,
      reason: "Can't sell the keep",
    });
    expect(applyCommand(state, { type: "sell", x: 3, y: 3 })).toEqual({
      ok: false,
      reason: "Nothing to sell",
    });
  });

  it("lets enemies reroute through the gap", () => {
    const state = createGameWithoutWaves();
    const version = state.gridVersion;
    placeStructure(state, "wall", 10, 10);
    applyCommand(state, { type: "sell", x: 10, y: 10 });
    expect(state.gridVersion).toBe(version + 2);
  });
});
