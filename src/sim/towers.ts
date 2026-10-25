import {
  AIM_TOLERANCE_DEGREES,
  EFFECT_TICKS,
  STRUCTURES,
  TICK_RATE,
  type StructureStats,
  type TowerStats,
} from "./config";
import { angleBetween, angleTo, facingAngle, inArc, turnTowards } from "./aiming";
import { addCue } from "./cues";
import { damageEnemy } from "./enemies";
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
  if (turns) {
    const wanted = angleTo(structure, target);
    structure.aim = turnTowards(
      structure.aim ?? wanted,
      wanted,
      tower.turnDegreesPerSecond / TICK_RATE,
    );
  }
  if (structure.cooldown > 0) return;
  const impact = turns ? landingPoint(structure, target) : target;
  if (turns && !shotWouldHit(structure, tower, target, impact)) return;
  fire(state, structure, tower, target, impact);
}

function fire(
  state: GameState,
  structure: Structure,
  tower: TowerStats,
  target: Enemy,
  impact: Point,
) {
  if (tower.splashRadius > 0) {
    for (const enemy of state.enemies) {
      const spread = Math.max(Math.abs(enemy.x - impact.x), Math.abs(enemy.y - impact.y));
      if (spread <= tower.splashRadius) damageEnemy(enemy, tower.damage, structure.owner);
    }
    state.effects.push({
      kind: "splash",
      x: impact.x,
      y: impact.y,
      radius: tower.splashRadius,
      ttl: EFFECT_TICKS,
    });
    addCue(state, "splash");
  } else {
    damageEnemy(target, tower.damage, structure.owner);
    addCue(state, "enemyHit");
  }
  state.effects.push({
    kind: "shot",
    fromX: structure.x,
    fromY: structure.y,
    toX: impact.x,
    toY: impact.y,
    ttl: EFFECT_TICKS,
  });
  structure.cooldown = tower.fireIntervalSeconds * TICK_RATE;
}

/** Where a shot from a turning tower lands: along its barrel, at the target's distance. */
function landingPoint(structure: Structure, target: Enemy): Point {
  const distance = Math.hypot(target.x - structure.x, target.y - structure.y);
  const radians = ((structure.aim ?? 0) * Math.PI) / 180;
  return {
    x: structure.x + Math.sin(radians) * distance,
    y: structure.y - Math.cos(radians) * distance,
  };
}

/**
 * Splash weapons fire once the shell would land close enough for the blast to catch the
 * target; others need their aim within the aim tolerance.
 */
function shotWouldHit(structure: Structure, tower: TowerStats, target: Enemy, impact: Point) {
  if (tower.splashRadius > 0) {
    return Math.hypot(impact.x - target.x, impact.y - target.y) <= tower.splashRadius + EPSILON;
  }
  return angleBetween(structure.aim ?? 0, angleTo(structure, target)) <= AIM_TOLERANCE_DEGREES;
}

const EPSILON = 1e-9;

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

/**
 * Fixed towers: the enemy closest to the keep. Turning towers: the enemy needing the least
 * turning from their current aim, so they keep firing at whatever is in front of them.
 * Ties go to the enemy closest to the keep, then the lowest id.
 */
function findTarget(state: GameState, structure: Structure, tower: TowerStats): Enemy | undefined {
  const turns = tower.turnDegreesPerSecond > 0;
  let best: Enemy | undefined;
  let bestKey: [number, number, number] | undefined;
  for (const enemy of state.enemies) {
    if (enemy.hp <= 0) continue;
    if (!canTarget(tower, structure, structure.facing, enemy)) continue;
    const turn = turns ? angleBetween(structure.aim ?? 0, angleTo(structure, enemy)) : 0;
    const key: [number, number, number] = [
      turn,
      distanceAt(state, Math.round(enemy.x), Math.round(enemy.y)),
      enemy.id,
    ];
    if (!bestKey || isLess(key, bestKey)) {
      best = enemy;
      bestKey = key;
    }
  }
  return best;
}

function isLess(a: [number, number, number], b: [number, number, number]): boolean {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] < b[i];
  }
  return false;
}
