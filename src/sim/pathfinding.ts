import { BREACH, type MovementProfile } from "./config";
import { attackTargetAt, blocksAt, inBounds, isKeepTile, isWalkable, tileIndex } from "./grid";
import type { FlowField, GameState, Point } from "./types";

// Neighbour order doubles as the tie-break order: N, E, S, W.
export const DIRECTIONS: readonly Point[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

/** A profile's cached flow field, built when first needed and again after the grid changes. */
export function getFlowField(state: GameState, profile: MovementProfile = "follower"): FlowField {
  const cached = state.flows[profile];
  if (cached && cached.version === state.gridVersion) return cached;
  const field = { version: state.gridVersion, dist: computeDistances(state, profile) };
  state.flows[profile] = field;
  return field;
}

/** Whether an enemy with this profile can stand on (x, y), ignoring structures. */
export function canCross(
  state: GameState,
  _profile: MovementProfile,
  x: number,
  y: number,
): boolean {
  return isWalkable(state, x, y);
}

/**
 * The neighbour an enemy on (x, y) should move to next, or null if already on the keep.
 * The returned tile may hold a blocking structure, which means "attack this".
 * On a tie, any other tile is preferred over `avoid` (the tile the enemy just left).
 */
export function nextStep(
  state: GameState,
  x: number,
  y: number,
  avoid?: Point,
  profile: MovementProfile = "follower",
): Point | null {
  const { dist } = getFlowField(state, profile);
  if (dist[tileIndex(state, x, y)] === 0) return null;
  let best: Point | null = null;
  let bestDist = Infinity;
  let bestAvoided = false;
  for (const d of DIRECTIONS) {
    const nx = x + d.x;
    const ny = y + d.y;
    if (!inBounds(state, nx, ny)) continue;
    const nd = dist[tileIndex(state, nx, ny)];
    const avoided = avoid !== undefined && nx === avoid.x && ny === avoid.y;
    if (nd < bestDist || (nd === bestDist && bestAvoided && !avoided)) {
      bestDist = nd;
      best = { x: nx, y: ny };
      bestAvoided = avoided;
    }
  }
  return best;
}

export function distanceAt(
  state: GameState,
  x: number,
  y: number,
  profile: MovementProfile = "follower",
): number {
  return getFlowField(state, profile).dist[tileIndex(state, x, y)];
}

/**
 * Dijkstra outwards from the keep. For followers and marines, entering a blocking structure
 * costs more than any open route could, so they only break through when there is no other
 * way. Breachers price it by how long it takes to break (see BREACH).
 */
function computeDistances(state: GameState, profile: MovementProfile): number[] {
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
      if (!canCross(state, profile, nx, ny)) continue;
      const cost = !blocksAt(state, nx, ny)
        ? 1
        : profile === "breacher"
          ? breachCost(state, nx, ny)
          : blockedCost;
      const ni = tileIndex(state, nx, ny);
      if (d + cost < dist[ni]) {
        dist[ni] = d + cost;
        heap.push(d + cost, ni);
      }
    }
  }
  return dist;
}

/** What breaking through (x, y) costs a breacher, in tiles it could have walked instead. */
function breachCost(state: GameState, x: number, y: number): number {
  const hp = attackTargetAt(state, x, y)!.hp;
  return 1 + Math.ceil((hp / BREACH.referenceDps) * BREACH.referenceSpeed);
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
