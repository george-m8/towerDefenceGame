import { describe, expect, it } from "vitest";
import { STRUCTURES, TICK_RATE, type StructureStats } from "../../src/sim/config";
import { applyCommand, tick } from "../../src/sim/game";
import { placeStructure } from "../../src/sim/grid";
import { toolsInTab } from "../../src/ui/state";
import type { GameState } from "../../src/sim/types";
import { createGameWithoutWaves } from "./helpers";

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
