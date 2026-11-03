// No looking back, an endless mode, solo or co-op. There's no keep to hold: each player has a
// royal (a king, a queen, a prince, a princess) that starts on the left edge and walks on, as far
// as it can. You plan yours's way as a raider plans their enemy's: a flag to walk to, then more
// flags after it, and it walks to each in turn by the shortest way your team knows (over land
// you've seen). Behind them lava creeps in from the left, slowly at first and a little faster all
// the time, with a ragged edge (see lavaEdge), turning each tile it reaches to lava with all
// that's on it, but for walls and ruins, which it flows round (spreadLava). Or it can be water
// (see FLOOD_LIQUIDS), which flows round trees, rocks and bushes too: "lava" here means either. A royal the lava
// reaches, or a swarm brings down, has fallen; its player builds on with the rest of the team.
// Once all have fallen the game's over; the furthest any got is the score.
// The map never ends: as a royal nears its right edge, the column furthest behind (lava, or soon
// to be) is dropped, everything moves a column left, and a column of new land comes in on the
// right (see shiftWorld). The camera moves with it.
import { FLOOD, FLOOD_LIQUIDS, KEEP_SIZE, RESOURCES, TERRAIN, TICK_RATE } from "./config";
import { withHills } from "./floodHills";
import { withRuins } from "./floodRuins";
import { placeSwarm } from "./floodSwarms";
import { randomInt } from "./rng";
import { canStand, spawnUnit } from "./units";
import { exploreRoyalSight, isExplored } from "./fog";
import {
  EMPTY,
  baseAt,
  blocksAt,
  inBounds,
  isBuilt,
  isFlooded,
  isWalkable,
  mountAt,
  placeStructure,
  removeStructure,
  terrainAt,
  tileIndex,
} from "./grid";
import { generateChunk, type MapGenResult } from "./mapgen";
import { startingWork, startingWorth } from "./resources";
import type {
  CommandResult,
  Flood,
  FloodLiquid,
  GameState,
  Land,
  PlayerId,
  Point,
  Royal,
  Terrain,
} from "./types";

export function createFlood(
  start: Point,
  width: number,
  height: number,
  goal: number | null = null,
  home: Point | null = null,
  liquid: FloodLiquid = "lava",
): Flood {
  return {
    royals: [],
    liquid,
    start,
    best: 0,
    swarms: 1,
    front: 0,
    // Lava comes in from beyond the left edge: every tile of it is next to it.
    edge: Array.from({ length: height }, (_, y) => y * width),
    fill: new Array<number>(height).fill(0),
    glow: [],
    cooling: {},
    shifted: 0,
    land: null,
    goal,
    home: home && { worldX: home.x, y: home.y },
  };
}

/**
 * Hands each player a royal (by id: the first gets the king), on the left edge round the start,
 * with its escort. When the game's made (solo), or when a room's host starts it.
 */
export function assignRoyals(state: GameState): void {
  const flood = state.flood!;
  const ids = Object.keys(state.players)
    .map(Number)
    .sort((a, b) => a - b)
    .slice(0, FLOOD.titles.length);
  flood.royals = ids.map((owner, i) => {
    const y = Math.min(state.height - 2, Math.max(1, flood.start.y + FLOOD.startRows[i]));
    const at = { x: flood.start.x, y };
    // Somewhere it can stand: its row, or the nearest open one on the start's column.
    for (let d = 0; d < 2 * state.height && !canStand(state, at.x, at.y); d++) {
      const offset = d % 2 === 0 ? d / 2 : -(d + 1) / 2;
      at.y = Math.min(state.height - 1, Math.max(0, y + offset));
    }
    return {
      owner,
      title: FLOOD.titles[i],
      at,
      progress: 0,
      plan: [],
      path: [],
      hp: FLOOD.royalHp,
      maxHp: FLOOD.royalHp,
      fallen: null,
    };
  });
  flood.royals.forEach((royal, i) => {
    exploreRoyalSight(state, royal);
    joinEscort(state, i);
  });
}

