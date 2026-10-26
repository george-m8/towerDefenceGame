// The player's own people on the map. Each unit belongs to a player, has a kind (UNIT_KINDS)
// and does what its kind's behaviour says every tick. See SPEC-unit-core.md.
import {
  STRUCTURES,
  TERRAIN,
  TICK_RATE,
  UNIT_KINDS,
  UNIT_PATH_SEARCHES_PER_TICK,
  type StructureStats,
  type UnitBehaviourId,
  type UnitKind,
  type UnitKindId,
} from "./config";
import { damageEnemy } from "./enemies";
import { blocksAt, inBounds, isBuilt, keepAt } from "./grid";
import { addBurst } from "./effects";
import { unitMoved } from "./fog";
import { atTileCentre, walk } from "./movement";
import { DIRECTIONS, canCross } from "./pathfinding";
import { harvest, resourceAt } from "./resources";
import { findPath } from "./unitPaths";
import type { Enemy, Facing, GameState, PlayerId, Point, Structure, Terrain, Unit } from "./types";

type Behaviour = (state: GameState, unit: Unit) => void;

const BEHAVIOURS: Record<UnitBehaviourId, Behaviour> = {
  hold,
  gather,
  guard: hold, // holding their spot comes with sim/guards.ts
};

/**
 * Workers work a resource in reach on their interval; otherwise they walk to the nearest
 * tile they can work from, or stand still until the grid changes if there's none.
 */
function gather(state: GameState, unit: Unit) {
  const kind = kindOf(unit);
  const gathers = kind.gathers ?? [];
  const target = atTileCentre(unit) ? workableFrom(state, unit.x, unit.y, gathers) : null;
  if (target) {
    if (unit.attackCooldown === 0) {
      harvest(state, target.x, target.y, kind.attackInterval, unit.owner);
      unit.attackCooldown = kind.attackInterval * TICK_RATE;
    }
    return;
  }
  walkTowards(
    state,
    unit,
    `gather ${gathers.join("+")}`,
    (x, y) => !!workableFrom(state, x, y, gathers),
  );
}

/**
 * A resource of these kinds a worker on (x, y) can work: one it stands on if it's walkable
 * (berry bushes), else one next to it, in N, E, S, W order (trees, rocks).
 */
export function workableFrom(
  state: GameState,
  x: number,
  y: number,
  gathers: readonly Terrain[],
): Point | null {
  const under = resourceAt(state, x, y);
  if (under && gathers.includes(under.terrain)) return { x, y };
  for (const d of DIRECTIONS) {
    const resource = resourceAt(state, x + d.x, y + d.y);
    if (resource && gathers.includes(resource.terrain) && !TERRAIN[resource.terrain].walkable) {
      return { x: x + d.x, y: y + d.y };
    }
  }
  return null;
}

/** Fights anything in reach; otherwise walks to its goal, if it has one, and holds there. */
function hold(state: GameState, unit: Unit) {
  if (atTileCentre(unit) && attackNearest(state, unit)) return;
  if (unit.goal) walkTowards(state, unit, `tile ${unit.goal.x},${unit.goal.y}`, isAt(unit.goal));
}

const isAt = (goal: Point) => (x: number, y: number) => x === goal.x && y === goal.y;

export function kindOf(unit: Unit): UnitKind {
  return UNIT_KINDS[unit.kind];
}

/** Open land a unit can stand on: walkable ground or a bridge, nothing blocking, not the keep. */
export function canStand(state: GameState, x: number, y: number): boolean {
  return (
    canCross(state, "follower", x, y) && !blocksAt(state, x, y) && keepAt(state, x, y) === undefined
  );
}

