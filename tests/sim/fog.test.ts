import { describe, expect, it } from "vitest";
import { STRUCTURES, KEEP_SIGHT, UNIT_KINDS, type StructureStats } from "../../src/sim/config";
import { applyCommand, assignKeeps, createGame, tick } from "../../src/sim/game";
import { spawnUnit } from "../../src/sim/units";
import {
  IN_SIGHT,
  SEEN,
  UNEXPLORED,
  canSeeEnemiesAt,
  getSight,
  isExplored,
  tierAt,
} from "../../src/sim/fog";
import { mountAt, placeStructure } from "../../src/sim/grid";
import { sentStateOf, toClientState, toUpdate } from "../../src/net/snapshot";
import { applyUpdate, fromClientState } from "../../src/net/view";
import type { GameState, StructureKind } from "../../src/sim/types";

/** A blank map with fog on and no waves. */
function foggy(players?: string[]): GameState {
  const state = createGame(1, { blankMap: true, players });
  state.wave.countdown = Infinity;
  return state;
}

/** The keep's right-hand column, and the row through its middle. */
function keepEdge(state: GameState) {
  return { x: state.keeps[0].x + state.keeps[0].size - 1, y: state.keeps[0].y + 1 };
}

function build(state: GameState, kind: StructureKind, x: number, y: number, player = 1) {
  return applyCommand(state, player, { type: "build", kind, x, y, facing: "E" });
}

describe("a new game", () => {
  it("sees around the keep, a wider ring of land, the spawn strip, and nothing else", () => {
    const state = foggy();
    const edge = keepEdge(state);
    expect(tierAt(state, edge.x + KEEP_SIGHT.inner, edge.y)).toBe(IN_SIGHT);
    expect(tierAt(state, edge.x + KEEP_SIGHT.inner + 1, edge.y)).toBe(SEEN);
    expect(tierAt(state, edge.x + KEEP_SIGHT.outer, edge.y)).toBe(SEEN);
    expect(tierAt(state, edge.x + KEEP_SIGHT.outer + 1, edge.y)).toBe(UNEXPLORED);
    for (const p of state.spawnTiles) expect(tierAt(state, p.x, p.y)).toBe(SEEN);
    expect(tierAt(state, 0, 0)).toBe(UNEXPLORED);
    expect(tierAt(state, state.width - 1, state.height - 1)).toBe(UNEXPLORED);
  });

  it("with fog off, every tile is in sight", () => {
    const state = createGame(1, { blankMap: true, fog: false });
    expect(getSight(state).every((t) => t === IN_SIGHT)).toBe(true);
  });

  it("generated ruins reveal nothing", () => {
    const state = createGame(42);
    const ruin = Object.values(state.structures).find(
      (s) => s.kind === "ruin" && tierAt(state, s.x, s.y) === UNEXPLORED,
    );
    expect(ruin).toBeDefined();
  });
});

describe("sight regions", () => {
  it("the keep sees furthest, towers next, walls least", () => {
    const sight = (kind: StructureKind) => (STRUCTURES[kind] as StructureStats).sight!;
    const towers: StructureKind[] = ["archer", "cannon", "catapult", "watchtower"];
    for (const kind of towers) {
      expect(sight(kind).inner).toBeLessThan(KEEP_SIGHT.inner);
      expect(sight(kind).inner).toBeGreaterThan(sight("wall").inner);
    }
    for (const kind of Object.keys(STRUCTURES) as StructureKind[]) {
      const s = (STRUCTURES[kind] as StructureStats).sight;
      if (!s || kind === "wall") continue;
      expect(s.outer).toBeGreaterThan(sight("wall").outer);
    }
    expect((STRUCTURES.ruin as StructureStats).sight).toBeUndefined();
  });

  it("every tower sees at least as far as it shoots", () => {
    for (const stats of Object.values(STRUCTURES) as StructureStats[]) {
      if (stats.tower) expect(stats.sight!.inner).toBeGreaterThanOrEqual(stats.tower.range);
    }
  });

  it("a wall at the edge of the seen land reveals only its neighbours", () => {
    const state = foggy();
    const edge = keepEdge(state);
    const x = edge.x + KEEP_SIGHT.outer;
    expect(build(state, "wall", x, edge.y)).toEqual({ ok: true });
    expect(tierAt(state, x + 1, edge.y)).toBe(IN_SIGHT);
    expect(tierAt(state, x + 1, edge.y + 1)).toBe(SEEN);
    expect(tierAt(state, x + 2, edge.y)).toBe(UNEXPLORED);
  });

  it("a watchtower sees all round, 5 in sight and 9 seen", () => {
    const state = foggy();
    const edge = keepEdge(state);
    const x = edge.x + KEEP_SIGHT.outer;
    const y = edge.y;
    expect(build(state, "watchtower", x, y)).toEqual({ ok: true });
    expect(tierAt(state, x + 5, y)).toBe(IN_SIGHT);
    expect(tierAt(state, x + 6, y)).toBe(SEEN);
    expect(tierAt(state, x + 9, y)).toBe(SEEN);
    expect(tierAt(state, x + 10, y)).toBe(UNEXPLORED);
    expect(tierAt(state, x, y - 5)).toBe(IN_SIGHT);
    expect(tierAt(state, x, y + 9)).toBe(SEEN);
  });

  it("an archer sees along its arc, plus the tiles right around it", () => {
    const state = createGame(1, { blankMap: true, players: [] });
    // Far from the keep, placed directly: only the archer's own sight matters.
    placeStructure(state, "archer", 20, 20, "E", null);
    expect(tierAt(state, 26, 20)).toBe(IN_SIGHT); // range 5 + 1, straight ahead
    expect(tierAt(state, 30, 20)).toBe(SEEN);
    expect(tierAt(state, 31, 20)).toBe(UNEXPLORED);
    expect(tierAt(state, 19, 20)).toBe(IN_SIGHT); // right behind it
    expect(tierAt(state, 19, 21)).toBe(IN_SIGHT);
    expect(tierAt(state, 17, 20)).toBe(UNEXPLORED); // 3 tiles behind
    expect(tierAt(state, 20, 26)).toBe(UNEXPLORED); // off to the side
  });

  it("cannons and catapults see all round", () => {
    const state = createGame(1, { blankMap: true, players: [] });
    placeStructure(state, "cannon", 20, 20, "E", null);
    placeStructure(state, "catapult", 20, 60, "E", null);
    expect(tierAt(state, 15, 20)).toBe(IN_SIGHT);
    expect(tierAt(state, 10, 60)).toBe(IN_SIGHT);
  });
});

