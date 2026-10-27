import { describe, expect, it } from "vitest";
import { GAME_CLOCK, NIGHT_SPAWNS, TICK_RATE, WAVES } from "../../src/sim/config";
import { applyCommand, createGame, tick } from "../../src/sim/game";
import { setClockHour } from "../../src/sim/clock";
import { setConnected } from "../../src/sim/players";
import type { GameState } from "../../src/sim/types";

const COUNTDOWN_TICKS = WAVES.countdownSeconds * TICK_RATE;
const vote = (state: GameState, player: number) =>
  applyCommand(state, player, { type: "voteSkipToNight" });
/** A night game at midday, its keep unbreakable, with these players. */
const dayGame = (players = ["Ann"]) => {
  const state = createGame(1, { blankMap: true, enemiesCome: "night", players });
  state.debug.infiniteKeep = true;
  setClockHour(state, 12);
  return state;
};

describe("skip to night", () => {
  it("solo, skips at once to the early evening, and the first wave comes after the countdown", () => {
    const state = dayGame();
    const gold = state.players[1].gold;
    expect(vote(state, 1)).toEqual({ ok: true });
    expect(state.clock!.hour).toBe(NIGHT_SPAWNS.from);
    expect(state.clock!.day).toBe(1);
    expect(state.players[1].gold).toBe(gold);
    for (let i = 0; i < COUNTDOWN_TICKS; i++) tick(state);
    expect(state.wave.number).toBe(1);
  });

  it("with two players, needs both votes; a vote can be taken back", () => {
    const state = dayGame(["Ann", "Bo"]);
    vote(state, 1);
    expect(state.clock!.hour).toBe(12);
    vote(state, 1);
    expect(state.players[1].votes.skipToNight).toBe(false);
    vote(state, 1);
    vote(state, 2);
    expect(state.clock!.hour).toBe(NIGHT_SPAWNS.from);
  });

  it("clears the votes after the skip", () => {
    const state = dayGame(["Ann", "Bo"]);
    vote(state, 1);
    vote(state, 2);
    expect(state.players[1].votes.skipToNight).toBe(false);
    expect(state.players[2].votes.skipToNight).toBe(false);
  });

  it("clears a standing vote when the evening comes on its own", () => {
    const state = dayGame(["Ann", "Bo"]);
    vote(state, 1);
    setClockHour(state, NIGHT_SPAWNS.from - 0.001);
    for (let i = 0; i < 10; i++) tick(state);
    expect(state.players[1].votes.skipToNight).toBe(false);
  });

  it("clears a player's vote when they drop out, and skips if the rest all voted", () => {
    const state = dayGame(["Ann", "Bo"]);
    vote(state, 2);
    setConnected(state, 2, false);
    expect(state.players[2].votes.skipToNight).toBe(false);
    expect(state.clock!.hour).toBe(12);
    vote(state, 1);
    expect(state.clock!.hour).toBe(NIGHT_SPAWNS.from);
  });

  it("is refused by night, and with enemies all the time", () => {
    const night = dayGame();
    setClockHour(night, 22);
    expect(vote(night, 1)).toEqual({ ok: false, reason: "It's already night" });
    const always = createGame(1, { blankMap: true });
    expect(vote(always, 1)).toEqual({ ok: false, reason: "No night to skip to" });
    expect(GAME_CLOCK.sunrise).toBeLessThan(NIGHT_SPAWNS.from);
  });
});