/** A new unit for `owner` on (x, y), or null if a unit can't stand there. */
export function spawnUnit(
  state: GameState,
  kind: UnitKindId,
  owner: PlayerId,
  x: number,
  y: number,
  home: number | null = null,
): Unit | null {
  if (!canStand(state, x, y)) return null;
  const { hp } = UNIT_KINDS[kind];
  const unit: Unit = {
    id: state.nextId++,
    kind,
    owner,
    home,
    x,
    y,
    tx: x,
    ty: y,
    hp,
    maxHp: hp,
    attackCooldown: 0,
    goal: null,
    path: null,
    pathGoal: null,
    pathVersion: -1,
    waitingForPath: false,
  };
  state.units.push(unit);
  unitMoved(state, unit);
  return unit;
}

/**
 * Every finished spawner counts down its timer (`cooldown`); at 0, while it has fewer than its
 * quota alive, it spawns a unit and starts again. At quota it stays ready, so a death is
 * replaced straight away. With no open tile beside it, it waits.
 */
export function updateSpawners(state: GameState): void {
  for (const structure of Object.values(state.structures)) {
    const { spawner }: StructureStats = STRUCTURES[structure.kind];
    if (!spawner || !isBuilt(structure) || structure.owner === null) continue;
    structure.cooldown = Math.max(0, structure.cooldown - 1);
    if (structure.cooldown > 0) continue;
    const alive = state.units.filter((u) => u.home === structure.id && u.hp > 0).length;
    if (alive >= spawner.quota) continue;
    const tile = spawnTile(state, structure);
    if (!tile) continue;
    spawnUnit(state, spawner.unit, structure.owner, tile.x, tile.y, structure.id);
    structure.cooldown = spawner.intervalSeconds * TICK_RATE;
  }
}

const CLOCKWISE: Facing[] = ["N", "E", "S", "W"];
const STEP: Record<Facing, Point> = {
  N: { x: 0, y: -1 },
  E: { x: 1, y: 0 },
  S: { x: 0, y: 1 },
  W: { x: -1, y: 0 },
};

/** The tile a spawner faces (south without a facing) if open, else the next open one clockwise. */
function spawnTile(state: GameState, structure: Structure): Point | null {
  const first = CLOCKWISE.indexOf(structure.facing ?? "S");
  for (let i = 0; i < 4; i++) {
    const d = STEP[CLOCKWISE[(first + i) % 4]];
    const tile = { x: structure.x + d.x, y: structure.y + d.y };
    if (canStand(state, tile.x, tile.y)) return tile;
  }
  return null;
}

/** Armour takes something off every hit, but a hit always does at least 1. */
export function damageUnit(unit: Unit, amount: number): void {
  unit.hp -= Math.max(1, amount - kindOf(unit).armour);
}

/** Path searches left this tick (see UNIT_PATH_SEARCHES_PER_TICK). */
let searchesLeft = 0;

export function updateUnits(state: GameState): void {
  searchesLeft = UNIT_PATH_SEARCHES_PER_TICK;
  // Units left waiting for a path last tick go first.
  const order = [
    ...state.units.filter((u) => u.waitingForPath),
    ...state.units.filter((u) => !u.waitingForPath),
  ];
  for (const unit of order) {
    if (unit.hp <= 0) continue;
    unit.attackCooldown = Math.max(0, unit.attackCooldown - 1);
    const tile = Math.round(unit.y) * state.width + Math.round(unit.x);
    BEHAVIOURS[kindOf(unit).behaviour](state, unit);
    if (Math.round(unit.y) * state.width + Math.round(unit.x) !== tile) unitMoved(state, unit);
  }
  occupancy.delete(state); // units have moved: rebuilt when next asked
}

// Units by tile, so enemies (and towers) find the units near them without scanning them all.
// Rebuilt when first asked for after units move, spawn or die; never sent over the wire.
const occupancy = new WeakMap<
  GameState,
  { tick: number; count: number; byTile: Map<number, Unit[]> }
>();

