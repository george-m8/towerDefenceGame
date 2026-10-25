import { ENEMY_KIND_ORDER, ENEMY_KINDS, TICK_RATE, WAVES, type EnemyKindId } from "./config";
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
 * Stopgap mix (until wave-director): a kind for the next spawn, drawn by mix weight from the
 * kinds unlocked by this wave whose threat fits in what's left. Null once nothing fits.
 */
export function pickWaveKind(
  state: GameState,
  wave: number,
  threatLeft: number,
): EnemyKindId | null {
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
    return kind.firstWave <= wave && kind.threat <= threatLeft + THREAT_EPSILON;
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
  const kind = pickWaveKind(state, wave.number, wave.threatLeft);
  if (kind) {
    const p = state.spawnTiles[randomInt(state, 0, state.spawnTiles.length - 1)];
    spawnEnemy(state, p.x, p.y, { kind, wave: wave.number, variant: "random" });
    wave.threatLeft -= ENEMY_KINDS[kind].threat;
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
