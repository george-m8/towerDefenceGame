// Raiders: players who play the enemy. A raider controls one enemy at a time: it goes where
// they point and acts (attacks, blows up, digs) on what they tell it to, with its kind's own
// stats. When it dies they take the nearest other enemy; a switch jumps into a random one.
// While a game has raiders, a few goblins always roam the map, so there's always one to be.
import { ENEMY_KINDS, RAID, TICK_RATE, type EnemyKindId } from "./config";
import { abilityOf, explode, isDigTarget } from "./behaviours";
import { attack, attackKeep, attackUnit, spawnEnemy } from "./enemies";
import {
  attackTargetAt,
  baseAt,
  blocksAt,
  damageStructure,
  inBounds,
  keepAt,
  mountAt,
} from "./grid";
import { atTileCentre, stepTo, walk } from "./movement";
import { DIRECTIONS, canCross } from "./pathfinding";
import { clearPaths, paintPath } from "./raidPaths";
import { randomInt } from "./rng";
import { unitsAt } from "./units";
import type {
  Aim,
  Command,
  CommandResult,
  Enemy,
  GameState,
  Player,
  PlayerId,
  Point,
  RaiderState,
  RaidOrder,
  Role,
  Steering,
  Structure,
} from "./types";

/** Commands raiders may not send, with why. */
const NOT_FOR_RAIDERS: Partial<Record<Command["type"], string>> = {
  build: "Raiders can't build",
  sell: "Raiders can't sell",
  sendWave: "Raiders can't send waves",
  voteSkipToNight: "Raiders can't skip to night",
};

/** Why `player` may not send `command`, or null if they may. */
export function raiderRefusal(player: Player, command: Command): string | null {
  return player.role === "raider" ? (NOT_FOR_RAIDERS[command.type] ?? null) : null;
}

/** Makes a player a defender or a raider. A raider leaving the role lets go of their enemy. */
export function setRole(state: GameState, id: PlayerId, role: Role): CommandResult {
  const player = state.players[id];
  if (!player) return { ok: false, reason: "Unknown player" };
  if (role === player.role) return { ok: true };
  if (role === "raider") {
    if (state.mode === "pvp") return { ok: false, reason: "No raiders in PvP" };
    if (raiders(state).length >= RAID.maxRaiders) return { ok: false, reason: "Enough raiders" };
    player.role = "raider";
    player.raid = freshRaid();
  } else {
    const enemy = enemyOf(state, player);
    if (enemy) release(player, enemy);
    player.role = "defender";
    player.raid = null;
  }
  return { ok: true };
}

export function raiders(state: GameState): Player[] {
  return Object.values(state.players).filter((p) => p.role === "raider");
}

/** The enemy a raider controls, if they're in one. */
export function enemyOf(state: GameState, player: Player | undefined): Enemy | undefined {
  const id = player?.raid?.enemyId;
  if (id === null || id === undefined) return undefined;
  return state.enemies.find((e) => e.id === id && e.hp > 0);
}

type RaidCommand = Extract<
  Command,
  {
    type:
      "steer" | "interact" | "stopInteract" | "sprint" | "switchEnemy" | "paintPath" | "clearPaths";
  }
>;

/** A raider's commands to their enemy, and to the paths. Refuses them from defenders. */
export function applyRaidCommand(
  state: GameState,
  player: Player,
  command: RaidCommand,
): CommandResult {
  if (player.role !== "raider") return { ok: false, reason: "Only raiders control enemies" };
  switch (command.type) {
    case "switchEnemy":
      return switchEnemy(state, player, command.kind);
    case "paintPath":
      return paintPath(state, command.x, command.y, command.erase === true);
    case "clearPaths":
      clearPaths(state);
      return { ok: true };
  }
  const enemy = enemyOf(state, player);
  // Between enemies there's nothing to steer; that's not worth a refusal.
  if (!enemy?.steer) return { ok: true };
  const result = steerEnemy(state, enemy, enemy.steer, command);
  remember(player, enemy.steer);
  return result;
}

