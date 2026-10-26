// Paths for units. Enemy flow fields all lead to the keep; units go anywhere, so each one
// searches its own way when it needs one (see the per-tick budget in units.ts).
import { DIRECTIONS } from "./pathfinding";
import { canStand } from "./units";
import type { GameState, Point } from "./types";

/**
 * The steps (not counting `from`) of a shortest walk over open tiles to the nearest tile where
 * `isGoal` holds. Empty if `from` is already one; null if none can be reached. One search
 * finds the nearest of any number of goals, e.g. "next to any tree".
 */
export function findPath(
  state: GameState,
  from: Point,
  isGoal: (x: number, y: number) => boolean,
): Point[] | null {
  if (isGoal(from.x, from.y)) return [];
  const cameFrom = new Map<number, number>([[from.y * state.width + from.x, -1]]);
  let frontier = [from];
  while (frontier.length > 0) {
    const next: Point[] = [];
    for (const p of frontier) {
      for (const d of DIRECTIONS) {
        const x = p.x + d.x;
        const y = p.y + d.y;
        const index = y * state.width + x;
        if (cameFrom.has(index) || !canStand(state, x, y)) continue;
        cameFrom.set(index, p.y * state.width + p.x);
        if (isGoal(x, y)) return walkBack(state, cameFrom, index);
        next.push({ x, y });
      }
    }
    frontier = next;
  }
  return null;
}

function walkBack(state: GameState, cameFrom: Map<number, number>, end: number): Point[] {
  const path: Point[] = [];
  for (let i = end; cameFrom.get(i) !== -1; i = cameFrom.get(i)!) {
    path.push({ x: i % state.width, y: Math.floor(i / state.width) });
  }
  return path.reverse();
}
