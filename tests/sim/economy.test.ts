import { describe, expect, it } from "vitest";
import { ENEMY_KINDS, STRUCTURES, TICK_RATE } from "../../src/sim/config";
import { incomePerMinute } from "../../src/sim/economy";
import { spawnEnemy } from "../../src/sim/enemies";
import { applyCommand, tick } from "../../src/sim/game";
import { baseAt, mountAt, placeStructure, removeStructure, topAt } from "../../src/sim/grid";
import { createGameWithoutWaves, goldOf } from "./helpers";

describe("bounties", () => {
  it("pays the enemy's bounty when a tower kills it", () => {
    const state = createGameWithoutWaves();
    placeStructure(state, "archer", 10, 10, "E", 1);
    spawnEnemy(state, 11, 10, { hp: 1, bounty: 7 });
    const gold = goldOf(state);
    tick(state);
    expect(state.enemies).toHaveLength(0);
    expect(goldOf(state)).toBe(gold + 7);
  });

  it("pays nothing when an enemy reaches the keep", () => {
    const state = createGameWithoutWaves();
    spawnEnemy(state, state.keeps[0].x - 1, state.keeps[0].y);
    const gold = goldOf(state);
    for (let i = 0; i < 40; i++) tick(state);
    expect(state.enemies).toHaveLength(0);
    expect(state.keeps[0].hp).toBe(state.keeps[0].maxHp - ENEMY_KINDS.goblin.damage);
    expect(goldOf(state)).toBe(gold);
  });
});

describe("house income", () => {
  const HOUSE = STRUCTURES.house.income;
  const interval = HOUSE.intervalSeconds * TICK_RATE;

  it("pays its income every interval after being built", () => {
    const state = createGameWithoutWaves();
    placeStructure(state, "house", 10, 10, "N", 1);
    const gold = goldOf(state);
    for (let i = 0; i < interval - 1; i++) tick(state);
    expect(goldOf(state)).toBe(gold);
    tick(state);
    expect(goldOf(state)).toBe(gold + HOUSE.gold);
    for (let i = 0; i < interval; i++) tick(state);
    expect(goldOf(state)).toBe(gold + 2 * HOUSE.gold);
  });

  it("pays nothing while paused", () => {
    const state = createGameWithoutWaves();
    placeStructure(state, "house", 10, 10);
    applyCommand(state, 1, { type: "togglePause" });
    const gold = goldOf(state);
    for (let i = 0; i < interval * 3; i++) tick(state);
    expect(goldOf(state)).toBe(gold);
  });

  it("stops paying once destroyed", () => {
    const state = createGameWithoutWaves();
    const house = placeStructure(state, "house", 10, 10);
    removeStructure(state, house);
    const gold = goldOf(state);
    for (let i = 0; i < interval * 2; i++) tick(state);
    expect(goldOf(state)).toBe(gold);
  });

  it("reports a player's total income per minute", () => {
    const state = createGameWithoutWaves();
    placeStructure(state, "house", 10, 10, "N", 1);
    placeStructure(state, "house", 12, 10, "N", 1);
    placeStructure(state, "house", 14, 10, "N", 2);
    expect(incomePerMinute(state, 1)).toBe(2 * HOUSE.gold * (60 / HOUSE.intervalSeconds));
  });
});

