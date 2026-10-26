// Resources on the map: trees, rocks, gold-veined rocks and berry bushes each hold an amount
// (state.resources, per tile). Every hit goes through harvest, which pays the gatherer's
// owner and clears the tile once it's used up. See SPEC-resources.md.
import { RESOURCES, type ResourceStats, type ResourceTerrain } from "./config";
import { inBounds, setTerrain, terrainAt, tileIndex } from "./grid";
import { addGold } from "./players";
import { nextRandom } from "./rng";
import type { GameState, PlayerId, Terrain } from "./types";

export function isResource(terrain: Terrain): terrain is ResourceTerrain {
  return terrain in RESOURCES;
}

/**
 * What each tile of a new map starts with: a roll in its kind's range from the map seed and
 * the tile, so the same seed always gives the same amounts (and map-gen's own rolls are
 * untouched).
 */
export function startingResources(terrain: Terrain[], seed: number): number[] {
  return terrain.map((t, i) => {
    if (!isResource(t)) return 0;
    const [lo, hi]: ResourceStats["amount"] = RESOURCES[t].amount;
    const roll = nextRandom({ rngState: (seed ^ Math.imul(i + 1, 0x9e3779b1)) | 0 });
    return lo + Math.floor(roll * (hi - lo + 1));
  });
}

/** The resource on (x, y), or null if there's none left. */
export function resourceAt(
  state: GameState,
  x: number,
  y: number,
): { terrain: ResourceTerrain; left: number; start: number } | null {
  if (!inBounds(state, x, y)) return null;
  const terrain = terrainAt(state, x, y);
  const i = tileIndex(state, x, y);
  if (!isResource(terrain) || state.resources[i] <= 0) return null;
  return { terrain, left: state.resources[i], start: state.resourceStart[i] };
}

/** Puts a resource on (x, y) with `amount` units (map-gen and tests). */
export function placeResource(
  state: GameState,
  x: number,
  y: number,
  terrain: ResourceTerrain,
  amount: number,
): void {
  setTerrain(state, x, y, terrain);
  const i = tileIndex(state, x, y);
  state.resources[i] = state.resourceStart[i] = amount;
}

/**
 * Takes up to `units` from (x, y), pays `owner` units x value gold, and clears the tile once
 * it's used up. Returns the gold paid (0 if there was nothing there).
 */
export function harvest(
  state: GameState,
  x: number,
  y: number,
  units: number,
  owner: PlayerId | null,
): number {
  const resource = resourceAt(state, x, y);
  if (!resource) return 0;
  const taken = Math.min(units, resource.left);
  const gold = taken * RESOURCES[resource.terrain].value;
  addGold(state, owner, gold);
  state.resources[tileIndex(state, x, y)] -= taken;
  if (taken === resource.left) clearResource(state, x, y);
  return gold;
}

/** Open ground with nothing left on it (used up, or a tree cleared with the sell tool). */
export function clearResource(state: GameState, x: number, y: number): void {
  const i = tileIndex(state, x, y);
  state.resources[i] = state.resourceStart[i] = 0;
  setTerrain(state, x, y, "ground");
}
