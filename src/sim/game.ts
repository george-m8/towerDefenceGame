import { GRID_HEIGHT, GRID_WIDTH, KEEP_HP, KEEP_SIZE, SPAWN_ZONE, STARTING_GOLD } from "./config";
import { EMPTY, KEEP_TILE } from "./grid";
import type { Command, CommandResult, GameState, Point } from "./types";

export function createGame(seed: number): GameState {
  const width = GRID_WIDTH;
  const height = GRID_HEIGHT;
  const tiles = new Array<number>(width * height).fill(EMPTY);

  const keepX = Math.floor(width / 2) - Math.floor(KEEP_SIZE / 2);
  const keepY = Math.floor(height / 2) - Math.floor(KEEP_SIZE / 2);
  for (let y = keepY; y < keepY + KEEP_SIZE; y++) {
    for (let x = keepX; x < keepX + KEEP_SIZE; x++) tiles[y * width + x] = KEEP_TILE;
  }

  const spawnTiles: Point[] = [];
  for (let y = SPAWN_ZONE.y; y < SPAWN_ZONE.y + SPAWN_ZONE.height; y++) {
    for (let x = SPAWN_ZONE.x; x < SPAWN_ZONE.x + SPAWN_ZONE.width; x++) spawnTiles.push({ x, y });
  }

  return {
    width,
    height,
    tiles,
    spawnTiles,
    keep: { x: keepX, y: keepY, size: KEEP_SIZE, hp: KEEP_HP, maxHp: KEEP_HP },
    gold: STARTING_GOLD,
    tick: 0,
    paused: false,
    gameOver: false,
    rngState: seed,
  };
}

export function tick(state: GameState): void {
  if (state.paused || state.gameOver) return;
  state.tick++;
}

export function applyCommand(state: GameState, command: Command): CommandResult {
  switch (command.type) {
    case "togglePause":
      state.paused = !state.paused;
      return { ok: true };
  }
}
