import type { STRUCTURES } from "./config";

export interface Point {
  x: number;
  y: number;
}

export type StructureKind = keyof typeof STRUCTURES;

export interface Structure {
  id: number;
  kind: StructureKind;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
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
}

export interface FlowField {
  /** gridVersion this field was computed for. */
  version: number;
  /** Cost to reach the keep from each tile (0 on the keep). */
  dist: number[];
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
  spawnTiles: Point[];
  keep: Keep;
  gold: number;
  tick: number;
  paused: boolean;
  gameOver: boolean;
  rngState: number;
}

export type Command =
  | { type: "togglePause" }
  | { type: "build"; kind: StructureKind; x: number; y: number }
  /** Dev only: spawn enemies at random spawn tiles. */
  | { type: "debugSpawn"; count: number };

export type CommandResult = { ok: true } | { ok: false; reason: string };
