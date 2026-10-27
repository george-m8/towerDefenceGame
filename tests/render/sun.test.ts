import { describe, expect, it } from "vitest";
import { CASTERS, DEFAULT_SUN, castShade, shadowOffset, sweptTile } from "../../src/render/sun";
import { SUN, TILE_SIZE } from "../../src/render/palette";

/** The shadow for the sun at `across`, on the default arc unless given. */
const at = (across: number, arc = DEFAULT_SUN.arc) => shadowOffset({ across, arc });
const length = (across: number, arc?: number) => Math.hypot(at(across, arc).dx, at(across, arc).dy);
/** Across the sky in small steps, horizon to horizon. */
const day = Array.from({ length: 101 }, (_, i) => i / 100);
const arcs = [SUN.arcMin, 30, 60, 80, 90, 120, 150, SUN.arcMax];

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

  it("points down the screen up to a 90° arc, and up it (behind blocks) past 90°", () => {
    for (const arc of arcs) {
      for (const across of day.slice(1, -1)) {
        if (arc < 90) expect(at(across, arc).dy).toBeGreaterThan(0);
        if (arc > 90) expect(at(across, arc).dy).toBeLessThan(0);
      }
    }
  });

  it("mirrors an arc leaning back with one leaning forward by as much", () => {
    for (const across of day) {
      expect(at(across, 120).dx).toBeCloseTo(at(across, 60).dx);
      expect(at(across, 120).dy).toBeCloseTo(-at(across, 60).dy);
    }
  });

  it("is never longer than the longest shadow, which keeps the tallest block's within its reach", () => {
    expect(SUN.maxLength * SUN.tallestBlock).toBeLessThan(SUN.reachTiles * TILE_SIZE);
    expect(SUN.reachTiles).toBe(2);
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

/** The box round a polygon. */
const bounds = (points: [number, number][]) => ({
  left: Math.min(...points.map(([x]) => x)),
  right: Math.max(...points.map(([x]) => x)),
  top: Math.min(...points.map(([, y]) => y)),
  bottom: Math.max(...points.map(([, y]) => y)),
});

describe("sweptTile", () => {
  it("joins the tile to its moved copy, with edges back to the corners that cast it", () => {
    const shape = sweptTile(2, 3, 5, 4);
    const [x0, y0, x1, y1] = [2 * TILE_SIZE, 3 * TILE_SIZE, 3 * TILE_SIZE, 4 * TILE_SIZE];
    expect(shape).toHaveLength(6);
    for (const corner of [
      [x0, y0],
      [x1, y0],
      [x1 + 5, y0 + 4],
      [x1 + 5, y1 + 4],
      [x0 + 5, y1 + 4],
      [x0, y1],
    ]) {
      expect(shape).toContainEqual(corner);
    }
  });

  it("is just a longer rectangle when the shadow goes straight along a side", () => {
    const shape = sweptTile(0, 0, 6, 0);
    expect(shape).toHaveLength(4);
    expect(bounds(shape)).toEqual({ left: 0, right: TILE_SIZE + 6, top: 0, bottom: TILE_SIZE });
  });
});

describe("castShade", () => {
  /** What a tower (11px) shades on a wall (6px) at (5, 5), cast from the neighbour at (dx, dy). */
  const shadeFrom = (across: number, dx: number, dy: number, arc?: number) =>
    castShade(at(across, arc), { x: 5 + dx, y: 5 + dy, height: 11 }, { x: 5, y: 5, height: 6 });
  /** How wide a face's shade is at a height on the screen. */
  const widthAt = (face: [number, number][], y: number) => {
    const xs = face.filter(([, py]) => Math.abs(py - y) < 1e-6).map(([px]) => px);
    return Math.max(...xs) - Math.min(...xs);
  };
  const foot = 6 * TILE_SIZE;
  const rim = foot - 6;

  it("checks every tile within a shadow's reach: 24 within 2", () => {
    expect(CASTERS).toHaveLength(24);
    for (const [dx, dy] of CASTERS) {
      expect(Math.max(Math.abs(dx), Math.abs(dy))).toBeLessThanOrEqual(SUN.reachTiles);
      expect([dx, dy]).not.toEqual([0, 0]);
    }
  });

  it("shades a lower block 2 tiles away when the shadow is long, not when it's short", () => {
    const keepCorner = { x: 3, y: 5, height: SUN.tallestBlock };
    const wall = { x: 5, y: 5, height: 2 };
    // Sun low on the left: shadows long to the right.
    expect(castShade(at(0.03), keepCorner, wall).top).not.toBeNull();
    expect(castShade(at(0.5), keepCorner, wall)).toEqual({ top: null, face: null });
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
    const top = bounds(shadeFrom(0.5, 0, -1).top!);
    expect(top.left).toBeCloseTo(5 * TILE_SIZE);
    expect(top.right).toBeCloseTo(6 * TILE_SIZE);
    expect(top.top).toBeCloseTo(5 * TILE_SIZE - 6);
    expect(top.bottom - top.top).toBeGreaterThan(0);
    expect(top.bottom - top.top).toBeLessThan(TILE_SIZE);
  });

  it("joins a top's shade to the caster's corner, with no gap", () => {
    // The block on the left, shadows falling right and down: the shade reaches the corner
    // the receiver shares with the caster, back at the top edge of the receiver's top.
    const top = shadeFrom(DEFAULT_SUN.across, -1, 0).top!;
    expect(top).toContainEqual([5 * TILE_SIZE, 5 * TILE_SIZE - 6]);
  });

  it("narrows the face's shade from the foot to the top edge", () => {
    const face = shadeFrom(DEFAULT_SUN.across, -1, 0).face!;
    expect(Math.min(...face.map(([x]) => x))).toBeCloseTo(5 * TILE_SIZE);
    expect(widthAt(face, foot)).toBeGreaterThan(widthAt(face, rim));
    expect(widthAt(face, rim)).toBeGreaterThan(0);
  });

  it("with the arc leaning back, shades the face and the front of the top of the block behind", () => {
    const shade = shadeFrom(0.5, 0, 1, 150);
    expect(widthAt(shade.face!, foot)).toBeCloseTo(TILE_SIZE);
    expect(widthAt(shade.face!, rim)).toBeCloseTo(TILE_SIZE);
    expect(bounds(shade.top!).bottom).toBeCloseTo(rim);
    expect(bounds(shade.top!).bottom - bounds(shade.top!).top).toBeGreaterThan(0);
    // The block in front, the other way, gets nothing; nor do the blocks beside.
    expect(shadeFrom(0.5, 0, -1, 150)).toEqual({ top: null, face: null });
    expect(shadeFrom(0.5, 1, 0, 150).face).toBeNull();
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
