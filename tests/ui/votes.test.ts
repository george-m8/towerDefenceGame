import { describe, expect, it } from "vitest";
import { applyCommand, createGame } from "../../src/sim/game";
import { addPlayer, setConnected } from "../../src/sim/players";
import { hasVoted, voteCount, voteLabel } from "../../src/ui/votes";
import { describeTile } from "../../src/ui/tileInfo";

describe("vote labels", () => {
  it("are plain with one player and show the count with more", () => {
    const state = createGame(1, { blankMap: true });
    expect(voteLabel(state, "pause", "Pause")).toBe("Pause");
    addPlayer(state, "Bo");
    applyCommand(state, 2, { type: "togglePause" });
    expect(voteLabel(state, "pause", "Pause")).toBe("Pause 1/2");
    expect(hasVoted(state, 2, "pause")).toBe(true);
    expect(hasVoted(state, 1, "pause")).toBe(false);
  });

  it("count only connected players", () => {
    const state = createGame(1, { blankMap: true, players: ["Ann", "Bo", "Cy"] });
    applyCommand(state, 1, { type: "toggleFastForward" });
    setConnected(state, 3, false);
    expect(voteCount(state, "fastForward")).toEqual({ votes: 1, of: 2 });
  });
});

describe("Built by", () => {
  it("names the owner in multiplayer, and says nothing in single-player", () => {
    const solo = createGame(1, { blankMap: true });
    applyCommand(solo, 1, { type: "build", kind: "wall", x: 5, y: 5 });
    expect(describeTile(solo, { x: 5, y: 5 }).join("\n")).not.toContain("Built by");

    const duo = createGame(1, { blankMap: true, players: ["Ann", "Bo"] });
    applyCommand(duo, 2, { type: "build", kind: "wall", x: 5, y: 5 });
    applyCommand(duo, 2, { type: "build", kind: "archer", x: 5, y: 5 });
    const lines = describeTile(duo, { x: 5, y: 5 });
    expect(lines.filter((l) => l === "Built by Bo")).toHaveLength(2);
  });
});
