import {
  ENEMY,
  FAST_FORWARD_SPEED,
  GRID_HEIGHT,
  GRID_WIDTH,
  KEEP_HP,
  KEEP_SIZE,
  SPAWN_ZONE,
  STARTING_GOLD,
  STRUCTURES,
} from "./config";
import { spawnEnemy, updateEnemies } from "./enemies";
import { EMPTY, KEEP_TILE, canBuild, placeStructure } from "./grid";
import { awardBounties, collectIncome, sellStructure } from "./economy";
import { updateEffects } from "./effects";
import { randomInt } from "./rng";
import { updateTowers } from "./towers";
import { updateTraps } from "./traps";
import { createWaveState, sendWaveEarly, updateWaves } from "./waves";
import type { Command, CommandResult, GameState, Point, Terrain } from "./types";

export function createGame(seed: number): GameState {
  const width = GRID_WIDTH;
  const height = GRID_HEIGHT;
  const base = new Array<number>(width * height).fill(EMPTY);

  const keepX = Math.floor(width / 2) - Math.floor(KEEP_SIZE / 2);
  const keepY = Math.floor(height / 2) - Math.floor(KEEP_SIZE / 2);
  for (let y = keepY; y < keepY + KEEP_SIZE; y++) {
    for (let x = keepX; x < keepX + KEEP_SIZE; x++) base[y * width + x] = KEEP_TILE;
  }

  const spawnTiles: Point[] = [];
  for (let y = SPAWN_ZONE.y; y < SPAWN_ZONE.y + SPAWN_ZONE.height; y++) {
    for (let x = SPAWN_ZONE.x; x < SPAWN_ZONE.x + SPAWN_ZONE.width; x++) spawnTiles.push({ x, y });
  }

  return {
    width,
    height,
    terrain: new Array<Terrain>(width * height).fill("ground"),
    base,
    mount: new Array<number>(width * height).fill(EMPTY),
    structures: {},
    nextId: 1,
    gridVersion: 0,
    flow: null,
    enemies: [],
    effects: [],
    spawnTiles,
    keep: { x: keepX, y: keepY, size: KEEP_SIZE, hp: KEEP_HP, maxHp: KEEP_HP },
    wave: createWaveState(),
    gold: STARTING_GOLD,
    tick: 0,
    paused: false,
    speed: 1,
    wanderChance: ENEMY.wanderChance,
    gameOver: false,
    rngState: seed,
  };
}

export function tick(state: GameState): void {
  if (state.paused || state.gameOver) return;
  state.tick++;
  updateEffects(state);
  updateEnemies(state);
  updateWaves(state);
  updateTowers(state);
  updateTraps(state);
  awardBounties(state);
  collectIncome(state);
  if (state.keep.hp <= 0) state.gameOver = true;
}

export function applyCommand(state: GameState, command: Command): CommandResult {
  switch (command.type) {
    case "togglePause":
      state.paused = !state.paused;
      return { ok: true };
    case "toggleFastForward":
      state.speed = state.speed === 1 ? FAST_FORWARD_SPEED : 1;
      return { ok: true };
    case "build": {
      const check = canBuild(state, command.kind, command.x, command.y);
      if (!check.ok) return check;
      state.gold -= STRUCTURES[command.kind].cost;
      placeStructure(state, command.kind, command.x, command.y, command.facing);
      return { ok: true };
    }
    case "sell":
      return sellStructure(state, command.x, command.y);
    case "sendWave":
      return sendWaveEarly(state);
    case "debugSpawn":
      for (let i = 0; i < command.count; i++) {
        const p = state.spawnTiles[randomInt(state, 0, state.spawnTiles.length - 1)];
        spawnEnemy(state, p.x, p.y);
      }
      return { ok: true };
  }
}
