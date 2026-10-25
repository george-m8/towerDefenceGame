import { describe, expect, it } from "vitest";
import { CUE_TICKS, ENEMY, STRUCTURES, TICK_RATE } from "../../src/sim/config";
import { addCue } from "../../src/sim/cues";
import { spawnEnemy } from "../../src/sim/enemies";
import { applyCommand, createGame, tick } from "../../src/sim/game";
import { placeStructure } from "../../src/sim/grid";
import { updateTraps } from "../../src/sim/traps";
import type { GameState } from "../../src/sim/types";
import { createGameWithoutWaves } from "./helpers";

const kinds = (state: GameState) => state.cues.map((c) => c.kind);
const run = (state: GameState, ticks: number) => {
  for (let i = 0; i < ticks; i++) tick(state);
};

describe("addCue", () => {
  it("gives each cue the next id and a lifetime, and cues expire with the ticks", () => {
    const state = createGameWithoutWaves();
    addCue(state, "treasure");
    addCue(state, "keepHit");
    expect(state.cues.map((c) => c.id)).toEqual([1, 2]);
    run(state, CUE_TICKS - 1);
    expect(state.cues).toHaveLength(2);
    tick(state);
    expect(state.cues).toEqual([]);
    addCue(state, "treasure");
    expect(state.cues[0].id).toBe(3); // ids keep counting after old cues expire
  });
});

describe("cues from the game", () => {
  it("an enemy reaching the keep adds keepHit", () => {
    const state = createGameWithoutWaves();
    spawnEnemy(state, state.keep.x - 1, state.keep.y);
    // Check on the tick the keep is hit: the cue only lives for CUE_TICKS.
    for (let i = 0; i < 40 && state.keep.hp === state.keep.maxHp; i++) tick(state);
    expect(state.keep.hp).toBe(state.keep.maxHp - ENEMY.keepDamage);
    expect(kinds(state)).toContain("keepHit");
  });

  it("claiming a treasure chest adds treasure", () => {
    const state = createGameWithoutWaves();
    state.features.push({ kind: "chest", x: 10, y: 10, gold: 30 });
    applyCommand(state, 1, { type: "build", kind: "wall", x: 10, y: 10 });
    expect(kinds(state)).toEqual(["treasure"]);
  });

  it("a tower hitting an enemy adds enemyHit, and a blast adds splash", () => {
    const state = createGameWithoutWaves();
    placeStructure(state, "archer", 10, 10, "E", 1);
    placeStructure(state, "cannon", 10, 14, "E", 1);
    spawnEnemy(state, 12, 10, 1_000);
    spawnEnemy(state, 12, 14, 1_000);
    tick(state);
    expect(kinds(state)).toEqual(expect.arrayContaining(["enemyHit", "splash"]));
  });

  it("a spike trap catching an enemy adds enemyHit", () => {
    const state = createGameWithoutWaves();
    placeStructure(state, "floorSpikes", 10, 10, "N", 1);
    spawnEnemy(state, 10, 10, 1_000);
    // Run just the traps, so the enemy stays on the spikes until they fire.
    const interval = STRUCTURES.floorSpikes.trap.fireIntervalSeconds * TICK_RATE;
    for (let i = 0; i < interval; i++) updateTraps(state);
    expect(kinds(state)).toEqual(["enemyHit"]);
  });

  it("a wave starting adds waveStart", () => {
    const state = createGameWithoutWaves();
    applyCommand(state, 1, { type: "sendWave" });
    expect(kinds(state)).toContain("waveStart");
  });

  it("the keep falling adds gameOver, once", () => {
    const state = createGameWithoutWaves();
    state.keep.hp = ENEMY.keepDamage;
    spawnEnemy(state, state.keep.x - 1, state.keep.y);
    run(state, 40);
    expect(state.gameOver).toBe(true);
    expect(kinds(state).filter((k) => k === "gameOver")).toHaveLength(1);
  });

  it("the same seed and commands give the same cues", () => {
    const play = () => {
      const s = createGame(7, { blankMap: true });
      applyCommand(s, 1, { type: "sendWave" });
      run(s, 200);
      return s.cues;
    };
    expect(play()).toEqual(play());
  });
});
