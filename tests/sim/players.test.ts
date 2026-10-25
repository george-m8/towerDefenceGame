import { describe, expect, it } from "vitest";
import {
  FAST_FORWARD_SPEED,
  STARTING_GOLD,
  STRUCTURES,
  TICK_RATE,
  TREE_CLEAR_GOLD,
  WAVES,
} from "../../src/sim/config";
import { spawnEnemy } from "../../src/sim/enemies";
import { applyCommand, createGame, tick } from "../../src/sim/game";
import { placeStructure, topAt } from "../../src/sim/grid";
import { addPlayer, playerName, setConnected } from "../../src/sim/players";
import type { GameState } from "../../src/sim/types";
import { createGameWithoutWaves, goldOf, paintTerrain } from "./helpers";

/** A blank, wave-free game with players 1 (A) and 2 (B). */
function twoPlayers(): GameState {
  const state = createGameWithoutWaves();
  addPlayer(state, "B");
  return state;
}

const A = 1;
const B = 2;

describe("players", () => {
  it("a new game has one player with the starting gold", () => {
    const state = createGame(1, { blankMap: true, fog: false });
    expect(Object.keys(state.players)).toEqual(["1"]);
    expect(playerName(state, 1)).toBe("Player 1");
    expect(goldOf(state, 1)).toBe(STARTING_GOLD);
  });

  it("can start with named players", () => {
    const state = createGame(1, { blankMap: true, fog: false, players: ["Ann", "Bo"] });
    expect(playerName(state, 1)).toBe("Ann");
    expect(playerName(state, 2)).toBe("Bo");
    expect(goldOf(state, 2)).toBe(STARTING_GOLD);
  });

  it("addPlayer hands out the next id with the starting gold", () => {
    const state = createGameWithoutWaves();
    expect(addPlayer(state, "B")).toBe(2);
    expect(addPlayer(state, "C")).toBe(3);
    expect(goldOf(state, 3)).toBe(STARTING_GOLD);
  });

  it("rejects commands from an unknown player and changes nothing", () => {
    const state = twoPlayers();
    const before = structuredClone(state);
    expect(applyCommand(state, 9, { type: "build", kind: "wall", x: 5, y: 5 })).toEqual({
      ok: false,
      reason: "Unknown player",
    });
    expect(state).toEqual(before);
  });
});

