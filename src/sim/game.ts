import { ENEMY, FAST_FORWARD_SPEED, GRID_HEIGHT, GRID_WIDTH, KEEP_HP, STRUCTURES } from "./config";
import { spawnEnemy, updateEnemies } from "./enemies";
import { EMPTY, KEEP_TILE, canBuild, placeStructure } from "./grid";
import { awardBounties, claimChest, collectIncome, sellStructure } from "./economy";
import { updateEffects } from "./effects";
import { generateTerrain, layoutFor } from "./mapgen";
import { randomInt } from "./rng";
import { updateTowers } from "./towers";
import { updateTraps } from "./traps";
import { createWaveState, sendWaveEarly, updateWaves } from "./waves";
import { addPlayer } from "./players";
import type { Command, CommandResult, GameState, PlayerId, Terrain } from "./types";

export interface GameOptions {
  /** Skip map generation and start on open ground (used by tests). */
  blankMap?: boolean;
  /** Names of the players to start with (default: one player). */
  players?: string[];
}

export function createGame(seed: number, options: GameOptions = {}): GameState {
  const width = GRID_WIDTH;
  const height = GRID_HEIGHT;
  const layout = layoutFor(width, height);
  const { keep, spawnTiles } = layout;

  const base = new Array<number>(width * height).fill(EMPTY);
  for (let y = keep.y; y < keep.y + keep.size; y++) {
    for (let x = keep.x; x < keep.x + keep.size; x++) base[y * width + x] = KEEP_TILE;
  }

  const map = options.blankMap
    ? { terrain: new Array<Terrain>(width * height).fill("ground"), ruins: [], chests: [] }
    : generateTerrain(layout, seed);

  const state: GameState = {
    seed,
    width,
    height,
    terrain: map.terrain,
    base,
    mount: new Array<number>(width * height).fill(EMPTY),
    structures: {},
    nextId: 1,
    gridVersion: 0,
    flow: null,
    enemies: [],
    features: map.chests.map((c) => ({ kind: "chest" as const, ...c })),
    effects: [],
    spawnTiles,
    keep: { ...keep, hp: KEEP_HP, maxHp: KEEP_HP },
    wave: createWaveState(),
    players: {},
    nextPlayerId: 1,
    tick: 0,
    paused: false,
    speed: 1,
    wanderChance: ENEMY.wanderChance,
    gameOver: false,
    rngState: seed,
  };
  for (const name of options.players ?? ["Player 1"]) addPlayer(state, name);
  for (const spot of map.ruins) {
    const ruin = placeStructure(state, "ruin", spot.x, spot.y, "N", null);
    ruin.hp = Math.round(ruin.maxHp * spot.hpFraction);
  }
  return state;
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

export function applyCommand(
  state: GameState,
  playerId: PlayerId,
  command: Command,
): CommandResult {
  const player = state.players[playerId];
  if (!player) return { ok: false, reason: "Unknown player" };
  switch (command.type) {
    case "togglePause":
      state.paused = !state.paused;
      return { ok: true };
    case "toggleFastForward":
      state.speed = state.speed === 1 ? FAST_FORWARD_SPEED : 1;
      return { ok: true };
    case "build": {
      const check = canBuild(state, playerId, command.kind, command.x, command.y);
      if (!check.ok) return check;
      player.gold -= STRUCTURES[command.kind].cost;
      placeStructure(state, command.kind, command.x, command.y, command.facing, playerId);
      claimChest(state, playerId, command.x, command.y);
      return { ok: true };
    }
    case "sell":
      return sellStructure(state, playerId, command.x, command.y);
    case "sendWave":
      return sendWaveEarly(state, playerId);
    case "debugSpawn":
      for (let i = 0; i < command.count; i++) {
        const p = state.spawnTiles[randomInt(state, 0, state.spawnTiles.length - 1)];
        spawnEnemy(state, p.x, p.y);
      }
      return { ok: true };
  }
}
