import { EFFECT_TICKS, STRUCTURES, TICK_RATE, type StructureStats, type TrapStats } from "./config";
import { addCue } from "./cues";
import { damageEnemy } from "./enemies";
import { isBuilt } from "./grid";
import type { Facing, GameState, Point, Structure } from "./types";

export function updateTraps(state: GameState): void {
  for (const structure of Object.values(state.structures)) {
    const stats: StructureStats = STRUCTURES[structure.kind];
    if (stats.trap && isBuilt(structure)) updateTrap(state, structure, stats.trap);
  }
}

function updateTrap(state: GameState, structure: Structure, trap: TrapStats) {
  structure.cooldown--;
  if (structure.cooldown > 0) return;
  structure.cooldown = trap.fireIntervalSeconds * TICK_RATE;

  const target = hitTile(structure);
  let hit = false;
  for (const enemy of state.enemies) {
    if (Math.round(enemy.x) === target.x && Math.round(enemy.y) === target.y) {
      damageEnemy(enemy, trap.damage, structure.owner);
      hit = true;
    }
  }
  if (hit) addCue(state, "enemyHit");
  state.effects.push({ kind: "spikes", x: target.x, y: target.y, ttl: EFFECT_TICKS });
}

/** The tile a trap's spikes come out on. */
export function hitTile(structure: Pick<Structure, "x" | "y" | "facing">): Point {
  if (!structure.facing) return { x: structure.x, y: structure.y };
  const offset = FACING_OFFSETS[structure.facing];
  return { x: structure.x + offset.x, y: structure.y + offset.y };
}

export const FACING_OFFSETS: Record<Facing, Point> = {
  N: { x: 0, y: -1 },
  E: { x: 1, y: 0 },
  S: { x: 0, y: 1 },
  W: { x: -1, y: 0 },
};
