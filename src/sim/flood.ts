// No looking back: a solo mode. You have no keep to hold: the king starts on the left edge and
// has to walk home, a keep on a raised mountain on the right edge. You plan his way as a raider
// plans their enemy's: a flag to walk to, then more flags after it, and he walks to each in turn
// by the shortest way he knows (over land you've seen). Behind him lava comes in from the left in
// waves: a surge that runs fast across a few tiles, then a calm before the next, each calm a
// little shorter. Every column a surge crosses turns to lava with all that's on it,
// except the mountain, which the lava can't climb. The lava touching the king loses; reaching
// home's keep wins. The whole map is there from the start; the camera rolls on with the lava.
import { FLOOD, KEEP_SIZE, TICK_RATE } from "./config";
import { exploreKingSight, isExplored } from "./fog";
import {
  baseAt,
  blocksAt,
  inBounds,
  isWalkable,
  mountAt,
  removeStructure,
  terrainAt,
  tileIndex,
} from "./grid";
import type { CommandResult, Flood, GameState, PlayerId, Point } from "./types";

export function createFlood(king: Point, home: Point): Flood {
  return {
    king,
    progress: 0,
    owner: 1,
    plan: [],
    path: [],
    home,
    front: 0,
    sunk: 0,
    wave: 0,
    calm: FLOOD.graceSeconds * TICK_RATE,
    surgeTo: 0,
  };
}

/** Whether (x, y) is part of home, the keep the king is going to. */
export function isFloodHome(state: GameState, x: number, y: number): boolean {
  const home = state.flood?.home;
  return !!home && x >= home.x && y >= home.y && x < home.x + KEEP_SIZE && y < home.y + KEEP_SIZE;
}

/** Tiles from home's keep to (x, y), in steps any way (0: on it). */
function fromHome(flood: Flood, x: number, y: number): number {
  const { home } = flood;
  const dx = Math.max(home.x - x, 0, x - (home.x + KEEP_SIZE - 1));
  const dy = Math.max(home.y - y, 0, y - (home.y + KEEP_SIZE - 1));
  return Math.max(dx, dy);
}

/**
 * How high the mountain home stands on is at (x, y): 0 off it, rising a step a ring to
 * FLOOD.mountainRadius at the top, round the keep (which stands on the top).
 */
export function mountainStep(state: GameState, x: number, y: number): number {
  const flood = state.flood;
  if (!flood) return 0;
  return Math.max(0, FLOOD.mountainRadius + 1 - Math.max(1, fromHome(flood, x, y)));
}

/** Where the king is drawn: part way from his tile to the next on his way. */
export function kingAt(flood: Flood): Point {
  const next = flood.progress > 0 ? flood.path[0] : undefined;
  if (!next) return { ...flood.king };
  const t = flood.progress;
  return {
    x: flood.king.x + (next.x - flood.king.x) * t,
    y: flood.king.y + (next.y - flood.king.y) * t,
  };
}

/** Tiles from the king to the nearest tile of home (0: on it), in steps any way. */
export function kingFromHome(state: GameState): number {
  const { king } = state.flood!;
  return fromHome(state.flood!, king.x, king.y);
}

/** Tiles from the lava to the king (0: it has him); null once he's up the mountain, safe. */
export function lavaBehindKing(state: GameState): number | null {
  const { king, front } = state.flood!;
  if (mountainStep(state, king.x, king.y) > 0) return null;
  return Math.max(0, Math.floor(king.x + 1 - front));
}

/** The king is home once he's on, or next to, any tile of its keep. */
export function kingHome(state: GameState): boolean {
  return state.flood !== null && kingFromHome(state) <= 1;
}

/** The lava has the king. */
export function kingDrowned(state: GameState): boolean {
  const flood = state.flood;
  return flood !== null && terrainAt(state, flood.king.x, flood.king.y) === "lava";
}

/** The calm after wave number `wave` (the first is 1), in ticks. */
function calmTicks(wave: number): number {
  const { first, lessPerWave, least } = FLOOD.calmSeconds;
  return Math.round(Math.max(least, first - lessPerWave * (wave - 1)) * TICK_RATE);
}

