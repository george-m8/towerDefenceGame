// How the fog of war looks: a white mist drawn as raised blocks, like walls and trees. Seen land
// has a thin, low layer; unexplored land is solid and high, stepping down in see-through bands
// along its edge. Every tile has one opacity and height. Like the ground, the top is a checker.
import { IN_SIGHT, SEEN, UNEXPLORED } from "../sim/fog";
import { FOG, TILE_SIZE } from "./palette";

/** How one tile's fog looks: its opacity (0-1) and how high it's raised, in pixels. */
export interface FogLevel {
  opacity: number;
  height: number;
}

/**
 * The fog on every tile (index y * width + x): none in sight, a thin layer where seen, and
 * where unexplored, the edge band its distance (counting diagonals) from the nearest explored
 * tile falls in, or full fog past the last band.
 */
export function fogLevels(
  tier: Uint8Array,
  width: number,
  height: number,
): (FogLevel | undefined)[] {
  const bandTiles = FOG.edgeBands.reduce((sum, band) => sum + band.tiles, 0);
  const levels = new Array<FogLevel | undefined>(tier.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (tier[i] === IN_SIGHT) continue;
      levels[i] =
        tier[i] === SEEN
          ? FOG.seen
          : edgeLevel(distanceToExplored(tier, width, height, x, y, bandTiles));
    }
  }
  return levels;
}

/** The fog of the edge band `distance` tiles out from explored land. */
function edgeLevel(distance: number): FogLevel {
  let reach = 0;
  for (const band of FOG.edgeBands) {
    reach += band.tiles;
    if (distance <= reach) return band;
  }
  return FOG.unexplored;
}

/** How many tiles (counting diagonals) to the nearest explored tile, or more than `max`. */
function distanceToExplored(
  tier: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
  max: number,
): number {
  let best = max + 1;
  for (let ny = Math.max(0, y - max); ny <= Math.min(height - 1, y + max); ny++) {
    for (let nx = Math.max(0, x - max); nx <= Math.min(width - 1, x + max); nx++) {
      if (tier[ny * width + nx] === UNEXPLORED) continue;
      best = Math.min(best, Math.max(Math.abs(nx - x), Math.abs(ny - y)));
    }
  }
  return best;
}

/** A vertical run of pixels, from `top` down to (not including) `bottom`. */
export interface Span {
  top: number;
  bottom: number;
}

/**
 * Where a tile's fog goes in map pixels, given its height and the height of the fog in front
 * of it (the row below; 0 if clear). The top is lifted by `height` and stops where the fog in
 * front, lifted the same way, starts. If this fog is higher, a front face fills the step.
 * Rows in a column never overlap, so see-through fog never doubles up.
 */
export function fogSpans(
  row: number,
  height: number,
  frontHeight: number,
): { top: Span; face: Span | null } {
  const bottom = (row + 1) * TILE_SIZE;
  return {
    top: { top: row * TILE_SIZE - height, bottom: bottom - Math.max(height, frontHeight) },
    face: height > frontHeight ? { top: bottom - height, bottom: bottom - frontHeight } : null,
  };
}

/**
 * The fog as an image one pixel wide per tile and full height, starting `lift` pixels above
 * the map (fog on the top row is raised above it). Drawn stretched across the map with
 * smoothing off, every tile keeps flat colours and hard edges, with no seams between
 * see-through tiles. Rebuilt only when sight changes.
 */
export function fogImage(
  tier: Uint8Array,
  width: number,
  height: number,
): { image: HTMLCanvasElement; lift: number } {
  const levels = fogLevels(tier, width, height);
  const lift = Math.max(
    FOG.seen.height,
    FOG.unexplored.height,
    ...FOG.edgeBands.map((b) => b.height),
  );
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = lift + height * TILE_SIZE;
  const ctx = canvas.getContext("2d")!;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const level = levels[y * width + x];
      if (!level) continue;
      const front = y + 1 < height ? (levels[(y + 1) * width + x]?.height ?? 0) : 0;
      const { top, face } = fogSpans(y, level.height, front);
      ctx.globalAlpha = level.opacity;
      ctx.fillStyle = (x + y) % 2 === 0 ? FOG.colour : FOG.colourAlt;
      ctx.fillRect(x, lift + top.top, 1, top.bottom - top.top);
      if (face) {
        ctx.fillStyle = FOG.face;
        ctx.fillRect(x, lift + face.top, 1, face.bottom - face.top);
      }
    }
  }
  return { image: canvas, lift };
}
