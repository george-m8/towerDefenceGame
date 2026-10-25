import { DEFAULT_MAP_SIZE, ENEMY, KEEP_HP, MAP_SIZES, PVP, type MapSize } from "./config";
import { buildTicksAt, updateBuilding } from "./building";
import { priceAt } from "./enclosures";
import { spawnEnemy, updateEnemies } from "./enemies";
import { EMPTY, KEEP_TILE, canBuild, placeStructure } from "./grid";
import { awardBounties, claimChest, collectIncome, sellStructure } from "./economy";
import { addCue, updateCues } from "./cues";
import { updateEffects } from "./effects";
import { initialExplored, revealKeep } from "./fog";
import { generateTerrain, layoutFor } from "./mapgen";
import { randomInt } from "./rng";
import { updateTowers } from "./towers";
import { updateTraps } from "./traps";
import { createWaveState, sendWaveEarly, updateWaves } from "./waves";
import { addPlayer, updateVotes } from "./players";
import type { Command, CommandResult, GameMode, GameState, PlayerId, Terrain } from "./types";

export interface GameOptions {
  /** Skip map generation and start on open ground (used by tests). */
  blankMap?: boolean;
  /** Names of the players to start with (default: one player). */
  players?: string[];
  /** Fog of war (default on). Off, every tile is in sight. */
  fog?: boolean;
  /** Endless (default) or PvP. */
  mode?: GameMode;
  /** How big the map is (default M). */
  size?: MapSize;
}

export function createGame(seed: number, options: GameOptions = {}): GameState {
  const { width, height } = MAP_SIZES[options.size ?? DEFAULT_MAP_SIZE];
  const mode = options.mode ?? "endless";
  const layout = layoutFor(width, height, mode);
  const { spawnTiles } = layout;
  const keepHp = mode === "pvp" ? PVP.keepHp : KEEP_HP;

  const base = new Array<number>(width * height).fill(EMPTY);
  for (const keep of layout.keeps) {
    for (let y = keep.y; y < keep.y + keep.size; y++) {
      for (let x = keep.x; x < keep.x + keep.size; x++) base[y * width + x] = KEEP_TILE;
    }
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
    flows: {},
    enemies: [],
    features: map.chests.map((c) => ({ kind: "chest" as const, ...c })),
    effects: [],
    cues: [],
    nextCueId: 1,
    spawnTiles,
    mode,
    keeps: layout.keeps.map((keep) => ({ ...keep, hp: keepHp, maxHp: keepHp, owner: null })),
    winner: null,
    wave: createWaveState(),
    players: {},
    nextPlayerId: 1,
    tick: 0,
    paused: false,
    speed: 1,
    wanderChance: ENEMY.wanderChance,
    gameOver: false,
    debug: { infiniteKeep: false, infiniteGold: false },
    rngState: seed,
    fog: options.fog ?? true,
    explored: [],
  };
  if (mode === "pvp") state.wave.countdown = Infinity; // no waves in PvP
  state.explored = initialExplored(state);
  for (const name of options.players ?? ["Player 1"]) addPlayer(state, name);
  if (mode === "pvp") assignKeeps(state);
  updateVotes(state); // with no players, the game starts paused
  for (const spot of map.ruins) {
    const ruin = placeStructure(state, "ruin", spot.x, spot.y, "N", null);
    ruin.hp = Math.round(ruin.maxHp * spot.hpFraction);
  }
  return state;
}

/**
 * PvP: hands the keeps to the players, lowest id first, and lets each see around their own.
 * Called when the game starts (a room's players are only known then).
 */
export function assignKeeps(state: GameState): void {
  const ids = Object.keys(state.players)
    .map(Number)
    .sort((a, b) => a - b);
  state.keeps.forEach((keep, i) => {
    keep.owner = ids[i] ?? null;
    if (keep.owner !== null) revealKeep(state, keep);
  });
  state.gridVersion++; // sight and enclosures depend on who owns the keeps
}

export function tick(state: GameState): void {
  if (state.paused || state.gameOver) return;
  state.tick++;
  updateEffects(state);
  updateCues(state);
  updateBuilding(state);
  updateEnemies(state);
  updateWaves(state);
  updateTowers(state);
  updateTraps(state);
  awardBounties(state);
  collectIncome(state);
  const fallen = state.keeps.find((keep) => keep.hp <= 0);
  if (fallen && !state.gameOver) {
    state.gameOver = true;
    // PvP: the player whose keep still stands wins.
    if (state.mode === "pvp") {
      state.winner = state.keeps.find((keep) => keep.hp > 0)?.owner ?? null;
    }
    addCue(state, "gameOver");
  }
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
      player.votes.pause = !player.votes.pause;
      updateVotes(state);
      return { ok: true };
    case "toggleFastForward":
      player.votes.fastForward = !player.votes.fastForward;
      updateVotes(state);
      return { ok: true };
    case "build": {
      const check = canBuild(state, playerId, command.kind, command.x, command.y);
      if (!check.ok) return check;
      // The price depends on the enclosure here before this build changes the grid.
      const price = priceAt(state, command.kind, command.x, command.y, playerId);
      if (!state.debug.infiniteGold) player.gold -= price; // free with infinite gold
      const built = placeStructure(
        state,
        command.kind,
        command.x,
        command.y,
        command.facing,
        playerId,
      );
      built.paid = price;
      const buildTicks = buildTicksAt(state, command.x, command.y, playerId);
      if (buildTicks > 0) built.buildLeft = built.buildTicks = buildTicks;
      claimChest(state, playerId, command.x, command.y);
      return { ok: true };
    }
    case "sell":
      return sellStructure(state, playerId, command.x, command.y);
    case "sendWave":
      if (state.mode === "pvp") return { ok: false, reason: "No waves in PvP" };
      return sendWaveEarly(state, playerId);
    case "debugOption":
      state.debug[command.option] = command.on;
      return { ok: true };
    case "debugFog":
      state.fog = command.on;
      return { ok: true };
    case "debugSpawn":
      for (let i = 0; i < command.count; i++) {
        const p = state.spawnTiles[randomInt(state, 0, state.spawnTiles.length - 1)];
        spawnEnemy(state, p.x, p.y, {
          kind: command.kind,
          wave: Math.max(1, state.wave.number),
          variant: "random",
        });
      }
      return { ok: true };
  }
}
