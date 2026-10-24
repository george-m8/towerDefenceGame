import type { STRUCTURES } from "./config";

export interface Point {
  x: number;
  y: number;
}

export type StructureKind = keyof typeof STRUCTURES;

export type Facing = "N" | "E" | "S" | "W";

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
}

export interface Enemy {
  id: number;
  /** Position in tile coordinates; fractional while moving between tiles. */
  x: number;
  y: number;
  /** The tile it is currently moving to. */
  tx: number;
  ty: number;
  hp: number;
  maxHp: number;
  bounty: number;
  /** Ticks until it can hit a blocking structure again. */
  attackCooldown: number;
}

/** Short-lived visual events recorded by the simulation for the renderer. */
export type Effect =
  | { kind: "shot"; fromX: number; fromY: number; toX: number; toY: number; ttl: number }
  | { kind: "splash"; x: number; y: number; radius: number; ttl: number }
  | { kind: "spikes"; x: number; y: number; ttl: number };

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
  width: number;
  height: number;
  /** Per-tile occupant: EMPTY, KEEP_TILE, or a structure id. Index = y * width + x. */
  tiles: number[];
  structures: Record<number, Structure>;
  nextId: number;
  /** Incremented whenever tile occupancy changes, so pathfinding can recompute lazily. */
  gridVersion: number;
  flow: FlowField | null;
  enemies: Enemy[];
  effects: Effect[];
  spawnTiles: Point[];
  keep: Keep;
  wave: WaveState;
  gold: number;
  tick: number;
  paused: boolean;
  gameOver: boolean;
  rngState: number;
}

export type Command =
  | { type: "togglePause" }
  | { type: "build"; kind: StructureKind; x: number; y: number; facing?: Facing }
  /** Dev only: spawn enemies at random spawn tiles. */
  | { type: "debugSpawn"; count: number }
  | { type: "sendWave" };

export type CommandResult = { ok: true } | { ok: false; reason: string };
