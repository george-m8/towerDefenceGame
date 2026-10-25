import { describe, expect, it } from "vitest";
import { ENEMY_KIND_ORDER } from "../../src/sim/config";
import { spawnEnemy } from "../../src/sim/enemies";
import { applyCommand, createGame, tick } from "../../src/sim/game";
import { placeStructure, topAt } from "../../src/sim/grid";
import { getFlowField } from "../../src/sim/pathfinding";
import type { GameState } from "../../src/sim/types";
import { sentStateOf, toClientState, toUpdate } from "../../src/net/snapshot";

describe("toClientState", () => {
  it("leaves out the flow field, rng state and server-only enemy and structure fields", () => {
    const state = createGame(3);
    getFlowField(state);
    spawnEnemy(state, 0, 12);
    tick(state);
    const client = toClientState(state);
    expect(client).not.toHaveProperty("flows");
    expect(client).not.toHaveProperty("rngState");
    expect(Object.keys(client.enemies[0]).sort()).toEqual([
      "hp",
      "id",
      "kind",
      "maxHp",
      "variant",
      "x",
      "y",
    ]);
    for (const s of Object.values(client.structures)) expect(s).not.toHaveProperty("cooldown");
    expect(client.terrain).toEqual(state.terrain);
    expect(client.players).toEqual(state.players);
  });

  it("sends kind and variant as small numbers", () => {
    const state = createGame(3, { blankMap: true, fog: false });
    spawnEnemy(state, 0, 12, { kind: "dwarf", variant: 2 });
    expect(toClientState(state).enemies[0]).toMatchObject({
      kind: ENEMY_KIND_ORDER.indexOf("dwarf"),
      variant: 2,
    });
  });

  it("sends an enemy's kind and variant in updates only the first time", () => {
    const state = createGame(3, { blankMap: true, fog: false });
    spawnEnemy(state, 0, 12, { kind: "golem" }); // in the welcome snapshot
    const sent = sentStateOf(state);
    spawnEnemy(state, 0, 14, { kind: "dwarf", variant: 2 }); // new since
    const [known, fresh] = toUpdate(state, sent).enemies;
    expect(known).not.toHaveProperty("kind");
    expect(known).not.toHaveProperty("variant");
    expect(fresh).toMatchObject({ kind: ENEMY_KIND_ORDER.indexOf("dwarf"), variant: 2 });
    expect(toUpdate(state, sent).enemies[1]).not.toHaveProperty("kind");
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
    const rebuilt = getFlowField({ ...client, flows: {} } as unknown as GameState);
    expect(rebuilt.dist).toEqual(getFlowField(state).dist);
  });

  it("survives a JSON round trip unchanged", () => {
    const state = createGame(3);
    const client = toClientState(state);
    expect(JSON.parse(JSON.stringify(client))).toEqual(client);
  });
});

describe("toUpdate", () => {
  it("carries only what changed: new structures, changed tiles, and removals", () => {
    const state = createGame(3, { blankMap: true, fog: false });
    const sent = sentStateOf(state);
    const quiet = toUpdate(state, sent);
    expect(quiet).not.toHaveProperty("structures");
    expect(quiet).not.toHaveProperty("removed");
    expect(quiet).not.toHaveProperty("tiles");
    expect(quiet).not.toHaveProperty("features");
    expect(quiet.tick).toBe(state.tick);

    applyCommand(state, 1, { type: "build", kind: "wall", x: 5, y: 5 });
    const built = toUpdate(state, sent);
    const wall = topAt(state, 5, 5)!;
    expect(built.structures).toEqual([expect.objectContaining({ id: wall.id, kind: "wall" })]);
    expect(built.tiles).toMatchObject({ base: [[5 * state.width + 5, wall.id]] });
    expect(built).not.toHaveProperty("features"); // no chest claimed
    expect(built.gridVersion).toBe(state.gridVersion);
    expect(toUpdate(state, sent)).not.toHaveProperty("structures"); // sent once

    wall.hp -= 10;
    expect(toUpdate(state, sent).structures).toEqual([expect.objectContaining({ hp: 40 })]);

    applyCommand(state, 1, { type: "sell", x: 5, y: 5 });
    const sold = toUpdate(state, sent);
    expect(sold.removed).toEqual([wall.id]);
    expect(sold.tiles).toEqual({ base: [[5 * state.width + 5, 0]] });
  });

  it("sends the chests again only when one is claimed", () => {
    const state = createGame(3, { blankMap: true, fog: false });
    state.features = [{ kind: "chest", x: 8, y: 8, gold: 30 }];
    const sent = sentStateOf(state);
    applyCommand(state, 1, { type: "build", kind: "wall", x: 8, y: 8 });
    expect(toUpdate(state, sent).features).toEqual([]);
    expect(toUpdate(state, sent)).not.toHaveProperty("features");
  });

  it("stays small with 200 enemies and 150 structures, and a build adds little", () => {
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
    const sent = sentStateOf(state);
    const size = () => JSON.stringify({ type: "update", update: toUpdate(state, sent) }).length;
    const quiet = size();
    expect(quiet).toBeLessThan(12 * 1024); // the enemies, and no structures
    applyCommand(state, 1, { type: "build", kind: "wall", x: 100, y: 1 });
    expect(size() - quiet).toBeLessThan(1024);
  });
});
