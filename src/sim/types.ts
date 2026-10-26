import type {
  EnemyKindId,
  MovementProfile,
  ProjectileKind,
  STRUCTURES,
  TERRAIN,
  UnitKindId,
} from "./config";

export interface Point {
  x: number;
  y: number;
}

export type StructureKind = keyof typeof STRUCTURES;

export type Facing = "N" | "E" | "S" | "W";

export type PlayerId = number;

/** Natural ground type under any structures. */
export type Terrain = keyof typeof TERRAIN;

export interface Player {
  id: PlayerId;
  name: string;
  gold: number;
  /** False while dropped out; they keep their gold and structures. */
  connected: boolean;
  votes: { pause: boolean; fastForward: boolean };
}

export interface Structure {
  id: number;
  kind: StructureKind;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  /** Ticks until a tower can fire again. */
  cooldown: number;
  /** Towers and directional traps (wall spikes). */
  facing?: Facing;
  /** Current aim in degrees, for towers that turn. */
  aim?: number;
  /** Who built it; null for neutral map structures (ruins). */
  owner: PlayerId | null;
  /** What was paid for it (after any enclosure discount); refunds are based on this. */
  paid?: number;
  /**
   * Ticks of building left; 0 or absent once it's built. Until then it does nothing: see
   * sim/building.ts.
   */
  buildLeft?: number;
  /** How many ticks building it took in all, for showing progress. */
  buildTicks?: number;
}

export interface Enemy {
  id: number;
  /** Position in tile coordinates; fractional while moving between tiles. */
  x: number;
  y: number;
  /** The tile it is currently moving to. */
  tx: number;
  ty: number;
  /** The tile it last left, so it doesn't step straight back onto it. */
  px: number;
  py: number;
  hp: number;
  maxHp: number;
  bounty: number;
  kind: EnemyKindId;
  /** Index into the kind's variants. */
  variant: number;
  /** Stats resolved at spawn (kind x variant x wave), never looked up again. */
  speed: number; // tiles per second
  damage: number; // per hit
  attackInterval: number; // ticks between hits
  /** The player whose structure struck the killing blow, once hp <= 0. */
  killedBy: PlayerId | null;
  /** Ticks until it can hit a blocking structure again. */
  attackCooldown: number;
  /** Ticks until its behaviour's ability (a heal, a dig) is ready again. */
  abilityCooldown: number;
  /** What it's doing beyond walking its field. */
  mode: "walking" | "sprinting" | "digging";
  /** The structure a bomber or digger is heading for or digging under. */
  targetId: number | null;
  /** Band members: the leader they follow, until it dies. */
  leaderId: number | null;
}

/** One of a player's own units (see sim/units.ts). Moves tile to tile like an enemy. */
export interface Unit {
  id: number;
  kind: UnitKindId;
  owner: PlayerId;
  /** The building that spawned it; null for dev units or once that building is gone. */
  home: number | null;
  /** Position in tile coordinates; fractional while moving between tiles. */
  x: number;
  y: number;
  /** The tile it is moving to. */
  tx: number;
  ty: number;
  hp: number;
  maxHp: number;
  /** Ticks until it can hit again. */
  attackCooldown: number;
  /** A tile it's told to go to and hold (guard spots); null stays where it is. */
  goal: Point | null;
  /** Steps still to walk, for `pathGoal` and the grid as it was at `pathVersion`. */
  path: Point[] | null;
  pathGoal: string | null;
  pathVersion: number;
  /** It needs a path but the tick's search budget ran out: it goes first next tick. */
  waitingForPath: boolean;
}

/** Short-lived visual events recorded by the simulation for the renderer. */
export type Effect =
  | {
      kind: "shot";
      fromX: number;
      fromY: number;
      toX: number;
      toY: number;
      ttl: number;
      /**
       * Drawn as this projectile flying along an arc for `flight` ticks (ttl counts down from
       * it). Only how it looks: the damage is done when the tower fires.
       */
      projectile: ProjectileKind;
      flight: number;
    }
  | { kind: "splash"; x: number; y: number; radius: number; ttl: number }
  | { kind: "spikes"; x: number; y: number; ttl: number }
  | { kind: "heal"; x: number; y: number; ttl: number }
  /**
   * Something destroyed: an enemy or unit killed, or a structure broken. Drawn still there for
   * BURST_DELAY_TICKS, then as its pixels flying apart and fading for BURST_TICKS.
   */
  | {
      kind: "burst";
      x: number;
      y: number;
      ttl: number;
      enemy?: EnemyKindId;
      structure?: StructureKind;
      /** A unit, drawn in its owner's colour. */
      unit?: UnitKindId;
      owner?: PlayerId;
    };

/** Things lying on the map that aren't terrain or structures. `resources` adds deposits and animals. */
export type MapFeature = { kind: "chest"; x: number; y: number; gold: number };

