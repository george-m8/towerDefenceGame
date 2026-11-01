// No looking back: a solo mode, and an endless one. You have no keep to hold: the king starts on
// the left edge and walks on, as far as he can. You plan his way as a raider plans their
// enemy's: a flag to walk to, then more flags after it, and he walks to each in turn by the
// shortest way he knows (over land you've seen). Behind him lava creeps in from the left, slowly
// at first and a little faster all the time, with a ragged edge (see lavaEdge), turning each tile
// it reaches to lava with all that's on it, but for walls and ruins, which it flows round
// (spreadLava). The lava touching the king ends the game; how far he got is the score.
// The map never ends: as the king nears its right edge, the column furthest behind (lava, or soon
// to be) is dropped, everything moves a column left, and a column of new land comes in on the
// right (see shiftWorld). The camera moves with it.
import { FLOOD, JOURNEY, KEEP_SIZE, TERRAIN, TICK_RATE } from "./config";
import { placeFloodSwarm } from "./floodSwarms";
import { randomInt } from "./rng";
import { exploreKingSight, isExplored } from "./fog";
import {
  EMPTY,
  baseAt,
  blocksAt,
  inBounds,
  isBuilt,
  isWalkable,
  mountAt,
  placeStructure,
  removeStructure,
  terrainAt,
  tileIndex,
} from "./grid";
import { generateChunk, type MapGenResult } from "./mapgen";
import { startingWork, startingWorth } from "./resources";
import type { CommandResult, Flood, GameState, Land, PlayerId, Point, Terrain } from "./types";

export function createFlood(
  king: Point,
  width: number,
  height: number,
  goal: number | null = null,
  home: Point | null = null,
): Flood {
  return {
    king,
    progress: 0,
    owner: 1,
    kingHp: FLOOD.kingHp,
    kingMaxHp: FLOOD.kingHp,
    swarms: 1,
    plan: [],
    path: [],
    front: 0,
    // Lava comes in from beyond the left edge: every tile of it is next to it.
    edge: Array.from({ length: height }, (_, y) => y * width),
    fill: new Array<number>(height).fill(0),
    glow: [],
    shifted: 0,
    startX: king.x,
    land: null,
    goal,
    home: home && { worldX: home.x, y: home.y },
  };
}

/** Where the keep is on the map (its top-left tile), if it's on it yet. */
export function homeOnMap(state: GameState): Point | null {
  const flood = state.flood;
  if (!flood?.home) return null;
  const x = flood.home.worldX - flood.shifted;
  return x + KEEP_SIZE > 0 && x < state.width ? { x, y: flood.home.y } : null;
}

/** Whether (x, y) is part of the keep the king's going to. */
export function isFloodHome(state: GameState, x: number, y: number): boolean {
  const home = homeOnMap(state);
  return !!home && x >= home.x && y >= home.y && x < home.x + KEEP_SIZE && y < home.y + KEEP_SIZE;
}

/** Tiles still to go to the keep (a goal game only; 0 once there). */
export function tilesToGoal(flood: Flood): number | null {
  if (flood.goal === null) return null;
  const at = flood.home ? flood.home.worldX - 1 - flood.startX : flood.goal;
  return Math.max(0, at - distanceTravelled(flood));
}

/** The king is next to (or on) the keep: a goal game won. */
export function kingHome(state: GameState): boolean {
  const flood = state.flood;
  const home = homeOnMap(state);
  if (!flood || !home) return false;
  const { x, y } = flood.king;
  const dx = Math.max(home.x - x, 0, x - (home.x + KEEP_SIZE - 1));
  const dy = Math.max(home.y - y, 0, y - (home.y + KEEP_SIZE - 1));
  return Math.max(dx, dy) <= 1;
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

/** How far the king has got from where he started, in tiles across the map: the score. */
export function distanceTravelled(flood: Flood): number {
  return Math.max(0, flood.king.x + flood.shifted - flood.startX);
}

/** Tiles from the lava's edge, in his row, to the king (0: it has him). */
export function lavaBehindKing(state: GameState): number {
  const { king } = state.flood!;
  return Math.max(0, Math.floor(king.x + 1 - lavaEdge(state, king.y)));
}

/**
 * Where the lava's edge is in row y, in tiles from the left: not a straight line but the
 * front, pushed on or held back a little row by row by two slow waves that drift as time goes
 * by (seeded, so a game plays the same), so tongues of lava run on ahead here and there.
 */
export function lavaEdge(state: GameState, y: number): number {
  const flood = state.flood!;
  const { reach, waves } = FLOOD.edge;
  const t = state.tick / TICK_RATE;
  let wobble = 0;
  waves.forEach((wave, i) => {
    const phase = (((state.seed >>> (i * 8)) & 0xff) / 256) * Math.PI * 2;
    wobble += wave.share * Math.sin((y / wave.rows) * Math.PI * 2 + phase + t * wave.drift);
  });
  return flood.front + reach * wobble;
}

/**
 * How much later than the edge the lava takes a tile, 0 to FLOOD.edge.rough: a little different
 * for each tile (fixed for its place in the world, not the map), so the edge is ragged.
 */
function roughness(state: GameState, x: number, y: number): number {
  let h = Math.imul(x + state.flood!.shifted, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1) ^ state.seed;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca77);
  h ^= h >>> 13;
  return ((h >>> 0) / 0x100000000) * FLOOD.edge.rough;
}