describe("separate gold", () => {
  it("building costs only the builder, and owns the structure", () => {
    const state = twoPlayers();
    applyCommand(state, B, { type: "build", kind: "wall", x: 5, y: 5 });
    expect(goldOf(state, B)).toBe(STARTING_GOLD - STRUCTURES.wall.cost);
    expect(goldOf(state, A)).toBe(STARTING_GOLD);
    expect(topAt(state, 5, 5)?.owner).toBe(B);
  });

  it("a player can't build with another player's gold", () => {
    const state = twoPlayers();
    state.players[A].gold = 0;
    expect(applyCommand(state, A, { type: "build", kind: "wall", x: 5, y: 5 })).toEqual({
      ok: false,
      reason: "Not enough gold",
    });
    expect(goldOf(state, B)).toBe(STARTING_GOLD);
  });

  it("bounties go to the player whose tower struck the killing blow", () => {
    const state = twoPlayers();
    placeStructure(state, "archer", 10, 10, "E", B);
    spawnEnemy(state, 11, 10, 1, 7);
    tick(state);
    expect(goldOf(state, B)).toBe(STARTING_GOLD + 7);
    expect(goldOf(state, A)).toBe(STARTING_GOLD);
  });

  it("house income goes to the house's owner", () => {
    const state = twoPlayers();
    const income = STRUCTURES.house.income;
    placeStructure(state, "house", 10, 10, "N", B);
    for (let i = 0; i < income.intervalSeconds * TICK_RATE; i++) tick(state);
    expect(goldOf(state, B)).toBe(STARTING_GOLD + income.gold);
    expect(goldOf(state, A)).toBe(STARTING_GOLD);
  });

  it("sell refunds go to the seller", () => {
    const state = twoPlayers();
    applyCommand(state, B, { type: "build", kind: "archer", x: 5, y: 5 });
    applyCommand(state, B, { type: "sell", x: 5, y: 5 });
    expect(goldOf(state, B)).toBe(
      STARTING_GOLD - STRUCTURES.archer.cost + Math.floor(STRUCTURES.archer.cost * 0.5),
    );
    expect(goldOf(state, A)).toBe(STARTING_GOLD);
  });

  it("tree clearing and ruin salvage pay the player who did it", () => {
    const state = twoPlayers();
    paintTerrain(state, [{ x: 5, y: 5 }], "tree");
    placeStructure(state, "ruin", 7, 7);
    applyCommand(state, B, { type: "sell", x: 5, y: 5 });
    applyCommand(state, B, { type: "sell", x: 7, y: 7 });
    expect(goldOf(state, B)).toBe(
      STARTING_GOLD + TREE_CLEAR_GOLD + STRUCTURES.ruin.salvageGold, // full-HP ruin
    );
    expect(goldOf(state, A)).toBe(STARTING_GOLD);
  });

  it("a chest pays the player whose build claimed it", () => {
    const state = twoPlayers();
    state.features.push({ kind: "chest", x: 10, y: 10, gold: 37 });
    applyCommand(state, B, { type: "build", kind: "wall", x: 10, y: 10 });
    expect(goldOf(state, B)).toBe(STARTING_GOLD - STRUCTURES.wall.cost + 37);
    expect(goldOf(state, A)).toBe(STARTING_GOLD);
  });

  it("the early-send bonus goes to whoever sent the wave", () => {
    const state = createGame(1, { blankMap: true, fog: false });
    addPlayer(state, "B");
    for (let i = 0; i < TICK_RATE * 5 + 7; i++) tick(state); // 14.65s left
    expect(applyCommand(state, B, { type: "sendWave" })).toEqual({ ok: true });
    expect(goldOf(state, B)).toBe(STARTING_GOLD + 14 * WAVES.earlySendGoldPerSecond);
    expect(goldOf(state, A)).toBe(STARTING_GOLD);
  });
});

describe("ownership rules", () => {
  it("a player can't sell another player's structure", () => {
    const state = twoPlayers();
    applyCommand(state, B, { type: "build", kind: "wall", x: 5, y: 5 });
    expect(applyCommand(state, A, { type: "sell", x: 5, y: 5 })).toEqual({
      ok: false,
      reason: "That belongs to B",
    });
    expect(topAt(state, 5, 5)?.owner).toBe(B);
    expect(goldOf(state, A)).toBe(STARTING_GOLD);
  });

  it("anyone can salvage a ruin, unless another player's tower stands on it", () => {
    const state = twoPlayers();
    placeStructure(state, "ruin", 5, 5);
    expect(applyCommand(state, A, { type: "sell", x: 5, y: 5 })).toEqual({ ok: true });

    placeStructure(state, "ruin", 7, 7);
    applyCommand(state, B, { type: "build", kind: "archer", x: 7, y: 7 });
    expect(applyCommand(state, A, { type: "sell", x: 7, y: 7 })).toEqual({
      ok: false,
      reason: "That belongs to B",
    });
  });

  it("towers mount on your own wall or a ruin, but not on another player's wall", () => {
    const state = twoPlayers();
    applyCommand(state, A, { type: "build", kind: "wall", x: 5, y: 5 });
    applyCommand(state, B, { type: "build", kind: "wall", x: 7, y: 7 });
    placeStructure(state, "ruin", 9, 9);
    expect(applyCommand(state, A, { type: "build", kind: "archer", x: 5, y: 5 })).toEqual({
      ok: true,
    });
    expect(applyCommand(state, A, { type: "build", kind: "archer", x: 9, y: 9 })).toEqual({
      ok: true,
    });
    expect(applyCommand(state, A, { type: "build", kind: "archer", x: 7, y: 7 })).toEqual({
      ok: false,
      reason: "That wall belongs to B",
    });
  });

  it("clearing trees isn't affected by ownership", () => {
    const state = twoPlayers();
    paintTerrain(state, [{ x: 5, y: 5 }], "tree");
    expect(applyCommand(state, A, { type: "sell", x: 5, y: 5 })).toEqual({ ok: true });
  });
});