/** The royals still standing. */
export function livingRoyals(flood: Flood): Royal[] {
  return flood.royals.filter((r) => r.fallen === null);
}

/** `player`'s royal, if it's still standing. */
export function royalOf(flood: Flood, player: PlayerId): Royal | undefined {
  return flood.royals.find((r) => r.owner === player && r.fallen === null);
}

/** Where the keep is on the map (its top-left tile), if it's on it yet. */
export function homeOnMap(state: GameState): Point | null {
  const flood = state.flood;
  if (!flood?.home) return null;
  const x = flood.home.worldX - flood.shifted;
  return x + KEEP_SIZE > 0 && x < state.width ? { x, y: flood.home.y } : null;
}

/** Whether (x, y) is part of the keep the royals are going to. */
export function isFloodHome(state: GameState, x: number, y: number): boolean {
  const home = homeOnMap(state);
  return !!home && x >= home.x && y >= home.y && x < home.x + KEEP_SIZE && y < home.y + KEEP_SIZE;
}

/** Tiles still to go to the keep (a goal game only; 0 once there). */
export function tilesToGoal(flood: Flood): number | null {
  if (flood.goal === null) return null;
  const at = flood.home ? flood.home.worldX - 1 - flood.start.x : flood.goal;
  return Math.max(0, at - distanceTravelled(flood));
}

/** A royal is next to (or on) the keep: a goal game won. */
export function royalHome(state: GameState): boolean {
  const flood = state.flood;
  const home = homeOnMap(state);
  if (!flood || !home) return false;
  return livingRoyals(flood).some(({ at: { x, y } }) => {
    const dx = Math.max(home.x - x, 0, x - (home.x + KEEP_SIZE - 1));
    const dy = Math.max(home.y - y, 0, y - (home.y + KEEP_SIZE - 1));
    return Math.max(dx, dy) <= 1;
  });
}

/** Where a royal is drawn: part way from its tile to the next on its way. */
export function royalAt(royal: Royal): Point {
  const next = royal.progress > 0 ? royal.path[0] : undefined;
  if (!next) return { ...royal.at };
  const t = royal.progress;
  return {
    x: royal.at.x + (next.x - royal.at.x) * t,
    y: royal.at.y + (next.y - royal.at.y) * t,
  };
}

/** The furthest any royal has got from the start, in tiles across the world: the score. */
export function distanceTravelled(flood: Flood): number {
  return flood.best;
}

/** Tiles from the lava's edge, in its row, to a royal (0: it has it). */
export function lavaBehind(state: GameState, royal: Royal): number {
  return Math.max(0, Math.floor(royal.at.x + 1 - lavaEdge(state, royal.at.y)));
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

/** Every royal has fallen (and there were some): the game's over. */
export function royalsFallen(state: GameState): boolean {
  const flood = state.flood;
  return flood !== null && flood.royals.length > 0 && livingRoyals(flood).length === 0;
}

/** Royals the lava's reached, or swarms have brought down, fall. */
function fallRoyals(state: GameState, flood: Flood): void {
  for (const royal of livingRoyals(flood)) {
    if (isFlooded(terrainAt(state, royal.at.x, royal.at.y))) royal.fallen = "flood";
    else if (royal.hp <= 0) royal.fallen = "swarm";
    if (royal.fallen) {
      royal.plan = [];
      royal.path = [];
      state.sightVersion++;
    }
  }
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
      if (steps.has(n) || isFlooded(state.terrain[n])) continue;
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
 * The planKing command, as a raider plans: a flag for the player's royal to walk to (its plan's
 * first, its others dropped), or with `queue` one more after its others. On the royal: it stops.
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
  const royal = royalOf(flood, player);
  if (!royal) return { ok: false, reason: "Your royal has fallen" };
  if (!inBounds(state, x, y)) return { ok: false, reason: "Off the map" };
  if (x === royal.at.x && y === royal.at.y && !queue) {
    royal.plan = [];
    royal.path = [];
    return { ok: true };
  }
  if (!isExplored(state, x, y, player)) return { ok: false, reason: "You can't see there" };
  if (isFlooded(terrainAt(state, x, y))) {
    return { ok: false, reason: `That's ${FLOOD_LIQUIDS[flood.liquid].name.toLowerCase()}` };
  }
  if (queue) {
    if (royal.plan.length >= FLOOD.maxFlags) return { ok: false, reason: "Too many flags" };
    royal.plan = [...royal.plan, { x, y }];
  } else royal.plan = [{ x, y }];
  royal.path = royalPath(state, royal);
  return { ok: true };
}

