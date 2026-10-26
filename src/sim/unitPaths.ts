// Paths for units. Enemy flow fields all lead to the keep; units go anywhere, so each one
// searches its own way when it needs one (see the per-tick budget in units.ts).
import { teamOf } from "./fog";
import { baseAt, blocksAt, keepAt, mountAt } from "./grid";
import { DIRECTIONS } from "./pathfinding";
import { canStand } from "./units";
import type { GameState, PlayerId, Point } from "./types";

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
  /** Per tile: the cheapest cost found so far, and the queue by cost (breaching searches only). */
  dist: Float64Array;
  heap: MinHeap;
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
      dist: new Float64Array(tiles),
      heap: new MinHeap(tiles),
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

/** Limits and extras for a search. */
export interface PathOptions {
  /** Only through tiles this team has explored (offensive units stay on known land). */
  exploredBy?: number;
  /**
   * PvP: a rival's blocking structures may be crossed, each costing the tiles this unit could
   * walk while breaking it (1 + HP / dps), so the weakest wall wins. `owner` is the unit's.
   */
  breach?: { owner: PlayerId; dps: number };
}

/**
 * The steps (not counting `from`) of a shortest walk over open tiles to the nearest tile where
 * `isGoal` holds. Empty if `from` is already one; null if none can be reached. One search
 * finds the nearest of any number of goals, e.g. "next to any tree". With `breach`, the steps
 * may include rival structures to break on the way.
 */
export function findPath(
  state: GameState,
  from: Point,
  isGoal: (x: number, y: number) => boolean,
  options: PathOptions = {},
): Point[] | null {
  if (isGoal(from.x, from.y)) return [];
  if (options.breach) return findBreachingPath(state, from, isGoal, options);
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
      if (!explored(state, index, options.exploredBy)) continue;
      b.seenBy[index] = search;
      b.cameFrom[index] = i;
      if (isGoal(x, y)) return walkBack(width, b.cameFrom, index);
      b.queue[tail++] = index;
    }
  }
  return null;
}

function explored(state: GameState, index: number, team: number | undefined): boolean {
  return team === undefined || !state.fog || (state.explored[index] & (1 << team)) !== 0;
}

/** What crossing a tile costs a breaching unit: 1 if open, more for a rival's structure. */
function breachCost(
  state: GameState,
  index: number,
  open: Uint8Array,
  breach: NonNullable<PathOptions["breach"]>,
) {
  if (open[index]) return 1;
  const x = index % state.width;
  const y = (index - x) / state.width;
  if (keepAt(state, x, y)) return Infinity;
  const blocker = baseAt(state, x, y) ?? mountAt(state, x, y);
  if (!blocker || !blocksAt(state, x, y) || blocker.owner === null) return Infinity;
  if (teamOf(state, blocker.owner) === teamOf(state, breach.owner)) return Infinity;
  return 1 + Math.ceil(blocker.hp / breach.dps);
}

/** Dijkstra over open tiles and breakable rival structures (see PathOptions.breach). */
function findBreachingPath(
  state: GameState,
  from: Point,
  isGoal: (x: number, y: number) => boolean,
  options: PathOptions,
): Point[] | null {
  const { width, height } = state;
  const b = buffersFor(state);
  const search = ++b.search;
  const heap = b.heap;
  heap.size = 0;
  const start = from.y * width + from.x;
  b.seenBy[start] = search;
  b.dist[start] = 0;
  b.cameFrom[start] = -1;
  heap.push(start, 0);
  while (heap.size > 0) {
    const [i, cost] = heap.pop();
    if (cost > b.dist[i]) continue; // a stale entry
    const px = i % width;
    const py = (i - px) / width;
    if (i !== start && isGoal(px, py)) return walkBack(width, b.cameFrom, i);
    for (const d of DIRECTIONS) {
      const x = px + d.x;
      const y = py + d.y;
      if (x < 0 || x >= width || y < 0 || y >= height) continue;
      const index = y * width + x;
      if (!explored(state, index, options.exploredBy)) continue;
      const next = cost + breachCost(state, index, b.open, options.breach!);
      if (next === Infinity || (b.seenBy[index] === search && next >= b.dist[index])) continue;
      b.seenBy[index] = search;
      b.dist[index] = next;
      b.cameFrom[index] = i;
      heap.push(index, next);
    }
  }
  return null;
}

/** A binary min-heap of tile indices by cost, on typed arrays. */
class MinHeap {
  private tiles: Int32Array;
  private costs: Float64Array;
  size = 0;
  constructor(capacity: number) {
    // A tile can be pushed again when a cheaper way to it turns up, so leave room.
    this.tiles = new Int32Array(capacity * 4);
    this.costs = new Float64Array(capacity * 4);
  }
  push(tile: number, cost: number) {
    let i = this.size++;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.costs[parent] <= cost) break;
      this.tiles[i] = this.tiles[parent];
      this.costs[i] = this.costs[parent];
      i = parent;
    }
    this.tiles[i] = tile;
    this.costs[i] = cost;
  }
  pop(): [number, number] {
    const top: [number, number] = [this.tiles[0], this.costs[0]];
    const tile = this.tiles[--this.size];
    const cost = this.costs[this.size];
    let i = 0;
    for (;;) {
      let child = 2 * i + 1;
      if (child >= this.size) break;
      if (child + 1 < this.size && this.costs[child + 1] < this.costs[child]) child++;
      if (this.costs[child] >= cost) break;
      this.tiles[i] = this.tiles[child];
      this.costs[i] = this.costs[child];
      i = child;
    }
    this.tiles[i] = tile;
    this.costs[i] = cost;
    return top;
  }
}

function walkBack(width: number, cameFrom: Int32Array, end: number): Point[] {
  const path: Point[] = [];
  for (let i = end; cameFrom[i] !== -1; i = cameFrom[i]) {
    path.push({ x: i % width, y: Math.floor(i / width) });
  }
  return path.reverse();
}
