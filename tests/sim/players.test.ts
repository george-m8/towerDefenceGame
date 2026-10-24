import { describe, expect, it } from "vitest";
import { STARTING_GOLD, STRUCTURES, TICK_RATE, TREE_CLEAR_GOLD, WAVES } from "../../src/sim/config";
import { spawnEnemy } from "../../src/sim/enemies";
import { applyCommand, createGame, tick } from "../../src/sim/game";
import { placeStructure, topAt } from "../../src/sim/grid";
import { addPlayer, playerName } from "../../src/sim/players";
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
    const state = createGame(1, { blankMap: true });
    expect(Object.keys(state.players)).toEqual(["1"]);
    expect(playerName(state, 1)).toBe("Player 1");
    expect(goldOf(state, 1)).toBe(STARTING_GOLD);
  });

  it("can start with named players", () => {
    const state = createGame(1, { blankMap: true, players: ["Ann", "Bo"] });
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
    placeStructure(state, "archer", 10, 10, "N", B);
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
    const state = createGame(1, { blankMap: true });
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