/** Somewhere a royal can step: ground (or a bridge), nothing in the way, that its team's seen. */
function canStep(state: GameState, royal: Royal, x: number, y: number): boolean {
  return isWalkable(state, x, y) && !blocksAt(state, x, y) && isExplored(state, x, y, royal.owner);
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
 * The tiles from a royal to its next flag, not counting where it stands, by the shortest way
 * over tiles it can step on. A flag it can't reach: to the tile nearest it that it can. Of the
 * shortest ways, the one nearest the straight line there: each step goes to whichever tile a
 * step nearer (along the way) is nearest the flag, so it walks a staircase, not an L.
 */
export function royalPath(state: GameState, royal: Royal): Point[] {
  const goal = royal.plan[0];
  if (!goal) return [];
  const { width } = state;
  const start = tileIndex(state, royal.at.x, royal.at.y);
  const steppable = (i: number) => canStep(state, royal, i % width, Math.floor(i / width));
  // Out from the royal: what it can reach, and the tile of it nearest the flag.
  const reached = new Set([start]);
  const queue = [start];
  let best = start;
  let bestDistance = Math.hypot(royal.at.x - goal.x, royal.at.y - goal.y);
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
 * Once a tick: the royals walk, the lava creeps, royals it (or a swarm) has had fall, and the
 * world moves on if one's near its edge (in a goal game, not once the keep's well on the map:
 * the land stops there).
 */
export function updateFlood(state: GameState): void {
  const flood = state.flood;
  if (!flood) return;
  for (const royal of livingRoyals(flood)) walkRoyal(state, royal);
  flood.front = Math.min(state.width, flood.front + lavaSpeed(state) / TICK_RATE);
  spreadLava(state, flood);
  if (state.tick % TICK_RATE === 0) coolLava(state, flood);
  fallRoyals(state, flood);
  flood.glow = lavaGlow(state, flood);
  for (const royal of livingRoyals(flood)) {
    flood.best = Math.max(flood.best, royal.at.x + flood.shifted - flood.start.x);
  }
  // The world moves on a few columns at a time, so new land comes in a few lines at a time.
  const home = homeOnMap(state);
  const landEnds = home !== null && home.x + KEEP_SIZE + FLOOD.pastKeep <= state.width;
  const nearEdge = livingRoyals(flood).some((r) => r.at.x >= state.width - aheadTiles(state));
  if (!landEnds && nearEdge) {
    for (let i = 0; i < FLOOD.shiftColumns; i++) shiftWorld(state);
  }
}

/**
 * A royal's escort (FLOOD.escorts), joining it at the start: each on its spot beside it, or the
 * nearest open tile round it. One that falls is gone for good.
 */
function joinEscort(state: GameState, index: number): void {
  const royal = state.flood!.royals[index];
  const { x, y } = royal.at;
  for (const escort of FLOOD.escorts) {
    const tries = [escort.spot, ...besideRoyal].map((d) => ({ x: x + d.x, y: y + d.y }));
    for (const p of tries) {
      const unit = spawnUnit(state, escort.kind, royal.owner, p.x, p.y);
      if (unit) {
        unit.escort = { ...escort.spot, royal: index };
        break;
      }
    }
  }
}

/** The tiles round a royal, nearest first. */
const besideRoyal = [
  { x: 0, y: -1 },
  { x: 0, y: 1 },
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 1, y: -1 },
  { x: 1, y: 1 },
  { x: -1, y: -1 },
  { x: -1, y: 1 },
];

