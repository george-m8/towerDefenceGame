import {
  DEFAULT_MAP_SIZE,
  ENEMY,
  KEEP_HP,
  KEEP_SIZE,
  MAP_SIZES,
  PVP,
  type MapSize,
} from "./config";
import {
  advanceClock,
  clearSkipVotesAtDusk,
  createClock,
  isSpawningTime,
  setClockHour,
} from "./clock";
import { buildTicksAt, updateBuilding } from "./building";
import { debugDamage } from "./debug";
import { priceAt } from "./enclosures";
import { spawnEnemy, updateEnemies } from "./enemies";
import { EMPTY, KEEP_TILE, canBuild, placeStructure } from "./grid";
import { awardBounties, claimChest, collectIncome, sellStructure } from "./economy";
import { addCue, updateCues } from "./cues";
import { updateEffects } from "./effects";
import { initialExplored, revealKeep } from "./fog";
import { claimKeepWalls, placeKeepWalls } from "./keepWalls";
import { generateTerrain, layoutFor } from "./mapgen";
import type { ItemsFile } from "./itemsFile";
import { mapFromGame, spawnTiles, terrainGrid, type MapFile } from "./mapFile";
import { randomInt } from "./rng";
import { startingWork, startingWorth } from "./resources";
import { collectFarmIncome } from "./farms";
import { updateTowers } from "./towers";
import { updateTraps } from "./traps";
import { removeDeadUnits, spawnUnit, updateSpawners, updateUnits } from "./units";
import { createWaveState, sendWaveEarly, updateWaves } from "./waves";
import { addPlayer, updateVotes } from "./players";
import type {
  Command,
  CommandResult,
  EnemiesCome,
  GameMode,
  GameState,
  PlayerId,
  Terrain,
} from "./types";

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
  /**
   * A hand-made map (a parsed, valid `.map` file). Its size, mode, terrain, keeps, spawns,
   * ruins, chests and structures replace the generated ones, and no starter walls are added.
   */
  map?: MapFile;
  /** An `.items` file: how many of each structure a player can have at once (default: no limits). */
  items?: ItemsFile;
  /** Give the game a clock, the time of day (default off; night spawns turn it on). */
  clock?: boolean;
  /** When enemies come (Endless only): all the time (default), or at night, with a clock. */
  enemiesCome?: EnemiesCome;
}

export function createGame(seed: number, options: GameOptions = {}): GameState {
  const file = options.map;
  const {
    width,
    height,
    keep: keepSide,
  } = MAP_SIZES[file?.size ?? options.size ?? DEFAULT_MAP_SIZE];
  const mode = file?.mode ?? options.mode ?? "endless";
  // PvP has no waves, so its enemies come "all the time" (never).
  const enemiesCome: EnemiesCome = mode === "pvp" ? "always" : (options.enemiesCome ?? "always");
  const layout = file
    ? {
        width,
        height,
        keeps: file.keeps.map((k) => ({ ...k, size: KEEP_SIZE })),
        spawnTiles: spawnTiles(file),
      }
    : layoutFor(width, height, mode, keepSide);
  const { spawnTiles: spawns } = layout;
  const keepHp = mode === "pvp" ? PVP.keepHp : KEEP_HP;

  const base = new Array<number>(width * height).fill(EMPTY);
  for (const keep of layout.keeps) {
    for (let y = keep.y; y < keep.y + keep.size; y++) {
      for (let x = keep.x; x < keep.x + keep.size; x++) base[y * width + x] = KEEP_TILE;
    }
  }

  const map = file
    ? {
        terrain: terrainGrid(file),
        ruins: file.ruins.map(({ x, y, hp }) => ({ x, y, hpFraction: hp })),
        chests: file.chests,
      }
    : options.blankMap
      ? { terrain: new Array<Terrain>(width * height).fill("ground"), ruins: [], chests: [] }
      : generateTerrain(layout, seed);

  const state: GameState = {
    seed,
    width,
    height,
    terrain: map.terrain,
    resources: startingWork(map.terrain),
    resourceWorth: startingWorth(map.terrain, seed),
    base,
    mount: new Array<number>(width * height).fill(EMPTY),
    structures: {},
    nextId: 1,
    gridVersion: 0,
    sightVersion: 0,
    exploredVersion: 0,
    flows: {},
    enemies: [],
    units: [],
    features: map.chests.map((c) => ({ kind: "chest" as const, ...c })),
    effects: [],
    cues: [],
    nextCueId: 1,
    spawnTiles: spawns,
    mode,
    keeps: layout.keeps.map((keep) => ({ ...keep, hp: keepHp, maxHp: keepHp, owner: null })),
    winner: null,
    wave: createWaveState(),
    clock: options.clock || enemiesCome === "night" ? createClock() : null,
    enemiesCome,
    players: {},
    nextPlayerId: 1,
    tick: 0,
    paused: false,
    speed: 1,
    wanderChance: ENEMY.wanderChance,
    gameOver: false,
    debug: { infiniteKeep: false, infiniteGold: false },
    limits: { ...options.items?.limits },
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
  if (file) {
    for (const s of file.structures) {
      const structure = placeStructure(
        state,
        s.kind,
        s.x,
        s.y,
        s.facing,
        state.keeps[s.keep].owner,
      );
      structure.keep = s.keep;
      structure.paid = 0;
    }
  } else if (!options.blankMap) placeKeepWalls(state);
  return state;
}

/** A generated map (as `createGame` makes it for this seed) as a `.map` file to edit. */
export function mapFromGenerated(
  title: string,
  mode: GameMode,
  size: MapSize,
  seed: number,
): MapFile {
  return mapFromGame(createGame(seed, { mode, size, players: [] }), title, size);
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
    claimKeepWalls(state, keep);
  });
  // A .map file's structures belong to their keep's player.
  for (const s of Object.values(state.structures)) {
    if (s.keep !== undefined) s.owner = state.keeps[s.keep]?.owner ?? null;
  }
  state.gridVersion++; // sight and enclosures depend on who owns the keeps
}

export function tick(state: GameState): void {
  if (state.paused || state.gameOver) return;
  state.tick++;
  advanceClock(state);
  clearSkipVotesAtDusk(state);
  updateEffects(state);
  updateCues(state);
  updateBuilding(state);
  updateSpawners(state);
  updateUnits(state); // before enemies, so a unit that steps in the way blocks them this tick
  updateEnemies(state);
  updateWaves(state);
  updateTowers(state);
  updateTraps(state);
  awardBounties(state);
  removeDeadUnits(state);
  collectIncome(state);
  collectFarmIncome(state);
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
    case "voteSkipToNight":
      if (state.enemiesCome !== "night") return { ok: false, reason: "No night to skip to" };
      if (isSpawningTime(state)) return { ok: false, reason: "It's already night" };
      player.votes.skipToNight = !player.votes.skipToNight;
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
    case "debugDamage":
      return debugDamage(state, command.x, command.y);
    case "debugClock":
      if (!state.clock) return { ok: false, reason: "This game has no clock" };
      setClockHour(state, command.hour);
      return { ok: true };
    case "debugUnit":
      return spawnUnit(state, command.kind, playerId, command.x, command.y)
        ? { ok: true }
        : { ok: false, reason: "A unit can't stand there" };
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