describe("votes", () => {
  it("pause and fast-forward need every connected player's vote", () => {
    const state = twoPlayers();
    applyCommand(state, A, { type: "togglePause" });
    applyCommand(state, A, { type: "toggleFastForward" });
    expect(state.paused).toBe(false);
    expect(state.speed).toBe(1);
    applyCommand(state, B, { type: "togglePause" });
    applyCommand(state, B, { type: "toggleFastForward" });
    expect(state.paused).toBe(true);
    expect(state.speed).toBe(FAST_FORWARD_SPEED);
  });

  it("any player withdrawing their vote undoes it", () => {
    const state = twoPlayers();
    for (const id of [A, B]) applyCommand(state, id, { type: "togglePause" });
    applyCommand(state, B, { type: "togglePause" });
    expect(state.paused).toBe(false);
  });

  it("a dropped player's votes are cleared and they stop counting", () => {
    const state = twoPlayers();
    applyCommand(state, B, { type: "togglePause" });
    applyCommand(state, A, { type: "toggleFastForward" });
    setConnected(state, B, false);
    expect(state.players[B].votes).toEqual({ pause: false, fastForward: false });
    expect(state.paused).toBe(false);
    expect(state.speed).toBe(FAST_FORWARD_SPEED); // A is the only connected player now

    setConnected(state, B, true);
    expect(state.speed).toBe(1); // B is back and hasn't voted
  });

  it("the game pauses while nobody is connected", () => {
    const state = twoPlayers();
    setConnected(state, A, false);
    setConnected(state, B, false);
    expect(state.paused).toBe(true);
    setConnected(state, A, true);
    expect(state.paused).toBe(false);
  });
});

describe("rejoining", () => {
  it("a dropped player keeps their gold and structures, and keeps earning", () => {
    const state = twoPlayers();
    const income = STRUCTURES.house.income;
    applyCommand(state, B, { type: "build", kind: "house", x: 10, y: 10 });
    const gold = goldOf(state, B);
    setConnected(state, B, false);
    for (let i = 0; i < income.intervalSeconds * TICK_RATE; i++) tick(state);
    setConnected(state, B, true);
    expect(topAt(state, 10, 10)?.owner).toBe(B);
    expect(goldOf(state, B)).toBe(gold + income.gold);
  });
});

describe("multiplayer determinism", () => {
  it("the same seed and player command log give identical state", () => {
    type Entry = { tick: number; player: number; command: Parameters<typeof applyCommand>[2] };
    const play = () => {
      const state = createGame(99, { players: ["A", "B"] });
      const keep = state.keeps[0];
      const log: Entry[] = [
        { tick: 5, player: A, command: { type: "build", kind: "wall", x: keep.x - 2, y: keep.y } },
        { tick: 5, player: B, command: { type: "build", kind: "wall", x: keep.x - 2, y: keep.y } },
        {
          tick: 6,
          player: A,
          command: { type: "build", kind: "archer", x: keep.x - 2, y: keep.y },
        },
        {
          tick: 7,
          player: B,
          command: { type: "build", kind: "cannon", x: keep.x - 2, y: keep.y + 2 },
        },
        { tick: 8, player: B, command: { type: "build", kind: "house", x: keep.x + 4, y: keep.y } },
        { tick: 10, player: A, command: { type: "sendWave" } },
        { tick: 120, player: A, command: { type: "toggleFastForward" } },
        { tick: 121, player: B, command: { type: "toggleFastForward" } },
        { tick: 300, player: B, command: { type: "sell", x: keep.x - 2, y: keep.y } },
      ];
      for (let t = 0; t < 600; t++) {
        for (const e of log.filter((e) => e.tick === t)) applyCommand(state, e.player, e.command);
        tick(state);
      }
      return state;
    };
    const first = play();
    expect(JSON.stringify(play())).toBe(JSON.stringify(first));
    // Make sure the run exercised both players, not just an idle map.
    expect(first.wave.number).toBeGreaterThan(0);
    const owners = new Set(Object.values(first.structures).map((s) => s.owner));
    expect(owners).toEqual(new Set([null, A, B]));
  });
});

describe("no players", () => {
  it("a game created without players is paused", () => {
    expect(createGame(1, { blankMap: true, fog: false, players: [] }).paused).toBe(true);
  });
});
