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
  nextKingStep,
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

/** Paints a straight route from just past the king along a row or column. */
function paintLine(state: GameState, from: Point, to: Point) {
  const dx = Math.sign(to.x - from.x);
  const dy = Math.sign(to.y - from.y);
  for (let p = { ...from }; ; p = { x: p.x + dx, y: p.y + dy }) {
    expect(applyCommand(state, ME, { type: "paintRoute", ...p })).toEqual({ ok: true });
    if (p.x === to.x && p.y === to.y) break;
  }
}

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

  it("only has land a few tiles ahead of the king", () => {
    const state = floodGame();
    const { x, y } = king(state);
    expect(state.flood!.risen).toBe(x + FLOOD.riseAhead + 1);
    const far = { x: x + FLOOD.riseAhead + 1, y };
    expect(applyCommand(state, ME, { type: "paintRoute", ...far })).toMatchObject({ ok: false });
  });
});

describe("the king's route", () => {
  it("walks the route he's painted, using it up, to its last tile", () => {
    const state = blankFlood();
    const start = king(state);
    const end = { x: start.x + 6, y: start.y };
    paintLine(state, { x: start.x + 1, y: start.y }, end);
    run(state, Math.ceil((7 / FLOOD.kingSpeed) * TICK_RATE));
    expect(king(state)).toEqual(end);
    expect(state.flood!.route).toEqual([]);
  });

  it("takes the shortest way within the route to the tile painted last", () => {
    const state = blankFlood();
    const { x, y } = king(state);
    // A loop: right 3, down 2, back left 3. The far end (painted last) is right below the king,
    // two tiles away, but only over painted tiles: round the loop is the only way.
    paintLine(state, { x: x + 1, y }, { x: x + 3, y });
    paintLine(state, { x: x + 3, y: y + 1 }, { x: x + 3, y: y + 2 });
    paintLine(state, { x: x + 2, y: y + 2 }, { x, y: y + 2 });
    expect(nextKingStep(state)).toEqual({ x: x + 1, y });
    // Painting the gap makes it two steps straight down.
    expect(applyCommand(state, ME, { type: "paintRoute", x, y: y + 1 })).toEqual({ ok: true });
    expect(nextKingStep(state)).toEqual({ x, y: y + 1 });
  });

  it("stands still with no route, and waits at anything built in his way", () => {
    const state = blankFlood();
    const start = king(state);
    run(state, TICK_RATE);
    expect(king(state)).toEqual(start);
    const wall = placeStructure(state, "wall", start.x + 2, start.y, "N", ME);
    wall.buildLeft = 0;
    paintLine(state, { x: start.x + 1, y: start.y }, { x: start.x + 4, y: start.y });
    run(state, 5 * TICK_RATE);
    expect(king(state)).toEqual({ x: start.x + 1, y: start.y });
  });

  it("rubs a tile out", () => {
    const state = blankFlood();
    const { x, y } = king(state);
    paintLine(state, { x: x + 1, y }, { x: x + 2, y });
    applyCommand(state, ME, { type: "paintRoute", x: x + 2, y, erase: true });
    expect(state.flood!.route).toEqual([{ x: x + 1, y }]);
  });

  it("can't be painted where you've never seen", () => {
    const state = floodGame();
    const { x, y } = king(state);
    const unseen = { x, y: y + FLOOD.kingSight.outer + 3 };
    if (unseen.y < state.height) {
      expect(applyCommand(state, ME, { type: "paintRoute", ...unseen })).toMatchObject({
        ok: false,
      });
    }
  });
});

describe("building", () => {
  it("is only round the king, on risen land", () => {
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
    applyCommand(state, ME, { type: "paintRoute", x: x + 1, y: y + 2 });
    state.flood!.front = x + 2;
    tick(state);
    expect(state.structures[wall.id]).toBeUndefined();
    expect(state.flood!.route).toEqual([]);
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
    state.flood!.risen = state.width; // to paint it all now
    state.fog = false;
    const { home } = state.flood!;
    state.flood!.king = { x: 1, y: home.y + 1 };
    paintLine(state, { x: 2, y: home.y + 1 }, { x: home.x - 1, y: home.y + 1 });
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
    state.flood!.risen = state.width;
    expect(canBuild(state, ME, "wall", home.x - 3, home.y + 1)).toMatchObject({
      reason: "Nothing can be built on the mountain",
    });
  });
});
