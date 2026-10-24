// Angle maths for tower facing, arcs and turning. Degrees, clockwise from north (up the
// screen, negative y). Targeting and the overlay both use these, so they never disagree.
import type { Facing, Point } from "./types";

const FACING_ANGLES: Record<Facing, number> = { N: 0, E: 90, S: 180, W: 270 };
const EPSILON = 1e-9;

export function facingAngle(facing: Facing): number {
  return FACING_ANGLES[facing];
}

/** Angle from a tower's tile centre to a point (an enemy's position or a tile centre). */
export function angleTo(from: Point, to: Point): number {
  const degrees = (Math.atan2(to.x - from.x, from.y - to.y) * 180) / Math.PI;
  return normalise(degrees);
}

/** Smallest absolute difference between two angles, 0-180. */
export function angleBetween(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
}

/** Whether an angle lies within an arc centred on `aim`. The edge counts as inside. */
export function inArc(aim: number, arcDegrees: number, angle: number): boolean {
  return arcDegrees >= 360 || angleBetween(aim, angle) <= arcDegrees / 2 + EPSILON;
}

/** Turn from `current` towards `target` by at most `maxStep`, the shorter way round. */
export function turnTowards(current: number, target: number, maxStep: number): number {
  const signed = ((((target - current) % 360) + 540) % 360) - 180; // in [-180, 180)
  if (Math.abs(signed) <= maxStep) return normalise(target);
  return normalise(current + Math.sign(signed) * maxStep);
}

function normalise(degrees: number): number {
  const d = degrees % 360;
  return d < 0 ? d + 360 : d;
}
