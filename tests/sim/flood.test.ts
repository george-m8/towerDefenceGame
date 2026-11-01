import { describe, expect, it } from "vitest";
import { FLOOD, TICK_RATE } from "../../src/sim/config";
import { applyCommand, createGame, tick } from "../../src/sim/game";
import { canBuild, placeStructure, tileIndex } from "../../src/sim/grid";
import { getSight, IN_SIGHT } from "../../src/sim/fog";
import {
  distanceTravelled,
  lavaBehindKing,
  lavaEdge,
  lavaSpeed,
  lavaWarning,
  shiftWorld,
} from "../../src/sim/flood";
import type { GameState, Point } from "../../src/sim/types";

const ME = 1;

function run(state: GameState, ticks: number) {
  for (let i = 0; i < ticks; i++) tick(state);
}

/** A generated No looking back game. */
function floodGame(seed = 3): GameState {
  return createGame(seed, { mode: "flood" });
}

/** Open ground, no flood yet (each test brings it on as it needs). */
function blankFlood(): GameState {
  const state = createGame(3, { mode: "flood", blankMap: true });
  state.flood!.front = -Infinity;
  return state;
}

const king = (state: GameState): Point => ({ ...state.flood!.king });

/** Sends the king to (x, y), or (`queue`) adds it after his other flags. */
function flag(state: GameState, p: Point, queue = false) {
  const command = queue
    ? { type: "planKing" as const, ...p, queue: true as const }
    : { type: "planKing" as const, ...p };
  expect(applyCommand(state, ME, command)).toEqual({ ok: true });
}

/** Ticks for the king to walk `tiles` tiles, and one more. */
const walkTicks = (tiles: number) => Math.ceil(((tiles + 1) / FLOOD.kingSpeed) * TICK_RATE);

describe("setting out", () => {
  it("has no keep or home: the king on the left edge, open land ahead, no waves", () => {
    const state = floodGame();
    expect(state.keeps).toEqual([]);
    expect(state.journey).toBeNull();
    const flood = state.flood!;
    expect(flood.king.x).toBe(1);
    expect(flood.owner).toBe(ME);
    expect(distanceTravelled(flood)).toBe(0);
    expect(state.enemies).toEqual([]);
    expect(state.wave.countdown).toBe(Infinity);
    // No sea on the left or right edges: the coast is only ever along the top or bottom.
    for (const x of [0, state.width - 1]) {
      const mid = Math.floor(state.height / 2);
      expect(state.terrain[tileIndex(state, x, mid)]).not.toBe("sea");
    }
  });

  it("lets the king see round himself", () => {
    const state = floodGame();
    const { x, y } = king(state);
    const sight = getSight(state, ME);
    expect(sight[tileIndex(state, x + FLOOD.kingSight.inner, y)]).toBe(IN_SIGHT);
  });
});

