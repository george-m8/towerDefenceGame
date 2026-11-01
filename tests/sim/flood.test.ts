import { describe, expect, it } from "vitest";
import { FLOOD, KEEP_SIZE, TICK_RATE } from "../../src/sim/config";
import { applyCommand, createGame, tick } from "../../src/sim/game";
import { canBuild, placeStructure, tileIndex } from "../../src/sim/grid";
import { getSight, IN_SIGHT } from "../../src/sim/fog";
import {
  isFloodHome,
  kingFromHome,
  lavaBehindKing,
  lavaWarning,
  lavaWaves,
  mountainStep,
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
  it("has no keep: the king on the left edge, home on the right, and no waves", () => {
    const state = floodGame();
    expect(state.keeps).toEqual([]);
    expect(state.journey).toBeNull();
    const flood = state.flood!;
    expect(flood.king.x).toBeLessThan(5);
    expect(flood.owner).toBe(ME);
    expect(flood.home.x).toBe(state.width - KEEP_SIZE - 1);
    expect(isFloodHome(state, flood.home.x, flood.home.y)).toBe(true);
    expect(state.enemies).toEqual([]);
    expect(state.wave.countdown).toBe(Infinity);
    expect(state.explored[tileIndex(state, flood.home.x + 1, flood.home.y + 1)]).toBe(1);
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
  it("is only round the king", () => {
    const state = blankFlood();
    const { x, y } = king(state);
    expect(canBuild(state, ME, "wall", x + 2, y).ok).toBe(true);
    expect(canBuild(state, ME, "wall", x, y + FLOOD.buildRadius + 1)).toMatchObject({
      reason: "Too far from the king",
    });
  });
});

describe("the lava", () => {
  it("waits, then comes in in waves: a surge, a calm, then a bigger one", () => {
    const state = floodGame();
    state.flood!.king.x = state.width - 10; // well out of its way
    run(state, FLOOD.graceSeconds * TICK_RATE - 1);
    expect(state.flood!.front).toBe(0);
    expect(lavaWaves(state)).toMatchObject({ wave: 1, surging: false });
    run(state, 2);
    expect(lavaWaves(state)).toMatchObject({ wave: 1, surging: true });
    // The first wave runs its stretch fast, then stops.
    const first = FLOOD.surgeTiles.first;
    run(state, Math.ceil((first / FLOOD.surgeSpeed) * TICK_RATE) + 1);
    expect(state.flood!.front).toBe(first);
    expect(state.terrain[tileIndex(state, 0, 5)]).toBe("lava");
    expect(lavaWaves(state)).toMatchObject({ wave: 2, surging: false });
    run(state, (FLOOD.calmSeconds.first - 1) * TICK_RATE);
    expect(state.flood!.front).toBe(first);
    // The second runs further.
    run(state, 2 * TICK_RATE + Math.ceil(((first + 3) / FLOOD.surgeSpeed) * TICK_RATE));
    expect(state.flood!.front).toBe(first + first + FLOOD.surgeTiles.perWave);
  });

  it("glows over the land the coming wave will take, more as it nears", () => {
    const state = floodGame();
    const reach = FLOOD.surgeTiles.first;
    expect(lavaWarning(state, reach)).toBeNull();
    const early = lavaWarning(state, reach - 1)!;
    run(state, 10 * TICK_RATE);
    expect(lavaWarning(state, reach - 1)!).toBeGreaterThan(early);
  });

  it("sinks whatever's on a column it reaches", () => {
    const state = blankFlood();
    const { x, y } = king(state);
    const wall = placeStructure(state, "wall", x + 1, y + 1, "N", ME);
    flag(state, { x: x + 1, y: y + 2 });
    state.flood!.front = x + 2;
    tick(state);
    expect(state.structures[wall.id]).toBeUndefined();
    expect(state.flood!.plan).toEqual([]);
    expect(state.terrain[tileIndex(state, x + 1, y)]).toBe("lava");
  });

  it("taking the king loses", () => {
    const state = blankFlood();
    state.flood!.front = state.flood!.king.x + 1;
    tick(state);
    expect(state.gameOver).toBe(true);
    expect(state.won).toBe(false);
  });

  it("is outrun by a king walking straight home, which wins", () => {
    const state = blankFlood();
    state.flood!.front = 0;
    state.fog = false;
    const { home } = state.flood!;
    state.flood!.king = { x: 1, y: home.y + 1 };
    flag(state, { x: home.x - 1, y: home.y + 1 });
    for (let i = 0; i < 300 * TICK_RATE && !state.gameOver; i++) tick(state);
    expect(state.won).toBe(true);
    expect(kingFromHome(state)).toBeLessThanOrEqual(1);
  });
});

describe("the mountain", () => {
  it("rises round home's keep, highest at the top, cleared and seen from the start", () => {
    const state = floodGame();
    const { home } = state.flood!;
    const r = FLOOD.mountainRadius;
    expect(mountainStep(state, home.x - 1, home.y)).toBe(r);
    expect(mountainStep(state, home.x - r, home.y)).toBe(1);
    expect(mountainStep(state, home.x - r - 1, home.y)).toBe(0);
    for (let y = home.y - r; y < home.y + KEEP_SIZE + r; y++) {
      for (let x = home.x - r; x < home.x + KEEP_SIZE + r; x++) {
        if (x >= state.width || y < 0 || y >= state.height) continue;
        expect(state.terrain[tileIndex(state, x, y)]).toBe("ground");
        expect(state.explored[tileIndex(state, x, y)]).toBe(1);
      }
    }
  });

  it("stands above the lava, and keeps the king on it safe", () => {
    const state = blankFlood();
    const { home } = state.flood!;
    state.flood!.king = { x: home.x - 2, y: home.y + 1 };
    expect(lavaBehindKing(state)).toBeNull();
    state.flood!.front = state.width;
    tick(state);
    expect(state.terrain[tileIndex(state, home.x - 2, home.y + 1)]).toBe("ground");
    expect(state.terrain[tileIndex(state, home.x - 2, home.y - FLOOD.mountainRadius - 1)]).toBe(
      "lava",
    );
    expect(state.gameOver).toBe(false);
  });

  it("can't be built on", () => {
    const state = blankFlood();
    const { home } = state.flood!;
    state.flood!.king = { x: home.x - 2, y: home.y + 1 };
    expect(canBuild(state, ME, "wall", home.x - 3, home.y + 1)).toMatchObject({
      reason: "Nothing can be built on the mountain",
    });
  });
});
