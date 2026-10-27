import { describe, expect, it } from "vitest";
import { IN_SIGHT, UNEXPLORED } from "../../src/sim/fog";
import { CLOSE_MS, OPEN_MS, curtainAt, curtainTiles, openRadius } from "../../src/ui/curtain";

/** An 800x600 px window, with 20 px tiles. */
const [W, H, CELL] = [800, 600, 20];

describe("openRadius", () => {
  it("reaches past the window's corners by a few tiles", () => {
    expect(openRadius(W, H, CELL)).toBe(500 + 3 * CELL); // half the diagonal (1000)
  });
});

describe("curtainAt", () => {
  const then = () => {};
  const full = openRadius(W, H, CELL);

  it("closes from past the window's corners to nothing", () => {
    const start = curtainAt({ phase: "closing", started: 0, then }, 0, W, H, CELL);
    expect(start).toEqual({ radius: full, done: false });
    const middle = curtainAt({ phase: "closing", started: 0, then }, CLOSE_MS / 2, W, H, CELL);
    expect(middle.radius).toBeCloseTo(full / 2);
    const end = curtainAt({ phase: "closing", started: 0, then }, CLOSE_MS, W, H, CELL);
    expect(end).toEqual({ radius: 0, done: true });
  });

  it("stays shut while covered, then opens all the way", () => {
    expect(curtainAt({ phase: "covered" }, 5000, W, H, CELL)).toEqual({ radius: 0, done: false });
    expect(curtainAt({ phase: "opening", started: 100 }, 100, W, H, CELL).radius).toBe(0);
    const end = curtainAt({ phase: "opening", started: 100 }, 100 + OPEN_MS, W, H, CELL);
    expect(end).toEqual({ radius: full, done: true });
  });
});

describe("curtainTiles", () => {
  it("clears the tiles whose centres are in the circle round the window's middle", () => {
    // 4x2 tiles of 10 px in a 40x20 window: the middle is (20, 10), between the middle four.
    const tiles = curtainTiles(4, 2, 10, 40, 20, 8);
    // prettier-ignore
    expect([...tiles]).toEqual([
      UNEXPLORED, IN_SIGHT, IN_SIGHT, UNEXPLORED,
      UNEXPLORED, IN_SIGHT, IN_SIGHT, UNEXPLORED,
    ]);
  });

  it("is all fog with the curtain shut, and all clear once it's open", () => {
    const shut = curtainTiles(40, 31, CELL, W, H, 0);
    expect(shut.every((t) => t === UNEXPLORED)).toBe(true);
    const open = curtainTiles(40, 31, CELL, W, H, openRadius(W, H, CELL));
    expect(open.every((t) => t === IN_SIGHT)).toBe(true);
  });
});
