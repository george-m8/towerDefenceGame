import { describe, expect, it } from "vitest";
import { lightMap, lightSources, nightLight, type LightSource } from "../../src/render/lights";
import { LIGHTS } from "../../src/render/palette";
import { spawnUnit } from "../../src/sim/units";
import { UNIT_KINDS, type UnitKind } from "../../src/sim/config";
import { buildAt, createGameWithoutWaves, finishBuilding } from "../sim/helpers";

/** The light source at a tile's centre, if any. */
const sourceAt = (sources: LightSource[], x: number, y: number) =>
  sources.find((s) => s.x === x + 0.5 && s.y === y + 0.5);

describe("lightSources", () => {
  it("lights built structures by kind, and the keep", () => {
    const state = createGameWithoutWaves();
    const keep = state.keeps[0];
    buildAt(state, [{ x: keep.x - 4, y: keep.y }], "wall");
    buildAt(state, [{ x: keep.x - 6, y: keep.y }], "watchtower");
    finishBuilding(state);
    const sources = lightSources(state);
    expect(sourceAt(sources, keep.x - 4, keep.y)).toMatchObject(LIGHTS.structures.wall!);
    expect(sourceAt(sources, keep.x - 6, keep.y)).toMatchObject(LIGHTS.structures.watchtower!);
    expect(sources).toContainEqual({
      x: keep.x + keep.size / 2,
      y: keep.y + keep.size / 2,
      ...LIGHTS.keep,
    });
  });

  it("leaves out buildings still going up, and ruins", () => {
    const state = createGameWithoutWaves();
    const keep = state.keeps[0];
    buildAt(state, [{ x: keep.x - 6, y: keep.y }], "watchtower");
    // buildAt places it finished; put it back to still being built.
    Object.values(state.structures).find((s) => s.kind === "watchtower")!.buildLeft = 100;
    expect(sourceAt(lightSources(state), keep.x - 6, keep.y)).toBeUndefined();
    expect(LIGHTS.structures.ruin).toBeUndefined();
  });

  it("lights units that carry a torch (soldiers, workers), but not scouts", () => {
    const state = createGameWithoutWaves();
    const keep = state.keeps[0];
    spawnUnit(state, "militia", 1, keep.x - 3, keep.y);
    spawnUnit(state, "lumberjack", 1, keep.x - 3, keep.y + 1);
    spawnUnit(state, "scout", 1, keep.x - 3, keep.y + 2);
    const sources = lightSources(state);
    expect(sourceAt(sources, keep.x - 3, keep.y)).toMatchObject(LIGHTS.torch);
    expect(sourceAt(sources, keep.x - 3, keep.y + 1)).toMatchObject(LIGHTS.torch);
    expect(sourceAt(sources, keep.x - 3, keep.y + 2)).toBeUndefined();
  });

  it("gives every unit kind a torch but the stealthy scout", () => {
    for (const [kind, stats] of Object.entries(UNIT_KINDS) as [string, UnitKind][]) {
      expect([kind, stats.torch === true]).toEqual([kind, kind !== "scout"]);
    }
  });

  it("makes a torch light the tiles round its carrier, not just its own", () => {
    const region = { x0: 0, y0: 0, width: 9, height: 9 };
    const map = lightMap([{ x: 4.5, y: 4.5, ...LIGHTS.torch }], region);
    expect(map[4 * 9 + 5]).toBeGreaterThan(0.3);
    expect(map[4 * 9 + 6]).toBeGreaterThan(0);
  });
});

describe("lightMap", () => {
  const region = { x0: 0, y0: 0, width: 20, height: 20 };
  const at = (map: Float32Array, x: number, y: number) => map[y * region.width + x];

  it("is brightest at a light and fades to nothing at its radius", () => {
    const map = lightMap([{ x: 10.5, y: 10.5, radius: 4, strength: 0.8 }], region);
    expect(at(map, 10, 10)).toBeCloseTo(0.8);
    expect(at(map, 12, 10)).toBeGreaterThan(0);
    expect(at(map, 12, 10)).toBeLessThan(at(map, 11, 10));
    expect(at(map, 14, 10)).toBe(0);
    expect(at(map, 0, 0)).toBe(0);
  });

  it("takes the brightest light reaching a tile: lights don't add up", () => {
    const one = lightMap([{ x: 10.5, y: 10.5, radius: 4, strength: 0.8 }], region);
    const two = lightMap(
      [
        { x: 10.5, y: 10.5, radius: 4, strength: 0.8 },
        { x: 11.5, y: 10.5, radius: 4, strength: 0.8 },
      ],
      region,
    );
    expect(at(two, 10, 10)).toBeCloseTo(at(one, 10, 10));
    expect(Math.max(...two)).toBeLessThanOrEqual(0.8 + 1e-6);
  });

  it("covers only its region, with lights from just outside it reaching in", () => {
    const part = { x0: 5, y0: 5, width: 4, height: 4 };
    const map = lightMap([{ x: 3.5, y: 6.5, radius: 3, strength: 1 }], part);
    expect(map).toHaveLength(16);
    expect(map[1 * 4 + 0]).toBeGreaterThan(0);
  });
});

describe("nightLight", () => {
  it("matches the light map of every light, over any region, as things are built", () => {
    const state = createGameWithoutWaves();
    const keep = state.keeps[0];
    buildAt(
      state,
      [
        { x: keep.x - 4, y: keep.y },
        { x: keep.x + 6, y: keep.y + 1 },
      ],
      "wall",
    );
    spawnUnit(state, "militia", 1, keep.x - 3, keep.y + 3);
    const region = { x0: keep.x - 8, y0: keep.y - 6, width: 20, height: 15 };
    expect(nightLight(state, region)).toEqual(lightMap(lightSources(state), region));
    buildAt(state, [{ x: keep.x - 6, y: keep.y }], "watchtower");
    expect(nightLight(state, region)).toEqual(lightMap(lightSources(state), region));
  });
});