/** How close to the map's right edge a royal gets before new land comes (half a small map). */
function aheadTiles(state: GameState): number {
  return Math.min(FLOOD.aheadTiles, Math.floor(state.width / 2));
}

function walkRoyal(state: GameState, royal: Royal): void {
  if (royal.path.length === 0) nextWay(state, royal);
  if (royal.path.length === 0) {
    royal.progress = 0;
    return;
  }
  royal.progress += FLOOD.royalSpeed / TICK_RATE;
  if (royal.progress < 1) return;
  royal.progress -= 1;
  // Its way, found again as it steps (what's built and seen changes as it goes).
  nextWay(state, royal);
  const next = royal.path[0];
  if (!next) return;
  royal.at = next;
  royal.path = royal.path.slice(1);
  exploreRoyalSight(state, royal);
}

/** The way to its next flag; flags it's at (or as near as it can get to) are done. */
function nextWay(state: GameState, royal: Royal): void {
  royal.path = royalPath(state, royal);
  while (royal.path.length === 0 && royal.plan.length > 0) {
    royal.plan = royal.plan.slice(1);
    royal.path = royalPath(state, royal);
  }
}

/**
 * Whether lava stops at (x, y): a finished wall or a ruin (an old wall) holds it, and a tower on
 * it, however long; so does a goal's keep, a hill (high ground) and rock. Water leaves trees and
 * bushes standing too.
 */
function holdsLava(state: GameState, x: number, y: number): boolean {
  const terrain = terrainAt(state, x, y);
  if (isFloodHome(state, x, y) || terrain === "hill") return true;
  if (terrain === "rock" || terrain === "goldRock") return true;
  if (state.flood?.liquid === "water" && terrain in RESOURCES) return true;
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
    if (isFlooded(state.terrain[i])) return;
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
      if (!isFlooded(state.terrain[n]) && !next.has(n)) next.set(n, 0);
    }
  });
  flood.edge = [...next.keys()];
  flood.fill = [...next.values()];
}

/**
 * Lava that's still joined (through lava, not walls or ruins on it) to where it comes in on the
 * left edge: per tile, 1 if so.
 */
function liveLava(state: GameState): Uint8Array {
  const { width, height } = state;
  const live = new Uint8Array(width * height);
  const flows = (i: number) => {
    const x = i % width;
    return isFlooded(state.terrain[i]) && !holdsLava(state, x, (i - x) / width);
  };
  const queue: number[] = [];
  for (let y = 0; y < height; y++) {
    const i = y * width;
    if (flows(i)) {
      live[i] = 1;
      queue.push(i);
    }
  }
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head];
    const x = i % width;
    for (const n of besideOnMap(state, x, (i - x) / width)) {
      if (live[n] || !flows(n)) continue;
      live[n] = 1;
      queue.push(n);
    }
  }
  return live;
}

/**
 * Once a second: lava walled off from where it comes in stops spreading (the tiles beside only
 * it come off `flood.edge`), and cools back to ground from its edges in, a tile of it beside land
 * (or a wall) cooling once it's been cut off and beside land FLOOD.coolSeconds. So a pocket the
 * players wall off dies away, a ring at a time, and its land can be used again. If a wall goes,
 * what's left of it joins the lava again.
 */
