import {
  ENCLOSURE_DISCOUNT,
  ENEMY_KINDS,
  RESOURCES,
  STRUCTURES,
  TERRAIN,
  TREE_CLEAR_GOLD,
  UNIT_KINDS,
  type StructureStats,
  type UnitKind,
} from "../sim/config";
import { resourceAt } from "../sim/resources";
import { workableFrom } from "../sim/units";
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
import { livingLeader } from "../sim/enemies";
import type {
  Unit,
  Enemy,
  GameState,
  PlayerId,
  Point,
  Structure,
  StructureKind,
  Terrain,
} from "../sim/types";
import { isBuildTool, type UiState } from "./state";

const FACING_NAMES = { N: "north", E: "east", S: "south", W: "west" };

const TERRAIN_DESCRIPTIONS: Record<Terrain, string> = {
  ground: "Open ground",
  ford: "Ford - a shallow river crossing",
  river: "River - build a bridge to cross",
  sea: "Sea",
  rock: "Rock - impassable",
  tree: `Tree - X to clear for ${TREE_CLEAR_GOLD}g`,
  goldRock: "Gold-veined rock - impassable",
  berries: "Berry bush",
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
    const resource = resourceAt(state, p.x, p.y);
    if (resource) {
      const { word, value } = RESOURCES[resource.terrain];
      const name = TERRAIN[resource.terrain].name;
      lines.push(
        `${name} - ${resource.left} of ${resource.start} ${word} left (${resource.left * value}g)`,
      );
      if (resource.terrain === "tree") lines.push(`X to clear for ${TREE_CLEAR_GOLD}g`);
    } else {
      lines.push(TERRAIN_DESCRIPTIONS[terrainAt(state, p.x, p.y)]);
    }
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
    const kind = ENEMY_KINDS[enemy.kind];
    const name =
      kind.variants.length > 1 ? `${kind.name} ${kind.variants[enemy.variant].name}` : kind.name;
    const doing = enemyDoing(state, enemy);
    lines.push(`${name}, HP ${Math.ceil(enemy.hp)} / ${enemy.maxHp}${doing ? `, ${doing}` : ""}`);
  }
  if (enemies.length > 3) lines.push(`...and ${enemies.length - 3} more`);
  // Units in sight: your own always are (they see), a rival's only where you can see.
  if (tier === IN_SIGHT) {
    for (const unit of state.units) {
      if (Math.round(unit.x) !== p.x || Math.round(unit.y) !== p.y) continue;
      const whose = playerName(state, unit.owner);
      const doing = unitDoing(state, unit);
      lines.push(
        `${UNIT_KINDS[unit.kind].name} (${whose}'s), HP ${Math.ceil(unit.hp)} / ${unit.maxHp}` +
          (doing ? `, ${doing}` : ""),
      );
    }
  }
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

/** What an enemy is up to beyond walking: "sprinting", "digging", "with its chief". */
function enemyDoing(state: GameState, enemy: Enemy): string | null {
  if (enemy.mode !== "walking") return enemy.mode;
  const leader = livingLeader(state, enemy);
  if (!leader) return null;
  // The last word of the leader's name: "Barbarian chief" leads "with its chief".
  return `with its ${ENEMY_KINDS[leader.kind].name.split(" ").pop()!.toLowerCase()}`;
}

/** What the info boxes show: the price of the selected tool here, then the tile's details. */
export function hoverText(state: GameState, ui: UiState): string {
  if (!ui.hover) return "";
  const lines = describeTile(state, ui.hover, ui.playerId);
  if (isBuildTool(ui.tool)) lines.unshift(priceLine(state, ui.tool, ui.hover, ui.playerId));
  return lines.join("\n");
}

/** What a worker is up to: its work ("chopping"), walking, or idle. Other units say nothing. */
function unitDoing(state: GameState, unit: Unit): string | null {
  const kind: UnitKind = UNIT_KINDS[unit.kind];
  if (!kind.gathers) return null;
  const between = !Number.isInteger(unit.x) || !Number.isInteger(unit.y);
  if (!between && workableFrom(state, unit.x, unit.y, kind.gathers)) return kind.working ?? null;
  return between || (unit.path?.length ?? 0) > 0 ? "walking" : "idle: nothing to gather";
}
