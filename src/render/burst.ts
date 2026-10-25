// How something destroyed bursts apart: it stays a moment, then its pixels fly outward from
// where it was, sag a little as they go, and fade out. Pure maths for the renderer; the pattern is seeded from where it
// happened, so a burst looks the same every frame (and to every player online).
import { BURST_TICKS } from "../sim/config";
import type { Effect } from "../sim/types";
import { TILE_SIZE } from "./palette";

type Burst = Extract<Effect, { kind: "burst" }>;

/** One flying pixel: where it is now (map pixels, its centre), its size, colour and opacity. */
export interface BurstPixel {
  x: number;
  y: number;
  size: number;
  /** Index into the colours the burst was given. */
  colour: number;
  alpha: number;
}

const ENEMY_PIXELS = 14;
const STRUCTURE_PIXELS = 20;
/** How far pixels fly over the burst, in tiles: from MIN up to MIN + RANGE. */
const FLY_MIN_TILES = 0.6;
const FLY_RANGE_TILES = 1.1;
/** How far they drop by the end, in tiles. */
const SAG_TILES = 0.5;

/** True while the destroyed thing is still standing there, before it bursts. */
export function burstWaiting(burst: Burst): boolean {
  return burst.ttl > BURST_TICKS;
}

/**
 * The pixels of a burst as it is now, `colours` being how many colours it has; none while
 * it's still waiting to burst.
 */
export function burstPixels(burst: Burst, colours: number): BurstPixel[] {
  if (burstWaiting(burst)) return [];
  // 0 as it bursts, approaching 1 as it ends.
  const t = Math.min(1, Math.max(0, 1 - burst.ttl / BURST_TICKS));
  const flown = 1 - (1 - t) ** 2; // fast at first, slowing down
  const rng = seeded(burst.x, burst.y);
  const count = burst.structure ? STRUCTURE_PIXELS : ENEMY_PIXELS;
  const size = burst.structure ? 4 : 3;
  const cx = (burst.x + 0.5) * TILE_SIZE;
  const cy = (burst.y + 0.5) * TILE_SIZE;
  const pixels: BurstPixel[] = [];
  for (let i = 0; i < count; i++) {
    const angle = rng() * Math.PI * 2;
    const reach = (FLY_MIN_TILES + rng() * FLY_RANGE_TILES) * TILE_SIZE;
    // Start spread over the tile, as if the thing itself breaks into pieces.
    const startX = cx + (rng() - 0.5) * TILE_SIZE * 0.7;
    const startY = cy + (rng() - 0.5) * TILE_SIZE * 0.7;
    pixels.push({
      x: Math.round(startX + Math.cos(angle) * reach * flown),
      y: Math.round(startY + Math.sin(angle) * reach * flown + SAG_TILES * TILE_SIZE * t * t),
      size,
      colour: Math.floor(rng() * colours),
      alpha: 1 - t * t, // lingers, then fades away at the end
    });
  }
  return pixels;
}

/** A small seeded generator (mulberry32), seeded from a position. */
function seeded(x: number, y: number): () => number {
  let a = (Math.round(x * 997) * 73856093) ^ (Math.round(y * 991) * 19349663);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
