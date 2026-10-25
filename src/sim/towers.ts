import {
  AIM_TOLERANCE_DEGREES,
  EFFECT_TICKS,
  PVP,
  STRUCTURES,
  TICK_RATE,
  type StructureStats,
  type TowerStats,
} from "./config";
import { angleBetween, angleTo, facingAngle, inArc, turnTowards } from "./aiming";
import { addCue } from "./cues";
import { damageEnemy } from "./enemies";
import { baseAt, damageKeep, damageStructure, inBounds, isBuilt, keepAt, mountAt } from "./grid";
import { distanceAt } from "./pathfinding";
import { addGold } from "./players";
import type { Enemy, Facing, GameState, Keep, PlayerId, Point, Structure } from "./types";

export function updateTowers(state: GameState): void {
  for (const structure of Object.values(state.structures)) {
    const stats: StructureStats = STRUCTURES[structure.kind];
    if (stats.tower && isBuilt(structure)) updateTower(state, structure, stats.tower);
  }
}

function updateTower(state: GameState, structure: Structure, tower: TowerStats) {
  structure.cooldown = Math.max(0, structure.cooldown - 1);
  const turns = tower.turnDegreesPerSecond > 0;
  // Fixed towers have nothing to do while reloading; turning towers keep tracking.
  if (structure.cooldown > 0 && !turns) return;
  if (state.mode === "pvp") return updateSiegeTower(state, structure, tower, turns);

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
      // The blast shows when the shot lands (the renderer draws a splash's last EFFECT_TICKS).
      ttl: tower.flightTicks + EFFECT_TICKS,
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
    ttl: tower.flightTicks,
    projectile: tower.projectile,
    flight: tower.flightTicks,
  });
  structure.cooldown = tower.fireIntervalSeconds * TICK_RATE;
}

/** Where a shot from a turning tower lands: along its barrel, at the target's distance. */
function landingPoint(structure: Structure, target: Point): Point {
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
function shotWouldHit(structure: Structure, tower: TowerStats, target: Point, impact: Point) {
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

// PvP: towers fire at the rival's structures and keep instead of enemies, with the same range,
// arcs, turning and splash. A wall shields the tower on it, as it does from enemies.

/** Something a PvP tower can hit on one tile: a rival structure, or a tile of a rival keep. */
type SiegeTarget = Point & { structure?: Structure; keep?: Keep };

function updateSiegeTower(
  state: GameState,
  structure: Structure,
  tower: TowerStats,
  turns: boolean,
) {
  const target = findSiegeTarget(state, structure, tower);
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

  // Splash hits every rival target in the blast (a keep only once); otherwise just the target.
  const hits =
    tower.splashRadius > 0
      ? siegeTargetsNear(state, structure.owner, impact, tower.splashRadius)
      : [target];
  const keepsHit = new Set<Keep>();
  for (const hit of hits) {
    if (hit.keep) {
      if (!keepsHit.has(hit.keep)) damageKeep(state, hit.keep, tower.damage);
      keepsHit.add(hit.keep);
      addCue(state, "keepHit");
    } else if (hit.structure) {
      damageRival(state, hit.structure, tower.damage, structure.owner);
    }
  }
  if (tower.splashRadius > 0) {
    state.effects.push({
      kind: "splash",
      x: impact.x,
      y: impact.y,
      radius: tower.splashRadius,
      // The blast shows when the shot lands (the renderer draws a splash's last EFFECT_TICKS).
      ttl: tower.flightTicks + EFFECT_TICKS,
    });
    addCue(state, "splash");
  } else {
    addCue(state, "enemyHit");
  }
  state.effects.push({
    kind: "shot",
    fromX: structure.x,
    fromY: structure.y,
    toX: impact.x,
    toY: impact.y,
    ttl: tower.flightTicks,
    projectile: tower.projectile,
    flight: tower.flightTicks,
  });
  structure.cooldown = tower.fireIntervalSeconds * TICK_RATE;
}

/** Damages a rival's structure; wrecking it pays the attacker a share of what it cost. */
function damageRival(state: GameState, target: Structure, damage: number, by: PlayerId | null) {
  const bounty = Math.floor((target.paid ?? STRUCTURES[target.kind].cost) * PVP.destroyBounty);
  damageStructure(state, target, damage);
  if (target.hp <= 0) addGold(state, by, bounty);
}

/** What a tower owned by `owner` would hit on (x, y): the wall before the tower on it. */
function siegeTargetAt(
  state: GameState,
  owner: PlayerId | null,
  x: number,
  y: number,
): SiegeTarget | undefined {
  const keep = keepAt(state, x, y);
  if (keep) return keep.owner !== null && keep.owner !== owner ? { x, y, keep } : undefined;
  const base = baseAt(state, x, y);
  const mount = mountAt(state, x, y);
  // Walkable things with no HP (floor spikes, bridges) can't be hit; a tower stands above them.
  const structure = base && base.maxHp > 0 ? base : mount;
  if (!structure || structure.owner === null || structure.owner === owner) return undefined;
  return { x, y, structure };
}

/** Every rival target within `radius` tiles (Chebyshev) of a point. */
function siegeTargetsNear(
  state: GameState,
  owner: PlayerId | null,
  point: Point,
  radius: number,
): SiegeTarget[] {
  const targets: SiegeTarget[] = [];
  for (let y = Math.ceil(point.y - radius); y <= Math.floor(point.y + radius); y++) {
    for (let x = Math.ceil(point.x - radius); x <= Math.floor(point.x + radius); x++) {
      const target = siegeTargetAt(state, owner, x, y);
      if (target) targets.push(target);
    }
  }
  return targets;
}

/**
 * The rival target needing the least turning (0 for fixed towers), then the nearest, then
 * the first in reading order.
 */
function findSiegeTarget(
  state: GameState,
  structure: Structure,
  tower: TowerStats,
): SiegeTarget | undefined {
  const turns = tower.turnDegreesPerSecond > 0;
  const reach = Math.ceil(tower.range);
  let best: SiegeTarget | undefined;
  let bestKey: [number, number, number] | undefined;
  for (let y = structure.y - reach; y <= structure.y + reach; y++) {
    for (let x = structure.x - reach; x <= structure.x + reach; x++) {
      if (!inBounds(state, x, y)) continue;
      if (!canTarget(tower, structure, structure.facing, { x, y })) continue;
      const target = siegeTargetAt(state, structure.owner, x, y);
      if (!target) continue;
      const turn = turns ? angleBetween(structure.aim ?? 0, angleTo(structure, target)) : 0;
      const key: [number, number, number] = [
        turn,
        Math.hypot(x - structure.x, y - structure.y),
        y * state.width + x,
      ];
      if (!bestKey || isLess(key, bestKey)) {
        best = target;
        bestKey = key;
      }
    }
  }
  return best;
}
