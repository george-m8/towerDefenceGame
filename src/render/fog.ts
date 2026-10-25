// How the fog of war looks: a white mist with one opacity per tile. Seen land is lightly misted
// and unexplored land is solid, except for see-through bands along its edge. Like the ground,
// the fog is a checker of two colours.
import { IN_SIGHT, SEEN, UNEXPLORED } from "../sim/fog";
import { FOG } from "./palette";

/**
 * The fog's opacity on every tile (index y * width + x): clear in sight, thin where seen, and
 * where unexplored, set by which edge band its distance (counting diagonals) from the nearest
 * explored tile falls in, or solid past the last band.
 */
export function fogOpacity(tier: Uint8Array, width: number, height: number): Float32Array {
  const bandTiles = FOG.edgeBands.reduce((sum, band) => sum + band.tiles, 0);
  const opacity = new Float32Array(tier.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (tier[i] === IN_SIGHT) continue;
      if (tier[i] === SEEN) {
        opacity[i] = FOG.seen;
        continue;
      }
      opacity[i] = edgeOpacity(distanceToExplored(tier, width, height, x, y, bandTiles));
    }
  }
  return opacity;
}

/** The opacity of the edge band `distance` tiles out from explored land. */
function edgeOpacity(distance: number): number {
  let reach = 0;
  for (const band of FOG.edgeBands) {
    reach += band.tiles;
    if (distance <= reach) return band.opacity;
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

/**
 * The fog as an image at one pixel per tile, drawn stretched over the map with smoothing off
 * so every tile keeps its own flat colour and opacity.
 */
export function fogImage(tier: Uint8Array, width: number, height: number): HTMLCanvasElement {
  const opacity = fogOpacity(tier, width, height);
  const colours = [hexToRgb(FOG.colour), hexToRgb(FOG.colourAlt)];
  const image = new ImageData(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const [r, g, b] = colours[(x + y) % 2];
      image.data.set([r, g, b, Math.round(opacity[i] * 255)], i * 4);
    }
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.putImageData(image, 0, 0);
  return canvas;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
