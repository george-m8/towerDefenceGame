// No looking back's swarms: groups of enemies idling round the map, tougher the further on they
// are, more coming in with each piece of new land. One that sees a royal (or is hurt) wakes its
// whole swarm, and they come for the nearest royal, round what's in the way (they don't break
// walls), hitting it once they reach it. They give up once they've lost sight of the royals for a
// while, and go back.
// A royal they bring down has fallen, as one the lava reaches has.
// Goblins are scared of water: with a flood of it, one that sees it runs (see fleeWater).
import { ENEMY_KINDS, FLOOD, TICK_RATE, type EnemyKindId } from "./config";
import { attackUnit, spawnEnemy, unitToFight } from "./enemies";
import { atTileCentre } from "./movement";
import { livingRoyals, royalAt } from "./flood";
import { blocksAt, inBounds } from "./grid";
import { canCross } from "./pathfinding";
import { headFor, roam } from "./raiders";
import { nextRandom, randomInt } from "./rng";
import type { Enemy, Flood, GameState, Point, Royal } from "./types";

/** How tough a swarm is, by how far across the world (from the royals' start) it is. */
export function swarmWave(state: GameState, x: number): number {
  const across = x + state.flood!.shifted - state.flood!.start.x;
  return Math.min(FLOOD.hardestWave, 1 + Math.max(0, Math.floor(across / FLOOD.tilesPerWave)));
}

/**
 * The swarms on the starting map, spread over it clear of the royals' start. Called once, when
 * the game is made, with the state's RNG.
 */
export function populateFlood(state: GameState): void {
  const start = state.flood!.start;
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
        Math.hypot(p.x - start.x, p.y - start.y) < clearOfStart ||
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
 * One tick of a swarm member's mind: seeing a royal (or being hurt) wakes its swarm; awake, it
 * comes for the nearest royal and hits it once it's beside it, and on the way stops to fight any
 * of the players' units beside it (an escort, say), as wave enemies do; asleep, it stands at its
 * post or heads back there (or, its post gone with the land behind, wanders).
 */
export function chaseRoyals(state: GameState, enemy: Enemy): void {
  const flood = state.flood!;
  const mind = enemy.swarm!;
  if (fleeWater(state, enemy)) return;
  const royal = nearestRoyal(flood, enemy);
  const hurt = enemy.hp < mind.hp;
  mind.hp = enemy.hp;
  if (hurt || (royal && royal.distance <= FLOOD.swarm.sight)) wake(state, enemy);
  if (mind.alert > 0 && royal) {
    mind.alert--;
    const { at } = royal.royal;
    const close = Math.max(
      Math.abs(Math.round(enemy.x) - at.x),
      Math.abs(Math.round(enemy.y) - at.y),
    );
    if (close <= 1) {
      if (enemy.attackCooldown === 0) {
        royal.royal.hp = Math.max(0, royal.royal.hp - enemy.damage);
        enemy.attackCooldown = enemy.attackInterval;
      }
      return;
    }
    // A unit beside it (between tiles, it carries on to the next first).
    const unit = atTileCentre(enemy) ? unitToFight(state, enemy, null) : undefined;
    if (unit) {
      attackUnit(enemy, unit);
      return;
    }
    headFor(state, enemy, at);
    return;
  }
  if (mind.post) headFor(state, enemy, mind.post);
  else roam(state, enemy);
}

/**
 * A goblin (FLOOD.swarm.fleeWater) that sees a flood of water (FLOOD.swarm.sight) runs from it,
 * before anything else: FLOOD.swarm.fleeTiles on, away from the nearest of it, then on again
 * while it's still in sight (or as far as it can get), and stays there. True while it runs.
 */
function fleeWater(state: GameState, enemy: Enemy): boolean {
  const { sight, fleeWater: kinds, fleeTiles } = FLOOD.swarm;
  const mind = enemy.swarm!;
  if (state.flood!.liquid !== "water" || !(kinds as string[]).includes(enemy.kind)) return false;
  const water = nearestFloodwater(state, enemy, sight);
  if (!water) {
    mind.flee = null;
    return false;
  }
  const x = Math.round(enemy.x);
  const y = Math.round(enemy.y);
  // Where to, worked out again once there, and every second (the water comes on).
  if (!mind.flee || (mind.flee.x === x && mind.flee.y === y) || state.tick % TICK_RATE === 0) {
    const away = Math.hypot(x - water.x, y - water.y) || 1;
    mind.flee = {
      x: clampTo(Math.round(x + ((x - water.x) / away) * fleeTiles), state.width),
      y: clampTo(Math.round(y + ((y - water.y) / away) * fleeTiles), state.height),
    };
  }
  // It settles where it ran to, not back by the water.
  mind.post = mind.flee;
  headFor(state, enemy, mind.flee);
  return true;
}

const clampTo = (n: number, size: number) => Math.max(0, Math.min(size - 1, n));

/** The nearest tile of floodwater within `reach` of an enemy, or null. */
function nearestFloodwater(state: GameState, enemy: Enemy, reach: number): Point | null {
  const ex = Math.round(enemy.x);
  const ey = Math.round(enemy.y);
  let best: Point | null = null;
  let nearest = Infinity;
  for (let y = Math.max(0, ey - reach); y <= Math.min(state.height - 1, ey + reach); y++) {
    for (let x = Math.max(0, ex - reach); x <= Math.min(state.width - 1, ex + reach); x++) {
      if (state.terrain[y * state.width + x] !== "floodwater") continue;
      const d = Math.hypot(x - ex, y - ey);
      if (d <= reach && d < nearest) [best, nearest] = [{ x, y }, d];
    }
  }
  return best;
}

/** The royal still standing nearest an enemy, and how far (as it's drawn, part way along). */
function nearestRoyal(flood: Flood, enemy: Enemy): { royal: Royal; distance: number } | null {
  let best: { royal: Royal; distance: number } | null = null;
  for (const royal of livingRoyals(flood)) {
    const p = royalAt(royal);
    const distance = Math.hypot(enemy.x - p.x, enemy.y - p.y);
    if (!best || distance < best.distance) best = { royal, distance };
  }
  return best;
}
