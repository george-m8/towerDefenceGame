// No looking back's swarms: groups of enemies idling round the map, tougher the further on they
// are, more coming in with each piece of new land. One that sees the king (or is hurt) wakes its
// whole swarm, and they come for him, round what's in the way (they don't break walls), hitting
// him once they reach him. They give up once they've lost sight of him for a while, and go back.
// The king falling to them ends the game, as the lava does.
import { ENEMY_KINDS, FLOOD, TICK_RATE, type EnemyKindId } from "./config";
import { spawnEnemy } from "./enemies";
import { kingAt } from "./flood";
import { blocksAt, inBounds } from "./grid";
import { canCross } from "./pathfinding";
import { headFor, roam } from "./raiders";
import { nextRandom, randomInt } from "./rng";
import type { Enemy, GameState, Point } from "./types";

/** How tough a swarm is, by how far across the world (from the king's start) it is. */
export function swarmWave(state: GameState, x: number): number {
  const across = x + state.flood!.shifted - state.flood!.startX;
  return Math.min(FLOOD.hardestWave, 1 + Math.max(0, Math.floor(across / FLOOD.tilesPerWave)));
}

/**
 * The swarms on the starting map, spread over it clear of the king's start. Called once, when
 * the game is made, with the state's RNG.
 */
export function populateFlood(state: GameState): void {
  const king = state.flood!.king;
  const { tilesPerSwarm, spacing, clearOfStart } = FLOOD.swarm;
  const count = Math.round((state.width * state.height) / tilesPerSwarm);
  const middles: Point[] = [];
  for (let n = 0; n < count; n++) {
    for (let tries = 0; tries < 40; tries++) {
      const p = {
        x: randomInt(state, 0, state.width - 3),
        y: randomInt(state, 0, state.height - 1),
      };
      if (
        !isOpen(state, p.x, p.y) ||
        Math.hypot(p.x - king.x, p.y - king.y) < clearOfStart ||
        middles.some((m) => Math.hypot(p.x - m.x, p.y - m.y) < spacing)
      ) {
        continue;
      }
      middles.push(p);
      placeSwarm(state, p);
      break;
    }
  }
}

/** Open ground an enemy can stand on. */
function isOpen(state: GameState, x: number, y: number): boolean {
  return inBounds(state, x, y) && canCross(state, "follower", x, y) && !blocksAt(state, x, y);
}

/**
 * A swarm round `middle` (on the map now), as tough as its place across the world is worth
 * (see swarmWave). None if there's no open ground there.
 */
export function placeSwarm(state: GameState, middle: Point): void {
  const spots: Point[] = [];
  for (let y = middle.y - 2; y <= middle.y + 2; y++) {
    for (let x = middle.x - 2; x <= middle.x + 2; x++)
      if (isOpen(state, x, y)) spots.push({ x, y });
  }
  if (spots.length === 0) return;
  const wave = swarmWave(state, middle.x);
  const id = state.flood!.swarms++;
  const size = randomInt(state, FLOOD.swarm.size.min, FLOOD.swarm.size.max);
  for (let i = 0; i < size; i++) {
    const spot = spots[randomInt(state, 0, spots.length - 1)];
    const enemy = spawnEnemy(state, spot.x, spot.y, {
      kind: kindFor(state, wave),
      wave,
      variant: "random",
    });
    enemy.swarm = { post: spot, id, alert: 0, hp: enemy.hp };
  }
}

/** A kind that has arrived by `wave`, picked by the waves' mix weights. */
function kindFor(state: GameState, wave: number): EnemyKindId {
  const kinds = (Object.keys(ENEMY_KINDS) as EnemyKindId[]).filter(
    (k) => ENEMY_KINDS[k].firstWave <= wave && ENEMY_KINDS[k].mixWeight > 0,
  );
  const total = kinds.reduce((sum, k) => sum + ENEMY_KINDS[k].mixWeight, 0);
  let roll = nextRandom(state) * total;
  for (const kind of kinds) {
    roll -= ENEMY_KINDS[kind].mixWeight;
    if (roll < 0) return kind;
  }
  return "goblin";
}

/** Wakes an enemy and the rest of its swarm. */
function wake(state: GameState, enemy: Enemy): void {
  const alert = FLOOD.swarm.giveUpSeconds * TICK_RATE;
  const { id } = enemy.swarm!;
  for (const other of state.enemies) {
    if (other.swarm?.id === id) other.swarm.alert = alert;
  }
}

/**
 * One tick of a swarm member's mind: seeing the king (or being hurt) wakes its swarm; awake, it
 * comes for him and hits him once it's beside him; asleep, it stands at its post or heads back
 * there (or, its post gone with the land behind, wanders).
 */
export function chaseKing(state: GameState, enemy: Enemy): void {
  const flood = state.flood!;
  const mind = enemy.swarm!;
  const king = kingAt(flood);
  const hurt = enemy.hp < mind.hp;
  mind.hp = enemy.hp;
  if (hurt || Math.hypot(enemy.x - king.x, enemy.y - king.y) <= FLOOD.swarm.sight) {
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
