// Build time: a structure goes up as a construction site and does nothing (blocks nothing,
// fires nothing, earns nothing) until it's finished. The further from your keep, the longer
// that takes: nothing at all next to it, up to BUILD_TIME.maxSeconds far away.
import { BUILD_TIME, STRUCTURES, TICK_RATE } from "./config";
import { enemyOccupies, inBounds, isBuilt } from "./grid";
import type { GameState, Keep, PlayerId, Structure } from "./types";

/** Tiles from (x, y) to the nearest tile of the keep (1 = right next to it). */
function distanceToKeep(keep: Keep, x: number, y: number): number {
  const dx = Math.max(keep.x - x, 0, x - (keep.x + keep.size - 1));
  const dy = Math.max(keep.y - y, 0, y - (keep.y + keep.size - 1));
  return Math.max(dx, dy);
}

/** The keeps a player builds out from: their own in PvP, else every keep (Endless shares one). */
function homeKeeps(state: GameState, player?: PlayerId): Keep[] {
  const own = state.keeps.filter((k) => k.owner !== null && k.owner === player);
  return own.length > 0 ? own : state.keeps;
}

/** How long building at (x, y) takes, as a fraction of the longest build time (0 to 1). */
export function buildFractionAt(state: GameState, x: number, y: number, player?: PlayerId): number {
  if (!inBounds(state, x, y)) return 0;
  const distance = Math.min(...homeKeeps(state, player).map((k) => distanceToKeep(k, x, y)));
  const fraction = (distance - 1) / (BUILD_TIME.fullDistance - 1);
  return Math.min(1, Math.max(0, fraction));
}

/** Ticks that building at (x, y) takes `player`. */
export function buildTicksAt(state: GameState, x: number, y: number, player?: PlayerId): number {
  return Math.round(buildFractionAt(state, x, y, player) * BUILD_TIME.maxSeconds * TICK_RATE);
}

/** How far along a structure is, 0 to 1 (1 once built). */
export function buildProgress(structure: Structure): number {
  if (isBuilt(structure) || !structure.buildTicks) return 1;
  return 1 - structure.buildLeft! / structure.buildTicks;
}

/**
 * Moves every construction site on by a tick. One that will block can't finish while an
 * enemy is standing on it: it waits on its last tick until the way is clear.
 */
export function updateBuilding(state: GameState): void {
  for (const structure of Object.values(state.structures)) {
    if (isBuilt(structure)) continue;
    const blocks = STRUCTURES[structure.kind].blocksMovement;
    const inTheWay = state.enemies.some((e) => enemyOccupies(e, structure.x, structure.y));
    if (structure.buildLeft === 1 && blocks && inTheWay) continue;
    structure.buildLeft!--;
    if (isBuilt(structure)) state.gridVersion++; // it blocks (or bridges) now
  }
}
