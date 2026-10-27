// The fog curtain between the start screens and a game: the fog closes in over the game playing
// behind the menus until it covers the screen, the chosen game is swapped in under it, and the
// fog opens back out to wherever the game's own fog of war is (or all the way, without fog).
// Pure: main.ts runs it each frame, and the renderer draws the fog through curtainTier.
import { UNEXPLORED } from "../sim/fog";
import { tilePixels, type Camera } from "./camera";

/** A circle the fog is held back to, in the view's tiles: full fog outside it. */
export interface Curtain {
  x: number;
  y: number;
  radius: number;
}

/** How long the fog takes to close in, and to open back out (ms). */
export const CLOSE_MS = 900;
export const OPEN_MS = 1400;
/** Past the screen's corners by this many tiles, so the fog's soft edge starts off screen. */
const EDGE_TILES = 3;

export type CurtainPhase =
  | { phase: "closing"; started: number; then: () => void }
  /** Covered: waiting for the game to be ready (online, until the server welcomes us). */
  | { phase: "covered" }
  | { phase: "opening"; started: number };

/** The radius that clears the whole view: from its centre to a corner, and a bit. */
export function openRadius(cam: Camera): number {
  const tile = tilePixels(cam);
  return Math.hypot(cam.viewWidth / tile, cam.viewHeight / tile) / 2 + EDGE_TILES;
}

/** Slow at both ends. */
const ease = (t: number) => t * t * (3 - 2 * t);

/**
 * The curtain at `now`, centred on the view: shrinking while closing, nothing showing while
 * covered, growing while opening. `done` once it's fully closed or open.
 */
export function curtainAt(
  phase: CurtainPhase,
  now: number,
  cam: Camera,
): { curtain: Curtain; done: boolean } {
  const tile = tilePixels(cam);
  const x = cam.x + cam.viewWidth / tile / 2;
  const y = cam.y + cam.viewHeight / tile / 2;
  const full = openRadius(cam);
  if (phase.phase === "covered") return { curtain: { x, y, radius: 0 }, done: false };
  const length = phase.phase === "closing" ? CLOSE_MS : OPEN_MS;
  const t = Math.min(1, Math.max(0, (now - phase.started) / length));
  const open = phase.phase === "closing" ? 1 - ease(t) : ease(t);
  return { curtain: { x, y, radius: full * open }, done: t >= 1 };
}

/**
 * The game's sight with the curtain drawn over it: unexplored outside the circle (measured to
 * each tile's centre), as the game sees it inside.
 */
export function curtainTier(
  tier: Uint8Array,
  width: number,
  height: number,
  curtain: Curtain,
): Uint8Array {
  const out = new Uint8Array(tier.length);
  const r2 = curtain.radius * curtain.radius;
  for (let y = 0; y < height; y++) {
    const dy = y + 0.5 - curtain.y;
    for (let x = 0; x < width; x++) {
      const dx = x + 0.5 - curtain.x;
      const i = y * width + x;
      out[i] = dx * dx + dy * dy <= r2 ? tier[i] : UNEXPLORED;
    }
  }
  return out;
}
