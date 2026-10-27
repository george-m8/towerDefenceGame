import { describe, expect, it } from "vitest";
import { GAME_CLOCK, TICK_RATE } from "../../src/sim/config";
import { createGame, tick } from "../../src/sim/game";
import { isNight, setClockHour } from "../../src/sim/clock";

const { sunrise, sunset, dayMinutes, nightMinutes } = GAME_CLOCK;
const ticksFor = (minutes: number) => Math.round(minutes * 60 * TICK_RATE);
/** A game with a clock whose keep can't fall, so it runs as long as a test needs. */
const clocked = () => {
  const state = createGame(1, { blankMap: true, clock: true });
  state.debug.infiniteKeep = true;
  return state;
};
const run = (state: ReturnType<typeof createGame>, ticks: number) => {
  for (let i = 0; i < ticks; i++) tick(state);
};

describe("the game clock", () => {
  it("starts at the start hour on day 1, and only when asked for", () => {
    expect(clocked().clock).toEqual({ hour: GAME_CLOCK.startHour, day: 1 });
    const plain = createGame(1, { blankMap: true });
    expect(plain.clock).toBeNull();
    run(plain, 100);
    expect(plain.clock).toBeNull();
  });

  it("takes the day's minutes from sunrise to sunset, and the night's from sunset to sunrise", () => {
    const state = clocked();
    setClockHour(state, sunrise);
    run(state, ticksFor(dayMinutes));
    expect(state.clock!.hour).toBeCloseTo(sunset, 3);
    run(state, ticksFor(nightMinutes));
    expect(state.clock!.hour).toBeCloseTo(sunrise, 3);
  });

  it("goes round a whole day and night in 8 minutes, wrapping at midnight", () => {
    const state = clocked();
    expect(dayMinutes + nightMinutes).toBe(8);
    run(state, ticksFor(dayMinutes + nightMinutes));
    expect(state.clock!.hour).toBeCloseTo(GAME_CLOCK.startHour, 3);
    expect(state.clock!.day).toBe(2);
  });

  it("starts a new day at sunrise", () => {
    const state = clocked();
    setClockHour(state, sunrise - 0.01);
    expect(state.clock!.day).toBe(1);
    run(state, ticksFor(1));
    expect(state.clock!.day).toBe(2);
  });

  it("stops while the game is paused", () => {
    const state = clocked();
    state.paused = true;
    run(state, 100);
    expect(state.clock!.hour).toBe(GAME_CLOCK.startHour);
  });

  it("moved by hand, a jump from night into day passes sunrise", () => {
    const state = clocked();
    setClockHour(state, 2);
    expect(state.clock!.day).toBe(1);
    setClockHour(state, 9);
    expect(state.clock!.day).toBe(2);
    setClockHour(state, 25);
    expect(state.clock!.hour).toBe(1);
  });

  it("knows night from day", () => {
    expect(isNight(sunrise - 1)).toBe(true);
    expect(isNight(sunrise)).toBe(false);
    expect(isNight(sunset - 0.1)).toBe(false);
    expect(isNight(sunset)).toBe(true);
  });
});