function steerEnemy(
  state: GameState,
  enemy: Enemy,
  steer: Steering,
  command: Extract<Command, { type: "steer" | "interact" | "stopInteract" | "sprint" }>,
): CommandResult {
  switch (command.type) {
    case "sprint":
      steer.sprinting = command.on;
      return { ok: true };
    case "stopInteract":
      steer.goal = null;
      steer.order = null;
      steer.queue = [];
      enemy.mode = "walking";
      return { ok: true };
    case "steer":
    case "interact": {
      if (!inBounds(state, command.x, command.y)) return { ok: false, reason: "Off the map" };
      const order =
        command.type === "interact" ? orderAt(state, enemy, command.x, command.y) : null;
      if (typeof order === "string") return { ok: false, reason: order };
      const aim: Aim = { x: command.x, y: command.y, order };
      if (command.queue && hasPlan(steer)) {
        if (steer.queue.length >= RAID.maxFlags) return { ok: false, reason: "Too many flags" };
        steer.queue.push(aim);
        return { ok: true };
      }
      steer.queue = [];
      startAim(steer, aim);
      enemy.mode = "walking";
      return { ok: true };
    }
  }
}

/** Makes an aim the steering's goal or order. */
function startAim(steer: Steering, aim: Aim) {
  steer.order = aim.order;
  steer.goal = aim.order ? null : { x: aim.x, y: aim.y };
  steer.aimAt = { x: aim.x, y: aim.y };
}

/** Whether it has anything to do: a goal, an order or flags. */
function hasPlan(steer: Steering): boolean {
  return steer.goal !== null || steer.order !== null || steer.queue.length > 0;
}

/** The steering's plan: what it's on now, then its queued flags. */
function planOf(steer: Steering): Aim[] {
  const now: Aim[] =
    steer.aimAt && (steer.order || steer.goal) ? [{ ...steer.aimAt, order: steer.order }] : [];
  return [...now, ...steer.queue];
}

/**
 * What acting on (x, y) means for this enemy: an order, null to just walk there (nothing to act
 * on), or why it can't.
 */
function orderAt(state: GameState, enemy: Enemy, x: number, y: number): RaidOrder | null | string {
  const behaviour = ENEMY_KINDS[enemy.kind].behaviour;
  if (x === Math.round(enemy.x) && y === Math.round(enemy.y)) {
    return behaviour === "bomber" ? { kind: "self" } : null;
  }
  const keepIndex = state.keeps.findIndex((k) => k === keepAt(state, x, y));
  if (keepIndex >= 0) return { kind: "keep", index: keepIndex };
  const structure = mountAt(state, x, y) ?? baseAt(state, x, y);
  if (structure) {
    if (!isRaidTarget(structure)) return "Nothing to attack there";
    return { kind: "structure", id: structure.id };
  }
  const unit = unitsAt(state, x, y)[0];
  if (unit) {
    if (behaviour === "siege") return "Rams don't fight units";
    return { kind: "unit", id: unit.id };
  }
  return null;
}

/** What a player built, except what the AI never goes for: bridges and floor spikes. */
function isRaidTarget(structure: Structure): boolean {
  return (
    structure.owner !== null && structure.kind !== "bridge" && structure.kind !== "floorSpikes"
  );
}

/**
 * Keeps the enemy's plan for the next enemy, should this one die, and for the raider's screen.
 * A bomber's blast on the spot isn't carried on: the next enemy would blow up as soon as it was
 * taken.
 */
function remember(player: Player, steer: Steering) {
  if (!player.raid) return;
  player.raid.plan = planOf(steer).filter((aim) => aim.order?.kind !== "self");
}

/** A raider not yet in an enemy, with nothing to carry on with. */
export function freshRaid(): RaiderState {
  return {
    enemyId: null,
    leftId: null,
    respawnIn: 0,
    lastAt: null,
    plan: [],
    kind: null,
    waitingFrom: null,
  };
}

/**
 * Puts a raider into an enemy, which stops acting on its own. After a death (`carryOn`), it
 * carries on with the raider's plan: the square they last chose, or what they last told it to
 * act on, then their flags.
 */
function takeEnemy(player: Player, enemy: Enemy, carryOn = false): void {
  const raid = player.raid ?? freshRaid();
  enemy.controller = player.id;
  enemy.steer = freshSteering("raider");
  if (carryOn && raid.plan.length > 0) {
    const [first, ...rest] = raid.plan;
    startAim(enemy.steer, first);
    enemy.steer.queue = rest.map((aim) => ({ ...aim }));
  }
  enemy.mode = "walking";
  enemy.targetId = null;
  enemy.leaderId = null; // a band member taken over leaves the band for good
  player.raid = {
    ...raid,
    enemyId: enemy.id,
    respawnIn: 0,
    lastAt: tileOf(enemy),
  };
  remember(player, enemy.steer);
}

