import { EFFECT_TICKS, STRUCTURES, TICK_RATE, type StructureStats, type TrapStats } from "./config";
import type { GameState, Point, Structure } from "./types";

export function updateTraps(state: GameState): void {
  for (const structure of Object.values(state.structures)) {
    const stats: StructureStats = STRUCTURES[structure.kind];
    if (stats.trap) updateTrap(state, structure, stats.trap);
  }
}

function updateTrap(state: GameState, structure: Structure, trap: TrapStats) {
  structure.cooldown--;
  if (structure.cooldown > 0) return;
  structure.cooldown = trap.fireIntervalSeconds * TICK_RATE;

  const target = hitTile(structure);
  for (const enemy of state.enemies) {
    if (Math.round(enemy.x) === target.x && Math.round(enemy.y) === target.y) {
      enemy.hp -= trap.damage;
    }
  }
  state.effects.push({ kind: "spikes", x: target.x, y: target.y, ttl: EFFECT_TICKS });
}

/** The tile a trap's spikes come out on. */
export function hitTile(structure: Structure): Point {
  return { x: structure.x, y: structure.y };
}
