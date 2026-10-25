// Turns the server's GameState into what clients receive. Shared and pure.
import { ENEMY_KIND_ORDER } from "../sim/config";
import type { GameState, Structure } from "../sim/types";
import type { ClientEnemy, ClientState, ClientStructure, StateUpdate } from "./protocol";

/** The whole game as a client needs it (sent on welcome and restart). */
export function toClientState(state: GameState): ClientState {
  const { flow: _flow, rngState: _rng, enemies, structures, ...rest } = state;
  return {
    ...rest,
    enemies: enemies.map(toClientEnemy),
    structures: toClientStructures(structures),
  };
}

/**
 * What the clients were last sent, so the next update only carries what changed. The room
 * keeps one; it starts from the state everyone was welcomed with.
 */
export interface SentState {
  gridVersion: number;
  terrain: GameState["terrain"];
  base: number[];
  mount: number[];
  explored: number[];
  /** The chest list as sent; claiming a chest replaces the list, so a new list means a change. */
  features: GameState["features"];
  structures: Map<number, ClientStructure>;
}

/** A baseline matching `state` as it is now (what a welcome snapshot carries). */
export function sentStateOf(state: GameState): SentState {
  return {
    gridVersion: state.gridVersion,
    terrain: [...state.terrain],
    base: [...state.base],
    mount: [...state.mount],
    explored: [...state.explored],
    features: state.features,
    structures: new Map(
      Object.values(state.structures).map((s) => [s.id, toClientStructure(s)] as const),
    ),
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
    enemies: state.enemies.map(toClientEnemy),
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

  if (state.gridVersion !== sent.gridVersion) {
    const tiles: NonNullable<StateUpdate["tiles"]> = {};
    const terrain = changedTiles(state.terrain, sent.terrain);
    const base = changedTiles(state.base, sent.base);
    const mount = changedTiles(state.mount, sent.mount);
    const explored = changedTiles(state.explored, sent.explored);
    if (terrain.length > 0) tiles.terrain = terrain;
    if (base.length > 0) tiles.base = base;
    if (mount.length > 0) tiles.mount = mount;
    if (explored.length > 0) tiles.explored = explored;
    update.tiles = tiles;
    sent.gridVersion = state.gridVersion;
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

function toClientEnemy(enemy: GameState["enemies"][number]): ClientEnemy {
  return {
    id: enemy.id,
    x: round2(enemy.x),
    y: round2(enemy.y),
    hp: enemy.hp,
    maxHp: enemy.maxHp,
    kind: ENEMY_KIND_ORDER.indexOf(enemy.kind),
    variant: enemy.variant,
  };
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
