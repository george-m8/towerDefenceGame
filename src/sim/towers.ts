import {
  EFFECT_TICKS,
  STRUCTURES,
  TICK_RATE,
  type StructureStats,
  type TowerStats,
} from "./config";
import { distanceAt } from "./pathfinding";
import type { Enemy, GameState, Structure } from "./types";

export function updateTowers(state: GameState): void {
  for (const structure of Object.values(state.structures)) {
    const stats: StructureStats = STRUCTURES[structure.kind];
    if (stats.tower) updateTower(state, structure, stats.tower);
  }
}

function updateTower(state: GameState, structure: Structure, tower: TowerStats) {
  structure.cooldown = Math.max(0, structure.cooldown - 1);
  if (structure.cooldown > 0) return;

  const target = findTarget(state, structure, tower);
  if (!target) return;

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

/** The living, in-range enemy closest to the keep by path distance (ties: lowest id). */
function findTarget(state: GameState, structure: Structure, tower: TowerStats): Enemy | undefined {
  let best: Enemy | undefined;
  let bestDist = Infinity;
  for (const enemy of state.enemies) {
    if (enemy.hp <= 0) continue;
    const range = Math.hypot(enemy.x - structure.x, enemy.y - structure.y);
    if (range > tower.range || range < tower.minRange) continue;
    const dist = distanceAt(state, Math.round(enemy.x), Math.round(enemy.y));
    if (dist < bestDist || (dist === bestDist && best && enemy.id < best.id)) {
      best = enemy;
      bestDist = dist;
    }
  }
  return best;
}
