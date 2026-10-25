// Enclosures: areas enemies can't walk to from the spawn. Building inside one (or on its walls)
// is cheaper: 50% off in the keep's enclosure, 25% off in any other. Worked out from the grid
// alone, so the server and every client agree.
import { ENCLOSURE_DISCOUNT, STRUCTURES } from "./config";
import { baseAt, blocksAt, inBounds, isKeepTile, isWalkable, mountAt } from "./grid";
import type { GameState, StructureKind } from "./types";

/** What kind of enclosure a tile belongs to (inside it, or on its boundary). */
export const NONE = 0;
export const OUTER = 1;
export const KEEP = 2;
export type EnclosureKind = typeof NONE | typeof OUTER | typeof KEEP;

export interface Enclosures {
  /** gridVersion this was worked out for. */
  version: number;
  /** Per tile (index y * width + x): NONE, OUTER or KEEP. */
  kind: EnclosureKind[];
  /** Per tile: the build discount, 0 to 1. */
  discount: number[];
}

const NEIGHBOURS_4 = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
] as const;
const NEIGHBOURS_8 = [...NEIGHBOURS_4, [1, -1], [1, 1], [-1, 1], [-1, -1]] as const;

// Cached per state, like the flow field, but outside GameState so it never goes over the wire.
const cache = new WeakMap<GameState, Enclosures>();

export function getEnclosures(state: GameState): Enclosures {
  const cached = cache.get(state);
  if (cached && cached.version === state.gridVersion) return cached;
  const enclosures = findEnclosures(state);
  cache.set(state, enclosures);
  return enclosures;
}

export function discountAt(state: GameState, x: number, y: number): number {
  if (!inBounds(state, x, y)) return 0;
  return getEnclosures(state).discount[y * state.width + x];
}

export function enclosureAt(state: GameState, x: number, y: number): EnclosureKind {
  if (!inBounds(state, x, y)) return NONE;
  return getEnclosures(state).kind[y * state.width + x];
}

/** What building `kind` at (x, y) costs: rounded to the nearest gold, never below 1. */
export function priceAt(state: GameState, kind: StructureKind, x: number, y: number): number {
  const cost = STRUCTURES[kind].cost;
  const discount = discountAt(state, x, y);
  return discount > 0 ? Math.max(1, Math.round(cost * (1 - discount))) : cost;
}

