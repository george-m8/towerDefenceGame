// Journey home: a solo mode. Your camp (the game's one keep, a single tile) starts on the left
// edge and has to reach home, a keep on the right edge. It sees round itself, and packs up and
// moves to somewhere in sight, a tile at a time; while camped you build round it. Swarms of
// enemies idle across the map, tougher further right. One that sees the camp (or is hurt) wakes
// its whole swarm, and they come for the camp as any enemy comes for a keep, until they've lost
// sight of it for a while and go back. A few goblins always wander. The camp falling loses.
import {
  ENEMY_KINDS,
  JOURNEY,
  KEEP_SIZE,
  STRUCTURES,
  TICK_RATE,
  type EnemyKindId,
  type StructureStats,
} from "./config";
import { claimChest } from "./economy";
import { spawnEnemy } from "./enemies";
import { IN_SIGHT, getSight, revealKeep } from "./fog";
import {
  EMPTY,
  KEEP_TILE,
  baseAt,
  blocksAt,
  inBounds,
  isSpawnTile,
  keepAt,
  tileIndex,
} from "./grid";
import { DIRECTIONS, canCross } from "./pathfinding";
import { headFor, roam } from "./raiders";
import { nextRandom, randomInt } from "./rng";
import type { CommandResult, Enemy, GameState, Journey, PlayerId, Point } from "./types";

export function createJourney(home: Point): Journey {
  return {
    home,
    phase: "camped",
    timer: 0,
    goal: null,
    path: [],
    progress: 0,
    wandererTimer: 0,
  };
}

/** Whether (x, y) is part of home, the keep the camp is heading for. */
export function isHomeTile(state: GameState, x: number, y: number): boolean {
  const home = state.journey?.home;
  return !!home && x >= home.x && y >= home.y && x < home.x + KEEP_SIZE && y < home.y + KEEP_SIZE;
}

/** Tiles from the camp to the nearest tile of home (0: on it), in steps any way. */
export function tilesFromHome(state: GameState): number {
  const { home } = state.journey!;
  const camp = state.keeps[0];
  const dx = Math.max(home.x - camp.x, 0, camp.x - (home.x + KEEP_SIZE - 1));
  const dy = Math.max(home.y - camp.y, 0, camp.y - (home.y + KEEP_SIZE - 1));
  return Math.max(dx, dy);
}

/** The camp is home once it's next to (or on) the keep. */
export function reachedHome(state: GameState): boolean {
  return state.journey !== null && tilesFromHome(state) <= 1;
}

/** Somewhere the camp can stand: open, walkable ground with nothing built on it, or a bridge. */
function canCampAt(state: GameState, x: number, y: number): boolean {
  if (!inBounds(state, x, y) || !canCross(state, "follower", x, y)) return false;
  const base = baseAt(state, x, y); // walkable, so a bridge is built
  const stats: StructureStats | undefined = base && STRUCTURES[base.kind];
  const bridge = stats?.spansWater === true;
  return (base === undefined || bridge) && state.mount[tileIndex(state, x, y)] === EMPTY;
}

/** The tiles from the camp to `to`, not counting where it stands; null if it can't get there. */
function campPath(state: GameState, to: Point): Point[] | null {
  const { width } = state;
  const camp = state.keeps[0];
  const start = tileIndex(state, camp.x, camp.y);
  const end = tileIndex(state, to.x, to.y);
  const cameFrom = new Map<number, number>([[start, -1]]);
  const queue = [start];
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head];
    if (i === end) break;
    const px = i % width;
    const py = (i - px) / width;
    for (const d of DIRECTIONS) {
      const x = px + d.x;
      const y = py + d.y;
      const next = y * width + x;
      if (cameFrom.has(next) || !canCampAt(state, x, y)) continue;
      cameFrom.set(next, i);
      queue.push(next);
    }
  }
  if (!cameFrom.has(end)) return null;
  const path: Point[] = [];
  for (let i = end; i !== start; i = cameFrom.get(i)!) {
    path.push({ x: i % width, y: Math.floor(i / width) });
  }
  return path.reverse();
}

