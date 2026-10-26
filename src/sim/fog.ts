// Fog of war. Every tile is unexplored (black), seen (land shown, enemies hidden) or in sight
// (everything shown). In sight is live, from what stands now; seen is remembered in
// state.explored. Sight belongs to a team: in Endless everyone shares one, in PvP each player
// sees only what their own keep and structures see. Fog only affects what's drawn and where
// players can build: enemies move and fight the same either way.
import { angleTo, facingAngle, inArc } from "./aiming";
import {
  KEEP_SIGHT,
  SIGHT_CLOSE_RADIUS,
  STRUCTURES,
  UNIT_KINDS,
  type SightStats,
  type StructureStats,
} from "./config";
import { inBounds } from "./grid";
import type { Facing, GameState, Keep, PlayerId, StructureKind, Unit } from "./types";

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
  /** gridVersion, sightVersion and fog setting this was worked out for. */
  version: number;
  sightVersion: number;
  fog: boolean;
  /** Per tile (index y * width + x). */
  tier: Uint8Array;
}

/**
 * Whose sight a player shares: everyone is team 0 in Endless; in PvP each player is their own
 * team. Structures with no owner (ruins, or ones placed by tests) count as team 0.
 */
export function teamOf(state: GameState, player: PlayerId | null | undefined): number {
  return state.mode === "pvp" && player ? player : 0;
}

// Cached per state and team, like enclosures, so it never goes over the wire.
const cache = new WeakMap<GameState, Map<number, Sight>>();

/** The tier of every tile, as `player` sees it. Recomputed only when the grid changes or a unit
 * moves to another tile. */
export function getSight(state: GameState, player?: PlayerId): Uint8Array {
  const team = teamOf(state, player);
  let byTeam = cache.get(state);
  if (!byTeam) cache.set(state, (byTeam = new Map()));
  const cached = byTeam.get(team);
  if (
    cached &&
    cached.version === state.gridVersion &&
    cached.sightVersion === state.sightVersion &&
    cached.fog === state.fog
  ) {
    return cached.tier;
  }
  const tier = findSight(state, team);
  byTeam.set(team, {
    version: state.gridVersion,
    sightVersion: state.sightVersion,
    fog: state.fog,
    tier,
  });
  return tier;
}

export function tierAt(state: GameState, x: number, y: number, player?: PlayerId): Tier {
  if (!inBounds(state, x, y)) return UNEXPLORED;
  return getSight(state, player)[y * state.width + x] as Tier;
}

/** Whether `player` can build (and sell) here: anywhere they've seen or have in sight. */
export function isExplored(state: GameState, x: number, y: number, player?: PlayerId): boolean {
  return tierAt(state, x, y, player) !== UNEXPLORED;
}

/** Enemies, shots and splashes are only drawn on tiles in sight. Takes fractional positions. */
export function canSeeEnemiesAt(
  state: GameState,
  x: number,
  y: number,
  player?: PlayerId,
): boolean {
  return tierAt(state, Math.round(x), Math.round(y), player) === IN_SIGHT;
}

/**
 * A fresh explored layer (bit 0, Endless's one team): the keep's outer sight and the spawn
 * strip. PvP keeps have no owner yet; assignKeeps reveals each one for its player.
 */
export function initialExplored(state: GameState): number[] {
  const explored = new Array<number>(state.width * state.height).fill(0);
  for (const keep of state.keeps) {
    if (state.mode !== "pvp") forEachKeepSightTile(state, keep, (i) => (explored[i] |= 1));
  }
  for (const p of state.spawnTiles) explored[p.y * state.width + p.x] |= 1;
  return explored;
}

/** Marks everything a new structure can see as explored by its owner's team, for good. */
export function reveal(state: GameState, viewer: Viewer & { owner?: PlayerId | null }): void {
  const bit = 1 << teamOf(state, viewer.owner);
  forEachSightTile(state, viewer, (i) => (state.explored[i] |= bit));
}

/** A unit has spawned or moved to another tile: sight changes, and what it sees is explored. */
export function unitMoved(state: GameState, unit: Unit): void {
  const bit = 1 << teamOf(state, unit.owner);
  forEachUnitSightTile(state, unit, (i) => (state.explored[i] |= bit));
  state.sightVersion++;
}

/** A unit sees all round from the tile it's nearest. */
function forEachUnitSightTile(
  state: GameState,
  unit: Unit,
  visit: (index: number, tier: Tier) => void,
) {
  forEachCircleTile(
    state,
    Math.round(unit.x),
    Math.round(unit.y),
    UNIT_KINDS[unit.kind].sight,
    visit,
  );
}

function forEachCircleTile(
  state: GameState,
  cx: number,
  cy: number,
  { inner, outer }: SightStats,
  visit: (index: number, tier: Tier) => void,
) {
  const reach = Math.floor(outer);
  for (let y = cy - reach; y <= cy + reach; y++) {
    for (let x = cx - reach; x <= cx + reach; x++) {
      if (!inBounds(state, x, y)) continue;
      const distance = Math.hypot(x - cx, y - cy);
      if (distance <= outer) visit(y * state.width + x, distance <= inner ? IN_SIGHT : SEEN);
    }
  }
}

/** Marks a keep's outer sight as explored by its owner's team. */
export function revealKeep(state: GameState, keep: Keep): void {
  const bit = 1 << teamOf(state, keep.owner);
  forEachKeepSightTile(state, keep, (i) => (state.explored[i] |= bit));
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

/** A keep sees from its nearest tile. */
function forEachKeepSightTile(
  state: GameState,
  keep: Keep,
  visit: (index: number, tier: Tier) => void,
) {
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

function findSight(state: GameState, team: number): Uint8Array {
  const tier = new Uint8Array(state.width * state.height);
  if (!state.fog) return tier.fill(IN_SIGHT);
  const bit = 1 << team;
  for (let i = 0; i < tier.length; i++) if (state.explored[i] & bit) tier[i] = SEEN;
  const see = (i: number, t: Tier) => {
    if (t > tier[i]) tier[i] = t;
  };
  for (const keep of state.keeps) {
    if (teamOf(state, keep.owner) === team && (state.mode !== "pvp" || keep.owner !== null)) {
      forEachKeepSightTile(state, keep, see);
    }
  }
  // Ruins have no sight, so only what players built counts.
  for (const structure of Object.values(state.structures)) {
    if (teamOf(state, structure.owner) === team) forEachSightTile(state, structure, see);
  }
  for (const unit of state.units) {
    if (unit.hp > 0 && teamOf(state, unit.owner) === team) forEachUnitSightTile(state, unit, see);
  }
  return tier;
}
