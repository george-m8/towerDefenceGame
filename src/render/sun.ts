// The sun's place in the sky, as one number: 0 at sunrise, 0.5 at noon, 1 at sunset. It crosses
// the top of the screen from right to left, so shadows swing from left, through straight down, to
// right, and are longest when it's low.
import { SUN, TILE_SIZE } from "./palette";

/** The time of day when nobody has set it. */
export const DEFAULT_SUN = SUN.default;

/**
 * Where a block's shadow lands on the ground, per pixel of its height, for the time of day: in
 * map pixels, +x right and +y down.
 */
export function shadowOffset(sun: number): { dx: number; dy: number } {
  const angle = Math.PI * sun;
  // Low sun (sin near 0) makes long shadows; it grows quickly near the ends, as real ones do.
  const length = SUN.noonLength + (SUN.edgeLength - SUN.noonLength) * (1 - Math.sin(angle));
  return { dx: -Math.cos(angle) * length, dy: Math.sin(angle) * length };
}

/** A raised block: its tile and its height in pixels. */
export interface Block {
  x: number;
  y: number;
  height: number;
}

/**
 * Where a taller block's shadow lies on a lower block beside it: a rectangle on its top (drawn
 * lifted, as the top is) and a four-sided shape on its front face, in map pixels. Either is null
 * when the shadow misses it.
 */
export interface Shade {
  top: { x: number; y: number; width: number; height: number } | null;
  face: [number, number][] | null;
}

/**
 * The neighbours whose shadows can fall on a block: beside it, and the row behind. Shadows never
 * point up the screen, and reach at most a tile.
 */
export const CASTERS: readonly [number, number][] = [
  [-1, 0],
  [1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
];

/** Shade thinner than this (in pixels) isn't drawn: it's only rounding. */
const SLIVER = 0.01;

/**
 * The shadow `caster` throws on `receiver`, for a shadow offset from shadowOffset. On the top,
 * it's the caster's footprint moved by the part of it above the receiver, so a lower receiver
 * gets more. On the front face (only from a block in the same row), it's as wide as the ground
 * shadow at the foot, narrowing towards the top edge.
 */
export function castShade(
  offset: { dx: number; dy: number },
  caster: Block,
  receiver: Block,
): Shade {
  const above = caster.height - receiver.height;
  if (above <= 0) return { top: null, face: null };
  const left = Math.max(caster.x * TILE_SIZE + above * offset.dx, receiver.x * TILE_SIZE);
  const right = Math.min(
    (caster.x + 1) * TILE_SIZE + above * offset.dx,
    (receiver.x + 1) * TILE_SIZE,
  );
  const near = Math.max(caster.y * TILE_SIZE + above * offset.dy, receiver.y * TILE_SIZE);
  const far = Math.min(
    (caster.y + 1) * TILE_SIZE + above * offset.dy,
    (receiver.y + 1) * TILE_SIZE,
  );
  const top =
    right - left > SLIVER && far - near > SLIVER
      ? { x: left, y: near - receiver.height, width: right - left, height: far - near }
      : null;
  // Towards the receiver: a caster on its left needs the shadow going right, and the other way.
  const towards = (receiver.x - caster.x) * offset.dx;
  let face: Shade["face"] = null;
  if (caster.y === receiver.y && towards > SLIVER) {
    const edge = (caster.x < receiver.x ? receiver.x : receiver.x + 1) * TILE_SIZE;
    const foot = (receiver.y + 1) * TILE_SIZE;
    const rim = foot - receiver.height;
    face = [
      [edge, foot],
      [edge + caster.height * offset.dx, foot],
      [edge + above * offset.dx, rim],
      [edge, rim],
    ];
  }
  return { top, face };
}
