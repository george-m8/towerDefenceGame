// Paths for units. Enemy flow fields all lead to the keep; units go anywhere, so each one
// searches its own way when it needs one (see the per-tick budget in units.ts).
import { DIRECTIONS } from "./pathfinding";
import { canStand } from "./units";
import type { GameState, Point } from "./types";

/** Search buffers, reused between searches on maps of the same size (never sent anywhere). */
interface Buffers {
  /** Per tile: 1 where a unit can stand, as of `version` (the gridVersion). */
  open: Uint8Array;
  version: number;
  /** Per tile: the search that last reached it, so nothing needs clearing between searches. */
  seenBy: Int32Array;
  /** Per tile: the tile it was reached from. */
  cameFrom: Int32Array;
  queue: Int32Array;
  search: number;
}
const buffers = new WeakMap<GameState, Buffers>();

function buffersFor(state: GameState): Buffers {
  const tiles = state.width * state.height;
  let b = buffers.get(state);
  if (!b || b.seenBy.length !== tiles) {
    b = {
      open: new Uint8Array(tiles),
      version: -1,
      seenBy: new Int32Array(tiles),
      cameFrom: new Int32Array(tiles),
      queue: new Int32Array(tiles),
      search: 0,
    };
    buffers.set(state, b);
  }
  if (b.version !== state.gridVersion) {
    for (let y = 0; y < state.height; y++) {
      for (let x = 0; x < state.width; x++)
        b.open[y * state.width + x] = canStand(state, x, y) ? 1 : 0;
    }
    b.version = state.gridVersion;
  }
  return b;
}

/**
 * The steps (not counting `from`) of a shortest walk over open tiles to the nearest tile where
 * `isGoal` holds. Empty if `from` is already one; null if none can be reached. One search
 * finds the nearest of any number of goals, e.g. "next to any tree".
 */
export function findPath(
  state: GameState,
  from: Point,
  isGoal: (x: number, y: number) => boolean,
): Point[] | null {
  if (isGoal(from.x, from.y)) return [];
  const { width } = state;
  const b = buffersFor(state);
  const search = ++b.search;
  const start = from.y * width + from.x;
  b.seenBy[start] = search;
  b.cameFrom[start] = -1;
  b.queue[0] = start;
  let head = 0;
  let tail = 1;
  while (head < tail) {
    const i = b.queue[head++];
    const px = i % width;
    const py = (i - px) / width;
    for (const d of DIRECTIONS) {
      const x = px + d.x;
      const y = py + d.y;
      const index = y * width + x;
      if (x < 0 || x >= width || y < 0 || !b.open[index] || b.seenBy[index] === search) continue;
      b.seenBy[index] = search;
      b.cameFrom[index] = i;
      if (isGoal(x, y)) return walkBack(width, b.cameFrom, index);
      b.queue[tail++] = index;
    }
  }
  return null;
}

function walkBack(width: number, cameFrom: Int32Array, end: number): Point[] {
  const path: Point[] = [];
  for (let i = end; cameFrom[i] !== -1; i = cameFrom[i]) {
    path.push({ x: i % width, y: Math.floor(i / width) });
  }
  return path.reverse();
}
