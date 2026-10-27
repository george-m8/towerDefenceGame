// The time of day as game state (games that use it only: see SPEC-game-clock.md). It runs on
// game ticks, so it stops while paused and runs faster on fast-forward, and it's the same for
// every player. Day hours and night hours pass at different rates (GAME_CLOCK).
import { GAME_CLOCK, TICK_RATE } from "./config";
import type { Clock, GameState } from "./types";

export function createClock(): Clock {
  return { hour: GAME_CLOCK.startHour, day: 1 };
}

/** Whether an hour is night: from sunset to sunrise. */
export function isNight(hour: number): boolean {
  return hour < GAME_CLOCK.sunrise || hour >= GAME_CLOCK.sunset;
}

/** How far one tick moves the clock at this hour: day and night take their own minutes. */
export function hoursPerTick(hour: number): number {
  const { sunrise, sunset, dayMinutes, nightMinutes } = GAME_CLOCK;
  const dayHours = sunset - sunrise;
  return isNight(hour)
    ? (24 - dayHours) / (nightMinutes * 60 * TICK_RATE)
    : dayHours / (dayMinutes * 60 * TICK_RATE);
}

/** Moves the clock on one tick. */
export function advanceClock(state: GameState): void {
  if (state.clock) moveClock(state, state.clock.hour + hoursPerTick(state.clock.hour));
}

/** Sets the clock by hand (the Debug menu): going from night into day passes sunrise. */
export function setClockHour(state: GameState, hour: number): void {
  if (state.clock) moveClock(state, hour);
}

/** Moves the clock to an hour (wrapped into 0-24); a new day starts when it passes sunrise. */
function moveClock(state: GameState, hour: number): void {
  const clock = state.clock!;
  const next = ((hour % 24) + 24) % 24;
  if (isNight(clock.hour) && !isNight(next) && next >= GAME_CLOCK.sunrise) clock.day++;
  clock.hour = next;
}