/**
 * The raider lets go of their enemy. Still on its way somewhere, it gets there (or acts on what
 * it was told to) and on through its flags, then goes back to its own ways: its field, or roaming for a roamer.
 */
export function release(player: Player, enemy: Enemy): void {
  enemy.controller = null;
  const steer = enemy.steer;
  if (steer && hasPlan(steer)) steer.sprinting = false;
  else enemy.steer = enemy.roamer ? freshSteering("roam") : null;
  enemy.mode = "walking";
  enemy.targetId = null;
  if (player.raid) {
    player.raid.enemyId = null;
    player.raid.leftId = enemy.id;
    player.raid.plan = [];
  }
}

/**
 * Jumps into a random other uncontrolled enemy (of `kind`, if given), never the one just left if
 * there's another.
 */
function switchEnemy(state: GameState, player: Player, kind?: EnemyKindId): CommandResult {
  const current = enemyOf(state, player);
  const free = state.enemies.filter(
    (e) => e.hp > 0 && e.controller === null && (kind === undefined || e.kind === kind),
  );
  const fresh = free.filter((e) => e.id !== player.raid?.leftId);
  const choices = fresh.length > 0 ? fresh : free;
  if (choices.length === 0) {
    const what = kind ? `${ENEMY_KINDS[kind].name.toLowerCase()} free` : "other enemy";
    return { ok: false, reason: `No ${what} to take` };
  }
  const next = choices[randomInt(state, 0, choices.length - 1)];
  if (current) release(player, current);
  takeEnemy(player, next);
  // Choosing a kind keeps them that kind from now on; a plain switch goes back to any kind.
  player.raid!.kind = kind ?? null;
  player.raid!.waitingFrom = null;
  return { ok: true };
}

/**
 * The living, uncontrolled enemy (of `kind`, if given) nearest `from` (straight-line); ties to
 * the lowest id.
 */
export function nearestFree(state: GameState, from: Point, kind?: EnemyKindId): Enemy | undefined {
  let best: Enemy | undefined;
  let bestDistance = Infinity;
  for (const e of state.enemies) {
    if (e.hp <= 0 || e.controller !== null || (kind && e.kind !== kind)) continue;
    const d = Math.hypot(e.x - from.x, e.y - from.y);
    if (d < bestDistance || (d === bestDistance && best && e.id < best.id)) {
      best = e;
      bestDistance = d;
    }
  }
  return best;
}

/**
 * Once a tick, after dead enemies are removed: keeps the roamers topped up, lets go of
 * dropped raiders' enemies, and puts waiting raiders into the nearest enemy.
 */
export function updateRaiders(state: GameState): void {
  const all = raiders(state);
  if (all.length === 0) return;
  const active = all.filter((p) => p.connected);
  if (active.length > 0) spawnRoamers(state);
  for (const player of all.sort((a, b) => a.id - b.id)) {
    const raid = player.raid!;
    const enemy = enemyOf(state, player);
    if (!player.connected) {
      if (enemy) release(player, enemy);
      continue;
    }
    if (enemy) {
      raid.lastAt = tileOf(enemy);
      if (enemy.steer) remember(player, enemy.steer); // e.g. a flag done
      const theirs = newlySpawned(state, raid);
      if (theirs) {
        // One of their kind has spawned: it becomes them, carrying on where they were going.
        release(player, enemy);
        takeEnemy(player, theirs, true);
        player.raid!.waitingFrom = null;
      }
      continue;
    }
    if (raid.enemyId !== null) {
      // It died since the last tick: it leaves a flag in the raider's colour.
      raid.enemyId = null;
      if (raid.lastAt) {
        const ttl = RAID.flagSeconds * TICK_RATE;
        state.effects.push({ kind: "flag", ...raid.lastAt, owner: player.id, ttl });
      }
      raid.respawnIn = RAID.respawnSeconds * TICK_RATE;
    }
    if (raid.respawnIn > 0) {
      raid.respawnIn--;
      continue;
    }
    const next = respawnInto(state, raid);
    if (next) takeEnemy(player, next, true);
  }
}

/**
 * The enemy a raider respawns into: the nearest of the kind they chose while there's one free;
 * if there isn't, a random one until one of theirs spawns. With no kind chosen, the nearest.
 */
