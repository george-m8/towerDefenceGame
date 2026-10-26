// Turns the server's GameState into what clients receive. Shared and pure.
import { ENEMY_KIND_ORDER, UNIT_KIND_ORDER } from "../sim/config";
import { livingLeader } from "../sim/enemies";
import type { Enemy, GameState, Structure, Unit } from "../sim/types";
import type {
  ClientEnemy,
  ClientState,
  ClientStructure,
  ClientUnit,
  StateUpdate,
  UpdateEnemy,
  UpdateUnit,
} from "./protocol";

/** The whole game as a client needs it (sent on welcome and restart). */
export function toClientState(state: GameState): ClientState {
  const { flows: _flows, rngState: _rng, enemies, units, structures, ...rest } = state;
  return {
    ...rest,
    enemies: enemies.map((e) => toClientEnemy(state, e)),
    units: units.map(toClientUnit),
    structures: toClientStructures(structures),
  };
}

/**
 * What the clients were last sent, so the next update only carries what changed. The room
 * keeps one; it starts from the state everyone was welcomed with.
 */
export interface SentState {
  gridVersion: number;
  sightVersion: number;
  terrain: GameState["terrain"];
  base: number[];
  mount: number[];
  explored: number[];
  resources: number[];
  /** The chest list as sent; claiming a chest replaces the list, so a new list means a change. */
  features: GameState["features"];
  structures: Map<number, ClientStructure>;
  /** Enemies whose kind and variant the clients already have. */
  enemies: Set<number>;
  /** Units whose kind and owner the clients already have. */
  units: Set<number>;
}

/** A baseline matching `state` as it is now (what a welcome snapshot carries). */
export function sentStateOf(state: GameState): SentState {
  return {
    gridVersion: state.gridVersion,
    sightVersion: state.sightVersion,
    terrain: [...state.terrain],
    base: [...state.base],
    mount: [...state.mount],
    explored: [...state.explored],
    resources: [...state.resources],
    features: state.features,
    structures: new Map(
      Object.values(state.structures).map((s) => [s.id, toClientStructure(s)] as const),
    ),
    enemies: new Set(state.enemies.map((e) => e.id)),
    units: new Set(state.units.map((u) => u.id)),
  };
}

/**
 * The next update: what changes every tick, plus whatever changed since `sent`, which is
 * moved on to match what this update brings the clients to.
 */
export function toUpdate(state: GameState, sent: SentState): StateUpdate {
  const update: StateUpdate = {
    tick: state.tick,
    gridVersion: state.gridVersion,
    sightVersion: state.sightVersion,
    enemies: state.enemies.map((e) => toUpdateEnemy(state, e, sent.enemies.has(e.id))),
    units: state.units.map((u) => toUpdateUnit(u, sent.units.has(u.id))),
    effects: state.effects,
    cues: state.cues,
    players: state.players,
    wave: state.wave,
    keeps: state.keeps,
    winner: state.winner,
    paused: state.paused,
    speed: state.speed,
    gameOver: state.gameOver,
    fog: state.fog,
  };

  sent.enemies = new Set(state.enemies.map((e) => e.id));
  sent.units = new Set(state.units.map((u) => u.id));

  const changed: ClientStructure[] = [];
  for (const structure of Object.values(state.structures)) {
    const now = toClientStructure(structure);
    const before = sent.structures.get(structure.id);
    if (before && sameStructure(before, now)) continue;
    changed.push(now);
    sent.structures.set(structure.id, now);
  }
  const removed: number[] = [];
  for (const id of sent.structures.keys()) {
    if (state.structures[id]) continue;
    removed.push(id);
    sent.structures.delete(id);
  }
  if (changed.length > 0) update.structures = changed;
  if (removed.length > 0) update.removed = removed;

  // Harvesting changes resources without changing the grid, so they're checked every time.
  const resources = changedTiles(state.resources, sent.resources);
  if (resources.length > 0) update.tiles = { resources };

  // Units explore as they walk, which changes sight but not the grid.
  if (state.gridVersion !== sent.gridVersion || state.sightVersion !== sent.sightVersion) {
    const tiles: NonNullable<StateUpdate["tiles"]> = update.tiles ?? {};
    const terrain = changedTiles(state.terrain, sent.terrain);
    const base = changedTiles(state.base, sent.base);
    const mount = changedTiles(state.mount, sent.mount);
    const explored = changedTiles(state.explored, sent.explored);
    if (terrain.length > 0) tiles.terrain = terrain;
    if (base.length > 0) tiles.base = base;
    if (mount.length > 0) tiles.mount = mount;
    if (explored.length > 0) tiles.explored = explored;
    if (Object.keys(tiles).length > 0) update.tiles = tiles;
    sent.gridVersion = state.gridVersion;
    sent.sightVersion = state.sightVersion;
  }
  if (state.features !== sent.features) {
    update.features = state.features;
    sent.features = state.features;
  }
  return update;
}

/** Tiles of one layer that differ from what was sent, as [index, value]; `sent` catches up. */
function changedTiles<T>(now: T[], sent: T[]): [number, T][] {
  const changes: [number, T][] = [];
  for (let i = 0; i < now.length; i++) {
    if (now[i] === sent[i]) continue;
    changes.push([i, now[i]]);
    sent[i] = now[i];
  }
  return changes;
}

function sameStructure(a: ClientStructure, b: ClientStructure): boolean {
  const keys = Object.keys(b) as (keyof ClientStructure)[];
  return keys.length === Object.keys(a).length && keys.every((k) => a[k] === b[k]);
}

function toClientEnemy(state: GameState, enemy: Enemy): ClientEnemy {
  const client: ClientEnemy = {
    id: enemy.id,
    x: round2(enemy.x),
    y: round2(enemy.y),
    hp: enemy.hp,
    maxHp: enemy.maxHp,
    kind: ENEMY_KIND_ORDER.indexOf(enemy.kind),
    variant: enemy.variant,
  };
  if (enemy.mode !== "walking") client.mode = enemy.mode;
  if (livingLeader(state, enemy)) client.leaderId = enemy.leaderId!;
  return client;
}

/** An enemy as an update carries it: kind and variant only if the clients don't have them. */
function toUpdateEnemy(state: GameState, enemy: Enemy, known: boolean): UpdateEnemy {
  if (!known) return toClientEnemy(state, enemy);
  const { kind: _kind, variant: _variant, ...rest } = toClientEnemy(state, enemy);
  return rest;
}

function toClientUnit(unit: Unit): ClientUnit {
  return {
    id: unit.id,
    x: round2(unit.x),
    y: round2(unit.y),
    hp: unit.hp,
    maxHp: unit.maxHp,
    owner: unit.owner,
    kind: UNIT_KIND_ORDER.indexOf(unit.kind),
  };
}

/** A unit as an update carries it: kind and owner only if the clients don't have them. */
function toUpdateUnit(unit: Unit, known: boolean): UpdateUnit {
  if (!known) return toClientUnit(unit);
  const { kind: _kind, owner: _owner, ...rest } = toClientUnit(unit);
  return rest;
}

function toClientStructures(
  structures: Record<number, Structure>,
): Record<number, ClientStructure> {
  const result: Record<number, ClientStructure> = {};
  for (const structure of Object.values(structures)) {
    result[structure.id] = toClientStructure(structure);
  }
  return result;
}

/** A structure without its firing cooldown, which only the server needs. */
function toClientStructure({ cooldown: _cooldown, ...rest }: Structure): ClientStructure {
  return rest;
}

/** Positions only need to be precise enough to draw; this keeps updates small. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
