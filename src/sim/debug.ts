// The debug Damage tool (offline only): wear something down, as fighting or working it would.
// Each click takes DEBUG_DAMAGE of the full amount off the top thing on the tile, through the
// game's own damage, so at 0 it's destroyed as it would be: an enemy or unit standing there,
// then a tower, then the structure under it, then the keep, then a resource (trees, rock,
// berries; used up, the tile is ground). Nobody is paid for any of it.
import { DEBUG_DAMAGE, TICK_RATE } from "./config";
import { awardBounties } from "./economy";
import { damageEnemy } from "./enemies";
import { baseAt, damageKeep, damageStructure, enemyOccupies, keepAt, mountAt } from "./grid";
import { fullWork, harvest, resourceAt } from "./resources";
import type { CommandResult, GameState } from "./types";
import { removeDeadUnits } from "./units";

export function debugDamage(state: GameState, x: number, y: number): CommandResult {
  const enemy = state.enemies.find((e) => e.hp > 0 && enemyOccupies(e, x, y));
  if (enemy) {
    damageEnemy(enemy, enemy.maxHp * DEBUG_DAMAGE, null);
    awardBounties(state); // a kill goes now, not at the next tick (the game may be paused)
    return { ok: true };
  }
  const unit = state.units.find((u) => u.hp > 0 && enemyOccupies(u, x, y));
  if (unit) {
    unit.hp -= unit.maxHp * DEBUG_DAMAGE; // exactly that share: no armour, unlike damageUnit
    removeDeadUnits(state);
    return { ok: true };
  }
  const structure = mountAt(state, x, y) ?? baseAt(state, x, y);
  if (structure) {
    damageStructure(state, structure, structure.maxHp * DEBUG_DAMAGE);
    return { ok: true };
  }
  const keep = keepAt(state, x, y);
  if (keep) {
    damageKeep(state, keep, keep.maxHp * DEBUG_DAMAGE);
    return { ok: true };
  }
  const resource = resourceAt(state, x, y);
  if (resource) {
    harvest(state, x, y, (fullWork(resource.terrain) * DEBUG_DAMAGE) / TICK_RATE, null);
    return { ok: true };
  }
  return { ok: false, reason: "Nothing to damage there" };
}