function respawnInto(state: GameState, raid: RaiderState): Enemy | undefined {
  const from = raid.lastAt ?? spawnCentre(state);
  if (!raid.kind) return nearestFree(state, from);
  const same = nearestFree(state, from, raid.kind);
  if (same) {
    raid.waitingFrom = null;
    return same;
  }
  const free = state.enemies.filter((e) => e.hp > 0 && e.controller === null);
  if (free.length === 0) return undefined;
  raid.waitingFrom = state.nextId;
  return free[randomInt(state, 0, free.length - 1)];
}

/** A raider in a stand-in: the first free enemy of their kind spawned since, if one has. */
function newlySpawned(state: GameState, raid: RaiderState): Enemy | undefined {
  if (raid.waitingFrom === null || !raid.kind) return undefined;
  const from = raid.waitingFrom;
  return state.enemies.find(
    (e) => e.id >= from && e.kind === raid.kind && e.hp > 0 && e.controller === null,
  );
}

function spawnRoamers(state: GameState) {
  state.roamerTimer = Math.max(0, state.roamerTimer - 1);
  if (state.roamerTimer > 0 || state.spawnTiles.length === 0) return;
  const roaming = state.enemies.filter((e) => e.roamer && e.hp > 0).length;
  if (roaming >= RAID.roamers) return;
  const p = state.spawnTiles[randomInt(state, 0, state.spawnTiles.length - 1)];
  const goblin = spawnEnemy(state, p.x, p.y, { kind: "goblin" });
  goblin.roamer = true;
  goblin.steer = freshSteering("roam");
  state.roamerTimer = RAID.roamerSpawnSeconds * TICK_RATE;
}

function spawnCentre(state: GameState): Point {
  const tiles = state.spawnTiles;
  if (tiles.length === 0) return { x: state.width / 2, y: state.height / 2 };
  const x = tiles.reduce((sum, p) => sum + p.x, 0) / tiles.length;
  const y = tiles.reduce((sum, p) => sum + p.y, 0) / tiles.length;
  return { x, y };
}

function freshSteering(by: Steering["by"]): Steering {
  return {
    by,
    goal: null,
    order: null,
    aimAt: null,
    queue: [],
    sprinting: false,
    path: null,
    pathKey: "",
    searchedFrom: -1,
    pause: 0,
  };
}

function tileOf(enemy: Enemy): Point {
  return { x: Math.round(enemy.x), y: Math.round(enemy.y) };
}

/** One tick for a controlled enemy: its plan, standing where it ends up once that's done. */
export function steerControlled(state: GameState, enemy: Enemy): void {
  enemy.steer ??= freshSteering("raider");
  followPlan(state, enemy, true);
}

/**
 * One tick for an enemy a raider left on its way: it gets there and through its flags, then goes
 * back to its own ways (its field, or roaming).
 */
export function followAim(state: GameState, enemy: Enemy): void {
  followPlan(state, enemy, false);
  if (enemy.steer && !hasPlan(enemy.steer)) {
    enemy.steer = enemy.roamer ? freshSteering("roam") : null;
  }
}

/**
 * Walks to the goal, or up to the order's target and acts on it, then on through the queued
 * flags. A goal that can't be reached counts as done once it's as near as it gets. With
 * `controlled`, the last goal or order stays when done (it stands there); otherwise it's
 * cleared, so the caller knows the plan's over.
 */
function followPlan(state: GameState, enemy: Enemy, controlled: boolean): void {
  const steer = enemy.steer!;
  if (enemy.mode === "digging") {
    dig(state, enemy, steer);
    return;
  }
  const ability = abilityOf(enemy);
  // Bombers sprint while the button is held, and on their way to blow something up.
  const bomber = ENEMY_KINDS[enemy.kind].behaviour === "bomber";
  const sprint = bomber && (steer.sprinting || steer.order !== null) ? (ability.sprint ?? 1) : 1;
  walk(enemy, enemy.speed * sprint, () => {
    // A few flags can finish at once (e.g. one under its feet); then it takes the next.
    for (let i = 0; i <= steer.queue.length; i++) {
      const step = stepPlan(state, enemy, steer);
      if (step !== "done") return step === "moved";
      const next = steer.queue.shift();
      if (next) {
        startAim(steer, next);
        continue;
      }
      if (!controlled) {
        steer.goal = null;
        steer.order = null;
      }
      return false;
    }
    return false;
  });
}