describe("the king's flags", () => {
  it("walks to a flag by the shortest way, and stands there", () => {
    const state = blankFlood();
    const start = king(state);
    const to = { x: start.x + 4, y: start.y + 2 };
    flag(state, to);
    expect(state.flood!.path).toHaveLength(6);
    run(state, walkTicks(6));
    expect(king(state)).toEqual(to);
    expect(state.flood!.plan).toEqual([]);
    run(state, TICK_RATE);
    expect(king(state)).toEqual(to);
  });

  it("walks to each flag in turn, as a raider's enemy does", () => {
    const state = blankFlood();
    const { x, y } = king(state);
    flag(state, { x: x + 3, y });
    flag(state, { x: x + 3, y: y + 3 }, true);
    flag(state, { x, y: y + 3 }, true);
    expect(state.flood!.plan).toHaveLength(3);
    const visited: Point[] = [];
    for (let i = 0; i < walkTicks(9); i++) {
      tick(state);
      const at = king(state);
      const last = visited[visited.length - 1];
      if (!last || last.x !== at.x || last.y !== at.y) visited.push(at);
    }
    expect(visited).toContainEqual({ x: x + 3, y });
    expect(visited).toContainEqual({ x: x + 3, y: y + 3 });
    expect(visited).toHaveLength(10); // where he started, then the shortest way through all three
    expect(king(state)).toEqual({ x, y: y + 3 });
    expect(state.flood!.plan).toEqual([]);
  });

  it("drops his plan for a new flag, and stops when you click on him", () => {
    const state = blankFlood();
    const { x, y } = king(state);
    flag(state, { x: x + 5, y });
    flag(state, { x: x + 5, y: y + 5 }, true);
    flag(state, { x, y: y + 4 });
    expect(state.flood!.plan).toEqual([{ x, y: y + 4 }]);
    flag(state, { x, y });
    expect(state.flood!.plan).toEqual([]);
    run(state, TICK_RATE * 2);
    expect(king(state)).toEqual({ x, y });
  });

  it("goes round what's built in his way", () => {
    const state = blankFlood();
    const { x, y } = king(state);
    const wall = placeStructure(state, "wall", x + 2, y, "N", ME);
    wall.buildLeft = 0;
    flag(state, { x: x + 4, y });
    expect(state.flood!.path.some((p) => p.x === x + 2 && p.y === y)).toBe(false);
    run(state, walkTicks(6));
    expect(king(state)).toEqual({ x: x + 4, y });
  });

  it("gets as near as he can to a flag he can't reach", () => {
    const state = blankFlood();
    const { x, y } = king(state);
    const wall = placeStructure(state, "wall", x + 3, y, "N", ME);
    wall.buildLeft = 0;
    flag(state, { x: x + 3, y });
    run(state, walkTicks(3));
    expect(king(state)).toEqual({ x: x + 2, y });
    expect(state.flood!.plan).toEqual([]);
  });

  it("can't be planted where you've never seen, and only so many at once", () => {
    const state = floodGame();
    const { x, y } = king(state);
    const unseen = { x, y: y + FLOOD.kingSight.outer + 3 };
    if (unseen.y < state.height) {
      expect(applyCommand(state, ME, { type: "planKing", ...unseen })).toMatchObject({
        ok: false,
      });
    }
    const blank = blankFlood();
    const at = king(blank);
    for (let i = 0; i < FLOOD.maxFlags; i++) {
      flag(blank, { x: at.x + 1 + (i % 5), y: at.y + Math.floor(i / 5) }, true);
    }
    expect(
      applyCommand(blank, ME, { type: "planKing", x: at.x, y: at.y + 2, queue: true }),
    ).toMatchObject({ reason: "Too many flags" });
  });
});

describe("building", () => {
  it("is anywhere you've seen, as usual", () => {
    const state = blankFlood();
    const { x, y } = king(state);
    expect(canBuild(state, ME, "wall", x + 7, y).ok).toBe(true);
    expect(canBuild(state, ME, "wall", x + 40, y)).toMatchObject({ ok: false });
  });
});

describe("the lava", () => {
  it("waits, then creeps in, slowly at first and faster as it goes", () => {
    const state = floodGame();
    state.flood!.king.x = state.width - 60; // well out of its way
    state.flood!.king.y = Math.floor(state.height / 2);
    run(state, FLOOD.graceSeconds * TICK_RATE);
    expect(state.flood!.front).toBe(0);
    run(state, 10 * TICK_RATE);
    expect(state.flood!.front).toBeCloseTo(10 * FLOOD.lavaSpeed.start, 0);
    const column = Array.from(
      { length: state.height },
      (_, y) => state.terrain[tileIndex(state, 0, y)],
    );
    expect(column).toContain("lava");
    const early = lavaSpeed(state);
    run(state, 60 * TICK_RATE);
    expect(lavaSpeed(state)).toBeCloseTo(early + FLOOD.lavaSpeed.perMinute, 2);
    state.tick = 3600 * TICK_RATE;
    expect(lavaSpeed(state)).toBe(FLOOD.lavaSpeed.most);
    expect(FLOOD.lavaSpeed.most).toBeGreaterThan(FLOOD.kingSpeed); // so every game ends
  });

  it("has a ragged edge, not a straight line", () => {
    const state = floodGame();
    state.flood!.king.x = state.width - 60;
    run(state, (FLOOD.graceSeconds + 40) * TICK_RATE);
    const edges = Array.from({ length: state.height }, (_, y) => lavaEdge(state, y));
    expect(Math.max(...edges) - Math.min(...edges)).toBeGreaterThan(FLOOD.edge.reach);
    expect(new Set(state.flood!.sunk).size).toBeGreaterThan(3);
    // Each row's lava is all in one piece, from the left edge up to where it's got to.
    for (let y = 0; y < state.height; y++) {
      for (let x = 0; x < state.flood!.sunk[y]; x++) {
        expect(state.terrain[tileIndex(state, x, y)]).toBe("lava");
      }
    }
  });

  it("glows over the next few tiles before its edge, not beyond", () => {
    const state = blankFlood();
    state.flood!.front = 10;
    const edge = lavaEdge(state, 5);
    expect(lavaWarning(state, Math.floor(edge), 5)).not.toBeNull();
    expect(lavaWarning(state, Math.ceil(edge) + FLOOD.warnTiles + 1, 5)).toBeNull();
  });

  it("sinks whatever's on a tile it reaches", () => {
    const state = blankFlood();
    const { x, y } = king(state);
    const wall = placeStructure(state, "wall", x + 1, y + 1, "N", ME);
    flag(state, { x: x + 1, y: y + 2 });
    // Far enough on that every row's edge, however ragged, is past them.
    state.flood!.front = x + 2 + FLOOD.edge.reach + FLOOD.edge.rough;
    tick(state);
    expect(state.structures[wall.id]).toBeUndefined();
    expect(state.flood!.plan).toEqual([]);
    expect(state.terrain[tileIndex(state, x + 1, y)]).toBe("lava");
  });

  it("taking the king loses", () => {
    const state = blankFlood();
    const { x, y } = state.flood!.king;
    state.flood!.front = x - 6;
    expect(lavaBehindKing(state)).toBe(Math.floor(x + 1 - lavaEdge(state, y)));
    expect(lavaBehindKing(state)).toBeGreaterThan(0);
    state.flood!.front = x + 1 + FLOOD.edge.reach + FLOOD.edge.rough;
    tick(state);
    expect(state.gameOver).toBe(true);
    expect(state.won).toBe(false);
  });
});

