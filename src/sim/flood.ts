// No looking back: a solo mode. You have no keep to hold: the king starts on the left edge and
// has to walk home, a keep on a raised mountain on the right edge. He walks the route you paint
// for him, as raiders' enemies keep to their painted paths: within the stretch he's on, by the
// shortest way, to the tile of it painted last, using up each tile he steps on. Behind him lava
// comes in from the left in waves: a surge that runs fast across a stretch of land, then a calm
// before the next, each wave bigger and the calm shorter. Every column a surge crosses turns to
// lava with all that's on it, except the mountain, which the lava can't climb. Ahead of him the
// land rises as he comes. The lava touching the king loses; reaching home's keep wins.
// The whole map is generated (seeded) at the start: the land that rises is what was always there.
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

export function createFlood(king: Point, home: Point, width: number): Flood {
  return {
    king,
    progress: 0,
    owner: 1,
    route: [],
    home,
    front: 0,
    sunk: 0,
    risen: Math.min(width, king.x + FLOOD.riseAhead + 1),
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

/** Whether the land at column x has risen yet (always, outside this mode). */
export function hasRisen(state: GameState, x: number): boolean {
  return !state.flood || x < state.flood.risen;
}

/** How far the wave after `wave` waves runs, in tiles. */
function surgeTiles(wave: number): number {
  return Math.min(FLOOD.surgeTiles.most, FLOOD.surgeTiles.first + FLOOD.surgeTiles.perWave * wave);
}

/** The calm after wave number `wave` (the first is 1), in seconds. */
function calmSeconds(wave: number): number {
  const { first, lessPerWave, least } = FLOOD.calmSeconds;
  return Math.max(least, first - lessPerWave * (wave - 1));
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
  const reach = surging ? flood.surgeTo : flood.front + surgeTiles(flood.wave);
  if (x >= Math.ceil(reach)) return null;
  if (surging) return 1;
  // The calm before the first wave is the grace period.
  const total = flood.wave === 0 ? FLOOD.graceSeconds : calmSeconds(flood.wave);
  return Math.max(0, 1 - flood.calm / (total * TICK_RATE));
}

/** The paintRoute command: a tile more of the king's route, or one rubbed out. */
export function paintRoute(
  state: GameState,
  player: PlayerId,
  x: number,
  y: number,
  erase: boolean,
): CommandResult {
  const flood = state.flood;
  if (!flood) return { ok: false, reason: "Only when there's no looking back" };
  if (!inBounds(state, x, y)) return { ok: false, reason: "Off the map" };
  const painted = flood.route.findIndex((p) => p.x === x && p.y === y);
  if (erase) {
    if (painted >= 0) flood.route = flood.route.filter((_, i) => i !== painted);
    return { ok: true };
  }
  if (painted >= 0) return { ok: true };
  if (!hasRisen(state, x)) return { ok: false, reason: "That land hasn't risen yet" };
  if (!isExplored(state, x, y, player)) return { ok: false, reason: "You can't see there" };
  if (terrainAt(state, x, y) === "lava") return { ok: false, reason: "That's lava" };
  if (flood.route.length >= FLOOD.maxRouteTiles) {
    return { ok: false, reason: "No more route to paint" };
  }
  flood.route = [...flood.route, { x, y }];
  return { ok: true };
}

/** Somewhere the king can step: ground (or a bridge) with nothing in the way, risen. */
function canStep(state: GameState, x: number, y: number): boolean {
  return isWalkable(state, x, y) && !blocksAt(state, x, y) && hasRisen(state, x);
}

/**
 * The king's next tile: the first step of the shortest way, over painted tiles he can step on,
 * from where he stands to the tile painted last of those he can reach. Null if there's none.
 */
export function nextKingStep(state: GameState): Point | null {
  const { king, route } = state.flood!;
  const { width } = state;
  const order = new Map<number, number>();
  route.forEach((p, i) => {
    if (canStep(state, p.x, p.y)) order.set(tileIndex(state, p.x, p.y), i);
  });
  const start = tileIndex(state, king.x, king.y);
  const cameFrom = new Map<number, number>([[start, -1]]);
  const queue = [start];
  let end = -1;
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head];
    if (i !== start && (end < 0 || order.get(i)! > order.get(end)!)) end = i;
    const x = i % width;
    for (const n of [i - width, x < width - 1 ? i + 1 : -1, i + width, x > 0 ? i - 1 : -1]) {
      if (!order.has(n) || cameFrom.has(n)) continue;
      cameFrom.set(n, i);
      queue.push(n);
    }
  }
  if (end < 0) return null;
  let step = end;
  while (cameFrom.get(step) !== start) step = cameFrom.get(step)!;
  return { x: step % width, y: Math.floor(step / width) };
}

/** Once a tick: the king walks, the lava waits or surges, and the land rises ahead of him. */
export function updateFlood(state: GameState): void {
  const flood = state.flood;
  if (!flood) return;
  walkKing(state, flood);
  if (flood.calm > 0) {
    if (--flood.calm === 0)
      flood.surgeTo = Math.min(state.width, flood.front + surgeTiles(flood.wave++));
  } else {
    flood.front = Math.min(flood.surgeTo, flood.front + FLOOD.surgeSpeed / TICK_RATE);
    if (flood.front >= flood.surgeTo) flood.calm = calmSeconds(flood.wave) * TICK_RATE;
  }
  while (flood.sunk < Math.floor(flood.front)) sinkColumn(state, flood, flood.sunk++);
  flood.risen = Math.max(flood.risen, Math.min(state.width, flood.king.x + FLOOD.riseAhead + 1));
}

function walkKing(state: GameState, flood: Flood): void {
  // A tile painted under him is used up already.
  flood.route = flood.route.filter((p) => p.x !== flood.king.x || p.y !== flood.king.y);
  const next = nextKingStep(state);
  if (!next) {
    flood.progress = 0;
    return;
  }
  flood.progress += FLOOD.kingSpeed / TICK_RATE;
  if (flood.progress < 1) return;
  flood.progress -= 1;
  flood.king = next;
  flood.route = flood.route.filter((p) => p.x !== next.x || p.y !== next.y);
  exploreKingSight(state);
}

/**
 * A column goes under: lava, with nothing left on it (units burn, buildings and route go).
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
  flood.route = flood.route.filter((p) => p.x > x || above(p.y));
  state.gridVersion++;
}
