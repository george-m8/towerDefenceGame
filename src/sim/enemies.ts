import {
  ENEMY_KINDS,
  TICK_RATE,
  WAVES,
  type EnemyKind,
  type EnemyKindId,
  type MovementProfile,
} from "./config";
import { BEHAVIOURS } from "./behaviours";
import { addCue } from "./cues";
import { attackTargetAt, blocksAt, damageStructure, keepAt } from "./grid";
import { DIRECTIONS, canCross, nextStep } from "./pathfinding";
import { stepTo, walk } from "./movement";
import { nextRandom, randomInt } from "./rng";
import type { Enemy, GameState, Keep, PlayerId, Point, Structure } from "./types";

export interface SpawnOptions {
  kind?: EnemyKindId;
  /** The wave it belongs to, for HP and bounty scaling. Defaults to 1. */
  wave?: number;
  /** A variant index, or "random" to roll one by weight. Defaults to the standard variant (0). */
  variant?: number | "random";
  /** Override the resolved HP and bounty (tests). */
  hp?: number;
  bounty?: number;
}

/** HP multiplier for a wave: +15% per wave after the first. */
export function waveHpScale(wave: number): number {
  return 1 + WAVES.hpGrowthPerWave * (wave - 1);
}

/** Bounty added for a wave: +1 every few waves. */
export function waveBountyBonus(wave: number): number {
  return Math.floor((wave - 1) / WAVES.bountyStepWaves);
}

/** Spawns an enemy with its stats resolved now (kind x variant x wave). */
export function spawnEnemy(
  state: GameState,
  x: number,
  y: number,
  options: SpawnOptions = {},
): Enemy {
  const kindId = options.kind ?? "goblin";
  const wave = options.wave ?? 1;
  const kind = ENEMY_KINDS[kindId];
  const variant = options.variant === "random" ? rollVariant(state, kind) : (options.variant ?? 0);
  const v = kind.variants[variant];
  const hp = options.hp ?? Math.round(kind.hp * v.hp * waveHpScale(wave));
  const enemy: Enemy = {
    id: state.nextId++,
    x,
    y,
    tx: x,
    ty: y,
    px: x,
    py: y,
    hp,
    maxHp: hp,
    bounty: options.bounty ?? kind.bounty + waveBountyBonus(wave),
    kind: kindId,
    variant,
    speed: kind.speed * v.speed,
    damage: Math.round(kind.damage * v.damage), // whole damage, so HP never shows fractions
    attackInterval: Math.round(kind.attackInterval * TICK_RATE),
    killedBy: null,
    attackCooldown: 0,
    mode: "walking",
    targetId: null,
  };
  state.enemies.push(enemy);
  return enemy;
}

/** Rolls a variant by weight, using the state RNG so online games stay in sync. */
function rollVariant(state: GameState, kind: EnemyKind): number {
  const total = kind.variants.reduce((sum, v) => sum + v.weight, 0);
  let roll = nextRandom(state) * total;
  for (let i = 0; i < kind.variants.length; i++) {
    roll -= kind.variants[i].weight;
    if (roll < 0) return i;
  }
  return kind.variants.length - 1;
}

/** Deals damage and records who struck the killing blow. */
export function damageEnemy(enemy: Enemy, amount: number, by: PlayerId | null): void {
  if (enemy.hp <= 0) return;
  enemy.hp -= amount;
  if (enemy.hp <= 0) enemy.killedBy = by;
}

export function updateEnemies(state: GameState): void {
  for (const enemy of state.enemies) advance(state, enemy);
}

/** One tick for one enemy: its behaviour first, then walking its field if that's still to do. */
function advance(state: GameState, enemy: Enemy): void {
  if (enemy.hp <= 0) return; // killed since the last tick; removed with the bounties
  enemy.attackCooldown = Math.max(0, enemy.attackCooldown - 1);
  if (BEHAVIOURS[ENEMY_KINDS[enemy.kind].behaviour](state, enemy)) return;
  walk(enemy, enemy.speed, () => chooseNextTile(state, enemy));
}

/**
 * Sets the next tile to walk to. If the keep or a blocking structure is next, the enemy
 * stays where it is and attacks it instead, and this returns false.
 */
function chooseNextTile(state: GameState, enemy: Enemy): boolean {
  const previous = { x: enemy.px, y: enemy.py };
  const profile = ENEMY_KINDS[enemy.kind].profile;
  const pathStep = nextStep(state, enemy.x, enemy.y, previous, profile);
  // No step means it is already on the keep; attack the keep from there.
  const keep = pathStep ? keepAt(state, pathStep.x, pathStep.y) : keepAt(state, enemy.x, enemy.y);
  if (keep) {
    attackKeep(state, enemy, keep);
    return false;
  }
  if (!pathStep) return false;
  if (blocksAt(state, pathStep.x, pathStep.y)) {
    attack(state, enemy, attackTargetAt(state, pathStep.x, pathStep.y)!);
    return false;
  }
  // Only walking enemies wander; one breaking through stays on its target.
  const next = wanderStep(state, enemy, pathStep, previous, profile) ?? pathStep;
  stepTo(enemy, next.x, next.y);
  return true;
}

/**
 * With chance `state.wanderChance`, a random open tile to the side of the path step,
 * so enemies sometimes stray off the path. Never steps backwards (opposite the path
 * step), onto the tile it just left, into a blocking structure, or onto terrain it can't cross.
 */
function wanderStep(
  state: GameState,
  enemy: Enemy,
  pathStep: Point,
  previous: Point,
  profile: MovementProfile,
): Point | null {
  if (state.wanderChance <= 0 || nextRandom(state) >= state.wanderChance) return null;
  const forward = { x: pathStep.x - enemy.x, y: pathStep.y - enemy.y };
  const options: Point[] = [];
  for (const d of DIRECTIONS) {
    // Sideways only: skip both forward (the path step) and straight back.
    if (d.x === forward.x || d.y === forward.y) continue;
    const x = enemy.x + d.x;
    const y = enemy.y + d.y;
    if (x === previous.x && y === previous.y) continue;
    if (canCross(state, profile, x, y) && !blocksAt(state, x, y) && !keepAt(state, x, y)) {
      options.push({ x, y });
    }
  }
  return options.length > 0 ? options[randomInt(state, 0, options.length - 1)] : null;
}

function attackKeep(state: GameState, enemy: Enemy, keep: Keep) {
  if (enemy.attackCooldown > 0) return;
  keep.hp = Math.max(0, keep.hp - enemy.damage);
  enemy.attackCooldown = enemy.attackInterval;
  addCue(state, "keepHit");
}

function attack(state: GameState, enemy: Enemy, target: Structure) {
  if (enemy.attackCooldown > 0) return;
  damageStructure(state, target, enemy.damage);
  enemy.attackCooldown = enemy.attackInterval;
}
