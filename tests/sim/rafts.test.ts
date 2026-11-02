import { describe, expect, it } from "vitest";
import { RAFTS, TICK_RATE } from "../../src/sim/config";
import { applyCommand, createGame, tick } from "../../src/sim/game";
import { canBuild, isKeepTile, placeStructure, tileIndex } from "../../src/sim/grid";
import { launchRaft } from "../../src/sim/rafts";
import type { GameState } from "../../src/sim/types";

const ME = 1;

function run(state: GameState, seconds: number) {
  for (let i = 0; i < seconds * TICK_RATE; i++) tick(state);
}

/** A Rafts game, the waves held off (each test brings them on as it needs). */
function raftsGame(): GameState {
  const state = createGame(11, { mode: "rafts" });
  state.wave.countdown = Infinity;
  return state;
}

describe("Rafts", () => {
  it("raises the keep's land, with resources on it, and floods the rest", () => {
    const state = raftsGame();
    const keep = state.keeps[0];
    const mid = { x: keep.x + 1, y: keep.y + 1 };
    const near = (x: number, y: number, r: number) => Math.hypot(x - mid.x, y - mid.y) < r;
    let hill = 0;
    let resources = 0;
    for (let y = 0; y < state.height; y++) {
      for (let x = 0; x < state.width; x++) {
        if (!near(x, y, RAFTS.raisedRadius * 0.8)) continue;
        const t = state.terrain[tileIndex(state, x, y)];
        if (t === "hill") hill++;
        if (t === "tree" || t === "rock" || t === "goldRock" || t === "berries") resources++;
      }
    }
    expect(hill).toBeGreaterThan(300);
    expect(resources).toBeGreaterThan(5);
    expect(state.spawnTiles).toEqual([]);
    run(state, 40);
    // Away from the keep's land it's water, but for what stands up from it (and the odd pocket
    // of land that shuts in).
    let dry = 0;
    let away = 0;
    for (let y = 0; y < state.height; y++) {
      for (let x = 0; x < state.width; x++) {
        if (near(x, y, RAFTS.raisedRadius * 1.3)) continue;
        away++;
        if (state.terrain[tileIndex(state, x, y)] === "ground") dry++;
      }
    }
    expect(dry / away).toBeLessThan(0.05);
    expect(state.terrain[tileIndex(state, mid.x + 6, mid.y)]).not.toBe("floodwater");
  });

  it("sails a wave in on rafts that put them off on the keep's shore", () => {
    const state = raftsGame();
    run(state, 40);
    expect(launchRaft(state, ["goblin", "goblin", "goblin"], { wave: 1 })).toBe(true);
    const [raft] = state.rafts!.boats;
    expect(raft.riders).toHaveLength(3);
    // More of the wave boards it while it waits at the edge.
    launchRaft(state, ["goblin"], { wave: 1 });
    expect(state.rafts!.boats).toHaveLength(1);
    expect(raft.riders).toHaveLength(4);
    const start = { x: raft.x, y: raft.y };
    run(state, RAFTS.boardSeconds + 2);
    expect(Math.hypot(raft.x - start.x, raft.y - start.y)).toBeGreaterThan(1); // under way
    run(state, 120);
    expect(state.rafts!.boats).toEqual([]);
    // Ashore, on land joined to the keep.
    expect(state.enemies.length).toBeGreaterThan(0);
    for (const e of state.enemies) {
      expect(e.raft).toBeUndefined();
      expect(state.terrain[tileIndex(state, Math.round(e.x), Math.round(e.y))]).not.toBe(
        "floodwater",
      );
    }
  });

  it("drains water walled off from the edge", () => {
    const state = raftsGame();
    run(state, 40);
    const keep = state.keeps[0];
    // A pocket of floodwater by the keep's land, closed round with walls.
    const at = { x: keep.x, y: keep.y - RAFTS.raisedRadius - 6 };
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const x = at.x + dx;
        const y = at.y + dy;
        if (Math.abs(dx) === 2 || Math.abs(dy) === 2) {
          state.terrain[tileIndex(state, x, y)] = "floodwater";
          placeStructure(state, "wall", x, y, "N", ME).buildLeft = 0;
        } else state.terrain[tileIndex(state, x, y)] = "floodwater";
      }
    }
    run(state, RAFTS.drainSeconds * 3 + 2);
    expect(state.terrain[tileIndex(state, at.x, at.y)]).toBe("ground");
  });

  it("lets a tower go on a wall built out over the water", () => {
    const state = raftsGame();
    run(state, 40);
    state.explored = state.explored.map(() => 1);
    const i = state.terrain.indexOf("floodwater");
    const x = i % state.width;
    const y = Math.floor(i / state.width);
    placeStructure(state, "wall", x, y, "N", ME).buildLeft = 0;
    expect(canBuild(state, ME, "archer", x, y)).toEqual({ ok: true });
    state.players[ME].gold = 1000;
    expect(applyCommand(state, ME, { type: "build", kind: "archer", x, y, facing: "E" })).toEqual({
      ok: true,
    });
    expect(isKeepTile(state, x, y)).toBe(false);
  });
});
