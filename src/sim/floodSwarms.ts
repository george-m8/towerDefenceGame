// No looking back's swarms, as Journey home's: groups of enemies idling round the map, tougher
// the further on they are, more coming in with each piece of new land. One that sees the king
// (or is hurt) wakes its whole swarm, and they come for him, round what's in the way (they don't
// break walls), hitting him once they reach him. They give up once they've lost sight of him for
// a while, and go back. The king falling to them ends the game, as the lava does.
import { FLOOD, JOURNEY } from "./config";
import { kingAt } from "./flood";
import { isOpen, placeSwarm, wake } from "./journey";
import { headFor, roam } from "./raiders";
import { randomInt } from "./rng";
import type { Enemy, GameState, Point } from "./types";

/** How tough a swarm is, by how far across the world (from the king's start) it is. */
export function swarmWave(state: GameState, x: number): number {
  const across = x + state.flood!.shifted - state.flood!.startX;
  return Math.min(FLOOD.hardestWave, 1 + Math.max(0, Math.floor(across / FLOOD.tilesPerWave)));
}

/** A new swarm's number (each wakes together). */
function nextSwarm(state: GameState): number {
  return state.flood!.swarms++;
}

/**
 * The swarms on the starting map: spread over it as Journey home's are, clear of the king's
 * start. Called once, when the game is made, with the state's RNG.
 */
export function populateFlood(state: GameState): void {
  const king = state.flood!.king;
  const count = Math.round((state.width * state.height) / JOURNEY.tilesPerSwarm);
  const middles: Point[] = [];
  for (let n = 0; n < count; n++) {
    for (let tries = 0; tries < 40; tries++) {
      const p = {
        x: randomInt(state, 0, state.width - 3),
        y: randomInt(state, 0, state.height - 1),
      };
      if (
        !isOpen(state, p.x, p.y) ||
        Math.hypot(p.x - king.x, p.y - king.y) < JOURNEY.clearOfStart ||
        middles.some((m) => Math.hypot(p.x - m.x, p.y - m.y) < JOURNEY.swarmSpacing)
      ) {
        continue;
      }
      middles.push(p);
      placeSwarm(state, p, nextSwarm(state), swarmWave(state, p.x));
      break;
    }
  }
}

/** A swarm coming in with new land, round `middle` (on the map now). */
export function placeFloodSwarm(state: GameState, middle: Point): void {
  placeSwarm(state, middle, nextSwarm(state), swarmWave(state, middle.x));
}

/**
 * One tick of a swarm member's mind: seeing the king (or being hurt) wakes its swarm; awake, it
 * comes for him and hits him once it's beside him; asleep, it stands at its post or heads back
 * there.
 */
export function chaseKing(state: GameState, enemy: Enemy): void {
  const flood = state.flood!;
  const mind = enemy.journey!;
  const king = kingAt(flood);
  const hurt = enemy.hp < mind.hp;
  mind.hp = enemy.hp;
  if (hurt || Math.hypot(enemy.x - king.x, enemy.y - king.y) <= JOURNEY.enemySight) {
    wake(state, enemy);
  }
  if (mind.alert > 0) {
    mind.alert--;
    const close = Math.max(
      Math.abs(Math.round(enemy.x) - flood.king.x),
      Math.abs(Math.round(enemy.y) - flood.king.y),
    );
    if (close <= 1) {
      if (enemy.attackCooldown === 0) {
        flood.kingHp = Math.max(0, flood.kingHp - enemy.damage);
        enemy.attackCooldown = enemy.attackInterval;
      }
      return;
    }
    headFor(state, enemy, flood.king);
    return;
  }
  if (mind.post) headFor(state, enemy, mind.post);
  else roam(state, enemy);
}

/** Whether a swarm's enemies have had the king. */
export function kingFallen(state: GameState): boolean {
  return state.flood !== null && state.flood.kingHp <= 0;
}
