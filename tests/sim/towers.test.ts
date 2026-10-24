import { describe, expect, it } from "vitest";
import { STRUCTURES, TICK_RATE } from "../../src/sim/config";
import { spawnEnemy } from "../../src/sim/enemies";
import { placeStructure } from "../../src/sim/grid";
import { updateTowers } from "../../src/sim/towers";
import { createGameWithoutWaves } from "./helpers";

const ARCHER = STRUCTURES.archer.tower;
const TOUGH = 10_000;

describe("archer targeting", () => {
  it("hits an enemy exactly at max range but not just beyond it", () => {
    const state = createGameWithoutWaves();
    placeStructure(state, "archer", 10, 10);
    const inRange = spawnEnemy(state, 10 + ARCHER.range, 10, TOUGH);
    const outOfRange = spawnEnemy(state, 10, 10 + ARCHER.range + 0.1, TOUGH);
    updateTowers(state);
    expect(inRange.hp).toBe(TOUGH - ARCHER.damage);
    expect(outOfRange.hp).toBe(TOUGH);
  });

  it("targets the in-range enemy closest to the keep by path distance", () => {
    const state = createGameWithoutWaves();
    const { keep } = state;
    const y = keep.y + 1;
    placeStructure(state, "archer", keep.x - 6, y - 1);
    const far = spawnEnemy(state, keep.x - 8, y, TOUGH);
    const near = spawnEnemy(state, keep.x - 4, y, TOUGH);
    updateTowers(state);
    expect(near.hp).toBe(TOUGH - ARCHER.damage);
    expect(far.hp).toBe(TOUGH);
  });

  it("fires at most once per fire interval", () => {
    const state = createGameWithoutWaves();
    placeStructure(state, "archer", 10, 10);
    const enemy = spawnEnemy(state, 12, 10, TOUGH);
    const interval = ARCHER.fireIntervalSeconds * TICK_RATE;
    for (let i = 0; i < interval; i++) updateTowers(state);
    expect(enemy.hp).toBe(TOUGH - ARCHER.damage);
    updateTowers(state);
    expect(enemy.hp).toBe(TOUGH - 2 * ARCHER.damage);
  });

  it("does not waste its shot when no enemy is in range", () => {
    const state = createGameWithoutWaves();
    placeStructure(state, "archer", 10, 10);
    updateTowers(state);
    const enemy = spawnEnemy(state, 12, 10, TOUGH);
    updateTowers(state);
    expect(enemy.hp).toBe(TOUGH - ARCHER.damage);
  });

  it("records a shot effect for the renderer", () => {
    const state = createGameWithoutWaves();
    placeStructure(state, "archer", 10, 10);
    spawnEnemy(state, 12, 10, TOUGH);
    updateTowers(state);
    expect(state.effects).toContainEqual(
      expect.objectContaining({ kind: "shot", fromX: 10, fromY: 10, toX: 12, toY: 10 }),
    );
  });
});
