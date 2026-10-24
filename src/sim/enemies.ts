import { ENEMY, TICK_RATE } from "./config";
import { attackTargetAt, blocksAt, damageStructure, isKeepTile } from "./grid";
import { nextStep } from "./pathfinding";
import type { Enemy, GameState, Structure } from "./types";

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
    hp,
    maxHp: hp,
    bounty,
    attackCooldown: 0,
  };
  state.enemies.push(enemy);
  return enemy;
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
  const next = nextStep(state, enemy.x, enemy.y);
  if (!next) return false;
  if (blocksAt(state, next.x, next.y)) {
    attack(state, enemy, attackTargetAt(state, next.x, next.y)!);
    return false;
  }
  enemy.tx = next.x;
  enemy.ty = next.y;
  return true;
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
