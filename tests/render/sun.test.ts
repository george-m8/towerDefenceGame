import { describe, expect, it } from "vitest";
import { CASTERS, DEFAULT_SUN, castShade, shadowOffset } from "../../src/render/sun";
import { SUN, TILE_SIZE } from "../../src/render/palette";

/** The shadow for the sun at `across`, on the default arc unless given. */
const at = (across: number, arc = DEFAULT_SUN.arc) => shadowOffset({ across, arc });
const length = (across: number, arc?: number) => Math.hypot(at(across, arc).dx, at(across, arc).dy);
/** Across the sky in small steps, horizon to horizon. */
const day = Array.from({ length: 101 }, (_, i) => i / 100);
const arcs = [SUN.arcMin, 30, 60, 80, 90];

describe("shadowOffset", () => {
  it("points straight down at the arc's top, the shortest shadow of the day", () => {
    const top = at(0.5);
    expect(top.dx).toBeCloseTo(0);
    expect(top.dy).toBeGreaterThan(0);
    for (const across of day) expect(length(across)).toBeGreaterThanOrEqual(length(0.5) - 1e-9);
  });

  it("casts no shadow at the top of a 90° arc: the sun is straight overhead", () => {
    expect(length(0.5, 90)).toBeCloseTo(0);
  });

  it("gives longer shadows on a lower arc", () => {
    expect(length(0.5, 30)).toBeGreaterThan(length(0.5, 60));
    expect(length(0.3, 30)).toBeGreaterThan(length(0.3, 60));
  });

  it("falls right with the sun on the left and left with it on the right, mirrored", () => {
    expect(at(0.2).dx).toBeGreaterThan(0);
    expect(at(0.8).dx).toBeCloseTo(-at(0.2).dx);
    expect(at(0.8).dy).toBeCloseTo(at(0.2).dy);
  });

  it("never points up the screen", () => {
    for (const arc of arcs)
      for (const across of day) expect(at(across, arc).dy).toBeGreaterThanOrEqual(0);
  });

  it("is never longer than the longest shadow, which keeps the tallest block's within a tile", () => {
    expect(SUN.maxLength * SUN.tallestBlock).toBeLessThan(TILE_SIZE);
    for (const arc of arcs) {
      for (const across of day)
        expect(length(across, arc)).toBeLessThanOrEqual(SUN.maxLength + 1e-9);
    }
  });

  it("cuts shadows near the horizons to the longest, pointing sideways", () => {
    expect(length(0)).toBeCloseTo(SUN.maxLength);
    expect(at(0).dx).toBeCloseTo(SUN.maxLength);
    expect(at(1).dx).toBeCloseTo(-SUN.maxLength);
  });

  it("goes mostly sideways to the right by default, a little longer than half the caster's height", () => {
    const { dx, dy } = shadowOffset(DEFAULT_SUN);
    expect(dy).toBeGreaterThan(0);
    expect(dx).toBeGreaterThan(2 * dy);
    expect(Math.hypot(dx, dy)).toBeGreaterThan(0.5);
    expect(Math.hypot(dx, dy)).toBeLessThan(0.8);
  });
});

describe("castShade", () => {
  /** What a tower (11px) shades on a wall (6px) at (5, 5), cast from the neighbour at (dx, dy). */
  const shadeFrom = (across: number, dx: number, dy: number) =>
    castShade(at(across), { x: 5 + dx, y: 5 + dy, height: 11 }, { x: 5, y: 5, height: 6 });

  it("checks the neighbours a shadow can come from: beside it and the row behind", () => {
    expect(CASTERS).toHaveLength(5);
    for (const [, dy] of CASTERS) expect(dy).toBeLessThanOrEqual(0);
  });

  it("shades the block on the side the shadow falls, top and face", () => {
    // Sun on the right: shadows fall left, so a tower on the right shades the wall.
    expect(shadeFrom(0.9, 1, 0).face).not.toBeNull();
    expect(shadeFrom(0.9, 1, 0).top).not.toBeNull();
    expect(shadeFrom(0.9, -1, 0).top).toBeNull();
    expect(shadeFrom(0.1, -1, 0).face).not.toBeNull();
    expect(shadeFrom(0.1, 1, 0).top).toBeNull();
  });

  it("shades the top of the block in front at the arc's top, but not its face or the blocks beside", () => {
    const top = shadeFrom(0.5, 0, -1);
    expect(top.top).not.toBeNull();
    expect(top.face).toBeNull();
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
    const [footNear, footFar, topFar, topNear] = shadeFrom(DEFAULT_SUN.across, -1, 0).face!;
    expect(footNear).toEqual([5 * TILE_SIZE, 6 * TILE_SIZE]);
    expect(topNear).toEqual([5 * TILE_SIZE, 6 * TILE_SIZE - 6]);
    expect(footFar[0] - footNear[0]).toBeGreaterThan(topFar[0] - topNear[0]);
    expect(topFar[0] - topNear[0]).toBeGreaterThan(0);
  });

  it("shades nothing on a block as tall as its caster or taller", () => {
    const shade = castShade(
      shadowOffset(DEFAULT_SUN),
      { x: 4, y: 5, height: 6 },
      { x: 5, y: 5, height: 6 },
    );
    expect(shade).toEqual({ top: null, face: null });
  });
});
