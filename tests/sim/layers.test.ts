import { describe, expect, it } from "vitest";
import { createGame } from "../../src/sim/game";
import {
  attackTargetAt,
  baseAt,
  blocksAt,
  isElevated,
  isKeepTile,
  mountAt,
  placeStructure,
  topAt,
} from "../../src/sim/grid";

describe("layer data model", () => {
  it("starts with ground terrain, the keep in the base layer and no mounts", () => {
    const state = createGame(1);
    expect(state).not.toHaveProperty("tiles");
    expect(state.terrain.every((t) => t === "ground")).toBe(true);
    expect(state.mount.every((id) => id === 0)).toBe(true);
    expect(isKeepTile(state, state.keep.x, state.keep.y)).toBe(true);
  });

  it("puts walls, spikes and houses in the base layer", () => {
    const state = createGame(1);
    for (const [i, kind] of (["wall", "wallSpikes", "floorSpikes", "house"] as const).entries()) {
      const s = placeStructure(state, kind, 5 + i, 5);
      expect(baseAt(state, 5 + i, 5)).toBe(s);
      expect(mountAt(state, 5 + i, 5)).toBeUndefined();
      expect(topAt(state, 5 + i, 5)).toBe(s);
    }
  });

  it("puts towers on open ground in the mount layer", () => {
    const state = createGame(1);
    for (const [i, kind] of (["archer", "cannon", "catapult"] as const).entries()) {
      const tower = placeStructure(state, kind, 5 + i, 5);
      expect(mountAt(state, 5 + i, 5)).toBe(tower);
      expect(baseAt(state, 5 + i, 5)).toBeUndefined();
      expect(isElevated(state, tower)).toBe(false);
    }
  });
});

describe("blocksAt and attackTargetAt", () => {
  it("open ground, floor spikes and the keep don't block", () => {
    const state = createGame(1);
    placeStructure(state, "floorSpikes", 5, 5);
    expect(blocksAt(state, 4, 4)).toBe(false);
    expect(blocksAt(state, 5, 5)).toBe(false);
    expect(blocksAt(state, state.keep.x, state.keep.y)).toBe(false);
    expect(attackTargetAt(state, 5, 5)).toBeUndefined();
  });

  it("a wall blocks and is the attack target", () => {
    const state = createGame(1);
    const wall = placeStructure(state, "wall", 5, 5);
    expect(blocksAt(state, 5, 5)).toBe(true);
    expect(attackTargetAt(state, 5, 5)).toBe(wall);
  });

  it("a ground tower blocks and is the attack target", () => {
    const state = createGame(1);
    const archer = placeStructure(state, "archer", 5, 5);
    expect(blocksAt(state, 5, 5)).toBe(true);
    expect(attackTargetAt(state, 5, 5)).toBe(archer);
  });

  it("a wall-mounted tower is elevated, and its wall is the attack target", () => {
    const state = createGame(1);
    const wall = placeStructure(state, "wall", 5, 5);
    const archer = placeStructure(state, "archer", 5, 5);
    expect(baseAt(state, 5, 5)).toBe(wall);
    expect(mountAt(state, 5, 5)).toBe(archer);
    expect(topAt(state, 5, 5)).toBe(archer);
    expect(isElevated(state, archer)).toBe(true);
    expect(attackTargetAt(state, 5, 5)).toBe(wall);
  });

  it("out of bounds tiles have no layers", () => {
    const state = createGame(1);
    expect(topAt(state, -1, 0)).toBeUndefined();
    expect(blocksAt(state, -1, 0)).toBe(false);
  });
});
