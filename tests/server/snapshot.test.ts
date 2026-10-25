import { describe, expect, it } from "vitest";
import { spawnEnemy } from "../../src/sim/enemies";
import { applyCommand, createGame, tick } from "../../src/sim/game";
import { placeStructure } from "../../src/sim/grid";
import { getFlowField } from "../../src/sim/pathfinding";
import type { GameState } from "../../src/sim/types";
import { toClientState, toUpdate } from "../../src/net/snapshot";

describe("toClientState", () => {
  it("leaves out the flow field, rng state and server-only enemy and structure fields", () => {
    const state = createGame(3);
    getFlowField(state);
    spawnEnemy(state, 0, 12);
    tick(state);
    const client = toClientState(state);
    expect(client).not.toHaveProperty("flow");
    expect(client).not.toHaveProperty("rngState");
    expect(Object.keys(client.enemies[0]).sort()).toEqual(["hp", "id", "maxHp", "x", "y"]);
    for (const s of Object.values(client.structures)) expect(s).not.toHaveProperty("cooldown");
    expect(client.terrain).toEqual(state.terrain);
    expect(client.players).toEqual(state.players);
  });

  it("rounds enemy positions to 2 decimals", () => {
    const state = createGame(3, { blankMap: true, fog: false });
    const enemy = spawnEnemy(state, 0, 12);
    enemy.x = 3.14159;
    expect(toClientState(state).enemies[0]).toMatchObject({ x: 3.14, y: 12 });
  });

  it("is enough for the client to rebuild the flow field", () => {
    const state = createGame(3);
    const client = toClientState(state);
    const rebuilt = getFlowField({ ...client, flow: null } as unknown as GameState);
    expect(rebuilt.dist).toEqual(getFlowField(state).dist);
  });

  it("survives a JSON round trip unchanged", () => {
    const state = createGame(3);
    const client = toClientState(state);
    expect(JSON.parse(JSON.stringify(client))).toEqual(client);
  });
});

describe("toUpdate", () => {
  it("includes the grid only when it changed since the last update", () => {
    const state = createGame(3, { blankMap: true, fog: false });
    const quiet = toUpdate(state, state.gridVersion);
    expect(quiet).not.toHaveProperty("terrain");
    expect(quiet).not.toHaveProperty("base");
    expect(quiet).not.toHaveProperty("features");
    expect(quiet.tick).toBe(state.tick);

    const before = state.gridVersion;
    applyCommand(state, 1, { type: "build", kind: "wall", x: 5, y: 5 });
    const changed = toUpdate(state, before);
    expect(changed.base).toEqual(state.base);
    expect(changed.mount).toEqual(state.mount);
    expect(changed.terrain).toEqual(state.terrain);
    expect(changed.features).toEqual(state.features);
    expect(changed.gridVersion).toBe(state.gridVersion);
  });

  it("stays under 30 KB with 200 enemies and 150 structures", () => {
    const state = createGame(5, { blankMap: true, fog: false });
    let built = 0;
    for (let y = 0; y < state.height && built < 150; y += 2) {
      for (let x = 4; x < state.width - 4 && built < 150; x += 3) {
        placeStructure(state, built % 3 ? "wall" : "archer", x, y, "N", 1);
        built++;
      }
    }
    for (let i = 0; i < 200; i++)
      spawnEnemy(state, i % 2, ((i * 7) % 12) + 10, { hp: 100, bounty: 2 });
    for (let i = 0; i < 7; i++) tick(state); // enemies mid-move, at fractional positions
    expect(Object.keys(state.structures).length).toBeGreaterThanOrEqual(150);
    expect(state.enemies.length).toBe(200);
    const bytes = JSON.stringify({
      type: "update",
      update: toUpdate(state, state.gridVersion),
    }).length;
    expect(bytes).toBeLessThan(30 * 1024);
  });
});
