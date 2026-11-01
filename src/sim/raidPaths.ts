// Raider paths: tiles the raiders paint on the ground. A free wave enemy that steps onto one
// keeps to it from then on, walking a shortest-path flow within the path (round, or through,
// whatever is in the way, at its usual costs) to the end of that stretch: the tile painted last.
// There it goes back to its own field for good, so it never loops back onto a path.
import { RAID, type MovementProfile } from "./config";
import { inBounds, tileIndex } from "./grid";
import { MinHeap, tileCosts } from "./pathfinding";
import type { CommandResult, Enemy, GameState } from "./types";

export interface PathField {
  /** As a flow field's, on the paths (Infinity off them): an enemy steps to the lowest beside it. */
  dist: Float64Array;
  /** 1 on painted tiles the profile can stand on. */
  onPath: Uint8Array;
  /** 1 at each stretch's end nearest the keep, where enemies leave the paths. */
  exit: Uint8Array;
}

interface Cache {
  gridVersion: number;
  paths: number[];
  fields: Partial<Record<MovementProfile, PathField>>;
}

/** Path fields by game, until the grid or the paths change (the paths array is replaced then). */
const caches = new WeakMap<GameState, Cache>();

/** Paints a tile of path, or rubs one out. */
export function paintPath(state: GameState, x: number, y: number, erase: boolean): CommandResult {
  if (!inBounds(state, x, y)) return { ok: false, reason: "Off the map" };
  const i = tileIndex(state, x, y);
  const painted = state.raidPaths.includes(i);
  if (erase) {
    if (painted) state.raidPaths = state.raidPaths.filter((t) => t !== i);
    return { ok: true };
  }
  if (painted) return { ok: true };
  if (state.raidPaths.length >= RAID.maxPathTiles) {
    return { ok: false, reason: "No more path to paint" };
  }
  state.raidPaths = [...state.raidPaths, i];
  return { ok: true };
}

export function clearPaths(state: GameState): void {
  state.raidPaths = [];
}

/**
 * The field a free wave enemy walks: the paths' while it's on one, short of its end, else
 * undefined (its own). Reaching a path's end, it's done with paths for good.
 */
export function pathFieldFor(
  state: GameState,
  enemy: Enemy,
  profile: MovementProfile,
): PathField | undefined {
  if (enemy.pathDone || state.raidPaths.length === 0) return undefined;
  const field = pathField(state, profile);
  const i = tileIndex(state, enemy.x, enemy.y);
  if (field.exit[i]) {
    enemy.pathDone = true;
    return undefined;
  }
  return field.dist[i] < Infinity ? field : undefined;
}

function pathField(state: GameState, profile: MovementProfile): PathField {
  let cache = caches.get(state);
  if (!cache || cache.gridVersion !== state.gridVersion || cache.paths !== state.raidPaths) {
    cache = { gridVersion: state.gridVersion, paths: state.raidPaths, fields: {} };
    caches.set(state, cache);
  }
  return (cache.fields[profile] ??= computePathField(state, profile));
}

/**
 * A shortest-path flow within each stretch: Dijkstra out from its end (its tile painted last),
 * within the stretch, at the profile's own costs.
 */
function computePathField(state: GameState, profile: MovementProfile): PathField {
  const { width, height } = state;
  const size = width * height;
  const cost = tileCosts(state, profile);
  const onPath = new Uint8Array(size);
  for (const i of state.raidPaths) if (cost[i] < Infinity) onPath[i] = 1;

  const exit = new Uint8Array(size);
  const dist = new Float64Array(size).fill(Infinity);
  const heap = new MinHeap(size);
  for (const end of stretchEnds(state, (i) => onPath[i] === 1)) {
    exit[end] = 1;
    dist[end] = 0;
    heap.push(0, end);
  }
  spread(dist, heap, width, height, (i) => (onPath[i] ? cost[i] : Infinity));
  return { dist, onPath, exit };
}

/**
 * Each stretch of path's end: its tile painted last. Stretches are 4-connected painted tiles
 * where `inside` holds (by default, all of them; a profile leaves out what it can't stand on).
 */
export function stretchEnds(
  state: Pick<GameState, "raidPaths" | "width" | "height">,
  inside: (i: number) => boolean = () => true,
): number[] {
  const { width, height } = state;
  const size = width * height;
  const painted = new Uint8Array(size);
  const paintedAt = new Int32Array(size);
  state.raidPaths.forEach((i, order) => {
    painted[i] = inside(i) ? 1 : 0;
    paintedAt[i] = order;
  });
  const seen = new Uint8Array(size);
  const ends: number[] = [];
  for (const start of state.raidPaths) {
    if (!painted[start] || seen[start]) continue;
    const stretch = flood(start, width, height, (i) => painted[i] === 1, seen);
    ends.push(stretch.reduce((last, i) => (paintedAt[i] > paintedAt[last] ? i : last)));
  }
  return ends;
}

/** The 4-connected tiles reachable from `start` where `inside` holds, marking them `seen`. */
function flood(
  start: number,
  width: number,
  height: number,
  inside: (i: number) => boolean,
  seen: Uint8Array,
): number[] {
  const tiles = [start];
  seen[start] = 1;
  for (let head = 0; head < tiles.length; head++) {
    for (const n of neighbours(tiles[head], width, height)) {
      if (seen[n] || !inside(n)) continue;
      seen[n] = 1;
      tiles.push(n);
    }
  }
  return tiles;
}

/** Dijkstra from what's in `heap`, stepping onto a tile for `costOf` it. */
function spread(
  dist: Float64Array,
  heap: MinHeap,
  width: number,
  height: number,
  costOf: (i: number) => number,
) {
  while (heap.size > 0) {
    const d = heap.topPriority();
    const i = heap.pop();
    if (d > dist[i]) continue;
    for (const n of neighbours(i, width, height)) {
      const nd = d + costOf(n);
      if (nd < dist[n]) {
        dist[n] = nd;
        heap.push(nd, n);
      }
    }
  }
}

function neighbours(i: number, width: number, height: number): number[] {
  const x = i % width;
  const out: number[] = [];
  if (i >= width) out.push(i - width); // N
  if (x < width - 1) out.push(i + 1); // E
  if (i < width * (height - 1)) out.push(i + width); // S
  if (x > 0) out.push(i - 1); // W
  return out;
}