/** How far ahead of the lava's edge (x, y) is, in tiles (0 or less: due to go under now). */
function aheadOfLava(state: GameState, x: number, y: number): number {
  return x + 1 + roughness(state, x, y) - lavaEdge(state, y);
}

/** The lava has the king. */
export function kingDrowned(state: GameState): boolean {
  const flood = state.flood;
  return flood !== null && terrainAt(state, flood.king.x, flood.king.y) === "lava";
}

/** How fast the lava creeps now, in tiles a second (0 before it starts). */
export function lavaSpeed(state: GameState): number {
  const seconds = state.tick / TICK_RATE - FLOOD.graceSeconds;
  if (seconds <= 0) return 0;
  const { start, perMinute, most } = FLOOD.lavaSpeed;
  return Math.min(most, start + (perMinute * seconds) / 60);
}

/** Seconds until the lava starts to creep (0 once it has). */
export function lavaStartsIn(state: GameState): number {
  return Math.max(0, Math.ceil(FLOOD.graceSeconds - state.tick / TICK_RATE));
}

/** The glow's tiles, looked up by place: worked out once for each tick's flood.glow. */
const glows = new WeakMap<number[], Map<number, number>>();

/**
 * How soon lava takes (x, y), for its glow: 0 to 1, higher nearer (1: filling now), or null if
 * it won't be soon: under already, more than FLOOD.warnTiles on from it, or out of its reach
 * (a wall, or land walls shut in). See lavaGlow.
 */
export function lavaWarning(state: GameState, x: number, y: number): number | null {
  const glow = state.flood?.glow;
  if (!glow) return null;
  let byPlace = glows.get(glow);
  if (!byPlace) {
    byPlace = new Map();
    for (let k = 0; k < glow.length; k += 3)
      byPlace.set(glow[k] * 65536 + glow[k + 1], glow[k + 2]);
    glows.set(glow, byPlace);
  }
  return byPlace.get(x * 65536 + y) ?? null;
}

/**
 * The tiles the lava will take soon, and how soon (see lavaWarning), as [x, y, warning] in a
 * row: out from the tiles beside it, only through tiles it can take, up to FLOOD.warnTiles steps
 * and FLOOD.warnTiles on from its edge.
 */
function lavaGlow(state: GameState, flood: Flood): number[] {
  const { width } = state;
  const steps = new Map<number, number>();
  const queue: number[] = [];
  flood.edge.forEach((i) => {
    const x = i % width;
    if (holdsLava(state, x, (i - x) / width) || steps.has(i)) return;
    steps.set(i, 0);
    queue.push(i);
  });
  const glow: number[] = [];
  flood.edge.forEach((i, k) => {
    if (!steps.has(i)) return;
    const x = i % width;
    const y = (i - x) / width;
    const ahead = aheadOfLava(state, x, y);
    if (ahead <= FLOOD.warnTiles) glow.push(x, y, Math.max(nearness(ahead), flood.fill[k]));
  });
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head];
    const step = steps.get(i)!;
    if (step >= FLOOD.warnTiles) continue;
    const x = i % width;
    for (const n of besideOnMap(state, x, (i - x) / width)) {
      if (steps.has(n) || state.terrain[n] === "lava") continue;
      const nx = n % width;
      const ny = (n - nx) / width;
      if (holdsLava(state, nx, ny)) continue;
      const ahead = aheadOfLava(state, nx, ny);
      if (ahead > FLOOD.warnTiles) continue;
      steps.set(n, step + 1);
      queue.push(n);
      glow.push(nx, ny, nearness(ahead + step + 1) * 0.9);
    }
  }
  return glow;
}

