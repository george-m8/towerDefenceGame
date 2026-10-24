import { describe, expect, it } from "vitest";
import { STRUCTURES, TICK_RATE } from "../../src/sim/config";
import { spawnEnemy } from "../../src/sim/enemies";
import { applyCommand } from "../../src/sim/game";
import { placeStructure, topAt } from "../../src/sim/grid";
import { updateTowers } from "../../src/sim/towers";
import { createGameWithoutWaves } from "./helpers";

const ARCHER = STRUCTURES.archer.tower;
const TOUGH = 10_000;

describe("archer targeting", () => {
  it("hits an enemy exactly at max range but not just beyond it", () => {
    const state = createGameWithoutWaves();
    placeStructure(state, "archer", 10, 10, "E");
    const inRange = spawnEnemy(state, 10 + ARCHER.range, 10, TOUGH);
    const outOfRange = spawnEnemy(state, 10 + ARCHER.range + 0.1, 10, TOUGH);
    updateTowers(state);
    expect(inRange.hp).toBe(TOUGH - ARCHER.damage);
    expect(outOfRange.hp).toBe(TOUGH);
  });

  it("targets the in-range enemy closest to the keep by path distance", () => {
    const state = createGameWithoutWaves();
    const { keep } = state;
    const y = keep.y + 1;
    // North of both enemies and facing south, so both are inside its arc.
    placeStructure(state, "archer", keep.x - 6, y - 4, "S");
    const far = spawnEnemy(state, keep.x - 8, y, TOUGH);
    const near = spawnEnemy(state, keep.x - 4, y, TOUGH);
    updateTowers(state);
    expect(near.hp).toBe(TOUGH - ARCHER.damage);
    expect(far.hp).toBe(TOUGH);
  });

  it("fires at most once per fire interval", () => {
    const state = createGameWithoutWaves();
    placeStructure(state, "archer", 10, 10, "E");
    const enemy = spawnEnemy(state, 12, 10, TOUGH);
    const interval = ARCHER.fireIntervalSeconds * TICK_RATE;
    for (let i = 0; i < interval; i++) updateTowers(state);
    expect(enemy.hp).toBe(TOUGH - ARCHER.damage);
    updateTowers(state);
    expect(enemy.hp).toBe(TOUGH - 2 * ARCHER.damage);
  });

  it("does not waste its shot when no enemy is in range", () => {
    const state = createGameWithoutWaves();
    placeStructure(state, "archer", 10, 10, "E");
    updateTowers(state);
    const enemy = spawnEnemy(state, 12, 10, TOUGH);
    updateTowers(state);
    expect(enemy.hp).toBe(TOUGH - ARCHER.damage);
  });

  it("records a shot effect for the renderer", () => {
    const state = createGameWithoutWaves();
    placeStructure(state, "archer", 10, 10, "E");
    spawnEnemy(state, 12, 10, TOUGH);
    updateTowers(state);
    expect(state.effects).toContainEqual(
      expect.objectContaining({ kind: "shot", fromX: 10, fromY: 10, toX: 12, toY: 10 }),
    );
  });
});

describe("cannon and catapult", () => {
  it("splash damages every enemy within the radius of the target, and no others", () => {
    const state = createGameWithoutWaves();
    const cannon = STRUCTURES.cannon.tower;
    placeStructure(state, "cannon", 10, 10, "E");
    // All three are equally close to the keep; the first spawned is the target.
    const target = spawnEnemy(state, 12, 10, TOUGH);
    const neighbour = spawnEnemy(state, 11, 11, TOUGH); // diagonal, within radius 1
    const outside = spawnEnemy(state, 10, 12, TOUGH); // 2 tiles from the target
    updateTowers(state);
    expect(target.hp).toBe(TOUGH - cannon.damage);
    expect(neighbour.hp).toBe(TOUGH - cannon.damage);
    expect(outside.hp).toBe(TOUGH);
    expect(state.effects).toContainEqual(
      expect.objectContaining({ kind: "splash", x: 12, y: 10, radius: cannon.splashRadius }),
    );
  });

  it("the catapult never targets enemies inside its minimum range", () => {
    const state = createGameWithoutWaves();
    const catapult = STRUCTURES.catapult.tower;
    placeStructure(state, "catapult", 10, 10);
    const tooClose = spawnEnemy(state, 10 + catapult.minRange - 1, 10, TOUGH);
    updateTowers(state);
    expect(tooClose.hp).toBe(TOUGH);

    const atMinRange = spawnEnemy(state, 10, 10 - catapult.minRange, TOUGH);
    updateTowers(state);
    expect(atMinRange.hp).toBe(TOUGH - catapult.damage);
  });

  it.each(["archer", "cannon", "catapult"] as const)("%s respects its fire interval", (kind) => {
    const state = createGameWithoutWaves();
    const tower = STRUCTURES[kind].tower;
    placeStructure(state, kind, 10, 10, "S");
    const enemy = spawnEnemy(state, 10, 14, TOUGH); // 4 tiles: in range of all three
    for (let i = 0; i < tower.fireIntervalSeconds * TICK_RATE; i++) updateTowers(state);
    expect(enemy.hp).toBe(TOUGH - tower.damage);
    updateTowers(state);
    expect(enemy.hp).toBe(TOUGH - 2 * tower.damage);
  });
});

describe("facing and arcs", () => {
  it("records the facing every tower was built with, and turning towers aim along it", () => {
    const state = createGameWithoutWaves();
    applyCommand(state, { type: "build", kind: "archer", x: 10, y: 10, facing: "E" });
    applyCommand(state, { type: "build", kind: "cannon", x: 12, y: 10, facing: "S" });
    expect(topAt(state, 10, 10)?.facing).toBe("E");
    expect(topAt(state, 12, 10)?.facing).toBe("S");
    expect(topAt(state, 12, 10)?.aim).toBe(180);
    expect(topAt(state, 10, 10)?.aim).toBeUndefined(); // fixed towers never turn
  });

  it("an archer only fires inside its arc, even at a less urgent target", () => {
    const state = createGameWithoutWaves();
    const { keep } = state;
    const y = keep.y + 1;
    const towerX = keep.x + keep.size + 6; // east of the keep
    placeStructure(state, "archer", towerX, y, "E");
    const west = spawnEnemy(state, towerX - 2, y, TOUGH); // closer to the keep, but behind
    const east = spawnEnemy(state, towerX + 2, y, TOUGH);
    updateTowers(state);
    expect(east.hp).toBe(TOUGH - ARCHER.damage);
    expect(west.hp).toBe(TOUGH);
  });

  it("an enemy exactly on the arc edge counts as inside", () => {
    const state = createGameWithoutWaves();
    placeStructure(state, "archer", 10, 10, "E");
    const onEdge = spawnEnemy(state, 12, 8, TOUGH); // 45 degrees off the facing
    updateTowers(state);
    expect(onEdge.hp).toBe(TOUGH - ARCHER.damage);
  });
});
