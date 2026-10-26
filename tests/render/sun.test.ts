import { describe, expect, it } from "vitest";
import { CASTERS, DEFAULT_SUN, castShade, shadowOffset } from "../../src/render/sun";
import { SUN, TILE_SIZE } from "../../src/render/palette";

const length = (sun: number) => Math.hypot(shadowOffset(sun).dx, shadowOffset(sun).dy);
/** The time of day in small steps, sunrise to sunset. */
const day = Array.from({ length: 101 }, (_, i) => i / 100);

describe("shadowOffset", () => {
  it("points straight down at noon, the shortest shadow of the day", () => {
    const noon = shadowOffset(0.5);
    expect(noon.dx).toBeCloseTo(0);
    expect(noon.dy).toBeGreaterThan(0);
    for (const sun of day) expect(length(sun)).toBeGreaterThanOrEqual(length(0.5) - 1e-9);
  });

  it("falls left at sunrise and right at sunset, mirroring each other", () => {
    const sunrise = shadowOffset(0);
    const sunset = shadowOffset(1);
    expect(sunrise.dx).toBeLessThan(0);
    expect(sunset.dx).toBeCloseTo(-sunrise.dx);
    expect(sunset.dy).toBeCloseTo(sunrise.dy);
    expect(shadowOffset(0.2).dx).toBeCloseTo(-shadowOffset(0.8).dx);
    expect(shadowOffset(0.2).dy).toBeCloseTo(shadowOffset(0.8).dy);
  });

  it("never points up the screen", () => {
    for (const sun of day) expect(shadowOffset(sun).dy).toBeGreaterThanOrEqual(0);
  });

  it("keeps the tallest block's shadow within a tile", () => {
    for (const sun of day) expect(length(sun) * SUN.tallestBlock).toBeLessThanOrEqual(TILE_SIZE);
  });

  it("goes mostly sideways to the right by default, about half the caster's height long", () => {
    const { dx, dy } = shadowOffset(DEFAULT_SUN);
    expect(dx).toBeGreaterThan(2 * dy);
    expect(length(DEFAULT_SUN)).toBeGreaterThan(0.4);
    expect(length(DEFAULT_SUN)).toBeLessThan(0.6);
  });
});

describe("castShade", () => {
  /** What a tower (11px) shades on a wall (6px) at (5, 5), cast from beside it at (dx, dy). */
  const shadeFrom = (sun: number, dx: number, dy: number) =>
    castShade(shadowOffset(sun), { x: 5 + dx, y: 5 + dy, height: 11 }, { x: 5, y: 5, height: 6 });

  it("checks the neighbours a shadow can come from: beside it and the row behind", () => {
    expect(CASTERS).toHaveLength(5);
    for (const [, dy] of CASTERS) expect(dy).toBeLessThanOrEqual(0);
  });

  it("shades the block to the left in the morning and to the right in the evening", () => {
    expect(shadeFrom(0.1, 1, 0).face).not.toBeNull();
    expect(shadeFrom(0.1, 1, 0).top).not.toBeNull();
    expect(shadeFrom(0.1, -1, 0).top).toBeNull();
    expect(shadeFrom(0.9, -1, 0).face).not.toBeNull();
    expect(shadeFrom(0.9, 1, 0).top).toBeNull();
  });

  it("shades the top of the block in front at noon, but not its face or the blocks beside", () => {
    const noon = shadeFrom(0.5, 0, -1);
    expect(noon.top).not.toBeNull();
    expect(noon.face).toBeNull();
    expect(shadeFrom(0.5, -1, 0).top).toBeNull();
    expect(shadeFrom(0.5, 1, 0).top).toBeNull();
  });

  it("puts the top's shade on the receiver's lifted top, inside its tile", () => {
    const top = shadeFrom(0.5, 0, -1).top!;
    expect(top.x).toBeCloseTo(5 * TILE_SIZE);
    expect(top.width).toBeCloseTo(TILE_SIZE);
    expect(top.y).toBeCloseTo(5 * TILE_SIZE - 6);
    expect(top.height).toBeGreaterThan(0);
    expect(top.height).toBeLessThan(TILE_SIZE);
  });

  it("narrows the face's shade from the foot to the top edge", () => {
    const [footNear, footFar, topFar, topNear] = shadeFrom(DEFAULT_SUN, -1, 0).face!;
    expect(footNear).toEqual([5 * TILE_SIZE, 6 * TILE_SIZE]);
    expect(topNear).toEqual([5 * TILE_SIZE, 6 * TILE_SIZE - 6]);
    expect(footFar[0] - footNear[0]).toBeGreaterThan(topFar[0] - topNear[0]);
    expect(topFar[0] - topNear[0]).toBeGreaterThan(0);
  });

  it("shades nothing on a block as tall as its caster or taller", () => {
    const offset = shadowOffset(DEFAULT_SUN);
    const shade = castShade(offset, { x: 4, y: 5, height: 6 }, { x: 5, y: 5, height: 6 });
    expect(shade).toEqual({ top: null, face: null });
  });
});
