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
import { farmFields, farmhouseFor } from "../sim/farms";
import { fieldActivity } from "../sim/fieldUnits";
import { resourceAt } from "../sim/resources";
import { guardActivity, workableFrom } from "../sim/units";
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
  replacedBy,
  terrainAt,
  topAt,
} from "../sim/grid";
import { livingLeader } from "../sim/enemies";
import type {
  Unit,
  Enemy,
  Facing,
  GameState,
  PlayerId,
  Point,
  Structure,
  StructureKind,
  Terrain,
} from "../sim/types";
import { canRotate, describeKind, traits } from "./describe";
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
/**
 * With a tool selected the box stays short (`brief`): what's on the tile by name and HP, without
 * descriptions or numbers. Building, the price line above says where it's cheaper, so the
 * enclosure line and sell price go too; selling keeps the sell price.
 */
export type Brief = "build" | "sell";

export function describeTile(
  state: GameState,
  p: Point,
  viewer?: PlayerId,
  brief?: Brief,
): string[] {
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
        ...describeStructure(mount, base ? "on wall" : "ground", brief),
        ...builtBy(state, mount),
      );
    if (base)
      lines.push(
        ...describeStructure(base, undefined, brief),
        ...farmLines(state, base),
        ...builtBy(state, base),
      );
    if (brief !== "build") lines.push(`Sells for ${refundFor(top)}g`);
  } else if (isSpawnTile(state, p.x, p.y)) {
    lines.push("Spawn zone");
  } else {
    const resource = resourceAt(state, p.x, p.y);
    if (resource) {
      const { word } = RESOURCES[resource.terrain];
      const name = TERRAIN[resource.terrain].name;
      lines.push(`${name} - ${resource.goldLeft} of ${resource.worth}g of ${word} left`);
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
  for (const [i, enemy] of enemies.slice(0, 3).entries()) {
    const kind = ENEMY_KINDS[enemy.kind];
    const name =
      kind.variants.length > 1 ? `${kind.name} ${kind.variants[enemy.variant].name}` : kind.name;
    const doing = enemyDoing(state, enemy);
    lines.push(`${name}, HP ${Math.ceil(enemy.hp)} / ${enemy.maxHp}${doing ? `, ${doing}` : ""}`);
    // Only the first gets the full entry, so a crowded tile stays short.
    if (i === 0 && !brief) lines.push(kind.description, enemyNumbers(enemy));
  }
  if (enemies.length > 3) lines.push(`...and ${enemies.length - 3} more`);
  // Units in sight: your own always are (they see), a rival's only where you can see.
  if (tier === IN_SIGHT) {
    let detailed = false;
    for (const unit of state.units) {
      if (Math.round(unit.x) !== p.x || Math.round(unit.y) !== p.y) continue;
      const whose = playerName(state, unit.owner);
      const doing = unitDoing(state, unit);
      lines.push(
        `${UNIT_KINDS[unit.kind].name} (${whose}'s), HP ${Math.ceil(unit.hp)} / ${unit.maxHp}` +
          (doing ? `, ${doing}` : ""),
      );
      if (!detailed && !brief) lines.push(...unitDetails(unit));
      detailed = true;
    }
  }
  const enclosure = brief === "build" ? null : enclosureLine(state, p, viewer);
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

/**
 * What the selected build tool costs on this tile, and where it would be cheaper:
 * "Wall here: 3g (50% off inside the keep's walls)", or "Wall here: 5g · 3g inside your keep's
 * walls". A tool that turns adds its facing: "· facing north (R to rotate)".
 */
export function priceLine(
  state: GameState,
  kind: StructureKind,
  p: Point,
  viewer?: PlayerId,
  facing?: Facing,
): string {
  const stats: StructureStats = STRUCTURES[kind];
  if (!isExplored(state, p.x, p.y, viewer)) return `${stats.name}: can't build on unexplored land`;
  const price = priceAt(state, kind, p.x, p.y, viewer);
  // Label with the enclosure's discount (rounding can make the gold saving look different).
  const discount = discountAt(state, p.x, p.y, viewer);
  const where = enclosureAt(state, p.x, p.y) === KEEP ? "the keep's walls" : "walls";
  const keepPrice = Math.max(1, Math.round(stats.cost * (1 - ENCLOSURE_DISCOUNT.keep)));
  const priced =
    discount > 0
      ? `${stats.name} here: ${price}g (${percent(discount)} off inside ${where})`
      : keepPrice < price
        ? `${stats.name} here: ${price}g · ${keepPrice}g inside your keep's walls`
        : `${stats.name} here: ${price}g`;
  // A gate on a wall sells the wall first.
  const replaced = replacedBy(state, kind, p.x, p.y);
  const line = replaced
    ? `${priced} · ${STRUCTURES[replaced.kind].name.toLowerCase()} refunds ${refundFor(replaced)}g`
    : priced;
  return facing && canRotate(kind)
    ? `${line} · facing ${FACING_NAMES[facing]} (R to rotate)`
    : line;
}

function percent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

/** "Built by Bo", only in games with more than one player. */
function builtBy(state: GameState, structure: Structure): string[] {
  if (structure.owner === null || Object.keys(state.players).length < 2) return [];
  return [`Built by ${playerName(state, structure.owner)}`];
}

function describeStructure(structure: Structure, placement?: string, brief?: Brief): string[] {
  const stats: StructureStats = STRUCTURES[structure.kind];
  const facing = structure.facing ? `, facing ${FACING_NAMES[structure.facing]}` : "";
  const where = placement ? ` (${placement})` : "";
  const lines = [`${stats.name}${where}${facing}`];
  if (structure.maxHp > 0) lines.push(`HP ${Math.ceil(structure.hp)} / ${structure.maxHp}`);
  if (brief) return lines;
  lines.push(stats.description);
  // Its numbers, without the kind's full HP (the line above has this one's).
  const { numbers } = describeKind({ type: "structure", kind: structure.kind });
  lines.push(...numbers.filter((line) => !line.startsWith("HP ")));
  const words = traits(structure.kind);
  if (words.length > 0) lines.push(words.join(" · "));
  return lines;
}

/** This enemy's own numbers (its variant and wave change them): "5 dmg every 1s · speed 1.5". */
function enemyNumbers(enemy: Enemy): string {
  const kind = ENEMY_KINDS[enemy.kind];
  const speed = Math.round(enemy.speed * 100) / 100;
  return `${enemy.damage} dmg every ${kind.attackInterval}s · speed ${speed} · bounty ${enemy.bounty}g`;
}

/** A unit's description and numbers, without HP (its own line has that). */
function unitDetails(unit: Unit): string[] {
  const kind: UnitKind = UNIT_KINDS[unit.kind];
  const [, ...numbers] = describeKind({ type: "unit", kind: unit.kind }).numbers;
  const armour = kind.armour > 0 ? [`armour ${kind.armour}`] : [];
  return [kind.description, [...armour, ...numbers].join(" · ")];
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
  const brief = ui.tool === null ? undefined : isBuildTool(ui.tool) ? "build" : "sell";
  const lines = describeTile(state, ui.hover, ui.playerId, brief);
  if (isBuildTool(ui.tool))
    lines.unshift(priceLine(state, ui.tool, ui.hover, ui.playerId, ui.facing));
  return lines.join("\n");
}

/** What a unit is up to: a guard's activity, a worker's work ("chopping"), walking or idle. */
function unitDoing(state: GameState, unit: Unit): string | null {
  const kind: UnitKind = UNIT_KINDS[unit.kind];
  if (kind.behaviour === "guard") return guardActivity(state, unit);
  if (kind.behaviour === "scout" || kind.behaviour === "attack") return fieldActivity(state, unit);
  if (!kind.gathers) return null;
  const between = !Number.isInteger(unit.x) || !Number.isInteger(unit.y);
  if (!between && workableFrom(state, unit.x, unit.y, kind.gathers)) return kind.working ?? null;
  return between || (unit.path?.length ?? 0) > 0 ? "walking" : "idle: nothing to gather";
}

/** A farmhouse's fields and earnings, or which farmhouse a field counts for. */
function farmLines(state: GameState, structure: Structure): string[] {
  const stats: StructureStats = STRUCTURES[structure.kind];
  if (stats.farm) {
    const { goldPerField, intervalSeconds, maxFields } = stats.farm;
    const fields = farmFields(state).get(structure.id)?.length ?? 0;
    return [
      `Farmhouse - ${fields} of ${maxFields} fields, +${fields * goldPerField}g every ${intervalSeconds}s`,
    ];
  }
  if (!stats.field) return [];
  const farmhouse = farmhouseFor(state, structure);
  return [
    farmhouse
      ? `Farmland - counts for the farmhouse at ${farmhouse.x}, ${farmhouse.y}`
      : "Farmland - not joined to a farmhouse",
  ];
}