/** The living units on (x, y), counting a moving unit on the tile it's nearest. */
export function unitsAt(state: GameState, x: number, y: number): Unit[] {
  if (!inBounds(state, x, y)) return [];
  let index = occupancy.get(state);
  if (!index || index.tick !== state.tick || index.count !== state.units.length) {
    index = { tick: state.tick, count: state.units.length, byTile: new Map() };
    for (const unit of state.units) {
      const i = Math.round(unit.y) * state.width + Math.round(unit.x);
      index.byTile.set(i, [...(index.byTile.get(i) ?? []), unit]);
    }
    occupancy.set(state, index);
  }
  return (index.byTile.get(y * state.width + x) ?? []).filter((unit) => unit.hp > 0);
}

/** Dead units are simply gone: nobody is paid for them. */
export function removeDeadUnits(state: GameState): void {
  const alive = state.units.filter((unit) => unit.hp > 0);
  if (alive.length === state.units.length) return;
  for (const unit of state.units) {
    if (unit.hp <= 0) addBurst(state, unit.x, unit.y, { unit: unit.kind, owner: unit.owner });
  }
  state.units = alive;
  state.sightVersion++; // their sight goes with them
}

/** Tiles between a unit and a point, counting diagonals as 1. */
function reach(unit: Unit, x: number, y: number): number {
  return Math.max(Math.abs(Math.round(x) - unit.x), Math.abs(Math.round(y) - unit.y));
}

/**
 * Hits the nearest enemy within range once its attack is ready. True while there's an enemy
 * in reach (even between hits), so the unit stays to fight.
 */
function attackNearest(state: GameState, unit: Unit): boolean {
  const kind = kindOf(unit);
  const target = nearestEnemy(state, unit, kind.range);
  if (!target) return false;
  if (unit.attackCooldown === 0) {
    damageEnemy(target, kind.damage, unit.owner);
    unit.attackCooldown = kind.attackInterval * TICK_RATE;
  }
  return true;
}

/**
 * Walks the unit a tick's worth towards the nearest tile where `isGoal` holds, searching for a
 * path when it has none for this goal (`goalKey`) or the grid has changed. A unit with no way
 * there stands still until the grid changes. Returns true once it's there.
 */
export function walkTowards(
  state: GameState,
  unit: Unit,
  goalKey: string,
  isGoal: (x: number, y: number) => boolean,
): boolean {
  if (atTileCentre(unit) && isGoal(unit.x, unit.y)) return true;
  walk(unit, kindOf(unit).speed, () => {
    if (isGoal(unit.x, unit.y)) return false;
    if (unit.pathGoal !== goalKey || unit.pathVersion !== state.gridVersion) {
      if (!searchPath(state, unit, goalKey, isGoal)) return false;
    }
    const step = unit.path?.[0];
    if (!step) return false; // no way there
    if (!canStand(state, step.x, step.y)) {
      unit.pathVersion = -1; // something's in the way now: search again
      return false;
    }
    unit.path!.shift();
    unit.tx = step.x;
    unit.ty = step.y;
    return true;
  });
  return false;
}

/** Searches if the tick's budget allows; otherwise the unit waits, first in line next tick. */
function searchPath(
  state: GameState,
  unit: Unit,
  goalKey: string,
  isGoal: (x: number, y: number) => boolean,
): boolean {
  if (searchesLeft <= 0) {
    unit.waitingForPath = true;
    return false;
  }
  searchesLeft--;
  unit.waitingForPath = false;
  unit.path = findPath(state, { x: unit.x, y: unit.y }, isGoal) ?? [];
  unit.pathGoal = goalKey;
  unit.pathVersion = state.gridVersion;
  return true;
}

/** The living enemy within `range` nearest the unit (straight-line), then the lowest id. */
function nearestEnemy(state: GameState, unit: Unit, range: number): Enemy | undefined {
  let best: Enemy | undefined;
  let bestDistance = Infinity;
  for (const enemy of state.enemies) {
    if (enemy.hp <= 0 || reach(unit, enemy.x, enemy.y) > range) continue;
    const distance = Math.hypot(enemy.x - unit.x, enemy.y - unit.y);
    if (distance < bestDistance) {
      best = enemy;
      bestDistance = distance;
    }
  }
  return best;
}