describe("selling", () => {
  it("removes the structure and refunds half its cost at full HP", () => {
    const state = createGameWithoutWaves();
    placeStructure(state, "archer", 10, 10);
    const gold = goldOf(state);
    expect(applyCommand(state, 1, { type: "sell", x: 10, y: 10 })).toEqual({ ok: true });
    expect(topAt(state, 10, 10)).toBeUndefined();
    expect(goldOf(state)).toBe(gold + Math.floor(STRUCTURES.archer.cost * 0.5));
  });

  it("refunds proportionally less for damaged structures", () => {
    const state = createGameWithoutWaves();
    const archer = placeStructure(state, "archer", 10, 10);
    archer.hp = archer.maxHp / 2;
    const gold = goldOf(state);
    applyCommand(state, 1, { type: "sell", x: 10, y: 10 });
    expect(goldOf(state)).toBe(gold + Math.floor(STRUCTURES.archer.cost * 0.5 * 0.5));
  });

  it("always refunds half for floor spikes, which have no HP", () => {
    const state = createGameWithoutWaves();
    placeStructure(state, "floorSpikes", 10, 10);
    const gold = goldOf(state);
    applyCommand(state, 1, { type: "sell", x: 10, y: 10 });
    expect(goldOf(state)).toBe(gold + Math.floor(STRUCTURES.floorSpikes.cost * 0.5));
  });

  it("rejects selling the keep or an empty tile", () => {
    const state = createGameWithoutWaves();
    expect(
      applyCommand(state, 1, { type: "sell", x: state.keeps[0].x, y: state.keeps[0].y }),
    ).toEqual({
      ok: false,
      reason: "Can't sell the keep",
    });
    expect(applyCommand(state, 1, { type: "sell", x: 3, y: 3 })).toEqual({
      ok: false,
      reason: "Nothing to sell",
    });
  });

  it("lets enemies reroute through the gap", () => {
    const state = createGameWithoutWaves();
    const version = state.gridVersion;
    placeStructure(state, "wall", 10, 10);
    applyCommand(state, 1, { type: "sell", x: 10, y: 10 });
    expect(state.gridVersion).toBe(version + 2);
  });
});

describe("selling across layers", () => {
  it("sells a wall-mounted tower first, then the wall", () => {
    const state = createGameWithoutWaves();
    placeStructure(state, "wall", 10, 10);
    placeStructure(state, "archer", 10, 10);
    const gold = goldOf(state);

    expect(applyCommand(state, 1, { type: "sell", x: 10, y: 10 })).toEqual({ ok: true });
    expect(goldOf(state)).toBe(gold + Math.floor(STRUCTURES.archer.cost * 0.5));
    expect(mountAt(state, 10, 10)).toBeUndefined();
    expect(baseAt(state, 10, 10)?.kind).toBe("wall");

    applyCommand(state, 1, { type: "sell", x: 10, y: 10 });
    expect(goldOf(state)).toBe(
      gold + Math.floor(STRUCTURES.archer.cost * 0.5) + Math.floor(STRUCTURES.wall.cost * 0.5),
    );
    expect(topAt(state, 10, 10)).toBeUndefined();
  });

  it("sells a ground tower in one click", () => {
    const state = createGameWithoutWaves();
    placeStructure(state, "cannon", 10, 10);
    const gold = goldOf(state);
    applyCommand(state, 1, { type: "sell", x: 10, y: 10 });
    expect(goldOf(state)).toBe(gold + Math.floor(STRUCTURES.cannon.cost * 0.5));
    expect(topAt(state, 10, 10)).toBeUndefined();
  });
});

describe("ruin salvage", () => {
  it("sells for its salvage value scaled by HP", () => {
    const state = createGameWithoutWaves();
    const ruin = placeStructure(state, "ruin", 10, 10);
    ruin.hp = ruin.maxHp / 2;
    const gold = goldOf(state);
    applyCommand(state, 1, { type: "sell", x: 10, y: 10 });
    expect(goldOf(state)).toBe(gold + Math.floor(STRUCTURES.ruin.salvageGold * 0.5));
    expect(topAt(state, 10, 10)).toBeUndefined();
  });
});

describe("treasure chests", () => {
  function withChest() {
    const state = createGameWithoutWaves();
    state.features.push({ kind: "chest", x: 10, y: 10, gold: 37 });
    return state;
  }

  it("pays its gold once when something is built on it, then disappears", () => {
    const state = withChest();
    const gold = goldOf(state);
    applyCommand(state, 1, { type: "build", kind: "wall", x: 10, y: 10 });
    expect(goldOf(state)).toBe(gold - STRUCTURES.wall.cost + 37);
    expect(state.features).toEqual([]);
    applyCommand(state, 1, { type: "sell", x: 10, y: 10 });
    applyCommand(state, 1, { type: "build", kind: "wall", x: 10, y: 10 });
    expect(goldOf(state)).toBe(gold - STRUCTURES.wall.cost + 37 + 2 - STRUCTURES.wall.cost);
  });

  it("is untouched by enemies walking over it", () => {
    const state = withChest();
    spawnEnemy(state, 8, 10);
    for (let i = 0; i < 100; i++) tick(state);
    expect(state.features).toHaveLength(1);
  });
});
