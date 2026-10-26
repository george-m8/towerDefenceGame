// Turning the view in quarter turns (a prototype). The renderer only knows one view, looking
// north with blocks' fronts to the south, so a turned view is drawn from a turned copy of the
// game: every tile layer, structure, enemy, unit, keep, chest and effect moved to where it
// sits once the map is turned, and every facing turned with it. The game itself never turns:
// clicks are turned back into map tiles before they become commands.
import type { Facing, GameState, Point } from "../sim/types";
import { centerOn, setViewport, tilePixels } from "../ui/camera";
import type { UiState } from "../ui/state";

/** Quarter turns clockwise: 0 is the map as it is, north up. */
export type Rotation = 0 | 1 | 2 | 3;

const FACINGS: Facing[] = ["N", "E", "S", "W"];

/** The view's size for a map of this size. */
export function viewSize(width: number, height: number, turns: Rotation) {
  return turns % 2 === 0 ? { width, height } : { width: height, height: width };
}

/**
 * Where a map point is in the view. Works for tiles and for in-between positions (enemies on
 * the move), which are measured the same way, in tiles from the top-left.
 */
export function toView(p: Point, turns: Rotation, width: number, height: number): Point {
  switch (turns) {
    case 0:
      return { x: p.x, y: p.y };
    case 1:
      return { x: height - 1 - p.y, y: p.x };
    case 2:
      return { x: width - 1 - p.x, y: height - 1 - p.y };
    case 3:
      return { x: p.y, y: width - 1 - p.x };
  }
}

/** The map point at a point in the view: the inverse of toView. */
export function fromView(p: Point, turns: Rotation, width: number, height: number): Point {
  const back = ((4 - turns) % 4) as Rotation;
  const view = viewSize(width, height, turns);
  return toView(p, back, view.width, view.height);
}

export function turnFacing(facing: Facing, turns: Rotation): Facing {
  return FACINGS[(FACINGS.indexOf(facing) + turns) % 4];
}

/** A map point in the view, given in continuous map coordinates (a tile's corner is 0). */
function cornerToView(x: number, y: number, turns: Rotation, w: number, h: number): Point {
  // toView works on tile positions; a corner point sits half a tile up-left of a tile centre.
  const p = toView({ x: x - 0.5, y: y - 0.5 }, turns, w, h);
  return { x: p.x + 0.5, y: p.y + 0.5 };
}

/** Coordinate pairs things carry that are tile positions, to be moved into the view. */
const POINT_KEYS: [string, string][] = [
  ["x", "y"],
  ["tx", "ty"],
  ["px", "py"],
  ["fromX", "fromY"],
  ["toX", "toY"],
];

/** A copy of `thing` with its positions and facing moved into the view. */
function turned<T extends object>(thing: T, turns: Rotation, w: number, h: number): T {
  const copy = { ...thing } as Record<string, unknown>;
  for (const [kx, ky] of POINT_KEYS) {
    if (typeof copy[kx] !== "number" || typeof copy[ky] !== "number") continue;
    const p = toView({ x: copy[kx] as number, y: copy[ky] as number }, turns, w, h);
    copy[kx] = p.x;
    copy[ky] = p.y;
  }
  if (typeof copy.facing === "string") copy.facing = turnFacing(copy.facing as Facing, turns);
  if (typeof copy.aim === "number") copy.aim = ((copy.aim as number) + 90 * turns) % 360;
  return copy as T;
}

/** A tile layer, reordered for the view. */
function turnedLayer<T>(layer: T[], turns: Rotation, w: number, h: number): T[] {
  const view = viewSize(w, h, turns);
  const out = new Array<T>(layer.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = toView({ x, y }, turns, w, h);
      out[p.y * view.width + p.x] = layer[y * w + x];
    }
  }
  return out;
}

/** The turned copy for each game, reused while the turn stays the same (it keeps caches). */
const views = new WeakMap<GameState, { turns: Rotation; view: GameState }>();

/** The turned copy as last brought up to date (for clicks between frames), or a fresh one. */
export function lastViewOf(state: GameState, turns: Rotation): GameState {
  const entry = views.get(state);
  return turns === 0 ? state : entry?.turns === turns ? entry.view : viewOf(state, turns);
}

/**
 * Turns the view `by` quarter turns clockwise, keeping the same spot of the map in the middle
 * of the screen.
 */
export function turnView(ui: UiState, state: GameState | null, by: 1 | 2 | 3): void {
  const cam = ui.camera;
  const next = ((ui.rotation + by) % 4) as Rotation;
  if (!state) {
    ui.rotation = next;
    return;
  }
  const tiles = cam.viewWidth / tilePixels(cam);
  const rows = cam.viewHeight / tilePixels(cam);
  const centre = { x: cam.x + tiles / 2, y: cam.y + rows / 2 }; // a corner point in the view
  const map = cornerFromView(centre, ui.rotation, state.width, state.height);
  ui.rotation = next;
  const size = viewSize(state.width, state.height, next);
  setViewport(cam, cam.viewWidth, cam.viewHeight, size.width, size.height);
  const there = cornerToView(map.x, map.y, next, state.width, state.height);
  centerOn(cam, there.x, there.y);
}

/** A continuous map point (corner-based) from one in the view. */
function cornerFromView(p: Point, turns: Rotation, w: number, h: number): Point {
  const q = fromView({ x: p.x - 0.5, y: p.y - 0.5 }, turns, w, h);
  return { x: q.x + 0.5, y: q.y + 0.5 };
}

/**
 * The game as seen turned `turns` quarter turns clockwise, for drawing. Brought up to date on
 * every call (once a frame): the same object is reused, so what's cached against it (sight,
 * enclosures, flow fields) stays cached while the game's versions don't change.
 */
export function viewOf(state: GameState, turns: Rotation): GameState {
  if (turns === 0) return state;
  const w = state.width;
  const h = state.height;
  const size = viewSize(w, h, turns);
  let entry = views.get(state);
  if (!entry || entry.turns !== turns) {
    entry = { turns, view: { ...state, flows: {} } };
    views.set(state, entry);
  }
  const view = entry.view;
  const flows = view.flows;
  Object.assign(view, state, size, { flows });
  view.terrain = turnedLayer(state.terrain, turns, w, h);
  view.resources = turnedLayer(state.resources, turns, w, h);
  view.resourceWorth = turnedLayer(state.resourceWorth, turns, w, h);
  view.base = turnedLayer(state.base, turns, w, h);
  view.mount = turnedLayer(state.mount, turns, w, h);
  view.explored = turnedLayer(state.explored, turns, w, h);
  view.structures = Object.fromEntries(
    Object.entries(state.structures).map(([id, s]) => [id, turned(s, turns, w, h)]),
  );
  view.enemies = state.enemies.map((e) => turned(e, turns, w, h));
  view.units = state.units.map((u) => turned(u, turns, w, h));
  view.features = state.features.map((f) => turned(f, turns, w, h));
  view.effects = state.effects.map((e) => turned(e, turns, w, h));
  view.spawnTiles = state.spawnTiles.map((p) => toView(p, turns, w, h));
  // A keep is a square: its top-left in the view is the turned corner nearest the top-left.
  view.keeps = state.keeps.map((keep) => {
    const a = cornerToView(keep.x, keep.y, turns, w, h);
    const b = cornerToView(keep.x + keep.size, keep.y + keep.size, turns, w, h);
    return { ...keep, x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) };
  });
  return view;
}
