// The sun's place in the sky. It crosses from the left horizon to the right on a circle tilted
// up from the horizon towards the top of the screen, so shadows swing from right, through
// straight down, to left, and lean down more (and grow longer) the lower its arc. Past 90° the
// arc leans the other way, over the bottom of the screen, and shadows fall up, behind blocks.
import { SUN, TILE_SIZE } from "./palette";

/**
 * Where the sun is: `across` its arc from the left horizon (0) to the right (1), on an arc tilted
 * `arc` degrees up from the horizon (90: straight overhead).
 */
export interface Sun {
  across: number;
  arc: number;
}

/** Where the sun is when nobody has set it. */
export const DEFAULT_SUN: Readonly<Sun> = { across: SUN.across, arc: SUN.arc };

/**
 * Where a block's shadow lands on the ground, per pixel of its height, for where the sun is: in
 * map pixels, +x right and +y down. Never longer than SUN.maxLength.
 */
export function shadowOffset(sun: Sun): { dx: number; dy: number } {
  const along = Math.PI * sun.across;
  const tilt = (Math.PI / 180) * sun.arc;
  // Towards the sun: along the screen (left at the start), up it, and up from the ground.
  const sideways = -Math.cos(along);
  const back = Math.sin(along) * Math.cos(tilt);
  const height = Math.sin(along) * Math.sin(tilt);
  const ground = Math.hypot(sideways, back);
  // The shadow points away from the sun, ground / height per pixel, cut short near the horizon.
  const length = height * SUN.maxLength > ground ? ground / height : SUN.maxLength;
  return { dx: (-sideways / ground) * length, dy: (back / ground) * length };
}

/** A raised block: its tile and its height in pixels. */
export interface Block {
  x: number;
  y: number;
  height: number;
}

/**
 * Where a taller block's shadow lies on a lower block beside it: a polygon on its top (drawn
 * lifted, as the top is) and one on its front face, in map pixels. Either is null when the
 * shadow misses it.
 */
export interface Shade {
  top: [number, number][] | null;
  face: [number, number][] | null;
}

/** The tiles whose shadows can fall on a block: every one within a shadow's reach. */
export const CASTERS: readonly [number, number][] = (() => {
  const offsets: [number, number][] = [];
  for (let dy = -SUN.reachTiles; dy <= SUN.reachTiles; dy++) {
    for (let dx = -SUN.reachTiles; dx <= SUN.reachTiles; dx++) {
      if (dx !== 0 || dy !== 0) offsets.push([dx, dy]);
    }
  }
  return offsets;
})();

/** Shade smaller than this (in pixels, or square pixels) isn't drawn: it's only rounding. */
const SLIVER = 0.01;
/** Rounding allowed when clipping, so a shadow lying exactly along an edge still counts. */
const SLACK = 1e-9;

/** The part of a polygon (points [x, z]) where a·x + b·z <= c. */
function clip(points: [number, number][], a: number, b: number, c: number): [number, number][] {
  const inside = ([x, z]: [number, number]) => a * x + b * z <= c + SLACK;
  const kept: [number, number][] = [];
  points.forEach((p, i) => {
    const q = points[(i + 1) % points.length];
    if (inside(p)) kept.push(p);
    if (inside(p) !== inside(q)) {
      const t = (c - a * p[0] - b * p[1]) / (a * (q[0] - p[0]) + b * (q[1] - p[1]));
      kept.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
    }
  });
  return kept;
}

/** The smallest convex polygon round some points (Andrew's monotone chain), all one way round. */
function hull(points: [number, number][]): [number, number][] {
  const sorted = [...points].sort(([ax, ay], [bx, by]) => ax - bx || ay - by);
  const turn = (o: [number, number], a: [number, number], b: [number, number]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (from: [number, number][]) => {
    const chain: [number, number][] = [];
    for (const p of from) {
      while (chain.length >= 2 && turn(chain[chain.length - 2], chain[chain.length - 1], p) <= 0) {
        chain.pop();
      }
      chain.push(p);
    }
    return chain.slice(0, -1);
  };
  return [...half(sorted), ...half(sorted.reverse())];
}

/**
 * A tile's footprint swept `ox`, `oy` pixels along its shadow: the footprint, the moved copy and
 * what lies between, so a shadow joins the corners of the block casting it.
 */
export function sweptTile(x: number, y: number, ox: number, oy: number): [number, number][] {
  const corners: [number, number][] = [];
  for (const [sx, sy] of [
    [0, 0],
    [ox, oy],
  ]) {
    for (const [cx, cy] of [
      [x, y],
      [x + 1, y],
      [x + 1, y + 1],
      [x, y + 1],
    ]) {
      corners.push([cx * TILE_SIZE + sx, cy * TILE_SIZE + sy]);
    }
  }
  return hull(corners);
}

/** A polygon's area (the shoelace formula). */
function area(points: [number, number][]): number {
  let twice = 0;
  points.forEach(([x, z], i) => {
    const [nx, nz] = points[(i + 1) % points.length];
    twice += x * nz - nx * z;
  });
  return Math.abs(twice) / 2;
}

/**
 * The shadow `caster` throws on `receiver`, for a shadow offset from shadowOffset. On the top,
 * it's the caster's footprint swept along the shadow of the part of it above the receiver, so a
 * lower receiver gets more, joined to the caster's corner. On the front face, a point `z` up the face is shaded where the caster's footprint,
 * moved by its shadow from `z` up, covers it: from a block beside it the shade narrows towards
 * the top edge; from the block in front (shadows pointing up) it can cover the whole face.
 */
export function castShade(
  offset: { dx: number; dy: number },
  caster: Block,
  receiver: Block,
): Shade {
  const above = caster.height - receiver.height;
  if (above <= 0) return { top: null, face: null };
  const casterLeft = caster.x * TILE_SIZE;
  const casterBack = caster.y * TILE_SIZE;
  // The top: the swept shadow, cut to the receiver's tile, then lifted with the top.
  let top = sweptTile(caster.x, caster.y, above * offset.dx, above * offset.dy);
  top = clip(top, -1, 0, -receiver.x * TILE_SIZE);
  top = clip(top, 1, 0, (receiver.x + 1) * TILE_SIZE);
  top = clip(top, 0, -1, -receiver.y * TILE_SIZE);
  top = clip(top, 0, 1, (receiver.y + 1) * TILE_SIZE);
  // The face as [x, z] (z: height up it), clipped to where the moved footprint covers it.
  const foot = (receiver.y + 1) * TILE_SIZE;
  const h = caster.height;
  const { dx, dy } = offset;
  let face: [number, number][] = [
    [receiver.x * TILE_SIZE, 0],
    [(receiver.x + 1) * TILE_SIZE, 0],
    [(receiver.x + 1) * TILE_SIZE, receiver.height],
    [receiver.x * TILE_SIZE, receiver.height],
  ];
  face = clip(face, -1, -dx, -casterLeft - h * dx);
  face = clip(face, 1, dx, casterLeft + TILE_SIZE + h * dx);
  face = clip(face, 0, -dy, foot - casterBack - h * dy);
  face = clip(face, 0, dy, casterBack + TILE_SIZE - foot + h * dy);
  return {
    top: area(top) > SLIVER ? top.map(([x, y]) => [x, y - receiver.height]) : null,
    face: area(face) > SLIVER ? face.map(([x, z]) => [x, foot - z]) : null,
  };
}