/** One go at the current goal or order: a step taken, busy acting, or done (or stuck). */
function stepPlan(state: GameState, enemy: Enemy, steer: Steering): "moved" | "busy" | "done" {
  const order = steer.order;
  if (!order) {
    const goal = steer.goal;
    if (!goal || (enemy.x === goal.x && enemy.y === goal.y)) return "done";
    const moved = stepTowards(state, enemy, `goal:${goal.x},${goal.y}`, goal, (x, y) => {
      return x === goal.x && y === goal.y;
    });
    return moved ? "moved" : "done";
  }
  if (order.kind === "self") {
    explode(state, enemy, abilityOf(enemy));
    return "busy";
  }
  const target = orderTiles(state, order);
  if (!target) {
    steer.order = null; // it's gone
    return "done";
  }
  if (canActFrom(state, enemy.x, enemy.y, target.tiles)) {
    act(state, enemy, order, target.tiles[0]);
    return "busy";
  }
  const aim = target.tiles[0];
  const moved = stepTowards(state, enemy, `${order.kind}:${aim.x},${aim.y}`, aim, (x, y) =>
    canActFrom(state, x, y, target.tiles),
  );
  return moved ? "moved" : "done";
}

/** The tiles an order's target stands on, or null once it's gone. */
function orderTiles(state: GameState, order: RaidOrder): { tiles: Point[] } | null {
  switch (order.kind) {
    case "structure": {
      const s = state.structures[order.id];
      return s ? { tiles: [{ x: s.x, y: s.y }] } : null;
    }
    case "unit": {
      const u = state.units.find((unit) => unit.id === order.id && unit.hp > 0);
      return u ? { tiles: [{ x: Math.round(u.x), y: Math.round(u.y) }] } : null;
    }
    case "keep": {
      const keep = state.keeps[order.index];
      if (!keep || keep.hp <= 0) return null;
      const tiles: Point[] = [];
      for (let y = keep.y; y < keep.y + keep.size; y++) {
        for (let x = keep.x; x < keep.x + keep.size; x++) tiles.push({ x, y });
      }
      return { tiles };
    }
    case "self":
      return null;
  }
}

/** On land, beside (or, for a unit, on) one of the target's tiles. */
function canActFrom(state: GameState, x: number, y: number, tiles: Point[]): boolean {
  if (!canCross(state, "follower", x, y)) return false; // nobody fights from the water
  return tiles.some((t) => Math.abs(t.x - x) + Math.abs(t.y - y) <= 1);
}

/** The enemy's own way of dealing with what it was told to act on. */
function act(state: GameState, enemy: Enemy, order: RaidOrder, at: Point) {
  const behaviour = ENEMY_KINDS[enemy.kind].behaviour;
  if (behaviour === "bomber") {
    explode(state, enemy, abilityOf(enemy));
    return;
  }
  if (order.kind === "keep") {
    attackKeep(state, enemy, state.keeps[order.index]);
  } else if (order.kind === "unit") {
    const unit = state.units.find((u) => u.id === order.id);
    if (unit) attackUnit(enemy, unit);
  } else if (order.kind === "structure") {
    const structure = state.structures[order.id];
    if (behaviour === "digger" && isDigTarget(structure)) {
      enemy.mode = "digging";
      enemy.targetId = structure.id;
      return;
    }
    // A wall shields the tower on it, as it does from every enemy.
    attack(state, enemy, attackTargetAt(state, at.x, at.y) ?? structure);
  }
}

/** A digger dug in: it damages the wall from below each interval until it falls. */
function dig(state: GameState, enemy: Enemy, steer: Steering) {
  const wall = enemy.targetId === null ? undefined : state.structures[enemy.targetId];
  if (!wall) {
    enemy.mode = "walking";
    enemy.targetId = null;
    steer.order = null;
    return;
  }
  if (enemy.attackCooldown > 0) return;
  damageStructure(state, wall, enemy.damage);
  enemy.attackCooldown = enemy.attackInterval;
}

/** One tick for a roamer: head for a random tile nearby, stop a moment, pick another. */
export function roam(state: GameState, enemy: Enemy): void {
  if (enemy.steer?.by !== "roam") enemy.steer = freshSteering("roam");
  const steer = enemy.steer;
  walk(enemy, enemy.speed, () => {
    if (steer.pause > 0) {
      steer.pause--;
      return false;
    }
    const goal = (steer.goal ??= roamGoal(state, enemy));
    if (!goal) {
      steer.pause = RAID.roamPauseSeconds * TICK_RATE;
      return false;
    }
    const moved = stepTowards(state, enemy, `roam:${goal.x},${goal.y}`, goal, (x, y) => {
      return x === goal.x && y === goal.y;
    });
    if (!moved) {
      // There (or as near as it gets): stop a moment, then pick somewhere else.
      steer.goal = null;
      steer.pause = RAID.roamPauseSeconds * TICK_RATE;
    }
    return moved;
  });
}

