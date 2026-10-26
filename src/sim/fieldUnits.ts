// Field units: offensive units that leave home. Scouts explore; soldiers and rangers hunt,
// patrol and, in PvP, besiege. They only ever walk on land their side has explored.
// See SPEC-field-units.md.
import { inBounds } from "./grid";
import { teamOf } from "./fog";
import { DIRECTIONS } from "./pathfinding";
import { canStand, spawnTileOf, walkTowards } from "./units";
import type { GameState, Point, Unit } from "./types";

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
