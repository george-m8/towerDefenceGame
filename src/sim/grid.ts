import type { GameState } from "./types";

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
