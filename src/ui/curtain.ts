// The fog curtain between the start screens and a game: a sheet of fog over the whole map window
// (the HUD and the map's controls too) closes in over the game playing behind the menus until it
// covers the screen, the chosen game is swapped in under it, and it opens back out, leaving the
// game as it is underneath, its own fog of war and all. It's the game's block fog (render/fog.ts)
// on a grid of tiles fixed to the window, held back from a circle in the middle; main.ts moves
// it on each frame and a curtain painter draws it.
import { IN_SIGHT, UNEXPLORED } from "../sim/fog";
import { fogImage } from "../render/fog";
import { TILE_SIZE } from "../render/palette";

/** How long the fog takes to close in, and to open back out (ms). */
export const CLOSE_MS = 900;
export const OPEN_MS = 1400;
/** Past the window's corners by this many tiles, so the fog's stepped edge starts off screen. */
const EDGE_TILES = 3;

export type CurtainPhase =
  | { phase: "closing"; started: number; then: () => void }
  /** Covered: waiting for the game to be ready (online, until the server welcomes us). */
  | { phase: "covered" }
  | { phase: "opening"; started: number };

/** The radius (px) that clears the whole window, with `cell` px tiles: past its corners. */
export function openRadius(width: number, height: number, cell: number): number {
  return Math.hypot(width, height) / 2 + EDGE_TILES * cell;
}

/** Slow at both ends. */
const ease = (t: number) => t * t * (3 - 2 * t);

/**
 * The curtain's clear circle at `now` in a window this size (px), with `cell` px tiles:
 * shrinking while closing, nothing while covered, growing while opening. `done` once it's fully
 * closed or open.
 */
export function curtainAt(
  phase: CurtainPhase,
  now: number,
  width: number,
  height: number,
  cell: number,
): { radius: number; done: boolean } {
  if (phase.phase === "covered") return { radius: 0, done: false };
  const length = phase.phase === "closing" ? CLOSE_MS : OPEN_MS;
  const t = Math.min(1, Math.max(0, (now - phase.started) / length));
  const open = phase.phase === "closing" ? 1 - ease(t) : ease(t);
  return { radius: openRadius(width, height, cell) * open, done: t >= 1 };
}

/**
 * The curtain's tiles, `cols` by `rows` of `cell` px from the window's top-left: clear where a
 * tile's centre is inside the circle (round the window's middle), unexplored fog elsewhere.
 */
export function curtainTiles(
  cols: number,
  rows: number,
  cell: number,
  width: number,
  height: number,
  radius: number,
): Uint8Array {
  const tiles = new Uint8Array(cols * rows);
  const r2 = radius * radius;
  for (let y = 0; y < rows; y++) {
    const dy = (y + 0.5) * cell - height / 2;
    for (let x = 0; x < cols; x++) {
      const dx = (x + 0.5) * cell - width / 2;
      tiles[y * cols + x] = dx * dx + dy * dy <= r2 ? IN_SIGHT : UNEXPLORED;
    }
  }
  return tiles;
}

/**
 * Draws the curtain on `canvas` (stretched over the window): the game's block fog, tile by tile,
 * redrawn only when the circle takes in or gives up a tile (or the window or tiles change size).
 */
export function createCurtainPainter(canvas: HTMLCanvasElement) {
  let drawn = "";
  return {
    draw(radius: number, cell: number) {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      // A row more below: fog is raised, so the bottom row's blocks stand up into the window.
      const cols = Math.ceil(width / cell);
      const rows = Math.ceil(height / cell) + 1;
      const tiles = curtainTiles(cols, rows, cell, width, height, radius);
      const key = `${width}x${height}:${cell}:${tiles.join("")}`;
      if (key === drawn) return;
      drawn = key;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      const ctx = canvas.getContext("2d")!;
      const scale = cell / TILE_SIZE;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const { image, lift } = fogImage(tiles, cols, rows);
      ctx.imageSmoothingEnabled = false; // hard tile edges, as on the map
      ctx.drawImage(image, 0, -lift * scale, cols * cell, image.height * scale);
    },
  };
}
