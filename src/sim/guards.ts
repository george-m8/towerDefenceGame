// Guard spots: the tiles in front of a guard building (its facing) where its guards stand.
// Worked out when needed and cached per grid version, never stored, so building over a spot
// simply moves its guard on. See SPEC-units.md.
import { DIRECTIONS } from "./pathfinding";
import { canStand } from "./units";
import type { Facing, GameState, Point, Structure, Unit } from "./types";

const AHEAD: Record<Facing, Point> = {
  N: { x: 0, y: -1 },
  E: { x: 1, y: 0 },
  S: { x: 0, y: 1 },
  W: { x: -1, y: 0 },
};
/** How far a spot may be walked from beside its building and still count as reachable. */
const REACH_STEPS = 12;

const cache = new WeakMap<GameState, { version: number; spots: Map<number, Point[]> }>();

/**
 * The open tiles of a building's guard area (two rows of three in front of it), in the order
 * guards take them: near middle, near sides, then the far row the same way. Tiles a unit can't
 * stand on, or can't walk to from beside the building, are left out.
 */
export function guardSpots(state: GameState, building: Structure): Point[] {
  let entry = cache.get(state);
  if (!entry || entry.version !== state.gridVersion) {
    entry = { version: state.gridVersion, spots: new Map() };
    cache.set(state, entry);
  }
  let spots = entry.spots.get(building.id);
  if (!spots) {
    spots = guardSpotsFor(state, building);
    entry.spots.set(building.id, spots);
  }
  return spots;
}

/** `guardSpots` for a building at a place and facing, built or not (the placing preview). */
export function guardSpotsFor(
  state: GameState,
  building: Pick<Structure, "x" | "y" | "facing">,
): Point[] {
  const f = AHEAD[building.facing ?? "S"];
  const side = { x: -f.y, y: f.x };
  const area: Point[] = [];
  for (const out of [1, 2]) {
    for (const across of [0, -1, 1]) {
      area.push({
        x: building.x + f.x * out + side.x * across,
        y: building.y + f.y * out + side.y * across,
      });
    }
  }
  const reachable = reachableNear(state, building);
  return area.filter((p) => reachable.has(p.y * state.width + p.x));
}

/** Tiles a unit could walk to within a few steps of the building. */
function reachableNear(state: GameState, building: Point): Set<number> {
  const seen = new Set<number>();
  let frontier: Point[] = [building];
  for (let step = 0; step < REACH_STEPS && frontier.length > 0; step++) {
    const next: Point[] = [];
    for (const p of frontier) {
      for (const d of DIRECTIONS) {
        const x = p.x + d.x;
        const y = p.y + d.y;
        const i = y * state.width + x;
        if (seen.has(i) || !canStand(state, x, y)) continue;
        seen.add(i);
        next.push({ x, y });
      }
    }
    frontier = next;
  }
  return seen;
}

/**
 * Where a guard should stand: its building's spot by age among its living guards (sharing when
 * there are fewer spots than guards), or its last spot once it has no home. Null when its
 * building has no open spot, so it stays where it is.
 */
export function guardSpotOf(state: GameState, unit: Unit): Point | null {
  const building = unit.home === null ? undefined : state.structures[unit.home];
  if (!building) return unit.goal;
  const spots = guardSpots(state, building);
  if (spots.length === 0) return null;
  const rank = state.units
    .filter((u) => u.home === building.id && u.hp > 0)
    .sort((a, b) => a.id - b.id)
    .indexOf(unit);
  return spots[Math.max(0, rank) % spots.length];
}
