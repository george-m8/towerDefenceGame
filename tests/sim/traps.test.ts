import { describe, expect, it } from "vitest";
import { ENEMY, STRUCTURES, TICK_RATE } from "../../src/sim/config";
import { spawnEnemy } from "../../src/sim/enemies";
import { applyCommand, tick } from "../../src/sim/game";
import { placeStructure, topAt } from "../../src/sim/grid";
import { getFlowField, nextStep } from "../../src/sim/pathfinding";
import { updateTraps } from "../../src/sim/traps";
import { createGameWithoutWaves } from "./helpers";

const TOUGH = 10_000;
const FLOOR = STRUCTURES.floorSpikes.trap;
const floorInterval = FLOOR.fireIntervalSeconds * TICK_RATE;

function runTraps(state: Parameters<typeof updateTraps>[0], times: number) {
  for (let i = 0; i < times; i++) updateTraps(state);
}

describe("floor spikes", () => {
  it("fire on a fixed cycle from when they are built", () => {
    const state = createGameWithoutWaves();
    placeStructure(state, "floorSpikes", 10, 10);
    const enemy = spawnEnemy(state, 10, 10, TOUGH);
    runTraps(state, floorInterval - 1);
    expect(enemy.hp).toBe(TOUGH);
    runTraps(state, 1);
    expect(enemy.hp).toBe(TOUGH - FLOOR.damage);
    runTraps(state, floorInterval);
    expect(enemy.hp).toBe(TOUGH - 2 * FLOOR.damage);
    expect(state.effects).toContainEqual(expect.objectContaining({ kind: "spikes", x: 10, y: 10 }));
  });

  it("hit every enemy on their own tile and none beside it", () => {
    const state = createGameWithoutWaves();
    placeStructure(state, "floorSpikes", 10, 10);
    const a = spawnEnemy(state, 10, 10, TOUGH);
    const b = spawnEnemy(state, 10, 10, TOUGH);
    const beside = spawnEnemy(state, 11, 10, TOUGH);
    runTraps(state, floorInterval);
    expect(a.hp).toBe(TOUGH - FLOOR.damage);
    expect(b.hp).toBe(TOUGH - FLOOR.damage);
    expect(beside.hp).toBe(TOUGH);
  });

  it("do not change enemy routing", () => {
    const state = createGameWithoutWaves();
    const before = [...getFlowField(state).dist];
    placeStructure(state, "floorSpikes", 10, state.keep.y + 1);
    expect(getFlowField(state).dist).toEqual(before);
  });

  it("are walked over and never attacked", () => {
    const state = createGameWithoutWaves();
    const y = state.keep.y + 1;
    for (let x = 5; x < 15; x++) placeStructure(state, "floorSpikes", x, y);
    spawnEnemy(state, 0, y, TOUGH);
    for (let i = 0; i < 600; i++) tick(state);
    expect(state.enemies).toHaveLength(0);
    expect(state.keep.hp).toBe(state.keep.maxHp - ENEMY.keepDamage);
    for (let x = 5; x < 15; x++) expect(topAt(state, x, y)?.kind).toBe("floorSpikes");
  });
});

describe("wall spikes", () => {
  const WALL = STRUCTURES.wallSpikes.trap;
  const wallInterval = WALL.fireIntervalSeconds * TICK_RATE;
  const offsets = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] } as const;

  it.each(["N", "E", "S", "W"] as const)(
    "facing %s hits only the faced adjacent tile",
    (facing) => {
      const state = createGameWithoutWaves();
      expect(
        applyCommand(state, { type: "build", kind: "wallSpikes", x: 10, y: 10, facing }),
      ).toEqual({
        ok: true,
      });
      const neighbours = Object.entries(offsets).map(([dir, [dx, dy]]) => ({
        dir,
        enemy: spawnEnemy(state, 10 + dx, 10 + dy, TOUGH),
      }));
      runTraps(state, wallInterval - 1);
      for (const { enemy } of neighbours) expect(enemy.hp).toBe(TOUGH);
      runTraps(state, 1);
      for (const { dir, enemy } of neighbours) {
        expect(enemy.hp).toBe(dir === facing ? TOUGH - WALL.damage : TOUGH);
      }
    },
  );

  it("defaults to facing north", () => {
    const state = createGameWithoutWaves();
    applyCommand(state, { type: "build", kind: "wallSpikes", x: 10, y: 10 });
    expect(topAt(state, 10, 10)?.facing).toBe("N");
  });

  it("blocks movement like a wall", () => {
    const state = createGameWithoutWaves();
    const y = state.keep.y + 1;
    placeStructure(state, "wallSpikes", 10, y, "E");
    expect(nextStep(state, 9, y)).not.toEqual({ x: 10, y });
  });
});
