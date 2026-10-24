import type { STRUCTURES, TERRAIN } from "./config";

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
  /** Only for directional structures (wall spikes). */
  facing?: Facing;
  /** Who built it; null for neutral map structures (ruins). */
  owner: PlayerId | null;
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
  /** The player whose structure struck the killing blow, once hp <= 0. */
  killedBy: PlayerId | null;
  /** Ticks until it can hit a blocking structure again. */
  attackCooldown: number;
}

/** Short-lived visual events recorded by the simulation for the renderer. */
export type Effect =
  | { kind: "shot"; fromX: number; fromY: number; toX: number; toY: number; ttl: number }
  | { kind: "splash"; x: number; y: number; radius: number; ttl: number }
  | { kind: "spikes"; x: number; y: number; ttl: number };

/** Things lying on the map that aren't terrain or structures. `resources` adds deposits and animals. */
export type MapFeature = { kind: "chest"; x: number; y: number; gold: number };

export interface FlowField {
  /** gridVersion this field was computed for. */
  version: number;
  /** Cost to reach the keep from each tile (0 on the keep). */
  dist: number[];
}

export interface WaveState {
  /** Waves started so far (0 before the first wave). */
  number: number;
  /** Enemies of the current wave still to spawn. */
  toSpawn: number;
  /** Ticks until the next spawn while spawning. */
  spawnTimer: number;
  /** Ticks until the next wave, once spawning has finished. */
  countdown: number;
}

export interface Keep {
  x: number; // top-left tile
  y: number;
  size: number;
  hp: number;
  maxHp: number;
}

export interface GameState {
  /** The seed this game was created from (map and waves). */
  seed: number;
  width: number;
  height: number;
  // Per-tile layers, index = y * width + x. Read them through the grid.ts helpers only.
  terrain: Terrain[];
  /** What the tile is: EMPTY, KEEP_TILE, or a base structure id. */
  base: number[];
  /** A tower standing on the tile: EMPTY or a mount structure id. */
  mount: number[];
  structures: Record<number, Structure>;
  nextId: number;
  /** Incremented whenever tile occupancy changes, so pathfinding can recompute lazily. */
  gridVersion: number;
  flow: FlowField | null;
  enemies: Enemy[];
  features: MapFeature[];
  effects: Effect[];
  spawnTiles: Point[];
  keep: Keep;
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
}

export type Command =
  | { type: "togglePause" }
  | { type: "toggleFastForward" }
  | { type: "build"; kind: StructureKind; x: number; y: number; facing?: Facing }
  /** Dev only: spawn enemies at random spawn tiles. */
  | { type: "debugSpawn"; count: number }
  | { type: "sendWave" }
  | { type: "sell"; x: number; y: number };

export type CommandResult = { ok: true } | { ok: false; reason: string };