/** A tile `ahead` tiles on from the lava's edge: how near, 0 (FLOOD.warnTiles on) to 1. */
function nearness(ahead: number): number {
  return Math.min(1, Math.max(0, 1 - ahead / FLOOD.warnTiles + 1 / FLOOD.warnTiles));
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

/**
 * Once a tick: the king walks, the lava creeps, and the world moves on if he's near its edge
 * (in a goal game, not once the keep's well on the map: the land stops there).
 */
export function updateFlood(state: GameState): void {
  const flood = state.flood;
  if (!flood) return;
  walkKing(state, flood);
  flood.front = Math.min(state.width, flood.front + lavaSpeed(state) / TICK_RATE);
  spreadLava(state, flood);
  flood.glow = lavaGlow(state, flood);
  // The world moves on a few columns at a time, so new land comes in a few lines at a time.
  const home = homeOnMap(state);
  const landEnds = home !== null && home.x + KEEP_SIZE + FLOOD.pastKeep <= state.width;
  if (!landEnds && flood.king.x >= state.width - aheadTiles(state)) {
    for (let i = 0; i < FLOOD.shiftColumns; i++) shiftWorld(state);
  }
}

/** How close to the map's right edge the king gets before new land comes (half a small map). */
function aheadTiles(state: GameState): number {
  return Math.min(FLOOD.aheadTiles, Math.floor(state.width / 2));
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
 * Whether lava stops at (x, y): a finished wall or a ruin (an old wall) holds it, and a tower on
 * it, however long; so does a goal's keep.
 */
function holdsLava(state: GameState, x: number, y: number): boolean {
  if (isFloodHome(state, x, y)) return true;
  const base = baseAt(state, x, y);
  return base !== undefined && (base.kind === "wall" || base.kind === "ruin") && isBuilt(base);
}

/**
 * The lava takes the tiles beside it that its edge (and their roughness) has passed, but for
 * walls, which it flows round. A tile it can take fills at the lava's pace (FLOOD.flowRate times
 * its speed, never slower than it starts), and goes under once full, so lava creeps round a
 * corner or through a gap as it creeps on everywhere else. `flood.edge` keeps the tiles beside
 * it not yet under (walls too, in case they go), and `flood.fill` how full each is.
 */
function spreadLava(state: GameState, flood: Flood): void {
  const { width } = state;
  const rate = (Math.max(lavaSpeed(state), FLOOD.lavaSpeed.start) * FLOOD.flowRate) / TICK_RATE;
  const next = new Map<number, number>();
  flood.edge.forEach((i, k) => {
    if (state.terrain[i] === "lava") return;
    const x = i % width;
    const y = (i - x) / width;
    if (holdsLava(state, x, y) || aheadOfLava(state, x, y) > 0) {
      next.set(i, holdsLava(state, x, y) ? 0 : flood.fill[k]);
      return;
    }
    const fill = flood.fill[k] + rate;
    if (fill < 1) {
      next.set(i, fill);
      return;
    }
    sinkTile(state, flood, x, y);
    next.delete(i);
    for (const n of besideOnMap(state, x, y)) {
      if (state.terrain[n] !== "lava" && !next.has(n)) next.set(n, 0);
    }
  });
  flood.edge = [...next.keys()];
  flood.fill = [...next.values()];
}

/** The tiles beside the lava not yet under (or, on the left edge, beside where it comes from). */
function lavaEdgeTiles(state: GameState): number[] {
  const { width, height } = state;
  const edge: number[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (state.terrain[i] === "lava") continue;
      if (x === 0 || besideOnMap(state, x, y).some((n) => state.terrain[n] === "lava")) {
        edge.push(i);
      }
    }
  }
  return edge;
}

/** A tile goes under: lava, with nothing left on it (units burn, buildings and flags go). */
function sinkTile(state: GameState, flood: Flood, x: number, y: number): void {
  const mount = mountAt(state, x, y);
  if (mount) removeStructure(state, mount);
  const base = baseAt(state, x, y);
  if (base) removeStructure(state, base);
  state.terrain[tileIndex(state, x, y)] = "lava";
  const on = (p: { x: number; y: number }) => Math.round(p.x) === x && Math.round(p.y) === y;
  for (const unit of state.units) if (on(unit)) unit.hp = 0;
  state.enemies = state.enemies.filter((e) => !on(e));
  state.features = state.features.filter((f) => !on(f));
  flood.plan = flood.plan.filter((p) => !on(p));
  state.gridVersion++;
}

/**
 * Moves the world on a column: the one furthest behind is dropped, with all that's on it (the
 * lava's, or soon would be), everything else moves a column to the left, and the next column of
 * new land (see nextColumn) comes in on the right. Everything that has a place on the map moves
 * with it; caches keyed to the grid start again, and units look for their ways again.
 */
export function shiftWorld(state: GameState): void {
  const flood = state.flood!;
  const { width, height } = state;
  const land = nextLand(state);
  const column = land.next++;
  const fresh = (y: number) => y * land.width + column;
  // Whatever's on the dropped column goes first, as it would under lava.
  for (const s of Object.values(state.structures)) if (s.x < 1) removeStructure(state, s);
  const shift = <T>(layer: T[], fill: (y: number) => T): T[] => {
    const out = new Array<T>(width * height);
    for (let y = 0; y < height; y++) {
      const row = y * width;
      for (let x = 0; x < width - 1; x++) out[row + x] = layer[row + x + 1];
      out[row + width - 1] = fill(y);
    }
    return out;
  };
  state.terrain = shift(state.terrain, (y) => land.terrain[fresh(y)]);
  state.resources = shift(state.resources, (y) => land.resources[fresh(y)]);
  state.resourceWorth = shift(state.resourceWorth, (y) => land.worth[fresh(y)]);
  state.base = shift(state.base, () => EMPTY);
  state.mount = shift(state.mount, () => EMPTY);
  state.explored = shift(state.explored, () => 0);
  for (const s of Object.values(state.structures)) s.x -= 1;
  state.units = state.units.filter((u) => u.x >= 1);
  for (const u of state.units) {
    u.x -= 1;
    u.tx -= 1;
    if (u.goal) u.goal = u.goal.x >= 1 ? { x: u.goal.x - 1, y: u.goal.y } : null;
    // Their ways were found on the old map: look again.
    u.path = [];
    u.pathGoal = null;
    u.pathVersion = -1;
  }
  state.enemies = state.enemies.filter((e) => e.x >= 1);
  for (const e of state.enemies) {
    e.x -= 1;
    e.tx -= 1;
    e.px -= 1;
    // Its way was found on the old map, and its post moves with the world (or is gone).
    e.steer = null;
    if (e.journey?.post) {
      e.journey.post =
        e.journey.post.x >= 1 ? { x: e.journey.post.x - 1, y: e.journey.post.y } : null;
    }
  }
  state.features = state.features
    .filter((f) => f.x >= 1)
    .map((f) => ({ ...f, x: f.x - 1 }))
    .concat(
      land.chests
        .filter((c) => c.x === column)
        .map((c) => ({ kind: "chest" as const, x: width - 1, y: c.y, gold: c.gold })),
    );
  state.effects = [];
  const moved = (p: Point) => ({ x: p.x - 1, y: p.y });
  flood.king = moved(flood.king);
  flood.plan = flood.plan.filter((p) => p.x >= 1).map(moved);
  flood.path = flood.path.filter((p) => p.x >= 1).map(moved);
  flood.front -= 1;
  flood.edge = lavaEdgeTiles(state);
  flood.fill = flood.edge.map(() => 0);
  flood.shifted += 1;
  for (const ruin of land.ruins.filter((r) => r.x === column)) {
    const r = placeStructure(state, "ruin", width - 1, ruin.y, "N", null);
    r.hp = Math.round(r.maxHp * ruin.hpFraction);
  }
  // A swarm comes in once the land round its middle has (two columns past it).
  for (const middle of land.swarms.filter((m) => m.x === column - 2)) {
    placeFloodSwarm(state, { x: width - 3, y: middle.y });
  }
  state.flows = {};
  state.gridVersion++;
  state.sightVersion++;
  state.exploredVersion++;
}

/**
 * The new land columns come from: FLOOD.chunkColumns at a time, generated as a map of their own
 * (seeded by the game's seed and how far the world has moved, so a game plays the same every
 * time), then handed out a column at a time. A new piece is tried again until you can walk
 * right across it from the land before it (see joinsOn).
 */
function nextLand(state: GameState): Land {
  const flood = state.flood!;
  if (flood.land && flood.land.next < flood.land.width) return flood.land;
  const { width, height } = state;
  // The land before it: the last piece, or the map's right side to start with.
  const last = flood.land;
  const before = last
    ? {
        width: last.width,
        open: (x: number, y: number) =>
          isOpen(last.terrain[y * last.width + x]) &&
          !last.ruins.some((r) => r.x === x && r.y === y),
      }
    : {
        width: FLOOD.chunkColumns,
        open: (x: number, y: number) => {
          const mx = width - FLOOD.chunkColumns + x;
          return isWalkable(state, mx, y) && !blocksAt(state, mx, y);
        },
      };
  const n = FLOOD.chunkColumns;
  // A goal game's keep goes in the piece of land its column falls in, on that piece's clear
  // patch (so it's on open ground you can reach): column c of the piece comes in at
  // `shifted + width + c` across the world.
  const start = flood.shifted + width;
  const goalX = flood.goal === null || flood.home ? null : flood.startX + flood.goal;
  const keepX =
    goalX !== null && goalX < start + n
      ? Math.min(Math.max(goalX - start, 2), n - KEEP_SIZE - 2)
      : undefined;
  let chunk = generateChunk(n, height, chunkSeed(state, 0), keepX);
  for (let attempt = 1; attempt < 20 && !joinsOn(before, chunk, height); attempt++) {
    chunk = generateChunk(n, height, chunkSeed(state, attempt), keepX);
  }
  if (keepX !== undefined) {
    const home = { worldX: start + keepX, y: Math.floor(height / 2) - 1 };
    flood.home = home;
    // Nothing on the keep's tiles.
    const offKeep = (p: { x: number; y: number }) =>
      p.x < keepX || p.x >= keepX + KEEP_SIZE || p.y < home.y || p.y >= home.y + KEEP_SIZE;
    chunk = { ...chunk, ruins: chunk.ruins.filter(offKeep), chests: chunk.chests.filter(offKeep) };
  }
  flood.land = {
    swarms: swarmMiddles(chunk, n, height, chunkSeed(state, 0)),
    width: n,
    next: 0,
    terrain: chunk.terrain,
    resources: startingWork(chunk.terrain),
    worth: startingWorth(chunk.terrain, chunkSeed(state, 0)),
    ruins: chunk.ruins,
    chests: chunk.chests,
  };
  return flood.land;
}

/**
 * Whether you can walk from the left side of the land before into a new piece and right across
 * it, at least FLOOD.seamRows rows wide where they join: the two side by side, ruins in the way.
 */
function joinsOn(
  before: { width: number; open: (x: number, y: number) => boolean },
  chunk: MapGenResult,
  height: number,
): boolean {
  const n = FLOOD.chunkColumns;
  const across = before.width + n;
  const open = (x: number, y: number) =>
    x < before.width
      ? before.open(x, y)
      : isOpen(chunk.terrain[y * n + x - before.width]) &&
        !chunk.ruins.some((r) => r.x === x - before.width && r.y === y);
  let seam = 0;
  for (let y = 0; y < height; y++) if (open(before.width - 1, y) && open(before.width, y)) seam++;
  if (seam < FLOOD.seamRows) return false;
  const reached = new Uint8Array(across * height);
  const queue: number[] = [];
  for (let y = 0; y < height; y++) {
    if (open(0, y)) {
      reached[y * across] = 1;
      queue.push(y * across);
    }
  }
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head];
    const x = i % across;
    const y = (i - x) / across;
    if (x === across - 1) return true;
    for (const [nx, ny] of [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ]) {
      if (nx < 0 || ny < 0 || nx >= across || ny >= height) continue;
      const ni = ny * across + nx;
      if (reached[ni] || !open(nx, ny)) continue;
      reached[ni] = 1;
      queue.push(ni);
    }
  }
  return false;
}

