import { blocksAt, inBounds, isKeepTile, tileIndex } from "./grid";
import type { FlowField, GameState, Point } from "./types";

// Neighbour order doubles as the tie-break order: N, E, S, W.
export const DIRECTIONS: readonly Point[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

/** The cached flow field, recomputed only when the grid has changed since it was built. */
export function getFlowField(state: GameState): FlowField {
  if (!state.flow || state.flow.version !== state.gridVersion) {
    state.flow = { version: state.gridVersion, dist: computeDistances(state) };
  }
  return state.flow;
}

/**
 * The neighbour an enemy on (x, y) should move to next, or null if already on the keep.
 * The returned tile may hold a blocking structure, which means "attack this".
 */
export function nextStep(state: GameState, x: number, y: number): Point | null {
  const { dist } = getFlowField(state);
  if (dist[tileIndex(state, x, y)] === 0) return null;
  let best: Point | null = null;
  let bestDist = Infinity;
  for (const d of DIRECTIONS) {
    const nx = x + d.x;
    const ny = y + d.y;
    if (!inBounds(state, nx, ny)) continue;
    const nd = dist[tileIndex(state, nx, ny)];
    if (nd < bestDist) {
      bestDist = nd;
      best = { x: nx, y: ny };
    }
  }
  return best;
}

export function distanceAt(state: GameState, x: number, y: number): number {
  return getFlowField(state).dist[tileIndex(state, x, y)];
}

/**
 * Dijkstra outwards from the keep. Entering a blocking structure costs more than
 * any open route could, so enemies only break through when there is no other way.
 */
function computeDistances(state: GameState): number[] {
  const blockedCost = state.width * state.height + 1;
  const dist = new Array<number>(state.width * state.height).fill(Infinity);
  const heap = new MinHeap();

  for (let y = 0; y < state.height; y++) {
    for (let x = 0; x < state.width; x++) {
      if (!isKeepTile(state, x, y)) continue;
      const i = tileIndex(state, x, y);
      dist[i] = 0;
      heap.push(0, i);
    }
  }

  while (heap.size > 0) {
    const [d, i] = heap.pop();
    if (d > dist[i]) continue;
    const x = i % state.width;
    const y = (i - x) / state.width;
    for (const dir of DIRECTIONS) {
      const nx = x + dir.x;
      const ny = y + dir.y;
      if (!inBounds(state, nx, ny)) continue;
      const cost = blocksAt(state, nx, ny) ? blockedCost : 1;
      const ni = tileIndex(state, nx, ny);
      if (d + cost < dist[ni]) {
        dist[ni] = d + cost;
        heap.push(d + cost, ni);
      }
    }
  }
  return dist;
}

/** Minimal binary heap of [priority, value] pairs. */
class MinHeap {
  private items: [number, number][] = [];

  get size() {
    return this.items.length;
  }

  push(priority: number, value: number) {
    const items = this.items;
    items.push([priority, value]);
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (items[parent][0] <= items[i][0]) break;
      [items[parent], items[i]] = [items[i], items[parent]];
      i = parent;
    }
  }

  pop(): [number, number] {
    const items = this.items;
    const top = items[0];
    const last = items.pop()!;
    if (items.length > 0) {
      items[0] = last;
      let i = 0;
      for (;;) {
        const left = i * 2 + 1;
        const right = left + 1;
        let smallest = i;
        if (left < items.length && items[left][0] < items[smallest][0]) smallest = left;
        if (right < items.length && items[right][0] < items[smallest][0]) smallest = right;
        if (smallest === i) break;
        [items[smallest], items[i]] = [items[i], items[smallest]];
        i = smallest;
      }
    }
    return top;
  }
}
