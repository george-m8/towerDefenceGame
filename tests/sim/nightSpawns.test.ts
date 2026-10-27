import { describe, expect, it } from "vitest";
import { GAME_CLOCK, NIGHT_SPAWNS, TICK_RATE, WAVES } from "../../src/sim/config";
import { applyCommand, createGame, tick } from "../../src/sim/game";
import { isSpawningTime, nightsSurvived, setClockHour } from "../../src/sim/clock";
import type { GameState } from "../../src/sim/types";

const COUNTDOWN_TICKS = WAVES.countdownSeconds * TICK_RATE;
/** A night game whose keep can't fall, so it runs as long as a test needs. */
const nightGame = (seed = 1) => {
  const state = createGame(seed, { blankMap: true, enemiesCome: "night" });
  state.debug.infiniteKeep = true;
  return state;
};
const run = (state: GameState, ticks: number) => {
  for (let i = 0; i < ticks; i++) tick(state);
};
/** Runs until the clock reaches an hour (going forward, round midnight if need be). */
const runUntil = (state: GameState, hour: number) => {
  for (let i = 0; i < 100_000 && Math.abs(state.clock!.hour - hour) > 0.002; i++) tick(state);
};

describe("enemies at night", () => {
  it("starts in the early evening with a clock, and the first wave comes after the usual countdown", () => {
    const state = nightGame();
    expect(state.enemiesCome).toBe("night");
    expect(state.clock!.hour).toBe(GAME_CLOCK.startHour);
    expect(isSpawningTime(state)).toBe(true);
    run(state, COUNTDOWN_TICKS - 1);
    expect(state.wave.number).toBe(0);
    run(state, 1);
    expect(state.wave.number).toBe(1);
  });

  it("sends nothing by day, then starts the countdown in the early evening", () => {
    const state = nightGame();
    setClockHour(state, GAME_CLOCK.sunrise + 1);
    expect(isSpawningTime(state)).toBe(false);
    runUntil(state, NIGHT_SPAWNS.from - 0.01);
    expect(state.wave.number).toBe(0);
    expect(state.enemies).toHaveLength(0);
    runUntil(state, NIGHT_SPAWNS.from + 0.001);
    run(state, COUNTDOWN_TICKS);
    expect(state.wave.number).toBe(1);
  });

  it("runs today's waves through the night, carrying their numbers on to the next night", () => {
    const state = nightGame();
    runUntil(state, GAME_CLOCK.sunrise);
    const lastOfNight = state.wave.number;
    expect(lastOfNight).toBeGreaterThan(1);
    runUntil(state, NIGHT_SPAWNS.from - 0.01);
    expect(state.wave.number).toBe(lastOfNight);
    runUntil(state, NIGHT_SPAWNS.from + 0.001);
    run(state, COUNTDOWN_TICKS + 1);
    expect(state.wave.number).toBe(lastOfNight + 1);
  });

  it("starts no wave after sunrise, but a wave already coming finishes", () => {
    const state = nightGame();
    run(state, 1);
    setClockHour(state, GAME_CLOCK.sunrise - 0.001);
    expect(applyCommand(state, 1, { type: "sendWave" }).ok).toBe(true);
    const number = state.wave.number;
    run(state, 2);
    expect(isSpawningTime(state)).toBe(false);
    const spawnedBySunrise = state.enemies.length;
    run(state, 30 * TICK_RATE);
    expect(state.wave.threatLeft).toBe(0);
    expect(state.enemies.length).toBeGreaterThan(spawnedBySunrise);
    run(state, 2 * COUNTDOWN_TICKS);
    expect(state.wave.number).toBe(number);
  });

  it("keeps the enemies already out after sunrise", () => {
    const state = nightGame();
    run(state, COUNTDOWN_TICKS + 10 * TICK_RATE);
    expect(state.enemies.length).toBeGreaterThan(0);
    setClockHour(state, GAME_CLOCK.sunrise + 1);
    run(state, 1);
    expect(state.enemies.length).toBeGreaterThan(0);
  });

  it("refuses sending a wave early by day", () => {
    const state = nightGame();
    setClockHour(state, 12);
    expect(applyCommand(state, 1, { type: "sendWave" })).toEqual({
      ok: false,
      reason: "Enemies come at night",
    });
  });

  it("counts a night survived each sunrise", () => {
    const state = nightGame();
    expect(nightsSurvived(state)).toBe(0);
    runUntil(state, GAME_CLOCK.sunrise + 0.01);
    expect(nightsSurvived(state)).toBe(1);
  });

  it("plays the same from the same seed", () => {
    const a = nightGame(5);
    const b = nightGame(5);
    run(a, 3000);
    run(b, 3000);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("enemies all the time", () => {
  it("is the default, with no clock, and waves as before", () => {
    const state = createGame(1, { blankMap: true });
    expect(state.enemiesCome).toBe("always");
    expect(state.clock).toBeNull();
    expect(isSpawningTime(state)).toBe(true);
    run(state, COUNTDOWN_TICKS);
    expect(state.wave.number).toBe(1);
  });

  it("is all there is in PvP, which has no waves", () => {
    const state = createGame(1, { mode: "pvp", enemiesCome: "night", players: ["A", "B"] });
    expect(state.enemiesCome).toBe("always");
    expect(state.clock).toBeNull();
  });
});