/** The lava's waves: surging now, or how long until the next one (whole seconds). */
export function lavaWaves(state: GameState): { wave: number; surging: boolean; seconds: number } {
  const { wave, calm } = state.flood!;
  return calm > 0
    ? { wave: wave + 1, surging: false, seconds: Math.ceil(calm / TICK_RATE) }
    : { wave, surging: true, seconds: 0 };
}

/**
 * How soon lava takes column x: null if not in this wave's (or the coming wave's) reach, else
 * 0 to 1, the coming wave's nearness (1: surging now). Under lava already: null too.
 */
export function lavaWarning(state: GameState, x: number): number | null {
  const flood = state.flood;
  if (!flood || x < flood.sunk) return null;
  const surging = flood.calm === 0;
  const reach = surging ? flood.surgeTo : flood.front + FLOOD.surgeTiles;
  if (x >= Math.ceil(reach)) return null;
  if (surging) return 1;
  // The calm before the first wave is the grace period.
  const total = flood.wave === 0 ? FLOOD.graceSeconds * TICK_RATE : calmTicks(flood.wave);
  return Math.max(0, 1 - flood.calm / total);
}

/**
 * The planKing command, as a raider plans: a flag for the king to walk to (his plan's first, its
 * others dropped), or with `queue` one more after his others. On the king himself: he stops.
 */
export function planKing(
  state: GameState,
  player: PlayerId,
  x: number,
  y: number,
  queue: boolean,
): CommandResult {
  const flood = state.flood;
  if (!flood) return { ok: false, reason: "Only when there's no looking back" };
  if (!inBounds(state, x, y)) return { ok: false, reason: "Off the map" };
  if (x === flood.king.x && y === flood.king.y && !queue) {
    flood.plan = [];
    flood.path = [];
    return { ok: true };
  }
  if (!isExplored(state, x, y, player)) return { ok: false, reason: "You can't see there" };
  if (terrainAt(state, x, y) === "lava") return { ok: false, reason: "That's lava" };
  if (queue) {
    if (flood.plan.length >= FLOOD.maxFlags) return { ok: false, reason: "Too many flags" };
    flood.plan = [...flood.plan, { x, y }];
  } else flood.plan = [{ x, y }];
  flood.path = kingPath(state, flood);
  return { ok: true };
}

/** Somewhere the king can step: ground (or a bridge) with nothing in the way, that you've seen. */
function canStep(state: GameState, flood: Flood, x: number, y: number): boolean {
  return isWalkable(state, x, y) && !blocksAt(state, x, y) && isExplored(state, x, y, flood.owner);
}

/** The four tiles beside (x, y) that are on the map, as indices. */
function besideOnMap(state: GameState, x: number, y: number): number[] {
  const { width, height } = state;
  const out: number[] = [];
  if (y > 0) out.push(x + (y - 1) * width);
  if (x < width - 1) out.push(x + 1 + y * width);
  if (y < height - 1) out.push(x + (y + 1) * width);
  if (x > 0) out.push(x - 1 + y * width);
  return out;
}

/**
 * The tiles from the king to his next flag, not counting where he stands, by the shortest way
 * over tiles he can step on. A flag he can't reach: to the tile nearest it that he can. Of the
 * shortest ways, the one nearest the straight line there: each step goes to whichever tile a
 * step nearer (along the way) is nearest the flag, so he walks a staircase, not an L.
 */
