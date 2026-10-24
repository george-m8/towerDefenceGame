import { describe, expect, it } from "vitest";
import { STRUCTURES } from "../../src/sim/config";
import { discountAt, getEnclosures, priceAt } from "../../src/sim/enclosures";
import { applyCommand, createGame } from "../../src/sim/game";
import { placeStructure, topAt } from "../../src/sim/grid";
import { addPlayer } from "../../src/sim/players";
import type { GameState, Point } from "../../src/sim/types";
import { buildAt, createGameWithoutWaves, goldOf, paintTerrain, ring } from "./helpers";

/** Tiles of a rectangle (inclusive). */
function rect(x0: number, y0: number, x1: number, y1: number): Point[] {
  const points: Point[] = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) points.push({ x, y });
  return points;
}

function discounts(state: GameState, points: Point[]): number[] {
  return [...new Set(points.map((p) => discountAt(state, p.x, p.y)))];
}

describe("finding enclosures", () => {
  it("an open map has none", () => {
    const state = createGameWithoutWaves();
    expect(getEnclosures(state).discount.every((d) => d === 0)).toBe(true);
  });

  it("a ring away from the keep: 25% inside and on every wall, corners included", () => {
    const state = createGameWithoutWaves();
    buildAt(state, ring(10, 5, 14, 9));
    expect(discounts(state, rect(11, 6, 13, 8))).toEqual([0.25]);
    expect(discounts(state, ring(10, 5, 14, 9))).toEqual([0.25]);
    expect(discountAt(state, 20, 20)).toBe(0);
    expect(discountAt(state, 15, 7)).toBe(0); // just outside
  });

  it("a ring around the keep: 50%", () => {
    const state = createGameWithoutWaves();
    const { keep } = state;
    const r = ring(keep.x - 2, keep.y - 2, keep.x + keep.size + 1, keep.y + keep.size + 1);
    buildAt(state, r);
    expect(discountAt(state, keep.x - 1, keep.y - 1)).toBe(0.5); // the gap inside the ring
    expect(discounts(state, r)).toEqual([0.5]);
  });

  it("a pocket walled off against the keep's side: 50%, though the keep is still open", () => {
    const state = createGameWithoutWaves();
    const { keep } = state;
    const top = keep.y - 4;
    buildAt(state, [
      ...rect(keep.x - 1, top, keep.x + keep.size, top), // lid
      ...rect(keep.x - 1, top + 1, keep.x - 1, keep.y - 1), // left side
      ...rect(keep.x + keep.size, top + 1, keep.x + keep.size, keep.y - 1), // right side
    ]);
    expect(discounts(state, rect(keep.x, top + 1, keep.x + keep.size - 1, keep.y - 1))).toEqual([
      0.5,
    ]);
    expect(discountAt(state, keep.x - 1, keep.y + 1)).toBe(0); // beside the keep, outside
  });

  it("a ring hugging the keep: the keep is enclosed, so its walls are 50%", () => {
    const state = createGameWithoutWaves();
    const { keep } = state;
    const r = ring(keep.x - 1, keep.y - 1, keep.x + keep.size, keep.y + keep.size);
    buildAt(state, r);
    expect(discounts(state, r)).toEqual([0.5]);
  });

  it("the map edge closes an enclosure", () => {
    const state = createGameWithoutWaves();
    buildAt(state, [...rect(10, 0, 10, 3), ...rect(14, 0, 14, 3), ...rect(10, 4, 14, 4)]);
    expect(discounts(state, rect(11, 0, 13, 3))).toEqual([0.25]);
  });

  it("rock and river close it too, and an enclosed river can be bridged at a discount", () => {
    const state = createGameWithoutWaves();
    // West side river, east side rock, walls top and bottom.
    paintTerrain(state, rect(20, 20, 20, 24), "river");
    paintTerrain(state, rect(24, 20, 24, 24), "rock");
    buildAt(state, [...rect(20, 19, 24, 19), ...rect(20, 25, 24, 25)]);
    expect(discounts(state, rect(21, 20, 23, 24))).toEqual([0.25]);
    expect(discountAt(state, 20, 22)).toBe(0.25); // the river is part of the boundary
    expect(priceAt(state, "bridge", 20, 22)).toBe(Math.round(STRUCTURES.bridge.cost * 0.75));
  });

  it("floor spikes don't close a ring", () => {
    const state = createGameWithoutWaves();
    // The gap is mid-side: a corner gap wouldn't open the ring (enemies don't walk diagonally).
    buildAt(
      state,
      ring(10, 5, 14, 9).filter((p) => !(p.x === 12 && p.y === 5)),
    );
    placeStructure(state, "floorSpikes", 12, 5);
    expect(discountAt(state, 12, 7)).toBe(0);
  });

  it("ruins and terrain alone don't make an enclosure; one built wall in the ring does", () => {
    const state = createGameWithoutWaves();
    const r = ring(10, 5, 14, 9);
    for (const p of r.slice(1)) placeStructure(state, "ruin", p.x, p.y);
    placeStructure(state, "ruin", r[0].x, r[0].y);
    expect(discountAt(state, 12, 7)).toBe(0);
    applyCommand(state, 1, { type: "sell", x: 12, y: 5 }); // salvage one ruin...
    applyCommand(state, 1, { type: "build", kind: "wall", x: 12, y: 5 }); // ...and wall the gap
    expect(discountAt(state, 12, 7)).toBe(0.25);
  });

  it("a freshly generated map has no enclosures", () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const state = createGame(seed);
      const enclosed = getEnclosures(state).kind.filter((k) => k !== 0).length;
      expect(enclosed, `seed ${seed}`).toBe(0);
    }
  });

  it("is worked out once per grid change", () => {
    const state = createGameWithoutWaves();
    expect(getEnclosures(state)).toBe(getEnclosures(state));
    buildAt(state, [{ x: 3, y: 3 }]);
    expect(getEnclosures(state).version).toBe(state.gridVersion);
  });
});

