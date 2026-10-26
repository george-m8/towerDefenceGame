// The player's own people on the map. Each unit belongs to a player, has a kind (UNIT_KINDS)
// and does what its kind's behaviour says every tick. See SPEC-unit-core.md.
import {
  TICK_RATE,
  UNIT_KINDS,
  type UnitBehaviourId,
  type UnitKind,
  type UnitKindId,
} from "./config";
import { damageEnemy } from "./enemies";
import { blocksAt, inBounds, keepAt } from "./grid";
import { canCross } from "./pathfinding";
import type { Enemy, GameState, PlayerId, Unit } from "./types";

type Behaviour = (state: GameState, unit: Unit) => void;

const BEHAVIOURS: Record<UnitBehaviourId, Behaviour> = {
  hold: (state, unit) => attackNearest(state, unit),
};

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
  };
  state.units.push(unit);
  return unit;
}

/** Armour takes something off every hit, but a hit always does at least 1. */
export function damageUnit(unit: Unit, amount: number): void {
  unit.hp -= Math.max(1, amount - kindOf(unit).armour);
}

export function updateUnits(state: GameState): void {
  for (const unit of state.units) {
    if (unit.hp <= 0) continue;
    unit.attackCooldown = Math.max(0, unit.attackCooldown - 1);
    BEHAVIOURS[kindOf(unit).behaviour](state, unit);
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
  state.units = state.units.filter((unit) => unit.hp > 0);
}

/** Tiles between a unit and a point, counting diagonals as 1. */
function reach(unit: Unit, x: number, y: number): number {
  return Math.max(Math.abs(Math.round(x) - unit.x), Math.abs(Math.round(y) - unit.y));
}

/** Hits the nearest enemy within range, once its attack is ready. */
function attackNearest(state: GameState, unit: Unit) {
  if (unit.attackCooldown > 0) return;
  const kind = kindOf(unit);
  const target = nearestEnemy(state, unit, kind.range);
  if (!target) return;
  damageEnemy(target, kind.damage, unit.owner);
  unit.attackCooldown = kind.attackInterval * TICK_RATE;
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
