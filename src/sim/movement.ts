// Tile-to-tile stepping, shared by every way an enemy moves (walking its field, sprinting).
import { TICK_RATE } from "./config";
import type { Enemy } from "./types";

const EPSILON = 1e-9;

/**
 * Moves the enemy one tick's worth at `speed` tiles per second, carrying leftover movement
 * across tile centres so speed stays constant. At each tile centre `chooseNext` either sets
 * the next tile (`tx`, `ty`) and returns true, or returns false to stop for this tick.
 */
export function walk(enemy: Enemy, speed: number, chooseNext: () => boolean): void {
  let budget = speed / TICK_RATE;
  while (budget > EPSILON) {
    if (atTileCentre(enemy) && !chooseNext()) return;
    budget -= moveTowardsTarget(enemy, budget);
  }
}

export function atTileCentre(enemy: Enemy): boolean {
  return enemy.x === enemy.tx && enemy.y === enemy.ty;
}

/** Sets the next tile to walk to, remembering the one being left. */
export function stepTo(enemy: Enemy, x: number, y: number): void {
  enemy.px = enemy.x;
  enemy.py = enemy.y;
  enemy.tx = x;
  enemy.ty = y;
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
