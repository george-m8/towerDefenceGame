// Every keep starts walled in: a ring of walls with a courtyard between it and the keep, and a
// gate in the middle of the side facing the enemy, so the way in stays open but the courtyard
// counts as the keep's enclosure. The walls were free, so selling them pays nothing.
import { KEEP_WALLS, TERRAIN } from "./config";
import { baseAt, inBounds, placeStructure, terrainAt, topAt } from "./grid";
import type { Facing, GameState, Keep, Point } from "./types";

/** Walls and gates on the ring round each keep, gate first. Skips anything already there. */
export function placeKeepWalls(state: GameState): void {
  for (const keep of state.keeps) {
    const gate = gateTile(keep, gateSide(state, keep));
    for (const p of ringTiles(keep)) {
      if (!inBounds(state, p.x, p.y) || topAt(state, p.x, p.y)) continue;
      if (TERRAIN[terrainAt(state, p.x, p.y)].buildable !== "any") continue;
      const kind = p.x === gate.x && p.y === gate.y ? "gate" : "wall";
      placeStructure(state, kind, p.x, p.y, "N", keep.owner).paid = 0;
    }
  }
}

/** PvP: once the keeps are handed out, each player owns the walls round their own keep. */
export function claimKeepWalls(state: GameState, keep: Keep): void {
  for (const p of ringTiles(keep)) {
    const base = baseAt(state, p.x, p.y);
    if (base && base.owner === null && (base.kind === "wall" || base.kind === "gate")) {
      base.owner = keep.owner;
    }
  }
}

/** The side the enemy comes from: the spawn in Endless, the middle of the map in PvP. */
export function gateSide(state: GameState, keep: Keep): Facing {
  const from =
    state.spawnTiles.length > 0
      ? {
          x: average(state.spawnTiles.map((p) => p.x)),
          y: average(state.spawnTiles.map((p) => p.y)),
        }
      : { x: state.width / 2, y: state.height / 2 };
  const dx = from.x - (keep.x + keep.size / 2);
  const dy = from.y - (keep.y + keep.size / 2);
  if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? "W" : "E";
  return dy < 0 ? "N" : "S";
}

/** The ring's corners: KEEP_WALLS.courtyard tiles of open ground between it and the keep. */
function ringBounds(keep: Keep) {
  const out = KEEP_WALLS.courtyard + 1;
  return {
    x0: keep.x - out,
    y0: keep.y - out,
    x1: keep.x + keep.size - 1 + out,
    y1: keep.y + keep.size - 1 + out,
  };
}

export function ringTiles(keep: Keep): Point[] {
  const { x0, y0, x1, y1 } = ringBounds(keep);
  const tiles: Point[] = [];
  for (let x = x0; x <= x1; x++) tiles.push({ x, y: y0 }, { x, y: y1 });
  for (let y = y0 + 1; y < y1; y++) tiles.push({ x: x0, y }, { x: x1, y });
  return tiles;
}

/** The middle of the ring's `side`. */
function gateTile(keep: Keep, side: Facing): Point {
  const { x0, y0, x1, y1 } = ringBounds(keep);
  const mid = Math.floor(keep.size / 2);
  const across = { x: keep.x + mid, y: keep.y + mid };
  if (side === "N") return { x: across.x, y: y0 };
  if (side === "S") return { x: across.x, y: y1 };
  if (side === "W") return { x: x0, y: across.y };
  return { x: x1, y: across.y };
}

function average(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}
