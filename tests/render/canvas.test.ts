import { describe, expect, it } from "vitest";
import { blockHeight, enemyDrawRow, isDamagedWall } from "../../src/render/canvas";
import { placeStructure } from "../../src/sim/grid";
import { textureSpecks } from "../../src/render/textures";
import { FOG } from "../../src/render/palette";
import { RESOURCES } from "../../src/sim/config";
import { spawnEnemy } from "../../src/sim/enemies";
import { harvest, placeResource } from "../../src/sim/resources";
import { createGameWithoutWaves } from "../sim/helpers";

describe("enemy draw order", () => {
  it("draws an enemy with its own row", () => {
    const state = createGameWithoutWaves();
    expect(enemyDrawRow(state, spawnEnemy(state, 3, 4))).toBe(4);
    expect(enemyDrawRow(state, spawnEnemy(state, 3, 4.4))).toBe(4);
  });

  it("draws an enemy against the back of the keep in front of the keep, not under its top", () => {
    const state = createGameWithoutWaves();
    const keep = state.keeps[0];
    expect(enemyDrawRow(state, spawnEnemy(state, keep.x + 1, keep.y - 1))).toBe(keep.y);
  });
});

describe("keep height", () => {
  it("raises the keep's corners above its edges, with its middle much lower, under the fog", () => {
    const state = createGameWithoutWaves();
    const keep = state.keeps[0];
    const last = keep.size - 1;
    const centre = Math.floor(keep.size / 2);
    const corner = blockHeight(state, keep.x + last, keep.y);
    const edge = blockHeight(state, keep.x + 1, keep.y);
    const middle = blockHeight(state, keep.x + centre, keep.y + centre);
    expect(blockHeight(state, keep.x, keep.y + last)).toBe(corner);
    expect(corner).toBeGreaterThan(edge);
    expect(middle).toBeGreaterThan(0);
    expect(middle).toBeLessThan(edge / 2);
    expect(FOG.unexplored.height).toBeGreaterThan(corner);
  });
});

describe("ore height", () => {
  it("sinks as the ore is mined, to a sliver, then the tile is flat ground", () => {
    const state = createGameWithoutWaves();
    placeResource(state, 4, 4, "goldRock", 100);
    const full = blockHeight(state, 4, 4);
    const seconds = RESOURCES.goldRock.seconds;
    harvest(state, 4, 4, seconds / 2, null);
    const half = blockHeight(state, 4, 4);
    expect(half).toBeLessThan(full);
    expect(half).toBeGreaterThan(0);
    harvest(state, 4, 4, seconds / 2 - 1, null);
    expect(blockHeight(state, 4, 4)).toBe(1);
    harvest(state, 4, 4, seconds, null);
    expect(blockHeight(state, 4, 4)).toBe(0);
  });
});

describe("damaged walls", () => {
  it("past half their HP, walls sink a little (a tower on one too) and look cracked", () => {
    const state = createGameWithoutWaves();
    const wall = placeStructure(state, "wall", 5, 5);
    const full = blockHeight(state, 5, 5);
    wall.hp = wall.maxHp / 2;
    expect(isDamagedWall(wall)).toBe(false);
    expect(blockHeight(state, 5, 5)).toBe(full);
    wall.hp = wall.maxHp / 2 - 1;
    expect(isDamagedWall(wall)).toBe(true);
    expect(blockHeight(state, 5, 5)).toBe(full - 1);
    const onWall = blockHeight(state, 5, 5);
    placeStructure(state, "archer", 5, 5);
    expect(blockHeight(state, 5, 5)).toBeGreaterThan(onWall);
    const tower = blockHeight(state, 5, 5);
    wall.hp = wall.maxHp;
    expect(blockHeight(state, 5, 5)).toBe(tower + 1);
  });

  it("only walls: a damaged gate keeps its height", () => {
    const state = createGameWithoutWaves();
    const gate = placeStructure(state, "gate", 5, 5);
    gate.hp = 1;
    expect(isDamagedWall(gate)).toBe(false);
  });

  it("cracked stone is the stone blocks with more on top", () => {
    expect(textureSpecks("crackedStone", 0).length).toBeGreaterThan(
      textureSpecks("stone", 0).length,
    );
  });
});
