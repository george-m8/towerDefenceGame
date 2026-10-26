// Enclosures: areas enemies can't walk to from the spawn. Building inside one (or on its walls)
// is cheaper: 50% off in the keep's enclosure, 25% off in any other. Worked out from the grid
// alone, so the server and every client agree.
//
// PvP has no spawn: the biggest open area is no-man's land, and every pocket walled off from
// it belongs to the player who built its walls (land touching your keep is always yours).
// Only the owner gets the discount, and the rival can't build inside.
import { ENCLOSURE_DISCOUNT, STRUCTURES, type StructureStats } from "./config";
import {
  baseAt,
  blocksAt,
  inBounds,
  isBuilt,
  isKeepTile,
  isWalkable,
  keepAt,
  mountAt,
} from "./grid";
import type { GameState, PlayerId, StructureKind } from "./types";

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
  /** Per tile: whose enclosure it is in PvP, or 0 if it's shared (Endless) or no one's. */
  owner: number[];
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

/** The discount `player` gets here: none inside someone else's enclosure. */
export function discountAt(state: GameState, x: number, y: number, player?: PlayerId): number {
  if (!inBounds(state, x, y)) return 0;
  const { discount, owner } = getEnclosures(state);
  const i = y * state.width + x;
  return owner[i] === 0 || owner[i] === player ? discount[i] : 0;
}

/** Whose enclosure (x, y) is in, or 0 if no one's. */
export function enclosureOwnerAt(state: GameState, x: number, y: number): number {
  if (!inBounds(state, x, y)) return 0;
  return getEnclosures(state).owner[y * state.width + x];
}

/** PvP: the rival whose enclosure (x, y) is in, where `player` can't build; null if none. */
export function rivalOwnerAt(
  state: GameState,
  x: number,
  y: number,
  player: PlayerId,
): PlayerId | null {
  const owner = enclosureOwnerAt(state, x, y);
  return owner !== 0 && owner !== player ? owner : null;
}

export function enclosureAt(state: GameState, x: number, y: number): EnclosureKind {
  if (!inBounds(state, x, y)) return NONE;
  return getEnclosures(state).kind[y * state.width + x];
}

/** What building `kind` at (x, y) costs `player`: rounded to the nearest gold, never below 1. */
export function priceAt(
  state: GameState,
  kind: StructureKind,
  x: number,
  y: number,
  player?: PlayerId,
): number {
  const cost = STRUCTURES[kind].cost;
  const discount = discountAt(state, x, y, player);
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
        isWalkable(state, x, y) &&
        !blocksAt(state, x, y) &&
        !closesRingAt(state, x, y) &&
        !isKeepTile(state, x, y);
    }
  }

  const reachable =
    state.mode === "pvp"
      ? largestArea(open, width, height)
      : reachableFromSpawn(state, open, width, height);

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
  const areaOwner = new Array<number>(size).fill(0);
  const seen = new Array<boolean>(size).fill(false);
  for (let start = 0; start < size; start++) {
    if (!inside[start] || seen[start]) continue;
    seen[start] = true;
    const members = [start];
    flood(members, seen, inside, width, height, true);
    if (!members.some((i) => open[i])) continue;
    // Ruins and terrain alone can box in a pocket on a fresh map; it only counts once
    // something the players built is part of the wall.
    const builders = boundaryBuilders(state, members, inside);
    if (builders.size === 0) continue;
    const keep = members.map((i) => touchedKeep(state, i)).find((k) => k !== undefined);
    let owner = 0;
    if (state.mode === "pvp") {
      // Land by your keep is yours; anywhere else, the one player who walled it in.
      owner = keep?.owner ?? (builders.size === 1 ? [...builders][0] : 0);
      if (owner === 0) continue;
    }
    const kind = keep ? KEEP : OUTER;
    for (const i of members) {
      area[i] = kind;
      areaOwner[i] = owner;
    }
  }

  // A keep enemies (or the rival) can't reach is enclosed itself, so a ring hugging it is the
  // keep's boundary.
  for (const keep of state.keeps) {
    const tiles = keepTiles(keep, width);
    const reached = tiles.some((i) =>
      neighbours(i, width, height, NEIGHBOURS_4).some((n) => reachable[n]),
    );
    if (reached || boundaryBuilders(state, tiles, inside).size === 0) continue;
    for (const i of tiles) {
      area[i] = KEEP;
      areaOwner[i] = keep.owner ?? 0;
    }
  }

  // Boundary: anything else next to an enclosed area (diagonals too, for ring corners) takes
  // the best discount it touches, and that area's owner.
  const kind = [...area];
  const owner = [...areaOwner];
  for (let i = 0; i < size; i++) {
    if (area[i] !== NONE || (open[i] && !inside[i])) continue;
    for (const n of neighbours(i, width, height, NEIGHBOURS_8)) {
      if (area[n] <= kind[i]) continue;
      kind[i] = area[n];
      owner[i] = areaOwner[n];
    }
  }
  // The keeps' own tiles aren't buildable; no discount to report there.
  for (const keep of state.keeps) {
    for (const i of keepTiles(keep, width)) {
      kind[i] = NONE;
      owner[i] = 0;
    }
  }

  return {
    version: state.gridVersion,
    owner,
    kind,
    discount: kind.map((k) =>
      k === KEEP ? ENCLOSURE_DISCOUNT.keep : k === OUTER ? ENCLOSURE_DISCOUNT.outer : 0,
    ),
  };
}

