import { ENEMY, TICK_RATE } from "./config";
import { addCue } from "./cues";
import { attackTargetAt, blocksAt, damageStructure, inBounds, isKeepTile } from "./grid";
import { DIRECTIONS, nextStep } from "./pathfinding";
import { nextRandom, randomInt } from "./rng";
import type { Enemy, GameState, PlayerId, Point, Structure } from "./types";

const STEP = ENEMY.speed / TICK_RATE;
const EPSILON = 1e-9;

export function spawnEnemy(
  state: GameState,
  x: number,
  y: number,
  hp = ENEMY.baseHp,
  bounty = ENEMY.baseBounty,
): Enemy {
  const enemy: Enemy = {
    id: state.nextId++,
    x,
    y,
    tx: x,
    ty: y,
    px: x,
    py: y,
    hp,
    maxHp: hp,
    bounty,
    killedBy: null,
    attackCooldown: 0,
  };
  state.enemies.push(enemy);
  return enemy;
}

/** Deals damage and records who struck the killing blow. */
export function damageEnemy(enemy: Enemy, amount: number, by: PlayerId | null): void {
  if (enemy.hp <= 0) return;
  enemy.hp -= amount;
  if (enemy.hp <= 0) enemy.killedBy = by;
}

export function updateEnemies(state: GameState): void {
  const survivors: Enemy[] = [];
  for (const enemy of state.enemies) {
    if (advance(state, enemy)) survivors.push(enemy);
  }
  state.enemies = survivors;
}

/**
 * Move the enemy one tick's worth of distance, carrying leftover movement
 * across tile centres so speed stays constant. Returns false once it is spent.
 */
function advance(state: GameState, enemy: Enemy): boolean {
  enemy.attackCooldown = Math.max(0, enemy.attackCooldown - 1);
  let budget = STEP;
  while (budget > EPSILON) {
    if (enemy.x === enemy.tx && enemy.y === enemy.ty) {
      if (isKeepTile(state, enemy.x, enemy.y)) {
        state.keep.hp = Math.max(0, state.keep.hp - ENEMY.keepDamage);
        addCue(state, "keepHit");
        return false;
      }
      if (!chooseNextTile(state, enemy)) return true; // waiting or attacking
    }
    budget -= moveTowardsTarget(enemy, budget);
  }
  return true;
}

/** Sets the next tile to walk to. If a structure blocks the way, attacks it instead and returns false. */
function chooseNextTile(state: GameState, enemy: Enemy): boolean {
  const previous = { x: enemy.px, y: enemy.py };
  const pathStep = nextStep(state, enemy.x, enemy.y, previous);
  if (!pathStep) return false;
  if (blocksAt(state, pathStep.x, pathStep.y)) {
    attack(state, enemy, attackTargetAt(state, pathStep.x, pathStep.y)!);
    return false;
  }
  // Only walking enemies wander; one breaking through stays on its target.
  const next = wanderStep(state, enemy, pathStep, previous) ?? pathStep;
  enemy.px = enemy.x;
  enemy.py = enemy.y;
  enemy.tx = next.x;
  enemy.ty = next.y;
  return true;
}

/**
 * With chance `state.wanderChance`, a random open tile to the side of the path step,
 * so enemies sometimes stray off the path. Never steps backwards (opposite the path
 * step), onto the tile it just left, or into a blocking structure.
 */
function wanderStep(
  state: GameState,
  enemy: Enemy,
  pathStep: Point,
  previous: Point,
): Point | null {
  if (state.wanderChance <= 0 || nextRandom(state) >= state.wanderChance) return null;
  const forward = { x: pathStep.x - enemy.x, y: pathStep.y - enemy.y };
  const options: Point[] = [];
  for (const d of DIRECTIONS) {
    // Sideways only: skip both forward (the path step) and straight back.
    if (d.x === forward.x || d.y === forward.y) continue;
    const x = enemy.x + d.x;
    const y = enemy.y + d.y;
    if (x === previous.x && y === previous.y) continue;
    if (inBounds(state, x, y) && !blocksAt(state, x, y)) options.push({ x, y });
  }
  return options.length > 0 ? options[randomInt(state, 0, options.length - 1)] : null;
}

function attack(state: GameState, enemy: Enemy, target: Structure) {
  if (enemy.attackCooldown > 0) return;
  damageStructure(state, target, ENEMY.structureDps);
  enemy.attackCooldown = TICK_RATE;
}

/** Moves up to `budget` tiles towards the target and returns the distance moved. */
function moveTowardsTarget(enemy: Enemy, budget: number): number {
  // Movement is always along one axis between adjacent tile centres.
  const dx = enemy.tx - enemy.x;
  const dy = enemy.ty - enemy.y;
  const remaining = Math.abs(dx) + Math.abs(dy);
  if (remaining <= budget + EPSILON) {
    enemy.x = enemy.tx;
    enemy.y = enemy.ty;
    return remaining;
  }
  enemy.x += Math.sign(dx) * budget;
  enemy.y += Math.sign(dy) * budget;
  return budget;
}
