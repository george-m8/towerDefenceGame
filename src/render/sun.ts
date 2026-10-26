// The sun's place in the sky, as one number: 0 at sunrise, 0.5 at noon, 1 at sunset. It crosses
// the top of the screen from right to left, so shadows swing from left, through straight down, to
// right, and are longest when it's low.
import { SUN } from "./palette";

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
