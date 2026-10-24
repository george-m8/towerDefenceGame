import { createGame } from "../../src/sim/game";
import { placeStructure } from "../../src/sim/grid";
import type { GameState, Point, StructureKind, Terrain } from "../../src/sim/types";

/** Place structures directly, bypassing gold and placement rules. */
export function buildAt(state: GameState, points: Point[], kind: StructureKind = "wall") {
  for (const p of points) placeStructure(state, kind, p.x, p.y);
}

/** Every tile in the 1-tile ring around a rectangle. */
export function ring(x0: number, y0: number, x1: number, y1: number): Point[] {
  const points: Point[] = [];
  for (let x = x0; x <= x1; x++) points.push({ x, y: y0 }, { x, y: y1 });
  for (let y = y0 + 1; y < y1; y++) points.push({ x: x0, y }, { x: x1, y });
  return points;
}

/** A game whose wave countdown never runs out, for testing other systems in isolation. */
export function createGameWithoutWaves(seed = 1): GameState {
  const state = createGame(seed);
  state.wave.countdown = Infinity;
  return state;
}

/** Paint terrain directly, for terrain-rule tests on an otherwise blank map. */
export function paintTerrain(state: GameState, points: Point[], terrain: Terrain) {
  for (const p of points) state.terrain[p.y * state.width + p.x] = terrain;
}

/** A full column of tiles at x, optionally leaving some rows out. */
export function column(state: GameState, x: number, except: number[] = []): Point[] {
  return Array.from({ length: state.height }, (_, y) => ({ x, y })).filter(
    (p) => !except.includes(p.y),
  );
}
