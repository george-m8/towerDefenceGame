// Fog of war. Every tile is unexplored (black), seen (land shown, enemies hidden) or in sight
// (everything shown). In sight is live, from what stands now; seen is remembered in
// state.explored. Sight is shared by every player, and only affects what's drawn and where
// players can build: enemies move and fight the same either way.
import { angleTo, facingAngle, inArc } from "./aiming";
import { KEEP_SIGHT, SIGHT_CLOSE_RADIUS, STRUCTURES, type StructureStats } from "./config";
import { inBounds } from "./grid";
import type { Facing, GameState, StructureKind } from "./types";

export const UNEXPLORED = 0;
export const SEEN = 1;
export const IN_SIGHT = 2;
export type Tier = typeof UNEXPLORED | typeof SEEN | typeof IN_SIGHT;

/** Something that sees: a structure, or one being placed. */
export interface Viewer {
  kind: StructureKind;
  x: number;
  y: number;
  facing?: Facing;
}

interface Sight {
  /** gridVersion and fog setting this was worked out for. */
  version: number;
  fog: boolean;
  /** Per tile (index y * width + x). */
  tier: Uint8Array;
}

// Cached per state, like enclosures, so it never goes over the wire.
const cache = new WeakMap<GameState, Sight>();

/** The tier of every tile. Recomputed only when the grid changes. */
export function getSight(state: GameState): Uint8Array {
  const cached = cache.get(state);
  if (cached && cached.version === state.gridVersion && cached.fog === state.fog) {
    return cached.tier;
  }
  const tier = findSight(state);
  cache.set(state, { version: state.gridVersion, fog: state.fog, tier });
  return tier;
}

export function tierAt(state: GameState, x: number, y: number): Tier {
  if (!inBounds(state, x, y)) return UNEXPLORED;
  return getSight(state)[y * state.width + x] as Tier;
}

/** Whether players can build (and sell) here: anywhere seen or in sight. */
export function isExplored(state: GameState, x: number, y: number): boolean {
  return tierAt(state, x, y) !== UNEXPLORED;
}

/** Enemies, shots and splashes are only drawn on tiles in sight. Takes fractional positions. */
export function canSeeEnemiesAt(state: GameState, x: number, y: number): boolean {
  return tierAt(state, Math.round(x), Math.round(y)) === IN_SIGHT;
}

/** A fresh explored layer: the keep's outer sight and the spawn strip. */
export function initialExplored(state: GameState): number[] {
  const explored = new Array<number>(state.width * state.height).fill(0);
  forEachKeepSightTile(state, (i) => (explored[i] = 1));
  for (const p of state.spawnTiles) explored[p.y * state.width + p.x] = 1;
  return explored;
}

/** Marks everything a new structure can see as explored, for good. */
export function reveal(state: GameState, viewer: Viewer): void {
  forEachSightTile(state, viewer, (i) => (state.explored[i] = 1));
}

/**
 * Calls `visit` for every tile `viewer` sees, with IN_SIGHT or SEEN. A fixed tower (an archer)
 * sees only along its arc, plus the tiles right around it; everything else sees all round.
 */
export function forEachSightTile(
  state: GameState,
  viewer: Viewer,
  visit: (index: number, tier: Tier) => void,
): void {
  const stats: StructureStats = STRUCTURES[viewer.kind];
  if (!stats.sight) return;
  const { inner, outer } = stats.sight;
  const tower = stats.tower;
  const arc =
    tower && tower.turnDegreesPerSecond === 0 && tower.arcDegrees < 360 && viewer.facing
      ? { aim: facingAngle(viewer.facing), degrees: tower.arcDegrees }
      : null;
  const reach = Math.floor(outer);
  for (let y = viewer.y - reach; y <= viewer.y + reach; y++) {
    for (let x = viewer.x - reach; x <= viewer.x + reach; x++) {
      if (!inBounds(state, x, y)) continue;
      const distance = Math.hypot(x - viewer.x, y - viewer.y);
      if (distance > outer) continue;
      if (arc && distance > SIGHT_CLOSE_RADIUS) {
        if (!inArc(arc.aim, arc.degrees, angleTo(viewer, { x, y }))) continue;
      }
      visit(y * state.width + x, distance <= inner ? IN_SIGHT : SEEN);
    }
  }
}

/** The keep sees from its nearest tile. */
function forEachKeepSightTile(state: GameState, visit: (index: number, tier: Tier) => void) {
  const { keep } = state;
  const { inner, outer } = KEEP_SIGHT;
  const reach = Math.floor(outer);
  const last = keep.size - 1;
  for (let y = keep.y - reach; y <= keep.y + last + reach; y++) {
    for (let x = keep.x - reach; x <= keep.x + last + reach; x++) {
      if (!inBounds(state, x, y)) continue;
      const dx = Math.max(keep.x - x, 0, x - (keep.x + last));
      const dy = Math.max(keep.y - y, 0, y - (keep.y + last));
      const distance = Math.hypot(dx, dy);
      if (distance <= outer) visit(y * state.width + x, distance <= inner ? IN_SIGHT : SEEN);
    }
  }
}

function findSight(state: GameState): Uint8Array {
  const tier = new Uint8Array(state.width * state.height);
  if (!state.fog) return tier.fill(IN_SIGHT);
  for (let i = 0; i < tier.length; i++) if (state.explored[i]) tier[i] = SEEN;
  const see = (i: number, t: Tier) => {
    if (t > tier[i]) tier[i] = t;
  };
  forEachKeepSightTile(state, see);
  // Ruins have no sight, so only what players built counts.
  for (const structure of Object.values(state.structures)) forEachSightTile(state, structure, see);
  return tier;
}
