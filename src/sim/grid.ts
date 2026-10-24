import { STRUCTURES } from "./config";
import type { CommandResult, Enemy, GameState, Structure, StructureKind } from "./types";

export const EMPTY = 0;
export const KEEP_TILE = -1;

export function inBounds(state: GameState, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < state.width && y < state.height;
}

export function tileIndex(state: GameState, x: number, y: number): number {
  return y * state.width + x;
}

export function isKeepTile(state: GameState, x: number, y: number): boolean {
  return inBounds(state, x, y) && state.tiles[tileIndex(state, x, y)] === KEEP_TILE;
}

export function isSpawnTile(state: GameState, x: number, y: number): boolean {
  return state.spawnTiles.some((p) => p.x === x && p.y === y);
}

export function structureAt(state: GameState, x: number, y: number): Structure | undefined {
  if (!inBounds(state, x, y)) return undefined;
  const id = state.tiles[tileIndex(state, x, y)];
  return id > 0 ? state.structures[id] : undefined;
}

/** True if the enemy is on, or moving between, tiles that include (x, y). */
export function enemyOccupies(enemy: Enemy, x: number, y: number): boolean {
  return (
    (Math.floor(enemy.x) === x && Math.floor(enemy.y) === y) ||
    (Math.ceil(enemy.x) === x && Math.ceil(enemy.y) === y)
  );
}

export function canBuild(
  state: GameState,
  kind: StructureKind,
  x: number,
  y: number,
): CommandResult {
  if (state.gameOver) return { ok: false, reason: "Game over" };
  if (!inBounds(state, x, y)) return { ok: false, reason: "Out of bounds" };
  if (isKeepTile(state, x, y)) return { ok: false, reason: "Can't build on the keep" };
  if (isSpawnTile(state, x, y)) return { ok: false, reason: "Can't build in the spawn zone" };
  if (state.enemies.some((e) => enemyOccupies(e, x, y))) {
    return { ok: false, reason: "An enemy is in the way" };
  }
  if (state.tiles[tileIndex(state, x, y)] !== EMPTY)
    return { ok: false, reason: "Tile is occupied" };
  if (state.gold < STRUCTURES[kind].cost) return { ok: false, reason: "Not enough gold" };
  return { ok: true };
}

export function placeStructure(
  state: GameState,
  kind: StructureKind,
  x: number,
  y: number,
): Structure {
  const stats = STRUCTURES[kind];
  const structure: Structure = {
    id: state.nextId++,
    kind,
    x,
    y,
    hp: stats.maxHp,
    maxHp: stats.maxHp,
  };
  state.structures[structure.id] = structure;
  state.tiles[tileIndex(state, x, y)] = structure.id;
  state.gridVersion++;
  return structure;
}
