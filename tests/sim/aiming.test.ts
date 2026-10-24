import { describe, expect, it } from "vitest";
import { angleBetween, angleTo, facingAngle, inArc, turnTowards } from "../../src/sim/aiming";

describe("facingAngle", () => {
  it("maps compass facings to clockwise degrees from north", () => {
    expect([facingAngle("N"), facingAngle("E"), facingAngle("S"), facingAngle("W")]).toEqual([
      0, 90, 180, 270,
    ]);
  });
});

describe("angleTo", () => {
  const from = { x: 10, y: 10 };
  it.each([
    [{ x: 10, y: 5 }, 0],
    [{ x: 15, y: 10 }, 90],
    [{ x: 10, y: 15 }, 180],
    [{ x: 5, y: 10 }, 270],
    [{ x: 13, y: 7 }, 45],
    [{ x: 13, y: 13 }, 135],
    [{ x: 7, y: 13 }, 225],
    [{ x: 7, y: 7 }, 315],
  ])("to %o is %d degrees", (to, expected) => {
    expect(angleTo(from, to)).toBeCloseTo(expected, 9);
  });
});

describe("angleBetween", () => {
  it("is the smallest difference, across 0/360", () => {
    expect(angleBetween(10, 350)).toBeCloseTo(20, 9);
    expect(angleBetween(90, 270)).toBeCloseTo(180, 9);
    expect(angleBetween(45, 45)).toBe(0);
  });
});

describe("inArc", () => {
  it("is inside at the centre and exactly on the edge, outside just beyond", () => {
    expect(inArc(90, 90, 90)).toBe(true);
    expect(inArc(90, 90, 45)).toBe(true);
    expect(inArc(90, 90, 135)).toBe(true);
    expect(inArc(90, 90, 44.9)).toBe(false);
    expect(inArc(90, 90, 135.1)).toBe(false);
  });

  it("handles arcs across north", () => {
    expect(inArc(0, 90, 350)).toBe(true);
    expect(inArc(0, 90, 10)).toBe(true);
    expect(inArc(0, 90, 180)).toBe(false);
  });

  it("is always true for a 360 degree arc", () => {
    for (const angle of [0, 90, 179, 271]) expect(inArc(0, 360, angle)).toBe(true);
  });
});

describe("turnTowards", () => {
  it("turns by at most the step, the shorter way round", () => {
    expect(turnTowards(0, 90, 10)).toBeCloseTo(10, 9);
    expect(turnTowards(0, 270, 10)).toBeCloseTo(350, 9); // anticlockwise is shorter
    expect(turnTowards(350, 20, 10)).toBeCloseTo(0, 9); // across north
  });

  it("stops exactly on the target and never overshoots", () => {
    expect(turnTowards(85, 90, 10)).toBe(90);
    expect(turnTowards(355, 2, 10)).toBe(2);
  });

  it("normalises results to [0, 360)", () => {
    const result = turnTowards(5, 300, 10);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThan(360);
    expect(result).toBeCloseTo(355, 9);
  });
});