/** Game events that make a sound. The audio layer adds UI-only sounds on top. */
export type SimCueKind =
  "enemyHit" | "keepHit" | "treasure" | "splash" | "explosion" | "waveStart" | "gameOver";

export interface SoundCue {
  id: number;
  kind: SimCueKind;
  ttl: number;
}

export interface FlowField {
  /** gridVersion this field was computed for. */
  version: number;
  /** Cost to reach the keep from each tile (0 on the keep). */
  dist: number[];
}

export interface WaveState {
  /** Waves started so far (0 before the first wave). */
  number: number;
  /** Threat budget of the current wave still to spend; 0 once it has finished spawning. */
  threatLeft: number;
  /** Ticks until the next spawn while spawning. */
  spawnTimer: number;
  /** Ticks until the next wave, once spawning has finished. */
  countdown: number;
}

/** Endless: hold one shared keep against waves. PvP: two players, a keep each, no waves. */
export type GameMode = "endless" | "pvp";

/**
 * Test options, from the Debug menu: keeps that take no damage, and gold that never runs out
 * (builds are free).
 */
export type DebugOption = "infiniteKeep" | "infiniteGold";

export interface Keep {
  x: number; // top-left tile
  y: number;
  size: number;
  hp: number;
  maxHp: number;
  /** Whose keep it is in PvP; null for the shared keep in Endless (or before PvP starts). */
  owner: PlayerId | null;
}

export interface GameState {
  /** The seed this game was created from (map and waves). */
  seed: number;
  width: number;
  height: number;
  // Per-tile layers, index = y * width + x. Read them through the grid.ts helpers only.
  terrain: Terrain[];
  /** Resource left on each tile (0 = none); see sim/resources.ts. */
  resources: number[];
  /** What each tile's resource started with, for showing how much is left. */
  resourceStart: number[];
  /** What the tile is: EMPTY, KEEP_TILE, or a base structure id. */
  base: number[];
  /** A tower standing on the tile: EMPTY or a mount structure id. */
  mount: number[];
  structures: Record<number, Structure>;
  nextId: number;
  /** Incremented whenever tile occupancy changes, so pathfinding can recompute lazily. */
  gridVersion: number;
  /** Incremented whenever a unit spawns, dies or moves to another tile, so sight is redone. */
  sightVersion: number;
  /** Flow fields per movement profile, built lazily. */
  flows: Partial<Record<MovementProfile, FlowField>>;
  enemies: Enemy[];
  units: Unit[];
  features: MapFeature[];
  effects: Effect[];
  /** Audible events for the audio layer; see sim/cues.ts. */
  cues: SoundCue[];
  nextCueId: number;
  spawnTiles: Point[];
  mode: GameMode;
  /** One shared keep in Endless; one per player in PvP. */
  keeps: Keep[];
  /** PvP: who won, once the game is over. */
  winner: PlayerId | null;
  wave: WaveState;
  players: Record<PlayerId, Player>;
  nextPlayerId: PlayerId;
  tick: number;
  /** Derived from votes by updateVotes; never set directly. */
  paused: boolean;
  /** Game-speed multiplier: 1 normally, FAST_FORWARD_SPEED while fast-forwarding. Derived from votes. */
  speed: number;
  /** Chance (0-1) at each tile that an enemy wanders off the path. Starts at ENEMY.wanderChance. */
  wanderChance: number;
  gameOver: boolean;
  rngState: number;
  /** False turns fog of war off: every tile is in sight. */
  fog: boolean;
  /** Debug options (offline only), all off to start with. */
  debug: Record<DebugOption, boolean>;
  /**
   * Per tile, one bit per team that has seen it (it stays seen). Endless has one team (bit 0,
   * value 1); in PvP each player is their own team. See sim/fog.ts.
   */
  explored: number[];
}

export type Command =
  | { type: "togglePause" }
  | { type: "toggleFastForward" }
  | { type: "build"; kind: StructureKind; x: number; y: number; facing?: Facing }
  /** Dev only: spawn enemies at random spawn tiles. */
  | { type: "debugSpawn"; count: number; kind?: EnemyKindId }
  /** Dev only (offline): turns a debug option on or off. */
  | { type: "debugOption"; option: DebugOption; on: boolean }
  /** Dev only (offline): turns fog of war on or off. */
  | { type: "debugFog"; on: boolean }
  /** Dev only (offline): a unit for the sender on (x, y). */
  | { type: "debugUnit"; kind: UnitKindId; x: number; y: number }
  | { type: "sendWave" }
  | { type: "sell"; x: number; y: number };

/** Commands for testing: offline only, refused online. */
export type DebugCommand = Extract<
  Command,
  { type: "debugSpawn" | "debugOption" | "debugFog" | "debugUnit" }
>;

export function isDebugCommand(command: Command): command is DebugCommand {
  return (
    command.type === "debugSpawn" ||
    command.type === "debugOption" ||
    command.type === "debugFog" ||
    command.type === "debugUnit"
  );
}

export type CommandResult = { ok: true } | { ok: false; reason: string };