/** Walks to `goal` along a short path and stands once there (or as near as it gets). */
export function headFor(state: GameState, enemy: Enemy, goal: Point): void {
  if (enemy.steer?.by !== "roam") enemy.steer = freshSteering("roam");
  walk(enemy, enemy.speed, () =>
    stepTowards(state, enemy, `to:${goal.x},${goal.y}`, goal, (x, y) => {
      return x === goal.x && y === goal.y;
    }),
  );
}

/** A random open tile within the roam radius, or null after a few misses. */
function roamGoal(state: GameState, enemy: Enemy): Point | null {
  const r = RAID.roamRadius;
  const profile = ENEMY_KINDS[enemy.kind].profile;
  for (let tries = 0; tries < 4; tries++) {
    const x = enemy.x + randomInt(state, -r, r);
    const y = enemy.y + randomInt(state, -r, r);
    if (isOpenFor(state, profile, x, y) && (x !== enemy.x || y !== enemy.y)) return { x, y };
  }
  return null;
}

type Profile = (typeof ENEMY_KINDS)[keyof typeof ENEMY_KINDS]["profile"];

function isOpenFor(state: GameState, profile: Profile, x: number, y: number): boolean {
  return (
    inBounds(state, x, y) &&
    canCross(state, profile, x, y) &&
    !blocksAt(state, x, y) &&
    !keepAt(state, x, y)
  );
}

/**
 * Takes the next step of a short path to where `isGoal` holds, searching again when `key` or
 * the grid changes. Without a way there, it walks to the tile found nearest `aim`. False when
 * there's no step to take (there, or stuck), so the enemy stands.
 */
function stepTowards(
  state: GameState,
  enemy: Enemy,
  key: string,
  aim: Point,
  isGoal: (x: number, y: number) => boolean,
): boolean {
  const steer = enemy.steer!;
  const fullKey = `${key}:${state.gridVersion}`;
  const here = enemy.y * state.width + enemy.x;
  // A search only looks so far: at the end of a partial path, search again from there.
  const partial = steer.path?.length === 0 && steer.searchedFrom !== here;
  if (steer.pathKey !== fullKey || !steer.path || partial) {
    steer.path = searchPath(state, enemy, aim, isGoal);
    steer.pathKey = fullKey;
    steer.searchedFrom = here;
  }
  const next = steer.path.shift();
  if (!next) return false;
  stepTo(enemy, next.x, next.y);
  return true;
}

/** Breadth-first over tiles its profile can cross, at most RAID.searchTiles of them. */
function searchPath(
  state: GameState,
  enemy: Enemy,
  aim: Point,
  isGoal: (x: number, y: number) => boolean,
): Point[] {
  if (!atTileCentre(enemy)) return [];
  const profile = ENEMY_KINDS[enemy.kind].profile;
  const { width } = state;
  const start = enemy.y * width + enemy.x;
  if (isGoal(enemy.x, enemy.y)) return [];
  const cameFrom = new Map<number, number>([[start, -1]]);
  const queue = [start];
  let best = start;
  let bestDistance = Math.hypot(enemy.x - aim.x, enemy.y - aim.y);
  for (let head = 0; head < queue.length && cameFrom.size < RAID.searchTiles; head++) {
    const i = queue[head];
    const px = i % width;
    const py = (i - px) / width;
    for (const d of DIRECTIONS) {
      const x = px + d.x;
      const y = py + d.y;
      const index = y * width + x;
      if (cameFrom.has(index) || !isOpenFor(state, profile, x, y)) continue;
      cameFrom.set(index, i);
      if (isGoal(x, y)) return pathTo(cameFrom, width, index);
      const distance = Math.hypot(x - aim.x, y - aim.y);
      if (distance < bestDistance) {
        best = index;
        bestDistance = distance;
      }
      queue.push(index);
    }
  }
  return pathTo(cameFrom, width, best);
}

function pathTo(cameFrom: Map<number, number>, width: number, end: number): Point[] {
  const path: Point[] = [];
  for (let i = end; cameFrom.get(i) !== -1; i = cameFrom.get(i)!) {
    path.push({ x: i % width, y: Math.floor(i / width) });
  }
  return path.reverse();
}
