// Field units: offensive units that leave home. Scouts explore; soldiers and rangers hunt,
// patrol and, in PvP, besiege. They only ever walk on land their side has explored.
// See SPEC-field-units.md.
import { TICK_RATE, UNIT_KINDS, type UnitKind } from "./config";
import { addCue } from "./cues";
import { damageKeep, inBounds } from "./grid";
import { canSeeEnemiesAt, teamOf } from "./fog";
import { atTileCentre } from "./movement";
import { DIRECTIONS } from "./pathfinding";
import { damageRival, siegeTargetAt, type SiegeTarget } from "./towers";
import {
  attackNearest,
  canStand,
  foeInReach,
  reach,
  shoot,
  spawnTileOf,
  walkTowards,
} from "./units";
import type { Enemy, GameState, Keep, Point, Unit } from "./types";

function exploredBy(state: GameState, x: number, y: number, team: number): boolean {
  return !state.fog || (state.explored[y * state.width + x] & (1 << team)) !== 0;
}

/** An explored tile a unit can stand on, next to one the team hasn't explored: the fog's edge. */
export function isFrontier(state: GameState, x: number, y: number, team: number): boolean {
  if (!state.fog || !canStand(state, x, y) || !exploredBy(state, x, y, team)) return false;
  return DIRECTIONS.some(
    (d) => inBounds(state, x + d.x, y + d.y) && !exploredBy(state, x + d.x, y + d.y, team),
  );
}

/**
 * Scouts walk to the nearest edge of the fog, then the next, never fighting. With nothing left
 * to explore they walk home and wait, trying again only once more land has been explored.
 */
export function scout(state: GameState, unit: Unit) {
  const team = teamOf(state, unit.owner);
  const options = { exploredBy: team };
  const nothingLeft = unit.pathGoal === "home" && unit.pathExplored === state.exploredVersion;
  if (!nothingLeft) {
    walkTowards(state, unit, "frontier", (x, y) => isFrontier(state, x, y, team), options);
    const none = unit.pathGoal === "frontier" && unit.path === null && !unit.waitingForPath;
    if (!none) return;
  }
  const home = homeDoor(state, unit);
  if (home) walkTowards(state, unit, "home", (x, y) => x === home.x && y === home.y, options);
}

/** The door of the unit's building, where it waits; null once it has no home. */
function homeDoor(state: GameState, unit: Unit): Point | null {
  const building = unit.home === null ? undefined : state.structures[unit.home];
  return building ? spawnTileOf(state, building) : null;
}

/**
 * Soldiers and rangers fight what's in reach; otherwise they hunt the nearest enemy (or, in PvP,
 * rival unit) their side can see, else patrol the edge of the fog. Only over explored land.
 */
export function attack(state: GameState, unit: Unit) {
  if (atTileCentre(unit) && attackNearest(state, unit)) return;
  const team = teamOf(state, unit.owner);
  const options = { exploredBy: team };
  const keep = knownRivalKeep(state, unit.owner);
  // Until more land is explored, a keep with no explored way to it is left for patrolling.
  if (keep && unit.siegeBlockedAt !== state.exploredVersion && besiege(state, unit, keep)) return;
  const prey = nearestVisibleFoe(state, unit);
  if (prey) {
    const range = UNIT_KINDS[unit.kind].range;
    const id = "bounty" in prey ? `enemy ${prey.id}` : `unit ${prey.id}`; // only enemies have one
    walkTowards(
      state,
      unit,
      `hunt ${id}`,
      (x, y) => reach({ x, y }, prey.x, prey.y) <= range,
      options,
    );
    return;
  }
  walkTowards(state, unit, "patrol", (x, y) => isFrontier(state, x, y, team), options);
}

/** The nearest living enemy, or rival unit in PvP, that the unit's side can see. */
function nearestVisibleFoe(state: GameState, unit: Unit): Enemy | Unit | undefined {
  const team = teamOf(state, unit.owner);
  let best: Enemy | Unit | undefined;
  let bestDistance = Infinity;
  const consider = (foe: Enemy | Unit) => {
    if (foe.hp <= 0 || !canSeeEnemiesAt(state, foe.x, foe.y, unit.owner)) return;
    const distance = Math.hypot(foe.x - unit.x, foe.y - unit.y);
    if (distance < bestDistance) {
      best = foe;
      bestDistance = distance;
    }
  };
  state.enemies.forEach(consider);
  for (const other of state.units) if (teamOf(state, other.owner) !== team) consider(other);
  return best;
}

