import { describe, expect, it } from "vitest";
import { STRUCTURES, TICK_RATE, type StructureStats } from "../../src/sim/config";
import { applyCommand, tick } from "../../src/sim/game";
import { placeStructure } from "../../src/sim/grid";
import { guardSpotOf, guardSpots } from "../../src/sim/guards";
import { spawnUnit } from "../../src/sim/units";
import { toolsInTab } from "../../src/ui/state";
import type { GameState } from "../../src/sim/types";
import { buildAt, createGameWithoutWaves } from "./helpers";

function run(state: GameState, ticks: number) {
  for (let i = 0; i < ticks; i++) tick(state);
}

const buildings = [
  ["guardhouse", "swordsman"],
  ["archeryPost", "archer"],
  ["paladinHall", "paladin"],
] as const;

describe("guard buildings", () => {
  it("each spawns its own guards, one per interval, up to its quota", () => {
    for (const [kind, guard] of buildings) {
      const { spawner } = STRUCTURES[kind];
      expect(spawner.unit).toBe(guard);
      const state = createGameWithoutWaves();
      placeStructure(state, kind, 10, 10, "E", 1);
      tick(state);
      expect(state.units.map((u) => u.kind)).toEqual([guard]);
      run(state, spawner.quota * spawner.intervalSeconds * TICK_RATE);
      expect(state.units).toHaveLength(spawner.quota);
    }
  });

  it("are placed facing a direction, from the Defence tab", () => {
    const state = createGameWithoutWaves();
    for (const [kind] of buildings) {
      const stats: StructureStats = STRUCTURES[kind];
      expect(stats.directional).toBe(true);
      expect(toolsInTab("defence").map((t) => t.tool)).toContain(kind);
    }
    expect(
      applyCommand(state, 1, { type: "build", kind: "guardhouse", x: 10, y: 10, facing: "W" }),
    ).toEqual({ ok: true });
    expect(Object.values(state.structures)[0].facing).toBe("W");
  });

  it("selling one leaves its guards alive with no home", () => {
    const state = createGameWithoutWaves();
    placeStructure(state, "guardhouse", 10, 10, "E", 1);
    tick(state);
    expect(applyCommand(state, 1, { type: "sell", x: 10, y: 10 })).toEqual({ ok: true });
    run(state, 2 * STRUCTURES.guardhouse.spawner.intervalSeconds * TICK_RATE);
    expect(state.units).toHaveLength(1);
    expect(state.units[0].home).toBeNull();
  });
});

describe("guard spots", () => {
  /** A guardhouse at (10, 10) facing east, with `n` guards of its own (oldest first). */
  function post(state: GameState, n = 0) {
    const building = placeStructure(state, "guardhouse", 10, 10, "E", 1);
    const guards = Array.from({ length: n }, () =>
      spawnUnit(state, "swordsman", 1, 9, 10, building.id)!,
    );
    return { building, guards };
  }

  it("run straight ahead, then the sides, then the same one row further out", () => {
    const state = createGameWithoutWaves();
    const { building } = post(state);
    expect(guardSpots(state, building)).toEqual([
      { x: 11, y: 10 },
      { x: 11, y: 9 },
      { x: 11, y: 11 },
      { x: 12, y: 10 },
      { x: 12, y: 9 },
      { x: 12, y: 11 },
    ]);
  });

  it("skip tiles that are built on, or that can't be walked to", () => {
    const state = createGameWithoutWaves();
    const { building } = post(state);
    buildAt(state, [{ x: 11, y: 9 }]);
    buildAt(state, [
      { x: 11, y: 10 },
      { x: 12, y: 9 },
      { x: 13, y: 10 },
      { x: 12, y: 11 },
    ]); // walls (12, 10) in
    expect(guardSpots(state, building)).toEqual([{ x: 11, y: 11 }]);
  });

  it("guards take spots oldest first, and share when there are too few", () => {
    const state = createGameWithoutWaves();
    const { guards } = post(state, 3);
    expect(guards.map((g) => guardSpotOf(state, g))).toEqual([
      { x: 11, y: 10 },
      { x: 11, y: 9 },
      { x: 11, y: 11 },
    ]);
    buildAt(state, [
      { x: 11, y: 9 },
      { x: 11, y: 11 },
      { x: 12, y: 10 },
      { x: 12, y: 9 },
      { x: 12, y: 11 },
    ]);
    expect(guards.map((g) => guardSpotOf(state, g))).toEqual(Array(3).fill({ x: 11, y: 10 }));
  });

  it("building over a spot moves its guard to the next one", () => {
    const state = createGameWithoutWaves();
    const { guards } = post(state, 1);
    expect(guardSpotOf(state, guards[0])).toEqual({ x: 11, y: 10 });
    buildAt(state, [{ x: 11, y: 10 }]);
    expect(guardSpotOf(state, guards[0])).toEqual({ x: 11, y: 9 });
  });

  it("a guard with no home keeps its last spot; with no open spot it stays put", () => {
    const state = createGameWithoutWaves();
    const { guards } = post(state, 1);
    guards[0].home = null;
    guards[0].goal = { x: 20, y: 20 };
    expect(guardSpotOf(state, guards[0])).toEqual({ x: 20, y: 20 });

    const boxed = createGameWithoutWaves();
    const {
      guards: [g],
    } = post(boxed, 1);
    buildAt(
      boxed,
      [11, 12].flatMap((x) => [9, 10, 11].map((y) => ({ x, y }))),
    );
    expect(guardSpotOf(boxed, g)).toBeNull();
  });
});