/** The moveCamp command: pack up (unless already on the way) and head for a tile in sight. */
export function moveCamp(state: GameState, player: PlayerId, x: number, y: number): CommandResult {
  const journey = state.journey;
  if (!journey) return { ok: false, reason: "Only on the journey home" };
  if (!inBounds(state, x, y)) return { ok: false, reason: "Out of bounds" };
  if (getSight(state, player)[tileIndex(state, x, y)] !== IN_SIGHT) {
    return { ok: false, reason: "The camp can only move somewhere in sight" };
  }
  if (!canCampAt(state, x, y)) return { ok: false, reason: "The camp can't stand there" };
  const camp = state.keeps[0];
  if (x === camp.x && y === camp.y) return { ok: false, reason: "The camp is already there" };
  const path = campPath(state, { x, y });
  if (!path) return { ok: false, reason: "The camp can't get there" };
  journey.goal = { x, y };
  journey.path = path;
  if (journey.phase === "camped" || journey.phase === "unpacking") {
    journey.phase = "packing";
    journey.timer = JOURNEY.packSeconds * TICK_RATE;
  }
  return { ok: true };
}

/** Once a tick: the camp packs, moves or sets up, and the wandering goblins are topped up. */
export function updateJourney(state: GameState): void {
  if (!state.journey) return;
  updateCamp(state, state.journey);
  topUpWanderers(state, state.journey);
}

function updateCamp(state: GameState, journey: Journey): void {
  if (journey.phase === "packing" || journey.phase === "unpacking") {
    if (--journey.timer > 0) return;
    journey.phase = journey.phase === "packing" ? "moving" : "camped";
    journey.progress = 0;
    return;
  }
  if (journey.phase !== "moving") return;
  journey.progress += JOURNEY.campSpeed / TICK_RATE;
  if (journey.progress >= 1 && journey.path.length > 0) {
    journey.progress -= 1;
    const next = journey.path[0];
    if (canCampAt(state, next.x, next.y)) {
      journey.path.shift();
      stepCamp(state, next);
    } else {
      // Something was built in the way: find another way, or stop here.
      journey.path = (journey.goal && campPath(state, journey.goal)) ?? [];
    }
  }
  if (journey.path.length === 0) {
    journey.phase = "unpacking";
    journey.timer = JOURNEY.unpackSeconds * TICK_RATE;
    journey.goal = null;
  }
}

/**
 * Moves the camp (the keep) a tile: the grid, so enemies' fields follow it, and its sight. On a
 * bridge the bridge stays in the base layer (the keep is found by where it stands), so selling
 * or losing it never takes the camp with it. Treasure it reaches is claimed.
 */
function stepCamp(state: GameState, to: Point): void {
  const camp = state.keeps[0];
  const from = tileIndex(state, camp.x, camp.y);
  if (state.base[from] === KEEP_TILE) state.base[from] = EMPTY;
  const into = tileIndex(state, to.x, to.y);
  if (state.base[into] === EMPTY) state.base[into] = KEEP_TILE;
  camp.x = to.x;
  camp.y = to.y;
  state.gridVersion++;
  revealKeep(state, camp);
  if (camp.owner !== null) claimChest(state, camp.owner, to.x, to.y);
}

/**
 * One tick of a Journey home enemy's mind. Seeing the camp, or being hurt, wakes its swarm;
 * awake, it acts as any enemy does (false: walk the field to the camp, fight what's in the way).
 * Asleep it idles at its post, or heads back there, or wanders (true: done for this tick).
 */
export function idleOnJourney(state: GameState, enemy: Enemy): boolean {
  const mind = enemy.journey!;
  const camp = state.keeps[0];
  const hurt = enemy.hp < mind.hp;
  mind.hp = enemy.hp;
  if (hurt || Math.hypot(enemy.x - camp.x, enemy.y - camp.y) <= JOURNEY.enemySight) {
    wake(state, enemy);
  }
  if (mind.alert > 0) {
    mind.alert--;
    return false;
  }
  // Given up: whatever it was doing (a bomber's sprint, a digger's dig) stops.
  enemy.mode = "walking";
  enemy.targetId = null;
  if (mind.post) headFor(state, enemy, mind.post);
  else roam(state, enemy);
  return true;
}

/** Wakes an enemy and the rest of its swarm (a wanderer wakes alone). */
function wake(state: GameState, enemy: Enemy): void {
  const alert = JOURNEY.giveUpSeconds * TICK_RATE;
  const { swarm } = enemy.journey!;
  if (swarm === 0) {
    enemy.journey!.alert = alert;
    return;
  }
  for (const other of state.enemies) {
    if (other.journey?.swarm === swarm) other.journey.alert = alert;
  }
}

/** Open ground an enemy can stand on. */
function isOpen(state: GameState, x: number, y: number): boolean {
  return (
    inBounds(state, x, y) &&
    canCross(state, "follower", x, y) &&
    !blocksAt(state, x, y) &&
    !keepAt(state, x, y) &&
    !isHomeTile(state, x, y) &&
    !isSpawnTile(state, x, y)
  );
}