export function kingPath(state: GameState, flood: Flood): Point[] {
  const goal = flood.plan[0];
  if (!goal) return [];
  const { width } = state;
  const start = tileIndex(state, flood.king.x, flood.king.y);
  const steppable = (i: number) => canStep(state, flood, i % width, Math.floor(i / width));
  // Out from the king: what he can reach, and the tile of it nearest the flag.
  const reached = new Set([start]);
  const queue = [start];
  let best = start;
  let bestDistance = Math.hypot(flood.king.x - goal.x, flood.king.y - goal.y);
  for (let head = 0; head < queue.length && bestDistance > 0; head++) {
    const i = queue[head];
    const x = i % width;
    const y = (i - x) / width;
    const distance = Math.hypot(x - goal.x, y - goal.y);
    if (distance < bestDistance) [best, bestDistance] = [i, distance];
    for (const n of besideOnMap(state, x, y)) {
      if (reached.has(n) || !steppable(n)) continue;
      reached.add(n);
      queue.push(n);
    }
  }
  if (best === start) return [];
  // Back from there: steps to go from each tile he can reach.
  const steps = new Map([[best, 0]]);
  const back = [best];
  for (let head = 0; head < back.length && !steps.has(start); head++) {
    const i = back[head];
    for (const n of besideOnMap(state, i % width, Math.floor(i / width))) {
      if (steps.has(n) || !reached.has(n)) continue;
      steps.set(n, steps.get(i)! + 1);
      back.push(n);
    }
  }
  const path: Point[] = [];
  for (let at = start; at !== best;) {
    const left = steps.get(at)!;
    let next = -1;
    let nearest = Infinity;
    for (const n of besideOnMap(state, at % width, Math.floor(at / width))) {
      if (steps.get(n) !== left - 1) continue;
      const d = Math.hypot((n % width) - goal.x, Math.floor(n / width) - goal.y);
      if (d < nearest) [next, nearest] = [n, d];
    }
    path.push({ x: next % width, y: Math.floor(next / width) });
    at = next;
  }
  return path;
}

/** Once a tick: the king walks, and the lava waits or surges. */
export function updateFlood(state: GameState): void {
  const flood = state.flood;
  if (!flood) return;
  walkKing(state, flood);
  if (flood.calm > 0) {
    if (--flood.calm === 0) {
      flood.surgeTo = Math.min(state.width, flood.front + FLOOD.surgeTiles);
      flood.wave++;
    }
  } else {
    flood.front = Math.min(flood.surgeTo, flood.front + FLOOD.surgeSpeed / TICK_RATE);
    if (flood.front >= flood.surgeTo) flood.calm = calmTicks(flood.wave);
  }
  while (flood.sunk < Math.floor(flood.front)) sinkColumn(state, flood, flood.sunk++);
}

function walkKing(state: GameState, flood: Flood): void {
  if (flood.path.length === 0) nextWay(state, flood);
  if (flood.path.length === 0) {
    flood.progress = 0;
    return;
  }
  flood.progress += FLOOD.kingSpeed / TICK_RATE;
  if (flood.progress < 1) return;
  flood.progress -= 1;
  // His way, found again as he steps (what's built and seen changes as he goes).
  nextWay(state, flood);
  const next = flood.path[0];
  if (!next) return;
  flood.king = next;
  flood.path = flood.path.slice(1);
  exploreKingSight(state);
}

/** The way to his next flag; flags he's at (or as near as he can get to) are done. */
function nextWay(state: GameState, flood: Flood): void {
  flood.path = kingPath(state, flood);
  while (flood.path.length === 0 && flood.plan.length > 0) {
    flood.plan = flood.plan.slice(1);
    flood.path = kingPath(state, flood);
  }
}

/**
 * A column goes under: lava, with nothing left on it (units burn, buildings and flags go).
 * The mountain, and home's keep on it, stand above it.
 */
function sinkColumn(state: GameState, flood: Flood, x: number): void {
  const above = (y: number) => mountainStep(state, x, y) > 0 || isFloodHome(state, x, y);
  for (let y = 0; y < state.height; y++) {
    if (above(y)) continue;
    const mount = mountAt(state, x, y);
    if (mount) removeStructure(state, mount);
    const base = baseAt(state, x, y);
    if (base) removeStructure(state, base);
    state.terrain[tileIndex(state, x, y)] = "lava";
  }
  for (const unit of state.units) {
    if (Math.round(unit.x) <= x && !above(Math.round(unit.y))) unit.hp = 0;
  }
  state.enemies = state.enemies.filter((e) => Math.round(e.x) > x || above(Math.round(e.y)));
  flood.plan = flood.plan.filter((p) => p.x > x || above(p.y));
  state.gridVersion++;
}
