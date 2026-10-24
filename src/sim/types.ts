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
  spawnTiles: Point[];
  keep: Keep;
  gold: number;
  tick: number;
  paused: boolean;
  gameOver: boolean;
  rngState: number;
}

export type Command =
  { type: "togglePause" } | { type: "build"; kind: StructureKind; x: number; y: number };

export type CommandResult = { ok: true } | { ok: false; reason: string };