/** PvP: the first rival keep the unit's side has explored any tile of. */
export function knownRivalKeep(state: GameState, owner: Unit["owner"]): Keep | undefined {
  const team = teamOf(state, owner);
  return state.keeps.find((keep) => {
    if (keep.owner === null || teamOf(state, keep.owner) === team) return false;
    for (let y = keep.y; y < keep.y + keep.size; y++) {
      for (let x = keep.x; x < keep.x + keep.size; x++) {
        if (exploredBy(state, x, y, team)) return true;
      }
    }
    return false;
  });
}

/** The keep tile nearest (x, y), and how many tiles away it is (diagonals count as 1). */
function nearestKeepTile(keep: Keep, x: number, y: number): { tile: Point; distance: number } {
  const tile = {
    x: Math.min(Math.max(x, keep.x), keep.x + keep.size - 1),
    y: Math.min(Math.max(y, keep.y), keep.y + keep.size - 1),
  };
  return { tile, distance: reach({ x, y }, tile.x, tile.y) };
}

/**
 * Marches on a rival keep over explored land, breaking through the cheapest walls on the way,
 * and hits the keep once in reach. False if there's no explored way to it yet (the unit then
 * patrols, remembering not to look again until more land is explored).
 */
function besiege(state: GameState, unit: Unit, keep: Keep): boolean {
  const kind = UNIT_KINDS[unit.kind];
  const atKeep = nearestKeepTile(keep, unit.x, unit.y);
  if (atTileCentre(unit) && atKeep.distance <= kind.range) {
    hit(state, unit, { ...atKeep.tile, keep });
    return true;
  }
  const team = teamOf(state, unit.owner);
  const goalKey = `siege ${keep.x},${keep.y}`;
  walkTowards(state, unit, goalKey, (x, y) => nearestKeepTile(keep, x, y).distance <= kind.range, {
    exploredBy: team,
    breach: { owner: unit.owner, dps: kind.damage / kind.attackInterval },
  });
  if (unit.pathGoal === goalKey && unit.path === null && !unit.waitingForPath) {
    unit.siegeBlockedAt = state.exploredVersion;
    return false;
  }
  // A rival structure on the next step: break it.
  const next = unit.path?.[0];
  if (next && atTileCentre(unit) && reach(unit, next.x, next.y) <= kind.range) {
    const target = siegeTargetAt(state, unit.owner, next.x, next.y);
    if (target) hit(state, unit, target);
  }
  return true;
}

/** One hit on a rival's keep or structure, on the unit's attack timer (with a shot if ranged). */
function hit(state: GameState, unit: Unit, target: SiegeTarget) {
  if (unit.attackCooldown > 0) return;
  const kind: UnitKind = UNIT_KINDS[unit.kind];
  if (target.keep) {
    damageKeep(state, target.keep, kind.damage);
    addCue(state, "keepHit");
  } else if (target.structure) {
    damageRival(state, target.structure, kind.damage, unit.owner);
  }
  if (kind.projectile) shoot(state, unit, target, kind.projectile);
  unit.attackCooldown = kind.attackInterval * TICK_RATE;
}

/**
 * What a field unit is doing, for hover info, from what online clients also have (positions,
 * explored land, keeps): scouts scouting or waiting at their door; attackers fighting,
 * besieging, hunting or patrolling.
 */
export function fieldActivity(state: GameState, unit: Unit): string {
  if (UNIT_KINDS[unit.kind].behaviour === "scout") {
    const door = homeDoor(state, unit);
    const home = door && unit.x === door.x && unit.y === door.y;
    return home ? "waiting: nothing left to explore" : "scouting";
  }
  if (foeInReach(state, unit)) return "fighting";
  if (knownRivalKeep(state, unit.owner)) return "besieging";
  if (nearestVisibleFoe(state, unit)) return "hunting";
  return "patrolling";
}
