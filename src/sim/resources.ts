// Resources on the map: trees, rocks, gold-veined rocks and berry bushes. Each tile has a
// worth (state.resourceWorth: the gold it pays in all) and work left (state.resources, in
// ticks). Every hit goes through harvest, which pays the gold that work earned and clears the
// tile once its work is done. See SPEC-resources.md.
import { RESOURCES, TICK_RATE, type ResourceStats, type ResourceTerrain } from "./config";
import { inBounds, setTerrain, terrainAt, tileIndex } from "./grid";
import { addGold } from "./players";
import { nextRandom } from "./rng";
import type { GameState, PlayerId, Terrain } from "./types";

export function isResource(terrain: Terrain): terrain is ResourceTerrain {
  return terrain in RESOURCES;
}

/** Ticks of work a fresh tile of this kind takes one worker. */
function fullWork(terrain: ResourceTerrain): number {
  return Math.max(1, Math.round(RESOURCES[terrain].seconds * TICK_RATE));
}

/** Work left on every tile of a new map: a fresh tile's full work, 0 where there's none. */
export function startingWork(terrain: Terrain[]): number[] {
  return terrain.map((t) => (isResource(t) ? fullWork(t) : 0));
}

/**
 * What each tile of a new map is worth: a roll in its kind's range from the map seed and the
 * tile, so the same seed always gives the same worths (and map-gen's own rolls are untouched).
 */
export function startingWorth(terrain: Terrain[], seed: number): number[] {
  return terrain.map((t, i) => {
    if (!isResource(t)) return 0;
    const [lo, hi]: ResourceStats["worth"] = RESOURCES[t].worth;
    const roll = nextRandom({ rngState: (seed ^ Math.imul(i + 1, 0x9e3779b1)) | 0 });
    return lo + Math.floor(roll * (hi - lo + 1));
  });
}

/** Gold a tile has paid once only `workLeft` of its work remains. */
function paidAt(terrain: ResourceTerrain, worth: number, workLeft: number): number {
  const full = fullWork(terrain);
  return Math.floor((worth * Math.max(0, full - workLeft)) / full);
}

/** The resource on (x, y), or null if there's none left. */
export function resourceAt(
  state: GameState,
  x: number,
  y: number,
): { terrain: ResourceTerrain; worth: number; goldLeft: number; workLeft: number } | null {
  if (!inBounds(state, x, y)) return null;
  const terrain = terrainAt(state, x, y);
  const i = tileIndex(state, x, y);
  const workLeft = state.resources[i];
  if (!isResource(terrain) || workLeft <= 0) return null;
  const worth = state.resourceWorth[i];
  return { terrain, worth, goldLeft: worth - paidAt(terrain, worth, workLeft), workLeft };
}

/** Puts a fresh resource worth `worth` gold on (x, y) (map-gen and tests). */
export function placeResource(
  state: GameState,
  x: number,
  y: number,
  terrain: ResourceTerrain,
  worth: number,
): void {
  setTerrain(state, x, y, terrain);
  const i = tileIndex(state, x, y);
  state.resources[i] = fullWork(terrain);
  state.resourceWorth[i] = worth;
}

/**
 * Works (x, y) for `seconds`, pays `owner` the gold that work earned, and clears the tile once
 * its work is done. Returns the gold paid (0 if there was nothing there).
 */
export function harvest(
  state: GameState,
  x: number,
  y: number,
  seconds: number,
  owner: PlayerId | null,
): number {
  const resource = resourceAt(state, x, y);
  if (!resource) return 0;
  const { terrain, worth, workLeft } = resource;
  const after = Math.max(0, workLeft - Math.round(seconds * TICK_RATE));
  const gold = paidAt(terrain, worth, after) - paidAt(terrain, worth, workLeft);
  addGold(state, owner, gold);
  state.resources[tileIndex(state, x, y)] = after;
  if (after === 0) clearResource(state, x, y);
  return gold;
}

/** Open ground with nothing left on it (used up, or a tree cleared with the sell tool). */
export function clearResource(state: GameState, x: number, y: number): void {
  const i = tileIndex(state, x, y);
  state.resources[i] = state.resourceWorth[i] = 0;
  setTerrain(state, x, y, "ground");
}
