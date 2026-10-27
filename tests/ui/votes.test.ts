import { describe, expect, it } from "vitest";
import { applyCommand, createGame } from "../../src/sim/game";
import { addPlayer, setConnected } from "../../src/sim/players";
import { canSkipToNight, hasVoted, voteCount, voteLabel } from "../../src/ui/votes";
import { setClockHour } from "../../src/sim/clock";
import { describeTile } from "../../src/ui/tileInfo";

describe("vote labels", () => {
  it("are plain with one player and show the count with more", () => {
    const state = createGame(1, { blankMap: true, fog: false });
    expect(voteLabel(state, "pause", "Pause")).toBe("Pause");
    addPlayer(state, "Bo");
    applyCommand(state, 2, { type: "togglePause" });
    expect(voteLabel(state, "pause", "Pause")).toBe("Pause 1/2");
    expect(hasVoted(state, 2, "pause")).toBe(true);
    expect(hasVoted(state, 1, "pause")).toBe(false);
  });

  it("count only connected players", () => {
    const state = createGame(1, { blankMap: true, fog: false, players: ["Ann", "Bo", "Cy"] });
    applyCommand(state, 1, { type: "toggleFastForward" });
    setConnected(state, 3, false);
    expect(voteCount(state, "fastForward")).toEqual({ votes: 1, of: 2 });
  });
});

describe("Built by", () => {
  it("names the owner in multiplayer, and says nothing in single-player", () => {
    const solo = createGame(1, { blankMap: true, fog: false });
    applyCommand(solo, 1, { type: "build", kind: "wall", x: 5, y: 5 });
    expect(describeTile(solo, { x: 5, y: 5 }).join("\n")).not.toContain("Built by");

    const duo = createGame(1, { blankMap: true, fog: false, players: ["Ann", "Bo"] });
    applyCommand(duo, 2, { type: "build", kind: "wall", x: 5, y: 5 });
    applyCommand(duo, 2, { type: "build", kind: "archer", x: 5, y: 5 });
    const lines = describeTile(duo, { x: 5, y: 5 });
    expect(lines.filter((l) => l === "Built by Bo")).toHaveLength(2);
  });
});

describe("canSkipToNight", () => {
  it("is offered by day in a game with enemies at night, not by night", () => {
    const state = createGame(1, { blankMap: true, enemiesCome: "night" });
    setClockHour(state, 12);
    expect(canSkipToNight(state)).toBe(true);
    setClockHour(state, 22);
    expect(canSkipToNight(state)).toBe(false);
  });

  it("is never offered with enemies all the time, or once the game is over", () => {
    expect(canSkipToNight(createGame(1, { blankMap: true }))).toBe(false);
    const over = createGame(1, { blankMap: true, enemiesCome: "night" });
    setClockHour(over, 12);
    over.gameOver = true;
    expect(canSkipToNight(over)).toBe(false);
  });

  it("shows the vote count in co-op, like Pause", () => {
    const state = createGame(1, { blankMap: true, enemiesCome: "night", players: ["Ann", "Bo"] });
    setClockHour(state, 12);
    state.players[1].votes.skipToNight = true;
    expect(voteLabel(state, "skipToNight", "Skip to night")).toBe("Skip to night 1/2");
  });
});
