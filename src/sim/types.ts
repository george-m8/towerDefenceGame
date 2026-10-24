export interface Point {
  x: number;
  y: number;
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
  spawnTiles: Point[];
  keep: Keep;
  gold: number;
  tick: number;
  paused: boolean;
  gameOver: boolean;
  rngState: number;
}

export type Command = { type: "togglePause" };

export type CommandResult = { ok: true } | { ok: false; reason: string };