describe("building and selling", () => {
  it("refuses to build on unexplored land, and charges nothing", () => {
    const state = foggy();
    const gold = state.players[1].gold;
    expect(build(state, "wall", 0, 0)).toEqual({
      ok: false,
      reason: "Can't build on unexplored land",
    });
    expect(state.players[1].gold).toBe(gold);
  });

  it("can build on seen land, not just in sight", () => {
    const state = foggy();
    const edge = keepEdge(state);
    const x = edge.x + KEEP_SIGHT.outer;
    expect(tierAt(state, x, edge.y)).toBe(SEEN);
    expect(build(state, "wall", x, edge.y)).toEqual({ ok: true });
  });

  it("refuses to sell or clear trees on unexplored land", () => {
    const state = foggy();
    state.terrain[0] = "tree";
    expect(applyCommand(state, 1, { type: "sell", x: 0, y: 0 })).toEqual({
      ok: false,
      reason: "Can't sell on unexplored land",
    });
    expect(state.terrain[0]).toBe("tree");
  });

  it("selling drops the land from in sight to seen, never to unexplored", () => {
    const state = foggy();
    const edge = keepEdge(state);
    const x = edge.x + KEEP_SIGHT.outer;
    build(state, "watchtower", x, edge.y);
    expect(tierAt(state, x + 5, edge.y)).toBe(IN_SIGHT);
    expect(applyCommand(state, 1, { type: "sell", x, y: edge.y })).toEqual({ ok: true });
    expect(mountAt(state, x, edge.y)).toBeUndefined();
    expect(tierAt(state, x + 5, edge.y)).toBe(SEEN);
    expect(tierAt(state, x + 9, edge.y)).toBe(SEEN);
  });

  it("a watchtower never fires, stands on a wall, and falls with it", () => {
    const state = foggy();
    const edge = keepEdge(state);
    const x = edge.x + 3;
    expect(build(state, "wall", x, edge.y)).toEqual({ ok: true });
    expect(build(state, "watchtower", x, edge.y)).toEqual({ ok: true });
    state.enemies.push({
      id: 99,
      x: x + 1,
      y: edge.y,
      tx: x + 1,
      ty: edge.y,
      px: x + 1,
      py: edge.y,
      hp: 20,
      maxHp: 20,
      bounty: 0,
      killedBy: null,
      kind: "goblin",
      variant: 0,
      speed: 1.5,
      damage: 5,
      attackInterval: 20,
      attackCooldown: 0,
      abilityCooldown: 0,
      mode: "walking",
      targetId: null,
      leaderId: null,
    });
    state.wave.countdown = Infinity;
    tick(state);
    expect(state.effects.filter((e) => e.kind === "shot")).toEqual([]);
    expect(applyCommand(state, 1, { type: "sell", x, y: edge.y })).toEqual({ ok: true }); // tower first
    expect(build(state, "watchtower", x, edge.y)).toEqual({ ok: true });
  });

  it("co-op players share sight: player 2 builds where only player 1 has seen", () => {
    const state = foggy(["Ann", "Bo"]);
    const edge = keepEdge(state);
    const x = edge.x + KEEP_SIGHT.outer;
    build(state, "watchtower", x, edge.y, 1);
    expect(build(state, "wall", x + 8, edge.y, 2)).toEqual({ ok: true });
  });
});

