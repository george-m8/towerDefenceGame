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

/** The parts that change every tick, plus the grid when it changed since `lastGridVersion`. */
export function toUpdate(state: GameState, lastGridVersion: number): StateUpdate {
  const update: StateUpdate = {
    tick: state.tick,
    gridVersion: state.gridVersion,
    enemies: state.enemies.map(toClientEnemy),
    effects: state.effects,
    cues: state.cues,
    structures: toClientStructures(state.structures),
    players: state.players,
    wave: state.wave,
    keeps: state.keeps,
    winner: state.winner,
    paused: state.paused,
    speed: state.speed,
    gameOver: state.gameOver,
    fog: state.fog,
  };
  if (state.gridVersion !== lastGridVersion) {
    update.terrain = state.terrain;
    update.base = state.base;
    update.mount = state.mount;
    update.features = state.features;
    update.explored = state.explored;
  }
  return update;
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
  for (const { cooldown: _cooldown, ...rest } of Object.values(structures)) result[rest.id] = rest;
  return result;
}

/** Positions only need to be precise enough to draw; this keeps updates small. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