/** A built gate: enemies walk through it, but it closes a ring of walls like a wall does. */
function closesRingAt(state: GameState, x: number, y: number): boolean {
  const base = baseAt(state, x, y);
  if (!base || !isBuilt(base)) return false;
  const stats: StructureStats = STRUCTURES[base.kind];
  return stats.enclosing === true;
}

/** Endless: everywhere enemies can walk to from the spawn. */
function reachableFromSpawn(
  state: GameState,
  open: boolean[],
  width: number,
  height: number,
): boolean[] {
  const reachable = new Array<boolean>(open.length).fill(false);
  const queue: number[] = [];
  for (const p of state.spawnTiles) {
    const i = p.y * width + p.x;
    if (open[i] && !reachable[i]) {
      reachable[i] = true;
      queue.push(i);
    }
  }
  flood(queue, reachable, open, width, height);
  return reachable;
}

/** PvP: no-man's land, the biggest connected stretch of open ground. */
function largestArea(open: boolean[], width: number, height: number): boolean[] {
  const seen = new Array<boolean>(open.length).fill(false);
  let biggest: number[] = [];
  for (let start = 0; start < open.length; start++) {
    if (!open[start] || seen[start]) continue;
    seen[start] = true;
    const members = [start];
    flood(members, seen, open, width, height, true);
    if (members.length > biggest.length) biggest = members;
  }
  const reachable = new Array<boolean>(open.length).fill(false);
  for (const i of biggest) reachable[i] = true;
  return reachable;
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

/**
 * Who built the structures on the wall around these tiles (ruins don't count). Structures
 * with no owner (placed directly, in tests) count as player 0.
 */
function boundaryBuilders(state: GameState, tiles: number[], inside: boolean[]): Set<number> {
  const { width, height } = state;
  const builders = new Set<number>();
  for (const i of tiles) {
    for (const n of neighbours(i, width, height, NEIGHBOURS_8)) {
      if (inside[n]) continue;
      const x = n % width;
      const y = Math.floor(n / width);
      const structure = mountAt(state, x, y) ?? baseAt(state, x, y);
      if (structure && structure.kind !== "ruin") builders.add(structure.owner ?? 0);
    }
  }
  return builders;
}

/** The keep next to tile i, if any. */
function touchedKeep(state: GameState, i: number) {
  for (const n of neighbours(i, state.width, state.height, NEIGHBOURS_4)) {
    const keep = keepAt(state, n % state.width, Math.floor(n / state.width));
    if (keep) return keep;
  }
  return undefined;
}

function keepTiles(keep: { x: number; y: number; size: number }, width: number): number[] {
  const tiles: number[] = [];
  for (let y = keep.y; y < keep.y + keep.size; y++) {
    for (let x = keep.x; x < keep.x + keep.size; x++) tiles.push(y * width + x);
  }
  return tiles;
}
