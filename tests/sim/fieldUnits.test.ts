import { describe, expect, it } from "vitest";
import { STRUCTURES, TICK_RATE } from "../../src/sim/config";
import { tick } from "../../src/sim/game";
import { placeStructure } from "../../src/sim/grid";
import type { GameState } from "../../src/sim/types";
import { createGameWithoutWaves } from "./helpers";

function run(state: GameState, ticks: number) {
  for (let i = 0; i < ticks; i++) tick(state);
}

describe("offensive buildings", () => {
  const buildings = [
    ["scoutCamp", "scout"],
    ["barracks", "soldier"],
    ["archeryRange", "ranger"],
  ] as const;

  it("each spawns its own kind, one per interval, up to its quota", () => {
    for (const [kind, unit] of buildings) {
      const { spawner } = STRUCTURES[kind];
      expect(spawner.unit).toBe(unit);
      const state = createGameWithoutWaves();
      placeStructure(state, kind, 10, 10, "E", 1);
      tick(state);
      expect(state.units.map((u) => u.kind)).toEqual([unit]);
      run(state, spawner.quota * spawner.intervalSeconds * TICK_RATE);
      expect(state.units.filter((u) => u.kind === unit)).toHaveLength(spawner.quota);
    }
  });
});