describe("new land", () => {
  it("comes a column at a time: the world moves on, everything with it", () => {
    const state = blankFlood();
    const n = FLOOD.chunkColumns;
    const { y } = king(state);
    state.flood!.king = { x: 50, y };
    const wall = placeStructure(state, "wall", 52, y, "N", ME);
    const lost = placeStructure(state, "wall", 3, y, "N", ME);
    state.explored[tileIndex(state, 52, y)] = 1;
    state.flood!.front = 5;
    state.flood!.sunk = state.flood!.sunk.map(() => 5);
    for (let i = 0; i < n; i++) shiftWorld(state);
    expect(state.flood!.king).toEqual({ x: 50 - n, y });
    expect(distanceTravelled(state.flood!)).toBe(50 - 1);
    expect(state.structures[wall.id]).toMatchObject({ x: 52 - n, y });
    expect(state.base[tileIndex(state, 52 - n, y)]).toBe(wall.id);
    expect(state.structures[lost.id]).toBeUndefined();
    expect(state.explored[tileIndex(state, 52 - n, y)]).toBe(1);
    expect(state.flood!.front).toBe(5 - n);
    expect(new Set(state.flood!.sunk)).toEqual(new Set([0]));
    // The new columns are generated land, not just open ground, joined to the old at some rows.
    const fresh = [];
    for (let yy = 0; yy < state.height; yy++) {
      for (let x = state.width - n; x < state.width; x++)
        fresh.push(state.terrain[tileIndex(state, x, yy)]);
    }
    expect(new Set(fresh).size).toBeGreaterThan(1);
  });

  it("is the same for the same seed", () => {
    const a = blankFlood();
    const b = blankFlood();
    for (let i = 0; i < 2 * FLOOD.chunkColumns + 3; i++) {
      shiftWorld(a);
      shiftWorld(b);
    }
    expect(a.terrain).toEqual(b.terrain);
  });

  it("keeps coming, so a king walking on keeps going", () => {
    const state = floodGame();
    state.fog = false;
    state.flood!.front = -Infinity;
    for (let i = 0; i < 300 * TICK_RATE && !state.gameOver; i++) {
      // A flag far to the right, on his row, as near as he can get.
      if (i % TICK_RATE === 0) {
        const { y } = state.flood!.king;
        applyCommand(state, ME, { type: "planKing", x: state.width - 1, y });
      }
      tick(state);
    }
    expect(state.flood!.shifted).toBeGreaterThan(state.width);
    expect(distanceTravelled(state.flood!)).toBeGreaterThan(state.width);
  }, 30_000);
});
