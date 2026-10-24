import { STRUCTURES, type StructureStats } from "../sim/config";
import { refundFor } from "../sim/economy";
import { baseAt, inBounds, isKeepTile, isSpawnTile, mountAt, topAt } from "../sim/grid";
import type { GameState, Point, Structure } from "../sim/types";

const FACING_NAMES = { N: "north", E: "east", S: "south", W: "west" };

/** Human-readable lines describing what is on a tile, for the hover info box. */
export function describeTile(state: GameState, p: Point): string[] {
  if (!inBounds(state, p.x, p.y)) return [];
  const lines: string[] = [];
  const top = topAt(state, p.x, p.y);

  if (isKeepTile(state, p.x, p.y)) {
    lines.push("Keep", `HP ${state.keep.hp} / ${state.keep.maxHp}`);
  } else if (top) {
    const mount = mountAt(state, p.x, p.y);
    const base = baseAt(state, p.x, p.y);
    if (mount) lines.push(...describeStructure(mount, base ? "on wall" : "ground"));
    if (base) lines.push(...describeStructure(base));
    lines.push(`Sells for ${refundFor(top)}g`);
  } else if (isSpawnTile(state, p.x, p.y)) {
    lines.push("Spawn zone");
  } else {
    lines.push("Open ground");
  }

  const enemies = state.enemies.filter((e) => Math.round(e.x) === p.x && Math.round(e.y) === p.y);
  for (const enemy of enemies.slice(0, 3)) {
    lines.push(`Enemy HP ${Math.ceil(enemy.hp)} / ${enemy.maxHp}`);
  }
  if (enemies.length > 3) lines.push(`...and ${enemies.length - 3} more`);
  return lines;
}

function describeStructure(structure: Structure, placement?: string): string[] {
  const stats: StructureStats = STRUCTURES[structure.kind];
  const facing = structure.facing ? `, facing ${FACING_NAMES[structure.facing]}` : "";
  const where = placement ? ` (${placement})` : "";
  const lines = [`${stats.name}${where}${facing}`];
  if (structure.maxHp > 0) lines.push(`HP ${Math.ceil(structure.hp)} / ${structure.maxHp}`);
  if (stats.tower) {
    const { range, minRange, damage, fireIntervalSeconds, splashRadius } = stats.tower;
    const reach = minRange > 0 ? `${minRange}-${range}` : `${range}`;
    const splash = splashRadius > 0 ? `, splash ${splashRadius}` : "";
    lines.push(`Range ${reach}, ${damage} dmg / ${fireIntervalSeconds}s${splash}`);
  }
  if (stats.trap) lines.push(`${stats.trap.damage} dmg / ${stats.trap.fireIntervalSeconds}s`);
  if (stats.income) lines.push(`+${stats.income.gold}g / ${stats.income.intervalSeconds}s`);
  return lines;
}
