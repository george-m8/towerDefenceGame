// The border round the tile you're about to build on, filled clockwise from the top middle by
// how long building there takes: none next to the keep, all the way round at the longest.
// It's white, turning more and more orange over the longest waits.
import type { Point } from "../sim/types";
import { BUILD_BORDER_LONG } from "./palette";

/** The border's colour, from white, and its strongest orange at the longest wait. */
const WHITE = [255, 255, 255];
const ORANGE = [255, 120, 0];

/**
 * The border's one colour for a wait `fraction` (0 to 1) of the longest: white, then from
 * BUILD_BORDER_LONG on, blending to full orange at the longest.
 */
export function borderColour(fraction: number): string {
  const t = Math.min(1, Math.max(0, (fraction - BUILD_BORDER_LONG) / (1 - BUILD_BORDER_LONG)));
  const [r, g, b] = WHITE.map((w, i) => Math.round(w + (ORANGE[i] - w) * t));
  return `rgb(${r}, ${g}, ${b})`;
}

/** Clockwise round a unit square from the top middle, back to where it started. */
const CORNERS: Point[] = [
  { x: 0.5, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
  { x: 0, y: 0 },
  { x: 0.5, y: 0 },
];

/**
 * The points of the filled part of the border, in a unit square (scale them to the tile):
 * `fraction` (0 to 1) of the way round. Empty when there's nothing to fill.
 */
export function borderTrace(fraction: number): Point[] {
  if (fraction <= 0) return [];
  let left = Math.min(1, fraction) * 4; // the perimeter of a unit square
  const points = [CORNERS[0]];
  for (let i = 1; i < CORNERS.length && left > 0; i++) {
    const from = CORNERS[i - 1];
    const to = CORNERS[i];
    const length = Math.abs(to.x - from.x) + Math.abs(to.y - from.y);
    const t = Math.min(1, left / length);
    points.push({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t });
    left -= length;
  }
  return points;
}
