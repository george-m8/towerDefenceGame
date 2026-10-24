import { describe, expect, it } from "vitest";
import { ENEMY } from "../../src/sim/config";
import { spawnEnemy } from "../../src/sim/enemies";
import { tick } from "../../src/sim/game";
import { placeStructure } from "../../src/sim/grid";
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
