import { goldOf } from "./helpers";
import { describe, expect, it } from "vitest";
import { TICK_RATE, WAVES } from "../../src/sim/config";
import { applyCommand, createGame, tick } from "../../src/sim/game";
import { waveBounty, waveEnemyCount, waveEnemyHp } from "../../src/sim/waves";
import type { GameState } from "../../src/sim/types";

const countdownTicks = WAVES.countdownSeconds * TICK_RATE;
const intervalTicks = WAVES.spawnIntervalSeconds * TICK_RATE;

function run(state: GameState, ticks: number) {
  for (let i = 0; i < ticks; i++) tick(state);
}

describe("wave formulas", () => {
  it("wave N has 5 + 3N enemies", () => {
    expect(waveEnemyCount(1)).toBe(8);
    expect(waveEnemyCount(5)).toBe(20);
    expect(waveEnemyCount(20)).toBe(65);
  });

  it("enemy HP grows 15% per wave", () => {
    expect(waveEnemyHp(1)).toBe(20);
    expect(waveEnemyHp(5)).toBe(32);
    expect(waveEnemyHp(20)).toBe(77);
  });

  it("bounty grows by 1 every 5 waves", () => {
    expect(waveBounty(1)).toBe(2);
    expect(waveBounty(5)).toBe(2);
    expect(waveBounty(6)).toBe(3);
    expect(waveBounty(11)).toBe(4);
  });
});

describe("wave schedule", () => {
  it("starts wave 1 after the first countdown", () => {
    const state = createGame(1, { blankMap: true, fog: false });
    run(state, countdownTicks - 1);
    expect(state.wave.number).toBe(0);
    tick(state);
    expect(state.wave.number).toBe(1);
    expect(state.enemies).toHaveLength(1);
    const [first] = state.enemies;
    expect(state.spawnTiles).toContainEqual({ x: first.x, y: first.y });
  });

  it("staggers spawns and gives them the wave's HP and bounty", () => {
    const state = createGame(1, { blankMap: true, fog: false });
    run(state, countdownTicks);
    run(state, intervalTicks);
    expect(state.enemies).toHaveLength(2);
    run(state, intervalTicks * (waveEnemyCount(1) - 2));
    expect(state.enemies).toHaveLength(waveEnemyCount(1));
    for (const e of state.enemies) {
      expect(e.hp).toBe(waveEnemyHp(1));
      expect(e.bounty).toBe(waveBounty(1));
    }
  });

  it("starts the next countdown once spawning finishes, then the next wave", () => {
    const state = createGame(1, { blankMap: true, fog: false });
    run(state, countdownTicks); // wave 1 starts, first enemy spawned
    run(state, intervalTicks * (waveEnemyCount(1) - 1)); // last enemy spawned
    expect(state.wave.toSpawn).toBe(0);
    run(state, countdownTicks - 1);
    expect(state.wave.number).toBe(1);
    tick(state);
    expect(state.wave.number).toBe(2);
  });
});

describe("send wave early", () => {
  it("starts the next wave now and pays 1 gold per full second skipped", () => {
    const state = createGame(1, { blankMap: true, fog: false });
    run(state, TICK_RATE * 5 + 7); // 14.65s left
    const gold = goldOf(state);
    expect(applyCommand(state, 1, { type: "sendWave" })).toEqual({ ok: true });
    expect(goldOf(state)).toBe(gold + 14 * WAVES.earlySendGoldPerSecond);
    expect(state.wave.number).toBe(1);
    tick(state);
    expect(state.enemies).toHaveLength(1);
  });

  it("is rejected while a wave is still spawning", () => {
    const state = createGame(1, { blankMap: true, fog: false });
    applyCommand(state, 1, { type: "sendWave" });
    expect(applyCommand(state, 1, { type: "sendWave" })).toEqual({
      ok: false,
      reason: "Wave still spawning",
    });
  });
});