function coolLava(state: GameState, flood: Flood): void {
  const { width, height } = state;
  const live = liveLava(state);
  // Only tiles beside live lava (or where it comes in) go on spreading.
  const edge: number[] = [];
  const fill: number[] = [];
  flood.edge.forEach((i, k) => {
    const x = i % width;
    const y = (i - x) / width;
    if (x === 0 || besideOnMap(state, x, y).some((n) => live[n])) {
      edge.push(i);
      fill.push(flood.fill[k]);
    }
  });
  flood.edge = edge;
  flood.fill = fill;
  const cooling: Record<number, number> = {};
  for (let i = 0; i < width * height; i++) {
    if (!isFlooded(state.terrain[i]) || live[i]) continue;
    const x = i % width;
    const y = (i - x) / width;
    // The lava beyond the left edge is live: a tile there never cools.
    if (x === 0) continue;
    const beside = besideOnMap(state, x, y);
    const byLand = beside.some(
      (n) => !isFlooded(state.terrain[n]) || holdsLava(state, n % width, Math.floor(n / width)),
    );
    if (!byLand) continue;
    const key = (x + flood.shifted) * 65536 + y;
    const seconds = (flood.cooling[key] ?? 0) + 1;
    if (seconds >= FLOOD.coolSeconds) {
      state.terrain[i] = "ground";
      state.gridVersion++;
    } else cooling[key] = seconds;
  }
  flood.cooling = cooling;
}

/** The tiles beside the lava not yet under (or, on the left edge, beside where it comes from). */
function lavaEdgeTiles(state: GameState): number[] {
  const { width, height } = state;
  const live = liveLava(state);
  const edge: number[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (isFlooded(state.terrain[i])) continue;
      if (x === 0 || besideOnMap(state, x, y).some((n) => live[n])) {
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
  state.terrain[tileIndex(state, x, y)] = FLOOD_LIQUIDS[flood.liquid].terrain;
  const on = (p: { x: number; y: number }) => Math.round(p.x) === x && Math.round(p.y) === y;
  for (const unit of state.units) if (on(unit)) unit.hp = 0;
  state.enemies = state.enemies.filter((e) => !on(e));
  state.features = state.features.filter((f) => !on(f));
  for (const royal of flood.royals) royal.plan = royal.plan.filter((p) => !on(p));
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
    if (e.swarm?.post) {
      e.swarm.post = e.swarm.post.x >= 1 ? { x: e.swarm.post.x - 1, y: e.swarm.post.y } : null;
    }
    if (e.swarm) e.swarm.flee = null; // worked out again on the moved map
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
  for (const royal of flood.royals) {
    royal.at = moved(royal.at);
    royal.plan = royal.plan.filter((p) => p.x >= 1).map(moved);
    royal.path = royal.path.filter((p) => p.x >= 1).map(moved);
  }
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
    placeSwarm(state, { x: width - 3, y: middle.y });
  }
  state.flows = {};
  state.gridVersion++;
  state.sightVersion++;
  state.exploredVersion++;
}

/**
 * A tile layer moved `n` columns to the left in place, as the world moving on moves it: the `n`
 * on the left go, and the `n` on the right come in as `fill`. Online, the server's record of what
 * it sent and each client's copy are moved this way, so only the new land goes over the wire.
 */
export function shiftLayer<T>(layer: T[], width: number, height: number, n: number, fill: T): void {
  const keep = Math.max(0, width - n);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < keep; x++) layer[row + x] = layer[row + x + n];
    for (let x = keep; x < width; x++) layer[row + x] = fill;
  }
}

