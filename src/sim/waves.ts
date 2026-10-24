import { ENEMY, TICK_RATE, WAVES } from "./config";
import { spawnEnemy } from "./enemies";
import { randomInt } from "./rng";
import type { CommandResult, GameState, WaveState } from "./types";

const COUNTDOWN_TICKS = WAVES.countdownSeconds * TICK_RATE;
const SPAWN_INTERVAL_TICKS = WAVES.spawnIntervalSeconds * TICK_RATE;

export function waveEnemyCount(wave: number): number {
  return WAVES.baseCount + WAVES.countPerWave * wave;
}

export function waveEnemyHp(wave: number): number {
  return Math.round(ENEMY.baseHp * (1 + WAVES.hpGrowthPerWave * (wave - 1)));
}

export function waveBounty(wave: number): number {
  return ENEMY.baseBounty + Math.floor((wave - 1) / WAVES.bountyStepWaves);
}

export function createWaveState(): WaveState {
  return { number: 0, toSpawn: 0, spawnTimer: 0, countdown: COUNTDOWN_TICKS };
}

export function updateWaves(state: GameState): void {
  const { wave } = state;
  if (wave.toSpawn === 0) {
    wave.countdown--;
    if (wave.countdown > 0) return;
    startWave(state);
  }

  wave.spawnTimer--;
  if (wave.spawnTimer > 0) return;
  const p = state.spawnTiles[randomInt(state, 0, state.spawnTiles.length - 1)];
  spawnEnemy(state, p.x, p.y, waveEnemyHp(wave.number), waveBounty(wave.number));
  wave.toSpawn--;
  wave.spawnTimer = SPAWN_INTERVAL_TICKS;
  if (wave.toSpawn === 0) wave.countdown = COUNTDOWN_TICKS;
}

/** Skip the countdown, paying a bonus for each full second skipped. */
export function sendWaveEarly(state: GameState): CommandResult {
  if (state.gameOver) return { ok: false, reason: "Game over" };
  if (state.wave.toSpawn > 0) return { ok: false, reason: "Wave still spawning" };
  state.gold += Math.floor(state.wave.countdown / TICK_RATE) * WAVES.earlySendGoldPerSecond;
  startWave(state);
  return { ok: true };
}

function startWave(state: GameState) {
  const { wave } = state;
  wave.number++;
  wave.toSpawn = waveEnemyCount(wave.number);
  wave.spawnTimer = 1; // first enemy spawns on the next update
  wave.countdown = 0;
}