describe("prices", () => {
  it("round to the nearest gold", () => {
    const state = createGameWithoutWaves();
    const { keep } = state;
    buildAt(state, ring(keep.x - 2, keep.y - 2, keep.x + keep.size + 1, keep.y + keep.size + 1));
    buildAt(state, ring(10, 5, 14, 9));
    expect(priceAt(state, "wall", keep.x - 1, keep.y - 1)).toBe(3); // 5 * 0.5 = 2.5
    expect(priceAt(state, "wall", 12, 7)).toBe(4); // 5 * 0.75 = 3.75
    expect(priceAt(state, "wall", 30, 30)).toBe(STRUCTURES.wall.cost);
  });

  it("never drop below 1", () => {
    const state = createGameWithoutWaves();
    const { keep } = state;
    buildAt(state, ring(keep.x - 2, keep.y - 2, keep.x + keep.size + 1, keep.y + keep.size + 1));
    for (const kind of Object.keys(STRUCTURES) as (keyof typeof STRUCTURES)[]) {
      expect(priceAt(state, kind, keep.x - 1, keep.y - 1)).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("paying and selling", () => {
  it("charges the discounted price and refunds half of what was paid", () => {
    const state = createGameWithoutWaves();
    buildAt(state, ring(10, 5, 14, 9));
    const gold = goldOf(state);
    const price = Math.round(STRUCTURES.archer.cost * 0.75);
    expect(applyCommand(state, 1, { type: "build", kind: "archer", x: 12, y: 7 })).toEqual({
      ok: true,
    });
    expect(goldOf(state)).toBe(gold - price);
    expect(topAt(state, 12, 7)?.paid).toBe(price);
    applyCommand(state, 1, { type: "sell", x: 12, y: 7 });
    expect(goldOf(state)).toBe(gold - price + Math.floor(price * 0.5));
  });

  it("lets a player afford a build only at the discount", () => {
    const state = createGameWithoutWaves();
    buildAt(state, ring(10, 5, 14, 9));
    state.players[1].gold = Math.round(STRUCTURES.archer.cost * 0.75);
    expect(applyCommand(state, 1, { type: "build", kind: "archer", x: 30, y: 30 }).ok).toBe(false);
    expect(applyCommand(state, 1, { type: "build", kind: "archer", x: 12, y: 7 }).ok).toBe(true);
  });

  it("discounts a tower mounted on a ring wall", () => {
    const state = createGameWithoutWaves();
    buildAt(state, ring(10, 5, 14, 9));
    const gold = goldOf(state);
    applyCommand(state, 1, { type: "build", kind: "archer", x: 10, y: 7 });
    expect(goldOf(state)).toBe(gold - Math.round(STRUCTURES.archer.cost * 0.75));
  });

  it("brings full price back once the ring is opened", () => {
    const state = createGameWithoutWaves();
    buildAt(state, ring(10, 5, 14, 9));
    applyCommand(state, 1, { type: "sell", x: 12, y: 5 }); // neutral walls: anyone can sell
    expect(discountAt(state, 12, 7)).toBe(0);
    expect(priceAt(state, "archer", 12, 7)).toBe(STRUCTURES.archer.cost);
  });

  it("gives any player the discount, whoever built the walls", () => {
    const state = createGameWithoutWaves();
    addPlayer(state, "Bo");
    for (const p of ring(10, 5, 14, 9))
      applyCommand(state, 1, { type: "build", kind: "wall", ...p });
    const gold = goldOf(state, 2);
    applyCommand(state, 2, { type: "build", kind: "house", x: 12, y: 7 });
    expect(goldOf(state, 2)).toBe(gold - Math.round(STRUCTURES.house.cost * 0.75));
  });
});