/**
 * Where a new piece of land's swarms go (as many for its size as on any map, apart from each
 * other), on open ground, chosen with their own RNG so the game's isn't touched.
 */
function swarmMiddles(chunk: MapGenResult, n: number, height: number, seed: number): Point[] {
  const rng = { rngState: seed ^ 0x51ed270b };
  const count = Math.round((n * height) / JOURNEY.tilesPerSwarm);
  const middles: Point[] = [];
  for (let k = 0; k < count; k++) {
    for (let tries = 0; tries < 40; tries++) {
      // Two columns in from its right side, so the land round it has come in with it.
      const p = { x: randomInt(rng, 0, n - 3), y: randomInt(rng, 2, height - 3) };
      if (!isOpen(chunk.terrain[p.y * n + p.x])) continue;
      if (middles.some((m) => Math.hypot(p.x - m.x, p.y - m.y) < JOURNEY.swarmSpacing)) continue;
      middles.push(p);
      break;
    }
  }
  return middles;
}

function isOpen(terrain: Terrain): boolean {
  return TERRAIN[terrain].walkable;
}

function chunkSeed(state: GameState, attempt: number): number {
  return (
    (state.seed ^
      Math.imul(state.flood!.shifted + 1, 0x85ebca6b) ^
      Math.imul(attempt, 0x27d4eb2f)) |
    0
  );
}