function findEnclosures(state: GameState): Enclosures {
  const { width, height } = state;
  const size = width * height;
  /** Open: somewhere an enemy could stand (walkable, nothing blocking, not the keep). */
  const open = new Array<boolean>(size);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      open[y * width + x] =
        isWalkable(state, x, y) && !blocksAt(state, x, y) && !isKeepTile(state, x, y);
    }
  }

  // Everywhere enemies can walk to from the spawn.
  const reachable = new Array<boolean>(size).fill(false);
  const queue: number[] = [];
  for (const p of state.spawnTiles) {
    const i = p.y * width + p.x;
    if (open[i] && !reachable[i]) {
      reachable[i] = true;
      queue.push(i);
    }
  }
  flood(queue, reachable, open, width, height);

  // Inside: walkable ground enemies can't reach and that doesn't border ground they can reach.
  // That includes structures standing inside a ring (a tower in a corner), but not the ring's
  // own walls, which border the outside.
  const inside = new Array<boolean>(size);
  for (let i = 0; i < size; i++) {
    const x = i % width;
    const y = Math.floor(i / width);
    inside[i] =
      isWalkable(state, x, y) &&
      !isKeepTile(state, x, y) &&
      !reachable[i] &&
      !neighbours(i, width, height, NEIGHBOURS_4).some((n) => reachable[n]);
  }

  // Connected inside tiles form areas; an area touching the keep is the keep's. An area needs
  // some open ground, so a solid block of walls out in the open isn't an "enclosure".
  const area = new Array<EnclosureKind>(size).fill(NONE);
  const seen = new Array<boolean>(size).fill(false);
  for (let start = 0; start < size; start++) {
    if (!inside[start] || seen[start]) continue;
    seen[start] = true;
    const members = [start];
    flood(members, seen, inside, width, height, true);
    if (!members.some((i) => open[i])) continue;
    // Ruins and terrain alone can box in a pocket on a fresh map; it only counts once
    // something the players built is part of the wall.
    if (!hasBuiltBoundary(state, members, inside)) continue;
    const kind = members.some((i) => touchesKeep(state, i)) ? KEEP : OUTER;
    for (const i of members) area[i] = kind;
  }

  // A keep enemies can't reach is enclosed itself, so a ring hugging it is the keep's boundary.
  const keepReached = keepTiles(state).some((i) =>
    neighbours(i, width, height, NEIGHBOURS_4).some((n) => reachable[n]),
  );
  if (!keepReached && hasBuiltBoundary(state, keepTiles(state), inside)) {
    for (const i of keepTiles(state)) area[i] = KEEP;
  }

  // Boundary: anything else next to an enclosed area (diagonals too, for ring corners) takes
  // the best discount it touches.
  const kind = [...area];
  for (let i = 0; i < size; i++) {
    if (area[i] !== NONE || (open[i] && !inside[i])) continue;
    let best: EnclosureKind = NONE;
    for (const n of neighbours(i, width, height, NEIGHBOURS_8))
      best = Math.max(best, area[n]) as EnclosureKind;
    kind[i] = best;
  }
  // The keep's own tiles aren't buildable; no discount to report there.
  for (const i of keepTiles(state)) kind[i] = NONE;

  return {
    version: state.gridVersion,
    kind,
    discount: kind.map((k) =>
      k === KEEP ? ENCLOSURE_DISCOUNT.keep : k === OUTER ? ENCLOSURE_DISCOUNT.outer : 0,
    ),
  };
}

/**
 * Breadth-first fill over open tiles from those in `queue`, marking them in `marked`. With
 * `collect`, the queue is left holding every tile reached (the whole area); otherwise emptied.
 */
function flood(
  queue: number[],
  marked: boolean[],
  open: boolean[],
  width: number,
  height: number,
  collect = false,
) {
  for (let head = 0; head < queue.length; head++) {
    for (const n of neighbours(queue[head], width, height, NEIGHBOURS_4)) {
      if (!open[n] || marked[n]) continue;
      marked[n] = true;
      queue.push(n);
    }
  }
  if (!collect) queue.length = 0;
}

function neighbours(
  i: number,
  width: number,
  height: number,
  offsets: readonly (readonly [number, number])[],
): number[] {
  const x = i % width;
  const y = Math.floor(i / width);
  const result: number[] = [];
  for (const [dx, dy] of offsets) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx >= 0 && ny >= 0 && nx < width && ny < height) result.push(ny * width + nx);
  }
  return result;
}

/** Whether any structure on the wall around these tiles was built by a player (not a ruin). */
function hasBuiltBoundary(state: GameState, tiles: number[], inside: boolean[]): boolean {
  const { width, height } = state;
  return tiles.some((i) =>
    neighbours(i, width, height, NEIGHBOURS_8).some((n) => {
      if (inside[n]) return false;
      const x = n % width;
      const y = Math.floor(n / width);
      const structure = mountAt(state, x, y) ?? baseAt(state, x, y);
      return structure !== undefined && structure.kind !== "ruin";
    }),
  );
}

function touchesKeep(state: GameState, i: number): boolean {
  return neighbours(i, state.width, state.height, NEIGHBOURS_4).some((n) =>
    isKeepTile(state, n % state.width, Math.floor(n / state.width)),
  );
}

function keepTiles(state: GameState): number[] {
  const { keep, width } = state;
  const tiles: number[] = [];
  for (let y = keep.y; y < keep.y + keep.size; y++) {
    for (let x = keep.x; x < keep.x + keep.size; x++) tiles.push(y * width + x);
  }
  return tiles;
}
