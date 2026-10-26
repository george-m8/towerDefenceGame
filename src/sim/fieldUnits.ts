// Field units: offensive units that leave home. Scouts explore; soldiers and rangers hunt,
// patrol and, in PvP, besiege. They only ever walk on land their side has explored.
// See SPEC-field-units.md.
import { UNIT_KINDS } from "./config";
import { inBounds } from "./grid";
import { canSeeEnemiesAt, teamOf } from "./fog";
import { atTileCentre } from "./movement";
import { DIRECTIONS } from "./pathfinding";
import { attackNearest, canStand, reach, spawnTileOf, walkTowards } from "./units";
import type { Enemy, GameState, Point, Unit } from "./types";

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
