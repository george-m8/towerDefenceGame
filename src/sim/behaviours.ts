// What enemies do on top of following their profile's field. Each behaviour runs before normal
// movement and returns true when it has used the enemy's turn.
import {
  EFFECT_TICKS,
  ENEMY_KINDS,
  STRUCTURES,
  type BehaviourId,
  type EnemyAbility,
  type EnemyKind,
} from "./config";
import { addCue } from "./cues";
import { baseAt, blocksAt, damageStructure, inBounds, keepAt, mountAt } from "./grid";
import { atTileCentre, stepTo, walk } from "./movement";
import { DIRECTIONS, canCross } from "./pathfinding";
import type { Enemy, GameState, Keep, Point, Structure } from "./types";

type Behaviour = (state: GameState, enemy: Enemy) => boolean;

export const BEHAVIOURS: Record<BehaviourId, Behaviour> = {
  follower: () => false,
  bomber: bomb,
};

function abilityOf(enemy: Enemy): EnemyAbility {
  const kind: EnemyKind = ENEMY_KINDS[enemy.kind];
  return kind.ability ?? {};
}

/**
 * Bombers walk their field until a player-built wall, tower, house or wall spikes is within
 * sight, then sprint to a tile next to it and explode.
 */
function bomb(state: GameState, enemy: Enemy): boolean {
  const ability = abilityOf(enemy);
  if (enemy.mode === "walking") {
    if (!atTileCentre(enemy)) return false;
    const target = findTarget(state, enemy, ability, isBombTarget);
    if (!target) return false;
    enemy.mode = "sprinting";
    enemy.targetId = target.id;
  }
  const target = enemy.targetId === null ? undefined : state.structures[enemy.targetId];
  if (!target) return giveUp(enemy);
  walk(enemy, enemy.speed * (ability.sprint ?? 1), () => {
    if (isNextTo(enemy, target)) {
      explode(state, enemy, ability);
      return false;
    }
    const step = firstStepTowards(state, enemy, target, ability.search ?? 0);
    if (!step) return giveUp(enemy);
    stepTo(enemy, step.x, step.y);
    return true;
  });
  return true;
}

function giveUp(enemy: Enemy): false {
  enemy.mode = "walking";
  enemy.targetId = null;
  return false;
}

/** Walls, towers, houses and wall spikes a player built. Never ruins, bridges or floor spikes. */
function isBombTarget(structure: Structure): boolean {
  if (structure.owner === null) return false;
  if (STRUCTURES[structure.kind].layer === "mount") return true;
  return structure.kind === "wall" || structure.kind === "house" || structure.kind === "wallSpikes";
}

/**
 * The nearest structure matching `accepts` within the enemy's sight (straight-line, ignoring
 * fog) that it can reach a tile next to within its search limit. Ties go to the lowest id.
 */
function findTarget(
  state: GameState,
  enemy: Enemy,
  ability: EnemyAbility,
  accepts: (structure: Structure) => boolean,
): Structure | undefined {
  const sight = ability.sight ?? 0;
  const reach = Math.floor(sight);
  const candidates: { structure: Structure; distance: number }[] = [];
  for (let y = enemy.y - reach; y <= enemy.y + reach; y++) {
    for (let x = enemy.x - reach; x <= enemy.x + reach; x++) {
      const distance = Math.hypot(x - enemy.x, y - enemy.y);
      if (!inBounds(state, x, y) || distance > sight) continue;
      for (const structure of [baseAt(state, x, y), mountAt(state, x, y)]) {
        if (structure && accepts(structure)) candidates.push({ structure, distance });
      }
    }
  }
  candidates.sort((a, b) => a.distance - b.distance || a.structure.id - b.structure.id);
  const search = ability.search ?? 0;
  return candidates.find(({ structure }) => firstStepTowards(state, enemy, structure, search))
    ?.structure;
}

function isNextTo(enemy: Enemy, target: Point): boolean {
  return Math.abs(enemy.x - target.x) + Math.abs(enemy.y - target.y) === 1;
}

/**
 * The first step of the shortest walk (at most `limit` steps) to a tile next to `target`,
 * over open tiles a follower can cross. Null if there's none, or if it's already there.
 */
function firstStepTowards(
  state: GameState,
  enemy: Enemy,
  target: Point,
  limit: number,
): Point | null {
  if (isNextTo(enemy, target)) return { x: enemy.x, y: enemy.y };
  const start = { x: enemy.x, y: enemy.y };
  const firstStep = new Map<number, Point>();
  let frontier: Point[] = [start];
  const seen = new Set([start.y * state.width + start.x]);
  for (let depth = 1; depth <= limit && frontier.length > 0; depth++) {
    const next: Point[] = [];
    for (const p of frontier) {
      for (const d of DIRECTIONS) {
        const x = p.x + d.x;
        const y = p.y + d.y;
        const index = y * state.width + x;
        if (seen.has(index) || !isOpen(state, x, y)) continue;
        seen.add(index);
        const first = depth === 1 ? { x, y } : firstStep.get(p.y * state.width + p.x)!;
        if (Math.abs(x - target.x) + Math.abs(y - target.y) === 1) return first;
        firstStep.set(index, first);
        next.push({ x, y });
      }
    }
    frontier = next;
  }
  return null;
}

function isOpen(state: GameState, x: number, y: number): boolean {
  return (
    canCross(state, "follower", x, y) && !blocksAt(state, x, y) && keepAt(state, x, y) === undefined
  );
}

/**
 * Damages every structure and the keep in the square around the bomber, then it dies. It drops
 * no bounty (nobody killed it) and never hurts other enemies.
 */
function explode(state: GameState, enemy: Enemy, ability: EnemyAbility) {
  const radius = ability.radius ?? 1;
  const amount = ability.amount ?? 0;
  const keepsHit = new Set<Keep>();
  for (let y = enemy.y - radius; y <= enemy.y + radius; y++) {
    for (let x = enemy.x - radius; x <= enemy.x + radius; x++) {
      if (!inBounds(state, x, y)) continue;
      const keep = keepAt(state, x, y);
      if (keep && !keepsHit.has(keep)) {
        keep.hp = Math.max(0, keep.hp - amount);
        keepsHit.add(keep);
      }
      // The tower first: if the wall falls, the tower goes with it.
      const mount = mountAt(state, x, y);
      if (mount) damageStructure(state, mount, amount);
      const base = baseAt(state, x, y);
      if (base) damageStructure(state, base, amount);
    }
  }
  enemy.hp = 0;
  enemy.bounty = 0;
  enemy.killedBy = null;
  state.effects.push({ kind: "splash", x: enemy.x, y: enemy.y, radius, ttl: EFFECT_TICKS });
  addCue(state, "explosion");
}
