// Turns what the server sends into a GameState the UI can draw, so offline and online
// share the renderer, panel and hover info. Pure: no DOM, no sockets.
import type { Enemy, GameState, Structure } from "../sim/types";
import type { ClientEnemy, ClientState, ClientStructure, StateUpdate } from "./protocol";

/** A full GameState from a welcome snapshot, with server-only fields defaulted. */
export function fromClientState(client: ClientState): GameState {
  return {
    ...client,
    enemies: client.enemies.map(toEnemy),
    structures: toStructures(client.structures),
    flow: null, // rebuilt lazily by getFlowField when needed
    rngState: 0,
  };
}

/** Applies an update in place. Grid fields are only present when the grid changed. */
export function applyUpdate(view: GameState, update: StateUpdate): void {
  view.tick = update.tick;
  view.gridVersion = update.gridVersion;
  view.enemies = update.enemies.map(toEnemy);
  view.effects = update.effects;
  view.structures = toStructures(update.structures);
  view.players = update.players;
  view.wave = update.wave;
  view.keep = update.keep;
  view.paused = update.paused;
  view.speed = update.speed;
  view.gameOver = update.gameOver;
  if (update.terrain) view.terrain = update.terrain;
  if (update.base) view.base = update.base;
  if (update.mount) view.mount = update.mount;
  if (update.features) view.features = update.features;
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
    return toEnemy({ ...e, x: from.x + (e.x - from.x) * f, y: from.y + (e.y - from.y) * f });
  });
}

function toEnemy(e: ClientEnemy): Enemy {
  return {
    ...e,
    tx: Math.round(e.x),
    ty: Math.round(e.y),
    px: Math.round(e.x),
    py: Math.round(e.y),
    bounty: 0,
    killedBy: null,
    attackCooldown: 0,
  };
}

function toStructures(structures: Record<number, ClientStructure>): Record<number, Structure> {
  const result: Record<number, Structure> = {};
  for (const s of Object.values(structures)) result[s.id] = { ...s, cooldown: 0 };
  return result;
}
