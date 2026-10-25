import {
  ENCLOSURE_DISCOUNT,
  STRUCTURES,
  TREE_CLEAR_GOLD,
  type StructureStats,
} from "../sim/config";
import { playerName } from "../sim/players";
import {
  KEEP,
  NONE,
  OUTER,
  discountAt,
  enclosureAt,
  enclosureOwnerAt,
  priceAt,
} from "../sim/enclosures";
import { refundFor } from "../sim/economy";
import { IN_SIGHT, UNEXPLORED, isExplored, tierAt } from "../sim/fog";
import {
  baseAt,
  inBounds,
  isKeepTile,
  isSpawnTile,
  keepAt,
  mountAt,
  terrainAt,
  topAt,
} from "../sim/grid";
import type { GameState, PlayerId, Point, Structure, StructureKind, Terrain } from "../sim/types";

const FACING_NAMES = { N: "north", E: "east", S: "south", W: "west" };

const TERRAIN_DESCRIPTIONS: Record<Terrain, string> = {
  ground: "Open ground",
  ford: "Ford - a shallow river crossing",
  river: "River - build a bridge to cross",
  sea: "Sea",
  rock: "Rock - impassable",
  tree: `Tree - X to clear for ${TREE_CLEAR_GOLD}g`,
};

/** Human-readable lines describing what is on a tile, for the hover info box. */
export function describeTile(state: GameState, p: Point, viewer?: PlayerId): string[] {
  if (!inBounds(state, p.x, p.y)) return [];
  const tier = tierAt(state, p.x, p.y, viewer);
  if (tier === UNEXPLORED) return ["Unexplored"];
  const lines: string[] = [];
  const top = topAt(state, p.x, p.y);

  if (isKeepTile(state, p.x, p.y)) {
    const keep = keepAt(state, p.x, p.y)!;
    const whose = keep.owner !== null ? `${playerName(state, keep.owner)}'s keep` : "Keep";
    lines.push(whose, `HP ${keep.hp} / ${keep.maxHp}`);
  } else if (top) {
    const mount = mountAt(state, p.x, p.y);
    const base = baseAt(state, p.x, p.y);
    if (mount)
      lines.push(
        ...describeStructure(mount, base ? "on wall" : "ground"),
        ...builtBy(state, mount),
      );
    if (base) lines.push(...describeStructure(base), ...builtBy(state, base));
    lines.push(`Sells for ${refundFor(top)}g`);
  } else if (isSpawnTile(state, p.x, p.y)) {
    lines.push("Spawn zone");
  } else {
    lines.push(TERRAIN_DESCRIPTIONS[terrainAt(state, p.x, p.y)]);
  }

  for (const feature of state.features) {
    if (feature.kind === "chest" && feature.x === p.x && feature.y === p.y) {
      lines.push(`Treasure chest: ${feature.gold}g`, "Build here to claim it");
    }
  }

  // Out of sight, enemies aren't shown here either.
  const enemies =
    tier === IN_SIGHT
      ? state.enemies.filter((e) => Math.round(e.x) === p.x && Math.round(e.y) === p.y)
      : [];
  for (const enemy of enemies.slice(0, 3)) {
    lines.push(`Enemy HP ${Math.ceil(enemy.hp)} / ${enemy.maxHp}`);
  }
  if (enemies.length > 3) lines.push(`...and ${enemies.length - 3} more`);
  const enclosure = enclosureLine(state, p, viewer);
  if (enclosure) lines.push(enclosure);
  if (tier !== IN_SIGHT) lines.push("Out of sight: enemies here aren't shown");
  return lines;
}

/** Which enclosure a tile is in (or walls), and its discount. */
function enclosureLine(state: GameState, p: Point, viewer?: PlayerId): string | null {
  const kind = enclosureAt(state, p.x, p.y);
  const owner = enclosureOwnerAt(state, p.x, p.y);
  if (kind !== NONE && owner !== 0 && owner !== viewer) {
    return `Inside ${playerName(state, owner)}'s walls: you can't build here`;
  }
  if (kind === KEEP)
    return `Inside the keep's walls: builds ${percent(ENCLOSURE_DISCOUNT.keep)} off`;
  if (kind === OUTER) return `Enclosed: builds ${percent(ENCLOSURE_DISCOUNT.outer)} off`;
  return null;
}

/** What the selected build tool costs on this tile, e.g. "Wall here: 3g (50% off)". */
export function priceLine(
  state: GameState,
  kind: StructureKind,
  p: Point,
  viewer?: PlayerId,
): string {
  const name = (STRUCTURES[kind] as StructureStats).name;
  if (!isExplored(state, p.x, p.y, viewer)) return `${name}: can't build on unexplored land`;
  const price = priceAt(state, kind, p.x, p.y, viewer);
  // Label with the enclosure's discount (rounding can make the gold saving look different).
  const discount = discountAt(state, p.x, p.y, viewer);
  return discount > 0
    ? `${name} here: ${price}g (${percent(discount)} off)`
    : `${name} here: ${price}g`;
}

function percent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

/** "Built by Bo", only in games with more than one player. */
function builtBy(state: GameState, structure: Structure): string[] {
  if (structure.owner === null || Object.keys(state.players).length < 2) return [];
  return [`Built by ${playerName(state, structure.owner)}`];
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
    const { arcDegrees, turnDegreesPerSecond } = stats.tower;
    lines.push(
      turnDegreesPerSecond > 0
        ? `${arcDegrees}° arc, turns ${turnDegreesPerSecond}°/s`
        : `${arcDegrees}° arc, fixed`,
    );
  }
  if (stats.trap) lines.push(`${stats.trap.damage} dmg / ${stats.trap.fireIntervalSeconds}s`);
  if (stats.income) lines.push(`+${stats.income.gold}g / ${stats.income.intervalSeconds}s`);
  if (stats.sight) lines.push(`Sees ${stats.sight.inner} (land ${stats.sight.outer})`);
  return lines;
}
