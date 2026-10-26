// The sun's place in the sky. It crosses from the left horizon to the right on a circle tilted
// up from the horizon towards the top of the screen, so shadows swing from right, through
// straight down, to left, and lean down more (and grow longer) the lower its arc.
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
