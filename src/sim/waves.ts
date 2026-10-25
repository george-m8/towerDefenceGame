import {
  ENEMY_KIND_ORDER,
  ENEMY_KINDS,
  TICK_RATE,
  WAVES,
  bandOf,
  type EnemyKindId,
} from "./config";
import { addCue } from "./cues";
import { spawnEnemy } from "./enemies";
import { nextRandom, randomInt } from "./rng";
import { addGold } from "./players";
import type { CommandResult, GameState, PlayerId, WaveState } from "./types";

const COUNTDOWN_TICKS = WAVES.countdownSeconds * TICK_RATE;
const SPAWN_INTERVAL_TICKS = WAVES.spawnIntervalSeconds * TICK_RATE;

/** Floating-point slack when comparing threat, so 0.4 + 0.4 + 0.2 still fits in 1. */
const THREAT_EPSILON = 1e-9;

/** A wave's threat budget: today's enemy count, so a goblin-only wave is unchanged. */
export function waveThreatBudget(wave: number): number {
  return WAVES.baseCount + WAVES.countPerWave * wave;
}

/**
 * Stopgap mix (until wave-director): the next group to spawn, as kinds. Usually one enemy; a
 * leader comes with its band (leader first), as big as rolled or as what's left can pay for.
 * Null once nothing fits.
 */
export function pickWaveGroup(
  state: GameState,
  wave: number,
  threatLeft: number,
): EnemyKindId[] | null {
  const leader = pickWaveKind(state, wave, threatLeft);
  if (!leader) return null;
  const band = bandOf(leader);
  if (!band) return [leader];
  const affordable = Math.floor(
    (threatLeft - ENEMY_KINDS[leader].threat + THREAT_EPSILON) / ENEMY_KINDS[band.kind].threat,
  );
  const size = Math.min(randomInt(state, band.min, band.max), affordable);
  return [leader, ...Array<EnemyKindId>(size).fill(band.kind)];
}

function threatOf(kinds: EnemyKindId[]): number {
  return kinds.reduce((sum, kind) => sum + ENEMY_KINDS[kind].threat, 0);
}

/** What a kind costs at the least: a leader always brings its smallest band. */
function minimumThreat(id: EnemyKindId): number {
  const band = bandOf(id);
  return ENEMY_KINDS[id].threat + (band ? band.min * ENEMY_KINDS[band.kind].threat : 0);
}

/**
 * A kind drawn by mix weight from the kinds unlocked by this wave whose minimum threat fits
 * in what's left. Null once nothing fits.
 */
function pickWaveKind(state: GameState, wave: number, threatLeft: number): EnemyKindId | null {
  const fits = kindsThatFit(wave, threatLeft);
  if (fits.length === 0) return null;
  const total = fits.reduce((sum, id) => sum + ENEMY_KINDS[id].mixWeight, 0);
  let roll = nextRandom(state) * total;
  for (const id of fits) {
    roll -= ENEMY_KINDS[id].mixWeight;
    if (roll < 0) return id;
  }
  return fits[fits.length - 1];
}

function kindsThatFit(wave: number, threatLeft: number): EnemyKindId[] {
  return ENEMY_KIND_ORDER.filter((id) => {
    const kind = ENEMY_KINDS[id];
    return kind.firstWave <= wave && minimumThreat(id) <= threatLeft + THREAT_EPSILON;
  });
}

export function createWaveState(): WaveState {
  return { number: 0, threatLeft: 0, spawnTimer: 0, countdown: COUNTDOWN_TICKS };
}

export function updateWaves(state: GameState): void {
  const { wave } = state;
  if (wave.threatLeft === 0) {
    wave.countdown--;
    if (wave.countdown > 0) return;
    startWave(state);
  }

  wave.spawnTimer--;
  if (wave.spawnTimer > 0) return;
  const group = pickWaveGroup(state, wave.number, wave.threatLeft);
  if (group) {
    const p = state.spawnTiles[randomInt(state, 0, state.spawnTiles.length - 1)];
    const [first, ...band] = group;
    const options = { wave: wave.number, variant: "random" as const };
    const leader = spawnEnemy(state, p.x, p.y, { ...options, kind: first });
    for (const kind of band) spawnEnemy(state, p.x, p.y, { ...options, kind, leader });
    wave.threatLeft -= threatOf(group);
  }
  wave.spawnTimer = SPAWN_INTERVAL_TICKS;
  // Finished as soon as nothing else fits, so the countdown starts straight after the last spawn.
  if (kindsThatFit(wave.number, wave.threatLeft).length === 0) {
    wave.threatLeft = 0;
    wave.countdown = COUNTDOWN_TICKS;
  }
}

/** Skip the countdown, paying a bonus for each full second skipped. */
export function sendWaveEarly(state: GameState, player: PlayerId): CommandResult {
  if (state.gameOver) return { ok: false, reason: "Game over" };
  if (state.wave.threatLeft > 0) return { ok: false, reason: "Wave still spawning" };
  const skipped = Math.floor(state.wave.countdown / TICK_RATE);
  addGold(state, player, skipped * WAVES.earlySendGoldPerSecond);
  startWave(state);
  return { ok: true };
}

function startWave(state: GameState) {
  const { wave } = state;
  wave.number++;
  wave.threatLeft = waveThreatBudget(wave.number);
  wave.spawnTimer = 1; // first enemy spawns on the next update
  wave.countdown = 0;
  addCue(state, "waveStart");
}