describe("enemies in the fog", () => {
  it("are only visible on tiles in sight", () => {
    const state = foggy();
    const edge = keepEdge(state);
    expect(canSeeEnemiesAt(state, edge.x + 2, edge.y)).toBe(true);
    expect(canSeeEnemiesAt(state, edge.x + KEEP_SIGHT.outer, edge.y)).toBe(false);
    expect(canSeeEnemiesAt(state, 0, state.spawnTiles[0].y)).toBe(false);
    expect(canSeeEnemiesAt(state, 0, 0)).toBe(false);
    // Positions between tiles round to the nearest tile.
    expect(canSeeEnemiesAt(state, edge.x + KEEP_SIGHT.inner + 0.4, edge.y)).toBe(true);
    expect(canSeeEnemiesAt(state, edge.x + KEEP_SIGHT.inner + 0.6, edge.y)).toBe(false);
  });
});

describe("over the network", () => {
  it("explored land survives the welcome snapshot, and a build sends it in the next update", () => {
    const server = foggy();
    const client = fromClientState(toClientState(server));
    expect(client.fog).toBe(true);
    expect(client.explored).toEqual(server.explored);

    const edge = keepEdge(server);
    const sent = sentStateOf(server);
    build(server, "watchtower", edge.x + KEEP_SIGHT.outer, edge.y);
    const update = toUpdate(server, sent);
    expect(update.tiles?.explored?.length).toBeGreaterThan(0);
    applyUpdate(client, JSON.parse(JSON.stringify(update)));
    expect(isExplored(client, edge.x + KEEP_SIGHT.outer + 9, edge.y)).toBe(true);
    expect(toUpdate(server, sent)).not.toHaveProperty("tiles");
  });

  it("the fog setting goes in every update", () => {
    const server = foggy();
    const client = fromClientState(toClientState(server));
    server.fog = false;
    applyUpdate(client, toUpdate(server, sentStateOf(server)));
    expect(tierAt(client, 0, 0)).toBe(IN_SIGHT);
  });
});

describe("performance", () => {
  it("works out sight on a full map with thousands of structures in a few milliseconds", () => {
    const state = createGame(1, { blankMap: true, players: [] });
    for (let y = 0; y < state.height; y += 2) {
      for (let x = 4; x < state.width; x += 3) {
        if (!state.base[y * state.width + x]) placeStructure(state, "wall", x, y);
      }
    }
    for (let i = 0; i < 100; i++) placeStructure(state, "catapult", 10 + i, 1, "N");
    expect(Object.keys(state.structures).length).toBeGreaterThan(2500);
    getSight(state); // warm up
    state.gridVersion++;
    const start = performance.now();
    getSight(state);
    expect(performance.now() - start).toBeLessThan(50);
  });
});

describe("units", () => {
  const sight = UNIT_KINDS.militia.sight;

  it("see around them for their own team, and what they've seen stays explored", () => {
    const state = foggy();
    const p = { x: 10, y: 10 };
    expect(tierAt(state, p.x, p.y)).toBe(UNEXPLORED);

    const unit = spawnUnit(state, "militia", 1, p.x, p.y)!;
    expect(tierAt(state, p.x, p.y)).toBe(IN_SIGHT);
    expect(tierAt(state, p.x + sight.inner, p.y)).toBe(IN_SIGHT);
    expect(tierAt(state, p.x + sight.inner + 1, p.y)).toBe(SEEN);
    expect(tierAt(state, p.x + sight.outer + 1, p.y)).toBe(UNEXPLORED);

    unit.hp = 0;
    tick(state);
    expect(tierAt(state, p.x, p.y)).toBe(SEEN);
  });

  it("only lift fog for their owner's team in PvP", () => {
    const state = createGame(1, { blankMap: true, mode: "pvp", players: ["A", "B"] });
    assignKeeps(state);
    const p = { x: Math.floor(state.width / 2), y: 5 };
    spawnUnit(state, "militia", 1, p.x, p.y);
    expect(tierAt(state, p.x, p.y, 1)).toBe(IN_SIGHT);
    expect(tierAt(state, p.x, p.y, 2)).toBe(UNEXPLORED);
  });

  it("sight is only worked out again when a unit moves to another tile", () => {
    const state = foggy();
    const unit = spawnUnit(state, "militia", 1, 10, 10)!;
    const before = getSight(state);
    tick(state);
    expect(getSight(state)).toBe(before);

    unit.goal = { x: 11, y: 10 };
    for (let i = 0; i < 40 && unit.x !== 11; i++) tick(state);
    expect(getSight(state)).not.toBe(before);
    expect(tierAt(state, 11 + sight.inner, 10)).toBe(IN_SIGHT);
  });
});
