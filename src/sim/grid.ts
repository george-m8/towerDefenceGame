import { facingAngle } from "./aiming";
import { STRUCTURES, TERRAIN, TICK_RATE, type StructureStats, type TerrainStats } from "./config";
import { priceAt, rivalOwnerAt } from "./enclosures";
import { addBurst } from "./effects";
import { isExplored, reveal } from "./fog";
import { playerName } from "./players";
import type {
  CommandResult,
  Keep,
  Facing,
  GameState,
  PlayerId,
  Point,
  Structure,
  StructureKind,
  Terrain,
} from "./types";

export const EMPTY = 0;
export const KEEP_TILE = -1;

export function inBounds(state: GameState, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < state.width && y < state.height;
}

export function tileIndex(state: GameState, x: number, y: number): number {
  return y * state.width + x;
}

export function isKeepTile(state: GameState, x: number, y: number): boolean {
  return inBounds(state, x, y) && state.base[tileIndex(state, x, y)] === KEEP_TILE;
}

/** The keep covering (x, y), if any. */
export function keepAt(state: GameState, x: number, y: number): Keep | undefined {
  return state.keeps.find((k) => x >= k.x && y >= k.y && x < k.x + k.size && y < k.y + k.size);
}

export function isSpawnTile(state: GameState, x: number, y: number): boolean {
  return state.spawnTiles.some((p) => p.x === x && p.y === y);
}

export function terrainAt(state: GameState, x: number, y: number): Terrain {
  return state.terrain[tileIndex(state, x, y)];
}

/** Changes terrain at runtime (e.g. clearing a tree), so pathfinding recomputes. */
export function setTerrain(state: GameState, x: number, y: number, terrain: Terrain): void {
  state.terrain[tileIndex(state, x, y)] = terrain;
  state.gridVersion++;
}

/** Whether enemies (and later units) can stand here at all. Sea, river, rock and trees are impassable. */
export function isWalkable(state: GameState, x: number, y: number): boolean {
  if (!inBounds(state, x, y)) return false;
  if (TERRAIN[terrainAt(state, x, y)].walkable) return true;
  return isBridge(baseAt(state, x, y));
}

function isBridge(structure: Structure | undefined): boolean {
  if (!structure || !isBuilt(structure)) return false;
  const stats: StructureStats = STRUCTURES[structure.kind];
  return stats.spansWater === true;
}

function structureIn(state: GameState, layer: number[], x: number, y: number) {
  if (!inBounds(state, x, y)) return undefined;
  const id = layer[tileIndex(state, x, y)];
  return id > 0 ? state.structures[id] : undefined;
}

/** What the tile is built from: a wall, spikes, a house. */
export function baseAt(state: GameState, x: number, y: number): Structure | undefined {
  return structureIn(state, state.base, x, y);
}

/** The tower standing on the tile, on a wall or on open ground. */
export function mountAt(state: GameState, x: number, y: number): Structure | undefined {
  return structureIn(state, state.mount, x, y);
}

/** The topmost structure: what you see, hover and sell first. */
export function topAt(state: GameState, x: number, y: number): Structure | undefined {
  return mountAt(state, x, y) ?? baseAt(state, x, y);
}

/** False while it's still being built (see sim/building.ts): until then it does nothing. */
export function isBuilt(structure: Structure): boolean {
  return !structure.buildLeft;
}

/** A built structure that enemies can't walk through: a wall, a house, any tower. */
function blocks(structure: Structure | undefined): structure is Structure {
  return structure !== undefined && isBuilt(structure) && STRUCTURES[structure.kind].blocksMovement;
}

/** True if enemies can't walk onto the tile: a blocking base, or any tower (once built). */
export function blocksAt(state: GameState, x: number, y: number): boolean {
  return blocks(mountAt(state, x, y)) || blocks(baseAt(state, x, y));
}

/** What an enemy hits when this tile blocks its route: the wall first, so it shields its tower. */
export function attackTargetAt(state: GameState, x: number, y: number): Structure | undefined {
  const base = baseAt(state, x, y);
  if (blocks(base)) return base;
  const mount = mountAt(state, x, y);
  return blocks(mount) ? mount : undefined;
}

/** A tower is elevated when it stands on a wall rather than open ground. */
export function isElevated(state: GameState, tower: Structure): boolean {
  return baseAt(state, tower.x, tower.y) !== undefined;
}

/** True if the enemy is on, or moving between, tiles that include (x, y). */
/** Whether an enemy (or unit) at its position, maybe between tiles, is on (x, y). */
export function enemyOccupies(enemy: Point, x: number, y: number): boolean {
  return (
    (Math.floor(enemy.x) === x && Math.floor(enemy.y) === y) ||
    (Math.ceil(enemy.x) === x && Math.ceil(enemy.y) === y)
  );
}

export function canBuild(
  state: GameState,
  player: PlayerId,
  kind: StructureKind,
  x: number,
  y: number,
): CommandResult {
  if (state.gameOver) return { ok: false, reason: "Game over" };
  const stats: StructureStats = STRUCTURES[kind];
  if (stats.buildable === false) return { ok: false, reason: `${stats.name}s can't be built` };
  if (!inBounds(state, x, y)) return { ok: false, reason: "Out of bounds" };
  if (!isExplored(state, x, y, player)) {
    return { ok: false, reason: "Can't build on unexplored land" };
  }
  const rival = rivalOwnerAt(state, x, y, player);
  if (rival !== null) {
    return { ok: false, reason: `That's inside ${playerName(state, rival)}'s walls` };
  }
  if (isKeepTile(state, x, y)) return { ok: false, reason: "Can't build on the keep" };
  if (isSpawnTile(state, x, y)) return { ok: false, reason: "Can't build in the spawn zone" };
  const terrainCheck = canBuildOnTerrain(state, kind, x, y);
  if (!terrainCheck.ok) return terrainCheck;
  const layerCheck =
    STRUCTURES[kind].layer === "mount" ? canMount(state, player, x, y) : canBuildBase(state, x, y);
  if (!layerCheck.ok) return layerCheck;
  const gold = state.players[player]?.gold ?? 0;
  if (!state.debug.infiniteGold && gold < priceAt(state, kind, x, y, player)) {
    return { ok: false, reason: "Not enough gold" };
  }
  return { ok: true };
}

