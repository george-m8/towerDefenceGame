// Words for every kind of thing in the game (SPEC-beginner-help.md): a title, its one-line
// description, its numbers, short trait words and building hints. The build picker's cards, the
// Info box and the journal all read these, so they never disagree. Numbers always come from the
// stats, so the text stays right after a rebalance. Pure: no DOM.
import {
  ENCLOSURE_DISCOUNT,
  ENEMY_KINDS,
  STRUCTURES,
  UNIT_KINDS,
  type EnemyKind,
  type EnemyKindId,
  type SightStats,
  type StructureStats,
  type TowerStats,
  type UnitKind,
  type UnitKindId,
} from "../sim/config";
import type { StructureKind } from "../sim/types";

export type KindRef =
  | { type: "structure"; kind: StructureKind }
  | { type: "unit"; kind: UnitKindId }
  | { type: "enemy"; kind: EnemyKindId };

export interface KindDescription {
  title: string;
  description: string;
  /** Short lines of numbers, e.g. "6 dmg every 1s · range 5". */
  numbers: string[];
}

export function describeKind(ref: KindRef): KindDescription {
  switch (ref.type) {
    case "structure": {
      const stats: StructureStats = STRUCTURES[ref.kind];
      return {
        title: stats.name,
        description: stats.description,
        numbers: structureNumbers(stats),
      };
    }
    case "unit": {
      const kind: UnitKind = UNIT_KINDS[ref.kind];
      return { title: kind.name, description: kind.description, numbers: unitNumbers(kind) };
    }
    case "enemy": {
      const kind: EnemyKind = ENEMY_KINDS[ref.kind];
      return { title: kind.name, description: kind.description, numbers: enemyNumbers(kind) };
    }
  }
}

/** "6 dmg every 1s · range 5 · splash 1", then its arc: "90° arc, fixed". */
export function towerNumbers(tower: TowerStats): string[] {
  const reach = tower.minRange > 0 ? `${tower.minRange}-${tower.range}` : `${tower.range}`;
  const splash = tower.splashRadius > 0 ? ` · splash ${tower.splashRadius}` : "";
  const arc =
    tower.turnDegreesPerSecond > 0
      ? `${tower.arcDegrees}° arc, turns ${tower.turnDegreesPerSecond}°/s`
      : `${tower.arcDegrees}° arc, fixed`;
  return [`${tower.damage} dmg every ${tower.fireIntervalSeconds}s · range ${reach}${splash}`, arc];
}

function structureNumbers(stats: StructureStats): string[] {
  const lines: string[] = [];
  if (stats.maxHp > 0) lines.push(`HP ${stats.maxHp}`);
  if (stats.tower) lines.push(...towerNumbers(stats.tower));
  if (stats.trap) lines.push(`${stats.trap.damage} dmg every ${stats.trap.fireIntervalSeconds}s`);
  if (stats.income)
    lines.push(`+${perMinute(stats.income.gold, stats.income.intervalSeconds)}g a minute`);
  if (stats.farm) {
    const { goldPerField, intervalSeconds, maxFields } = stats.farm;
    lines.push(
      `+${perMinute(goldPerField, intervalSeconds)}g a minute per field, up to ${maxFields}`,
    );
  }
  if (stats.spawner) {
    const { unit, quota, intervalSeconds } = stats.spawner;
    const kind: UnitKind = UNIT_KINDS[unit];
    lines.push(`A ${kind.name.toLowerCase()} every ${intervalSeconds}s, up to ${quota} at once`);
    lines.push(`${kind.name}: ${unitNumbers(kind).slice(0, 2).join(", ")}`);
  }
  if (stats.sight) lines.push(sightLine(stats.sight));
  return lines;
}

function unitNumbers(kind: UnitKind): string[] {
  const lines = [kind.armour > 0 ? `HP ${kind.hp}, armour ${kind.armour}` : `HP ${kind.hp}`];
  if (kind.damage > 0)
    lines.push(`${kind.damage} dmg every ${kind.attackInterval}s, reach ${kind.range}`);
  lines.push(`Speed ${kind.speed}`, sightLine(kind.sight));
  return lines;
}

function enemyNumbers(kind: EnemyKind): string[] {
  return [
    `HP ${kind.hp}`,
    `${kind.damage} dmg every ${kind.attackInterval}s`,
    `Speed ${kind.speed}`,
    `Bounty ${kind.bounty}g`,
  ];
}

function sightLine(sight: SightStats): string {
  return `Sees ${sight.inner} tiles (land ${sight.outer})`;
}

/** Gold a minute from `gold` every `seconds`, to one decimal place at most. */
function perMinute(gold: number, seconds: number): number {
  return Math.round((gold * 60 * 10) / seconds) / 10;
}

/** Short words worked out from a structure's stats: "Splash damage", "Fixed: fires through a slit". */
export function traits(kind: StructureKind): string[] {
  const stats: StructureStats = STRUCTURES[kind];
  const words: string[] = [];
  const tower = stats.tower;
  if (tower) {
    if (tower.turnDegreesPerSecond === 0 && tower.arcDegrees < 360) {
      words.push("Fixed: fires through a slit");
    } else if (tower.turnDegreesPerSecond > 0 && tower.turnDegreesPerSecond < 45) {
      words.push("Turns slowly");
    }
    if (tower.splashRadius > 0) words.push("Splash damage");
    if (tower.minRange > 0) words.push(`Can't hit enemies closer than ${tower.minRange} tiles`);
    // towers.ts blastHitsOwn: splash towers hold fire rather than hit their owner's builds.
    if (tower.splashRadius > 0) words.push("Won't fire where its blast would hit your own walls");
  } else if (stats.layer === "mount") {
    words.push("Never fires");
  }
  if (stats.acceptsMount) words.push("Blocks enemies", "Towers can go on top");
  if (stats.enclosing && !stats.blocksMovement) words.push("Enemies walk through it");
  else if (!stats.blocksMovement && !stats.spansWater) words.push("Enemies walk over it");
  if (stats.income || stats.farm) words.push("Makes gold over time");
  return words;
}

/** Whether R turns it before placing: directional things and fixed-arc towers. */
export function canRotate(kind: StructureKind): boolean {
  const stats: StructureStats = STRUCTURES[kind];
  return stats.directional === true || stats.tower?.turnDegreesPerSecond === 0;
}

/** Tips for building one: turning it, where it's cheaper, where it can go. */
export function buildHints(kind: StructureKind): string[] {
  const stats: StructureStats = STRUCTURES[kind];
  const hints: string[] = [];
  if (canRotate(kind)) hints.push("R to rotate");
  if (stats.spansWater) hints.push("Only on a river");
  if (stats.layer === "mount") hints.push("Goes on open ground or on a wall");
  hints.push(
    `${percent(ENCLOSURE_DISCOUNT.keep)} off inside your keep's walls, ${percent(ENCLOSURE_DISCOUNT.outer)} inside other walls`,
    "Builds slower further from your keep",
  );
  return hints;
}

export function percent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}
