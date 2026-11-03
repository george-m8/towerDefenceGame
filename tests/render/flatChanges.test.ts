import { describe, expect, it } from "vitest";
import { changedTiles, flatPrints, shiftPrints, UNPAINTED } from "../../src/render/flatChanges";
import { createGame } from "../../src/sim/game";
import { placeStructure } from "../../src/sim/grid";

describe("the flat map's changed tiles", () => {
  const game = () => createGame(3, { mode: "flood", blankMap: true, size: "S" });
  const index = (state: ReturnType<typeof game>, x: number, y: number) => y * state.width + x;

  it("are none when nothing's changed", () => {
    const state = game();
    const a = flatPrints(state, null, 0).tiles;
    expect(changedTiles(a, flatPrints(state, null, 0).tiles)).toEqual([]);
  });

  it("are just the tiles whose terrain, structures or sight changed", () => {
    const state = game();
    const before = flatPrints(state, null, 0).tiles;
    state.terrain[index(state, 4, 5)] = "lava";
    placeStructure(state, "wall", 10, 12, "N", 1);
    expect(changedTiles(before, flatPrints(state, null, 0).tiles)).toEqual([
      index(state, 4, 5),
      index(state, 10, 12),
    ]);
    const tiers = new Uint8Array(state.width * state.height);
    const seen = flatPrints(state, tiers, 0).tiles;
    tiers[index(state, 7, 7)] = 1;
    expect(changedTiles(seen, flatPrints(state, tiers, 0).tiles)).toEqual([index(state, 7, 7)]);
  });

  it("move with the world, leaving its new columns to paint", () => {
    const state = game();
    const prints = flatPrints(state, null, 0).tiles;
    const moved = shiftPrints(prints, state.width, 3);
    expect(moved[index(state, 0, 2)]).toBe(prints[index(state, 3, 2)]);
    expect(moved[index(state, state.width - 1, 2)]).toBe(UNPAINTED);
  });
});
