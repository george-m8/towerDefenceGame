import {
  BREACH,
  MARINE_COSTS,
  STRUCTURES,
  TERRAIN,
  type MovementProfile,
  type StructureStats,
} from "./config";
import {
  attackTargetAt,
  inBounds,
  isBuilt,
  isKeepTile,
  isWalkable,
  terrainAt,
  tileIndex,
} from "./grid";
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
  profile: MovementProfile,
  x: number,
  y: number,
): boolean {
  if (isWalkable(state, x, y)) return true;
  // Marines also swim: rivers and the sea (a bridged river tile is already walkable).
  return profile === "marine" && inBounds(state, x, y) && terrainAt(state, x, y) in MARINE_COSTS;
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
 * way. Breachers price it by how long it takes to break (see BREACH). Each tile's cost is
 * worked out once up front, so the search itself is plain array work.
 */
function computeDistances(state: GameState, profile: MovementProfile): number[] {
  const { width, height } = state;
  const cost = tileCosts(state, profile);
  const dist = new Float64Array(width * height).fill(Infinity);
  const heap = new MinHeap(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!isKeepTile(state, x, y)) continue;
      const i = tileIndex(state, x, y);
      dist[i] = 0;
      heap.push(0, i);
    }
  }

  const relax = (d: number, ni: number) => {
    const nd = d + cost[ni];
    if (nd < dist[ni]) {
      dist[ni] = nd;
      heap.push(nd, ni);
    }
  };
  while (heap.size > 0) {
    const d = heap.topPriority();
    const i = heap.pop();
    if (d > dist[i]) continue;
    const x = i % width;
    if (i >= width) relax(d, i - width); // N
    if (x < width - 1) relax(d, i + 1); // E
    if (i < width * (height - 1)) relax(d, i + width); // S
    if (x > 0) relax(d, i - 1); // W
  }
  return Array.from(dist);
}

/**
 * The cost of stepping onto each tile for this profile; Infinity where it can't go. Reads the
 * layers directly (the same rules as canCross and blocksAt) because it runs for every tile.
 */
function tileCosts(state: GameState, profile: MovementProfile): Float64Array {
  const blockedCost = state.width * state.height + 1;
  const { terrain, base, mount, structures } = state;
  const cost = new Float64Array(terrain.length);
  for (let i = 0; i < terrain.length; i++) {
    // Anything still being built is left out: it doesn't block or bridge yet.
    const baseStats: StructureStats | undefined =
      base[i] > 0 && isBuilt(structures[base[i]])
        ? STRUCTURES[structures[base[i]].kind]
        : undefined;
    const ground = TERRAIN[terrain[i]].walkable || baseStats?.spansWater === true;
    const water = MARINE_COSTS[terrain[i] as keyof typeof MARINE_COSTS];
    if (!ground && !(profile === "marine" && water !== undefined)) cost[i] = Infinity;
    else if ((mount[i] > 0 && isBuilt(structures[mount[i]])) || baseStats?.blocksMovement) {
      cost[i] =
        profile === "breacher"
          ? breachCost(state, i % state.width, Math.floor(i / state.width))
          : blockedCost;
    } else cost[i] = ground ? 1 : water;
  }
  return cost;
}

/** What breaking through (x, y) costs a breacher, in tiles it could have walked instead. */
function breachCost(state: GameState, x: number, y: number): number {
  const hp = attackTargetAt(state, x, y)!.hp;
  return 1 + Math.ceil((hp / BREACH.referenceDps) * BREACH.referenceSpeed);
}

/** Minimal binary heap of (priority, tile index) pairs in typed arrays, growing as needed. */
class MinHeap {
  private priorities: Float64Array;
  private values: Int32Array;
  size = 0;

  constructor(capacity: number) {
    this.priorities = new Float64Array(Math.max(16, capacity));
    this.values = new Int32Array(Math.max(16, capacity));
  }

  push(priority: number, value: number) {
    if (this.size === this.values.length) this.grow();
    const p = this.priorities;
    const v = this.values;
    let i = this.size++;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (p[parent] <= priority) break;
      p[i] = p[parent];
      v[i] = v[parent];
      i = parent;
    }
    p[i] = priority;
    v[i] = value;
  }

  topPriority(): number {
    return this.priorities[0];
  }

  /** Removes and returns the value with the smallest priority. */
  pop(): number {
    const p = this.priorities;
    const v = this.values;
    const top = v[0];
    const last = --this.size;
    const lastP = p[last];
    const lastV = v[last];
    let i = 0;
    for (;;) {
      const left = i * 2 + 1;
      if (left >= last) break;
      const right = left + 1;
      const child = right < last && p[right] < p[left] ? right : left;
      if (p[child] >= lastP) break;
      p[i] = p[child];
      v[i] = v[child];
      i = child;
    }
    p[i] = lastP;
    v[i] = lastV;
    return top;
  }

  private grow() {
    const p = new Float64Array(this.priorities.length * 2);
    const v = new Int32Array(this.values.length * 2);
    p.set(this.priorities);
    v.set(this.values);
    this.priorities = p;
    this.values = v;
  }
}