function canBuildOnTerrain(
  state: GameState,
  kind: StructureKind,
  x: number,
  y: number,
): CommandResult {
  const terrain: TerrainStats = TERRAIN[terrainAt(state, x, y)];
  const stats: StructureStats = STRUCTURES[kind];
  const spansWater = stats.spansWater === true;
  if (terrain.buildable === "none") {
    return { ok: false, reason: `Can't build on ${terrain.name.toLowerCase()}` };
  }
  // Once a river is bridged, the layer rules decide (no towers on bridges, no stacking).
  if (terrain.buildable === "bridgeOnly" && !spansWater && !baseAt(state, x, y)) {
    return { ok: false, reason: "Only bridges can be built on rivers" };
  }
  if (terrain.buildable === "any" && spansWater) {
    return { ok: false, reason: "Bridges can only be built on rivers" };
  }
  return { ok: true };
}

/** A base needs open ground: nothing built there, and no enemy standing on it. */
function canBuildBase(state: GameState, x: number, y: number): CommandResult {
  if (topAt(state, x, y)) return { ok: false, reason: "Tile is occupied" };
  return noEnemyAt(state, x, y);
}

/**
 * A tower goes on open ground, or on a base that accepts mounts (a wall) with no tower yet.
 * The wall must be the player's own or neutral (a ruin).
 */
function canMount(state: GameState, player: PlayerId, x: number, y: number): CommandResult {
  if (mountAt(state, x, y)) return { ok: false, reason: "A tower is already here" };
  const base = baseAt(state, x, y);
  if (!base) return noEnemyAt(state, x, y);
  const stats: StructureStats = STRUCTURES[base.kind];
  if (!stats.acceptsMount) {
    return { ok: false, reason: `Can't put a tower on ${stats.name.toLowerCase()}` };
  }
  if (base.owner !== null && base.owner !== player) {
    return { ok: false, reason: `That wall belongs to ${playerName(state, base.owner)}` };
  }
  return { ok: true }; // nothing walks on a wall, so enemies can't be in the way
}

function noEnemyAt(state: GameState, x: number, y: number): CommandResult {
  if (state.enemies.some((e) => enemyOccupies(e, x, y))) {
    return { ok: false, reason: "An enemy is in the way" };
  }
  return { ok: true };
}

function layerOf(state: GameState, kind: StructureKind): number[] {
  return STRUCTURES[kind].layer === "mount" ? state.mount : state.base;
}

export function placeStructure(
  state: GameState,
  kind: StructureKind,
  x: number,
  y: number,
  facing: Facing = "N",
  owner: PlayerId | null = null,
): Structure {
  const stats: StructureStats = STRUCTURES[kind];
  const structure: Structure = {
    id: state.nextId++,
    kind,
    x,
    y,
    hp: stats.maxHp,
    maxHp: stats.maxHp,
    cooldown: initialCooldown(stats),
    owner,
  };
  if (stats.directional || stats.tower) structure.facing = facing;
  if (stats.tower && stats.tower.turnDegreesPerSecond > 0) structure.aim = facingAngle(facing);
  state.structures[structure.id] = structure;
  layerOf(state, kind)[tileIndex(state, x, y)] = structure.id;
  reveal(state, structure);
  state.gridVersion++;
  return structure;
}

/** Traps and income start their cycle when built; towers can fire straight away. */
function initialCooldown(stats: StructureStats): number {
  const seconds = stats.trap?.fireIntervalSeconds ?? stats.income?.intervalSeconds ?? 0;
  return seconds * TICK_RATE;
}

/** Removing a base also removes any tower standing on it: it falls with its wall. */
export function removeStructure(state: GameState, structure: Structure): void {
  if (STRUCTURES[structure.kind].layer === "base") {
    const mount = mountAt(state, structure.x, structure.y);
    if (mount) removeStructure(state, mount);
  }
  delete state.structures[structure.id];
  layerOf(state, structure.kind)[tileIndex(state, structure.x, structure.y)] = EMPTY;
  state.gridVersion++;
}

/** Damages a keep, never below 0, unless the infinite keep health debug option is on. */
export function damageKeep(state: GameState, keep: Keep, amount: number): void {
  if (state.debug.infiniteKeep) return;
  keep.hp = Math.max(0, keep.hp - amount);
}

/** Damages a structure; at 0 HP it's destroyed and bursts apart (a tower on it falls too). */
export function damageStructure(state: GameState, structure: Structure, amount: number): void {
  structure.hp -= amount;
  if (structure.hp > 0) return;
  const falling =
    STRUCTURES[structure.kind].layer === "base"
      ? mountAt(state, structure.x, structure.y)
      : undefined;
  for (const s of [structure, falling]) if (s) addBurst(state, s.x, s.y, { structure: s.kind });
  removeStructure(state, structure);
}
