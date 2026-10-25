import { describe, expect, it } from "vitest";
import { createGame } from "../../src/sim/game";
import { describeTile, priceLine } from "../../src/ui/tileInfo";
import { buildAt, ring } from "../sim/helpers";

function walledGame() {
  const state = createGame(1, { blankMap: true });
  const { keep } = state;
  buildAt(state, ring(keep.x - 2, keep.y - 2, keep.x + keep.size + 1, keep.y + keep.size + 1));
  buildAt(state, ring(10, 5, 14, 9));
  return state;
}

describe("enclosure hover info", () => {
  it("names the enclosure and its discount, inside and on the walls", () => {
    const state = walledGame();
    const { keep } = state;
    expect(describeTile(state, { x: keep.x - 1, y: keep.y - 1 })).toContain(
      "Inside the keep's walls: builds 50% off",
    );
    expect(describeTile(state, { x: 12, y: 7 })).toContain("Enclosed: builds 25% off");
    expect(describeTile(state, { x: 10, y: 5 })).toContain("Enclosed: builds 25% off"); // a wall
    expect(describeTile(state, { x: 30, y: 30 }).join("\n")).not.toContain("off");
  });
});

describe("priceLine", () => {
  it("shows the discounted price, or the full price outside", () => {
    const state = walledGame();
    const { keep } = state;
    expect(priceLine(state, "wall", { x: keep.x - 1, y: keep.y - 1 })).toBe(
      "Wall here: 3g (50% off)",
    );
    expect(priceLine(state, "archer", { x: 12, y: 7 })).toBe("Archer here: 19g (25% off)");
    expect(priceLine(state, "wall", { x: 30, y: 30 })).toBe("Wall here: 5g");
  });
});