/** The No looking back state the clients get: what the server alone needs left out. */
export function clientFlood(flood: Flood | null): Flood | null {
  return flood && { ...flood, edge: [], fill: [], cooling: {}, land: null };
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
  const goalX = flood.goal === null || flood.home ? null : flood.start.x + flood.goal;
  const keepX =
    goalX !== null && goalX < start + n
      ? Math.min(Math.max(goalX - start, 2), n - KEEP_SIZE - 2)
      : undefined;
  // Its ruins go in before the check, so they never block the way on.
  const keepArea = keepX === undefined ? null : { x: keepX, y: Math.floor(height / 2) - 1 };
  const generate = (attempt: number) => {
    const seed = chunkSeed(state, attempt);
    const land = generateChunk(n, height, seed, keepX);
    const terrain = withHills(land.terrain, n, height, seed, FLOOD.hills.perPiece);
    return withRuins({ ...land, terrain }, n, height, {
      seed,
      keep: keepArea,
      count: FLOOD.ruins.perPiece,
    });
  };
  let chunk = generate(0);
  for (let attempt = 1; attempt < 20 && !joinsOn(before, chunk, height); attempt++) {
    chunk = generate(attempt);
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
    swarms: [...swarmMiddles(chunk, n, height, chunkSeed(state, 0)), ...chunk.ruinSwarms],
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
  chunk: Pick<MapGenResult, "terrain" | "ruins">,
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
 * The starting map with hills (see floodHills.ts) and ruins (see floodRuins.ts) too, as many for its width as new land gets,
 * clear of the royals' start and a goal's keep, and only where they leave a way from the start to
 * the map's right edge (tried a few times, else none).
 */
export function withStartingRuins(
  map: Pick<MapGenResult, "terrain" | "ruins" | "chests">,
  width: number,
  height: number,
  seed: number,
  start: Point,
  home: Point | null,
): Pick<MapGenResult, "terrain" | "ruins" | "chests"> & { ruinSwarms: Point[] } {
  const pieces = width / FLOOD.chunkColumns;
  const count = Math.round(pieces * FLOOD.ruins.perPiece);
  const hills = Math.round(pieces * FLOOD.hills.perPiece);
  map = { ...map, terrain: withHills(map.terrain, width, height, seed, hills) };
  for (let attempt = 0; attempt < 10; attempt++) {
    const ruins = withRuins(map, width, height, {
      seed: (seed ^ Math.imul(attempt + 1, 0x632be5ab)) | 0,
      keep: home,
      count,
      clear: [{ ...start, radius: FLOOD.swarm.clearOfStart }],
    });
    if (crossable(ruins, width, height, start)) return ruins;
  }
  return { ...map, ruinSwarms: [] };
}

/** Whether there's a way over walkable land, round ruins, from `start` to the map's right edge. */
function crossable(
  map: Pick<MapGenResult, "terrain" | "ruins">,
  width: number,
  height: number,
  start: Point,
): boolean {
  const ruined = new Set(map.ruins.map((r) => r.y * width + r.x));
  const open = (i: number) => isOpen(map.terrain[i]) && !ruined.has(i);
  const first = start.y * width + start.x;
  const seen = new Uint8Array(width * height);
  seen[first] = 1;
  const queue = [first];
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head];
    const x = i % width;
    if (x === width - 1) return true;
    const y = (i - x) / width;
    for (const [nx, ny] of [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ]) {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const n = ny * width + nx;
      if (seen[n] || !open(n)) continue;
      seen[n] = 1;
      queue.push(n);
    }
  }
  return false;
}

/**
 * Where a new piece of land's swarms go (as many for its size as on any map, apart from each
 * other), on open ground, chosen with their own RNG so the game's isn't touched.
 */
function swarmMiddles(
  chunk: Pick<MapGenResult, "terrain">,
  n: number,
  height: number,
  seed: number,
): Point[] {
  const rng = { rngState: seed ^ 0x51ed270b };
  const count = Math.round((n * height) / FLOOD.swarm.tilesPerSwarm);
  const middles: Point[] = [];
  for (let k = 0; k < count; k++) {
    for (let tries = 0; tries < 40; tries++) {
      // Two columns in from its right side, so the land round it has come in with it.
      const p = { x: randomInt(rng, 0, n - 3), y: randomInt(rng, 2, height - 3) };
      if (!isOpen(chunk.terrain[p.y * n + p.x])) continue;
      if (middles.some((m) => Math.hypot(p.x - m.x, p.y - m.y) < FLOOD.swarm.spacing)) continue;
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
