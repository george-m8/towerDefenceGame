import {
  AIM_TOLERANCE_DEGREES,
  EFFECT_TICKS,
  STRUCTURES,
  TICK_RATE,
  type StructureStats,
  type TowerStats,
} from "./config";
import { angleBetween, angleTo, facingAngle, inArc, turnTowards } from "./aiming";
import { distanceAt } from "./pathfinding";
import type { Enemy, Facing, GameState, Point, Structure } from "./types";

export function updateTowers(state: GameState): void {
  for (const structure of Object.values(state.structures)) {
    const stats: StructureStats = STRUCTURES[structure.kind];
    if (stats.tower) updateTower(state, structure, stats.tower);
  }
}

function updateTower(state: GameState, structure: Structure, tower: TowerStats) {
  structure.cooldown = Math.max(0, structure.cooldown - 1);
  const turns = tower.turnDegreesPerSecond > 0;
  // Fixed towers have nothing to do while reloading; turning towers keep tracking.
  if (structure.cooldown > 0 && !turns) return;

  const target = findTarget(state, structure, tower);
  if (!target) return;
  const aligned = turns ? turnTowardsTarget(structure, tower, target) : true;
  if (!aligned || structure.cooldown > 0) return;

  if (tower.splashRadius > 0) {
    for (const enemy of state.enemies) {
      const spread = Math.max(Math.abs(enemy.x - target.x), Math.abs(enemy.y - target.y));
      if (spread <= tower.splashRadius) enemy.hp -= tower.damage;
    }
    state.effects.push({
      kind: "splash",
      x: target.x,
      y: target.y,
      radius: tower.splashRadius,
      ttl: EFFECT_TICKS,
    });
  } else {
    target.hp -= tower.damage;
  }
  state.effects.push({
    kind: "shot",
    fromX: structure.x,
    fromY: structure.y,
    toX: target.x,
    toY: target.y,
    ttl: EFFECT_TICKS,
  });
  structure.cooldown = tower.fireIntervalSeconds * TICK_RATE;
}

/** Turns the tower's aim towards the target; true once it is within the aim tolerance. */
function turnTowardsTarget(structure: Structure, tower: TowerStats, target: Enemy): boolean {
  const wanted = angleTo(structure, target);
  const aim = structure.aim ?? wanted;
  structure.aim = turnTowards(aim, wanted, tower.turnDegreesPerSecond / TICK_RATE);
  return angleBetween(structure.aim, wanted) <= AIM_TOLERANCE_DEGREES;
}

/**
 * Whether a tower at `origin` with `facing` could ever fire at `point`: in range, outside its
 * minimum range, and (for fixed towers) inside its arc. Turning towers can face any way.
 * Targeting and the range overlay both use this, so they always agree.
 */
export function canTarget(
  tower: TowerStats,
  origin: Point,
  facing: Facing | undefined,
  point: Point,
): boolean {
  const distance = Math.hypot(point.x - origin.x, point.y - origin.y);
  if (distance > tower.range || distance < tower.minRange) return false;
  if (tower.turnDegreesPerSecond > 0 || !facing) return true;
  return inArc(facingAngle(facing), tower.arcDegrees, angleTo(origin, point));
}

/** The living, in-range enemy closest to the keep by path distance (ties: lowest id). */
function findTarget(state: GameState, structure: Structure, tower: TowerStats): Enemy | undefined {
  let best: Enemy | undefined;
  let bestDist = Infinity;
  for (const enemy of state.enemies) {
    if (enemy.hp <= 0) continue;
    if (!canTarget(tower, structure, structure.facing, enemy)) continue;
    const dist = distanceAt(state, Math.round(enemy.x), Math.round(enemy.y));
    if (dist < bestDist || (dist === bestDist && best && enemy.id < best.id)) {
      best = enemy;
      bestDist = dist;
    }
  }
  return best;
}