/**
 * The swarms, spread over the map clear of the camp's start and home, and the first wandering
 * goblins. Called once, when the game is made, with the state's RNG.
 */
export function populateJourney(state: GameState): void {
  const journey = state.journey!;
  const camp = state.keeps[0];
  const homeMiddle = { x: journey.home.x + 1, y: journey.home.y + 1 };
  const count = Math.round((state.width * state.height) / JOURNEY.tilesPerSwarm);
  const middles: Point[] = [];
  for (let swarm = 1; swarm <= count; swarm++) {
    for (let tries = 0; tries < 40; tries++) {
      const p = {
        x: randomInt(state, 0, state.width - 1),
        y: randomInt(state, 0, state.height - 1),
      };
      if (
        !isOpen(state, p.x, p.y) ||
        distance(p, camp) < JOURNEY.clearOfStart ||
        distance(p, homeMiddle) < JOURNEY.clearOfHome ||
        middles.some((m) => distance(p, m) < JOURNEY.swarmSpacing)
      ) {
        continue;
      }
      middles.push(p);
      placeSwarm(state, p, swarm);
      break;
    }
  }
  for (let i = 0; i < JOURNEY.wanderers; i++) spawnWanderer(state);
  // You know where home is from the start: its keep and the ground round it are explored.
  for (let y = journey.home.y - 1; y <= journey.home.y + KEEP_SIZE; y++) {
    for (let x = journey.home.x - 1; x <= journey.home.x + KEEP_SIZE; x++) {
      if (inBounds(state, x, y)) state.explored[tileIndex(state, x, y)] |= 1;
    }
  }
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** A swarm round `middle`, as tough as the wave its distance across the map is worth. */
function placeSwarm(state: GameState, middle: Point, swarm: number): void {
  const wave = 1 + Math.round((middle.x / (state.width - 1)) * (JOURNEY.hardestWave - 1));
  const spots: Point[] = [];
  for (let y = middle.y - 2; y <= middle.y + 2; y++) {
    for (let x = middle.x - 2; x <= middle.x + 2; x++)
      if (isOpen(state, x, y)) spots.push({ x, y });
  }
  const size = randomInt(state, JOURNEY.swarmSize.min, JOURNEY.swarmSize.max);
  for (let i = 0; i < size; i++) {
    const spot = spots[randomInt(state, 0, spots.length - 1)];
    const enemy = spawnEnemy(state, spot.x, spot.y, {
      kind: kindFor(state, wave),
      wave,
      variant: "random",
    });
    enemy.journey = { post: spot, swarm, alert: 0, hp: enemy.hp };
  }
}

/** A kind that has arrived by `wave`, picked by the waves' mix weights. */
function kindFor(state: GameState, wave: number): EnemyKindId {
  const kinds = (Object.keys(ENEMY_KINDS) as EnemyKindId[]).filter(
    (k) => ENEMY_KINDS[k].firstWave <= wave && ENEMY_KINDS[k].mixWeight > 0,
  );
  const total = kinds.reduce((sum, k) => sum + ENEMY_KINDS[k].mixWeight, 0);
  let roll = nextRandom(state) * total;
  for (const kind of kinds) {
    roll -= ENEMY_KINDS[kind].mixWeight;
    if (roll < 0) return kind;
  }
  return "goblin";
}

/** Brings the wandering goblins back up to JOURNEY.wanderers, one every so often. */
function topUpWanderers(state: GameState, journey: Journey): void {
  journey.wandererTimer = Math.max(0, journey.wandererTimer - 1);
  if (journey.wandererTimer > 0) return;
  const wandering = state.enemies.filter((e) => e.hp > 0 && e.journey && !e.journey.post);
  if (wandering.length >= JOURNEY.wanderers) return;
  if (spawnWanderer(state)) journey.wandererTimer = JOURNEY.wandererSpawnSeconds * TICK_RATE;
}

/** A wandering goblin somewhere out of sight of the camp; false after a few misses. */
function spawnWanderer(state: GameState): boolean {
  const camp = state.keeps[0];
  const sight = getSight(state);
  for (let tries = 0; tries < 20; tries++) {
    const x = randomInt(state, 0, state.width - 1);
    const y = randomInt(state, 0, state.height - 1);
    if (!isOpen(state, x, y) || sight[tileIndex(state, x, y)] === IN_SIGHT) continue;
    if (distance({ x, y }, camp) <= JOURNEY.campSight.outer) continue;
    const goblin = spawnEnemy(state, x, y, { kind: "goblin", variant: "random" });
    goblin.journey = { post: null, swarm: 0, alert: 0, hp: goblin.hp };
    return true;
  }
  return false;
}
