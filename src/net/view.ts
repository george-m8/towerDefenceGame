// Turns what the server sends into a GameState the UI can draw, so offline and online
// share the renderer, panel and hover info. Pure: no DOM, no sockets.
import { ENEMY_KIND_ORDER, UNIT_KIND_ORDER } from "../sim/config";
import type { Enemy, GameState, Structure, Unit } from "../sim/types";
import type {
  ClientEnemy,
  ClientState,
  ClientStructure,
  ClientUnit,
  StateUpdate,
} from "./protocol";

/** Enemies and units as an update leaves them, with every field filled in, for smoothing. */
export interface Movers {
  enemies: ClientEnemy[];
  units: ClientUnit[];
}

/** A full GameState from a welcome snapshot, with server-only fields defaulted. */
export function fromClientState(client: ClientState): GameState {
  return {
    ...client,
    enemies: client.enemies.map(toEnemy),
    units: client.units.map(toUnit),
    structures: toStructures(client.structures),
    flows: {}, // rebuilt lazily by getFlowField when needed
    rngState: 0,
  };
}

/**
 * Applies an update in place and returns its enemies and units with kind, variant and owner
 * filled in from what the view already knows. Structures and tiles only come when they changed; layers are
 * updated tile by tile, so the client's arrays stay the ones it was welcomed with.
 */
export function applyUpdate(view: GameState, update: StateUpdate): Movers {
  const known = new Map(view.enemies.map((e) => [e.id, e]));
  const enemies = update.enemies.map((e): ClientEnemy => {
    const before = known.get(e.id);
    return {
      ...e,
      kind: e.kind ?? (before ? ENEMY_KIND_ORDER.indexOf(before.kind) : 0),
      variant: e.variant ?? before?.variant ?? 0,
    };
  });
  const knownUnits = new Map(view.units.map((u) => [u.id, u]));
  const units = update.units.map((u): ClientUnit => {
    const before = knownUnits.get(u.id);
    return {
      ...u,
      kind: u.kind ?? (before ? UNIT_KIND_ORDER.indexOf(before.kind) : 0),
      owner: u.owner ?? before?.owner ?? 0,
    };
  });
  view.tick = update.tick;
  view.gridVersion = update.gridVersion;
  view.sightVersion = update.sightVersion;
  view.enemies = enemies.map(toEnemy);
  view.units = units.map(toUnit);
  view.effects = update.effects;
  view.cues = update.cues;
  view.players = update.players;
  view.wave = update.wave;
  view.keeps = update.keeps;
  view.winner = update.winner;
  view.paused = update.paused;
  view.speed = update.speed;
  view.gameOver = update.gameOver;
  view.fog = update.fog;
  for (const s of update.structures ?? []) view.structures[s.id] = toStructure(s);
  for (const id of update.removed ?? []) delete view.structures[id];
  const { tiles } = update;
  if (tiles) {
    for (const [i, t] of tiles.terrain ?? []) view.terrain[i] = t;
    for (const [i, id] of tiles.base ?? []) view.base[i] = id;
    for (const [i, id] of tiles.mount ?? []) view.mount[i] = id;
    for (const [i, bits] of tiles.explored ?? []) view.explored[i] = bits;
    for (const [i, left] of tiles.resources ?? []) view.resources[i] = left;
  }
  if (update.features) view.features = update.features;
  return { enemies, units };
}

/** Units a fraction `t` (0-1) of the way from `previous` to `next`, as for enemies. */
export function interpolateUnits(previous: ClientUnit[], next: ClientUnit[], t: number): Unit[] {
  const f = Math.min(1, Math.max(0, t));
  const before = new Map(previous.map((u) => [u.id, u]));
  return next.map((u) => {
    const from = before.get(u.id);
    if (!from) return toUnit(u);
    return toUnit({ ...u, x: lerp(from.x, u.x, f), y: lerp(from.y, u.y, f) });
  });
}

function toUnit(u: ClientUnit): Unit {
  return {
    ...u,
    kind: UNIT_KIND_ORDER[u.kind],
    home: null,
    tx: Math.round(u.x),
    ty: Math.round(u.y),
    attackCooldown: 0,
    goal: null,
    path: null,
    pathGoal: null,
    pathVersion: -1,
    pathExplored: -1,
    waitingForPath: false,
  };
}

/**
 * Enemies a fraction `t` (0-1) of the way from `previous` to `next`, matched by id.
 * New enemies appear where they are; enemies missing from `next` are gone.
 */
export function interpolateEnemies(
  previous: ClientEnemy[],
  next: ClientEnemy[],
  t: number,
): Enemy[] {
  const f = Math.min(1, Math.max(0, t));
  const before = new Map(previous.map((e) => [e.id, e]));
  return next.map((e) => {
    const from = before.get(e.id);
    if (!from) return toEnemy(e);
    return toEnemy({ ...e, x: lerp(from.x, e.x, f), y: lerp(from.y, e.y, f) });
  });
}

/**
 * How far to draw between the previous and newest update, rendering one update interval
 * behind: 0 when the newest update has just arrived, 1 one interval later.
 */
export function interpolationFraction(previousAt: number, newestAt: number, now: number): number {
  const interval = newestAt - previousAt;
  if (interval <= 0) return 1;
  return Math.min(1, Math.max(0, (now - newestAt) / interval));
}

/** Exact at both ends (unlike a + (b - a) * t), so t = 1 lands precisely on the server's value. */
function lerp(a: number, b: number, t: number): number {
  return a * (1 - t) + b * t;
}

function toEnemy(e: ClientEnemy): Enemy {
  return {
    ...e,
    tx: Math.round(e.x),
    ty: Math.round(e.y),
    px: Math.round(e.x),
    py: Math.round(e.y),
    bounty: 0,
    kind: ENEMY_KIND_ORDER[e.kind],
    speed: 0,
    damage: 0,
    attackInterval: 0,
    killedBy: null,
    attackCooldown: 0,
    abilityCooldown: 0,
    mode: e.mode ?? "walking",
    targetId: null,
    leaderId: e.leaderId ?? null,
  };
}

function toStructures(structures: Record<number, ClientStructure>): Record<number, Structure> {
  const result: Record<number, Structure> = {};
  for (const s of Object.values(structures)) result[s.id] = toStructure(s);
  return result;
}

function toStructure(s: ClientStructure): Structure {
  return { ...s, cooldown: 0 };
}
