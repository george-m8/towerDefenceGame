import { describe, expect, it } from "vitest";
import { ENCLOSURE_DISCOUNT, FLOOD, TICK_RATE } from "../../src/sim/config";
import { discountAt, priceAt } from "../../src/sim/enclosures";
import { spawnEnemy } from "../../src/sim/enemies";
import { swarmWave } from "../../src/sim/floodSwarms";
import { spawnUnit } from "../../src/sim/units";
import { applyCommand, createGame, tick } from "../../src/sim/game";
import {
  blocksAt,
  canBuild,
  isWalkable,
  placeStructure,
  removeStructure,
  tileIndex,
} from "../../src/sim/grid";
import { getSight, IN_SIGHT } from "../../src/sim/fog";
import {
  distanceTravelled,
  lavaBehind,
  lavaEdge,
  lavaSpeed,
  lavaWarning,
  shiftWorld,
  homeOnMap,
  isFloodHome,
  tilesToGoal,
} from "../../src/sim/flood";
import type { FloodLiquid, GameState, Point } from "../../src/sim/types";

const ME = 1;

function run(state: GameState, ticks: number) {
  for (let i = 0; i < ticks; i++) tick(state);
}

/** A generated No looking back game. */
function floodGame(seed = 3): GameState {
  return createGame(seed, { mode: "flood" });
}

/** Open ground, no flood yet (each test brings it on as it needs). */
function blankFlood(floodLiquid?: FloodLiquid): GameState {
  const state = createGame(3, { mode: "flood", blankMap: true, floodLiquid });
  state.flood!.front = -Infinity;
  return state;
}

/** The (first) royal: the king. */
const royal = (state: GameState) => state.flood!.royals[0];
const king = (state: GameState): Point => ({ ...royal(state).at });

/** Sends the king to (x, y), or (`queue`) adds it after his other flags. */
function flag(state: GameState, p: Point, queue = false) {
  const command = queue
    ? { type: "planKing" as const, ...p, queue: true as const }
    : { type: "planKing" as const, ...p };
  expect(applyCommand(state, ME, command)).toEqual({ ok: true });
}

/** Ticks for the king to walk `tiles` tiles, and one more. */
const walkTicks = (tiles: number) => Math.ceil(((tiles + 1) / FLOOD.royalSpeed) * TICK_RATE);

describe("setting out", () => {
  it("has no keep or home: the king on the left edge, open land ahead, no waves", () => {
    const state = floodGame();
    expect(state.keeps).toEqual([]);
    const flood = state.flood!;
    expect(flood.royals).toHaveLength(1);
    expect(royal(state)).toMatchObject({ owner: ME, title: "king", at: { x: 1 }, fallen: null });
    expect(distanceTravelled(flood)).toBe(0);
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
    expect(sight[tileIndex(state, x + FLOOD.royalSight.inner, y)]).toBe(IN_SIGHT);
  });
});

describe("the king's flags", () => {
  it("walks to a flag by the shortest way, and stands there", () => {
    const state = blankFlood();
    const start = king(state);
    const to = { x: start.x + 4, y: start.y + 2 };
    flag(state, to);
    expect(royal(state).path).toHaveLength(6);
    run(state, walkTicks(6));
    expect(king(state)).toEqual(to);
    expect(royal(state).plan).toEqual([]);
    run(state, TICK_RATE);
    expect(king(state)).toEqual(to);
  });

  it("walks to each flag in turn, as a raider's enemy does", () => {
    const state = blankFlood();
    const { x, y } = king(state);
    flag(state, { x: x + 3, y });
    flag(state, { x: x + 3, y: y + 3 }, true);
    flag(state, { x, y: y + 3 }, true);
    expect(royal(state).plan).toHaveLength(3);
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
    expect(royal(state).plan).toEqual([]);
  });

  it("drops his plan for a new flag, and stops when you click on him", () => {
    const state = blankFlood();
    const { x, y } = king(state);
    flag(state, { x: x + 5, y });
    flag(state, { x: x + 5, y: y + 5 }, true);
    flag(state, { x, y: y + 4 });
    expect(royal(state).plan).toEqual([{ x, y: y + 4 }]);
    flag(state, { x, y });
    expect(royal(state).plan).toEqual([]);
    run(state, TICK_RATE * 2);
    expect(king(state)).toEqual({ x, y });
  });

  it("goes round what's built in his way", () => {
    const state = blankFlood();
    const { x, y } = king(state);
    const wall = placeStructure(state, "wall", x + 2, y, "N", ME);
    wall.buildLeft = 0;
    flag(state, { x: x + 4, y });
    expect(royal(state).path.some((p) => p.x === x + 2 && p.y === y)).toBe(false);
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
    expect(royal(state).plan).toEqual([]);
  });

  it("can't be planted where you've never seen, and only so many at once", () => {
    const state = floodGame();
    const { x, y } = king(state);
    const unseen = { x, y: y + FLOOD.royalSight.outer + 3 };
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
    royal(state).at.x = state.width - 60; // well out of its way
    royal(state).at.y = Math.floor(state.height / 2);
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
    expect(FLOOD.lavaSpeed.most).toBeGreaterThan(FLOOD.royalSpeed); // so every game ends
  });

  it("has a ragged edge, not a straight line", () => {
    const state = floodGame();
    royal(state).at.x = state.width - 60;
    run(state, (FLOOD.graceSeconds + 40) * TICK_RATE);
    const edges = Array.from({ length: state.height }, (_, y) => lavaEdge(state, y));
    expect(Math.max(...edges) - Math.min(...edges)).toBeGreaterThan(FLOOD.edge.reach);
    const lavaIn = (y: number) =>
      Array.from({ length: state.width }, (_, x) => state.terrain[tileIndex(state, x, y)]).filter(
        (t) => t === "lava",
      ).length;
    const counts = Array.from({ length: state.height }, (_, y) => lavaIn(y));
    expect(new Set(counts).size).toBeGreaterThan(3);
  });

  it("glows over what it'll take soon, not beyond, and not walls or what they shut in", () => {
    const state = blankFlood();
    royal(state).at = { x: 40, y: 10 };
    // A closed ring of finished walls round (3, 20).
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx !== 0 || dy !== 0)
          placeStructure(state, "wall", 3 + dx, 20 + dy, "N", ME).buildLeft = 0;
      }
    }
    state.flood!.front = 20;
    tick(state);
    expect(lavaWarning(state, 0, 5)).not.toBeNull();
    expect(lavaWarning(state, 1, 5)).not.toBeNull();
    expect(lavaWarning(state, FLOOD.warnTiles + 2, 5)).toBeNull(); // more steps on than it shows
    expect(lavaWarning(state, 2, 20)).toBeNull(); // a wall
    expect(lavaWarning(state, 3, 20)).toBeNull(); // shut in
  });

  it("sinks whatever's on a tile it reaches (but walls)", () => {
    const state = blankFlood();
    const { x, y } = king(state);
    const tower = placeStructure(state, "archer", x + 1, y + 1, "E", ME);
    flag(state, { x: x + 1, y: y + 2 });
    royal(state).at = { x: x + 20, y }; // out of the way
    // Far enough on that every row's edge, however ragged, is past them.
    state.flood!.front = x + 2 + FLOOD.edge.reach + FLOOD.edge.rough;
    run(state, 10 * TICK_RATE);
    expect(state.structures[tower.id]).toBeUndefined();
    expect(royal(state).plan).toEqual([]);
    expect(state.terrain[tileIndex(state, x + 1, y)]).toBe("lava");
  });

  it("doesn't take walls: it flows round them, and what they shut in stays dry", () => {
    const state = blankFlood();
    royal(state).at = { x: 30, y: 10 };
    // A closed ring of finished walls round (12, 20), and a lone wall at (12, 30).
    const walls = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        walls.push(placeStructure(state, "wall", 12 + dx, 20 + dy, "N", ME));
      }
    }
    walls.push(placeStructure(state, "wall", 12, 30, "N", ME));
    for (const wall of walls) wall.buildLeft = 0;
    state.flood!.front = 20;
    run(state, 45 * TICK_RATE);
    for (const wall of walls) expect(state.structures[wall.id]).toBeDefined();
    expect(state.terrain[tileIndex(state, 12, 20)]).not.toBe("lava"); // shut in
    expect(state.terrain[tileIndex(state, 13, 30)]).toBe("lava"); // round the lone wall
    // Once a wall of the ring goes (one along a side: lava doesn't flow corner to corner), the
    // lava gets in.
    removeStructure(state, walls[1]);
    run(state, 6 * TICK_RATE);
    expect(state.terrain[tileIndex(state, 12, 20)]).toBe("lava");
  });

  it("doesn't take ruins either", () => {
    const state = blankFlood();
    royal(state).at = { x: 40, y: 10 };
    const ruin = placeStructure(state, "ruin", 3, 20, "N", null);
    const tower = placeStructure(state, "archer", 3, 20, "E", ME);
    tower.buildLeft = 0;
    state.flood!.front = 20;
    run(state, 20 * TICK_RATE);
    expect(state.structures[ruin.id]).toBeDefined();
    expect(state.structures[tower.id]).toBeDefined(); // safe on it
    expect(state.terrain[tileIndex(state, 3, 20)]).not.toBe("lava");
    expect(state.terrain[tileIndex(state, 4, 20)]).toBe("lava");
  });

  it("creeps through a gap and round a corner at its own pace, not all at once", () => {
    const state = blankFlood();
    royal(state).at = { x: 40, y: 10 };
    // A wall down column 5, but for a gap at row 20.
    for (let y = 0; y < state.height; y++) {
      if (y !== 20) placeStructure(state, "wall", 5, y, "N", ME).buildLeft = 0;
    }
    state.flood!.front = 6; // to the wall
    run(state, 30 * TICK_RATE);
    expect(state.terrain[tileIndex(state, 5, 20)]).toBe("lava"); // in the gap
    // Now its edge is far past: beyond the wall it spreads out from the gap, a tile at a time.
    state.flood!.front = 30;
    const behind = () => {
      let n = 0;
      for (let y = 0; y < state.height; y++) {
        for (let x = 6; x < 20; x++) if (state.terrain[tileIndex(state, x, y)] === "lava") n++;
      }
      return n;
    };
    run(state, 2 * TICK_RATE);
    const soon = behind();
    expect(soon).toBeGreaterThan(0);
    expect(soon).toBeLessThan(10);
    run(state, 6 * TICK_RATE);
    expect(behind()).toBeGreaterThan(soon);
  });

  it("taking the king loses", () => {
    const state = blankFlood();
    const { x, y } = royal(state).at;
    state.flood!.front = x - 6;
    expect(lavaBehind(state, royal(state))).toBe(Math.floor(x + 1 - lavaEdge(state, y)));
    expect(lavaBehind(state, royal(state))).toBeGreaterThan(0);
    state.flood!.front = x + 1 + FLOOD.edge.reach + FLOOD.edge.rough;
    run(state, 10 * TICK_RATE);
    expect(state.gameOver).toBe(true);
    expect(state.won).toBe(false);
  });
});

describe("hills", () => {
  it("stand above the flood: it goes round them, and they can be walked and built on", () => {
    const state = blankFlood();
    royal(state).at = { x: 40, y: 10 };
    for (let y = 19; y <= 21; y++) {
      for (let x = 3; x <= 5; x++) state.terrain[tileIndex(state, x, y)] = "hill";
    }
    state.flood!.front = 20;
    run(state, 30 * TICK_RATE);
    expect(state.terrain[tileIndex(state, 4, 20)]).toBe("hill");
    expect(state.terrain[tileIndex(state, 6, 20)]).toBe("lava");
    expect(isWalkable(state, 4, 20)).toBe(true);
    expect(lavaWarning(state, 3, 20)).toBeNull();
  });

  it("are on the starting map and the new land", () => {
    const state = floodGame();
    const hills = () => state.terrain.filter((t) => t === "hill").length;
    expect(hills()).toBeGreaterThan(0);
    for (let i = 0; i < 3 * FLOOD.chunkColumns; i++) shiftWorld(state);
    expect(hills()).toBeGreaterThan(0);
  });
});

describe("water", () => {
  /** A tree, a rock and a bush in the flood's way, and a tower, and the flood far past them. */
  function inTheWay(liquid?: FloodLiquid) {
    const state = blankFlood(liquid);
    royal(state).at = { x: 40, y: 10 };
    for (const [x, terrain] of [
      [3, "tree"],
      [5, "rock"],
      [7, "berries"],
    ] as const) {
      state.terrain[tileIndex(state, x, 20)] = terrain;
    }
    const tower = placeStructure(state, "archer", 4, 22, "E", ME);
    tower.buildLeft = 0;
    state.flood!.front = 20;
    run(state, 30 * TICK_RATE);
    return { state, tower, at: (x: number, y = 20) => state.terrain[tileIndex(state, x, y)] };
  }

  it("leaves trees, rocks and bushes standing, and goes round them", () => {
    const { state, tower, at } = inTheWay("water");
    expect(state.flood!.liquid).toBe("water");
    expect([at(3), at(5), at(7)]).toEqual(["tree", "rock", "berries"]);
    expect([at(4), at(6), at(8), at(9)]).toEqual(Array(4).fill("floodwater"));
    expect(state.structures[tower.id]).toBeUndefined(); // the rest it takes, as lava does
    expect(lavaWarning(state, 3, 20)).toBeNull();
  });

  it("isn't how lava goes: that takes trees and bushes (but not rock)", () => {
    const { at } = inTheWay();
    expect([at(3), at(5), at(7)]).toEqual(["lava", "rock", "lava"]);
  });

  it("takes a royal it reaches", () => {
    const state = blankFlood("water");
    const { x } = king(state);
    state.flood!.front = x + 2 + FLOOD.edge.reach + FLOOD.edge.rough;
    run(state, 10 * TICK_RATE);
    expect(royal(state).fallen).toBe("flood");
  });

  it("can be walled across, as lava can", () => {
    const state = blankFlood("water");
    state.explored = state.explored.map(() => 1);
    state.terrain[tileIndex(state, 20, 5)] = "floodwater";
    expect(canBuild(state, ME, "wall", 20, 5)).toMatchObject({
      ok: false,
      reason: "A wall on floodwater has to join on to a wall",
    });
    placeStructure(state, "wall", 21, 5, "N", ME).buildLeft = 0;
    expect(canBuild(state, ME, "wall", 20, 5)).toEqual({ ok: true });
  });
});

describe("new land", () => {
  it("comes a column at a time: the world moves on, everything with it", () => {
    const state = blankFlood();
    const n = FLOOD.chunkColumns;
    const { y } = king(state);
    royal(state).at = { x: 50, y };
    const wall = placeStructure(state, "wall", 52, y, "N", ME);
    const lost = placeStructure(state, "wall", 3, y, "N", ME);
    state.explored[tileIndex(state, 52, y)] = 1;
    state.flood!.front = 5;
    for (let i = 0; i < n; i++) shiftWorld(state);
    expect(royal(state).at).toEqual({ x: 50 - n, y });
    tick(state); // the furthest he's got is reckoned each tick
    expect(distanceTravelled(state.flood!)).toBe(50 - 1);
    expect(state.structures[wall.id]).toMatchObject({ x: 52 - n, y });
    expect(state.base[tileIndex(state, 52 - n, y)]).toBe(wall.id);
    expect(state.structures[lost.id]).toBeUndefined();
    expect(state.explored[tileIndex(state, 52 - n, y)]).toBe(1);
    expect(state.flood!.front).toBe(5 - n);
    // What's beside the lava is worked out again for the moved world.
    expect(state.flood!.edge.every((i) => state.terrain[i] !== "lava")).toBe(true);
    expect(state.flood!.edge).toContain(tileIndex(state, 0, y));
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
    royal(state).hp = Infinity; // swarms come with the land; this is about the land
    for (let i = 0; i < 300 * TICK_RATE && !state.gameOver; i++) {
      // A flag far to the right, on his row, as near as he can get.
      if (i % TICK_RATE === 0) {
        const { y } = royal(state).at;
        applyCommand(state, ME, { type: "planKing", x: state.width - 1, y });
      }
      tick(state);
    }
    expect(state.flood!.shifted).toBeGreaterThan(state.width);
    expect(distanceTravelled(state.flood!)).toBeGreaterThan(state.width);
  }, 30_000);
});

describe("a goal", () => {
  it("puts a keep that far on, on open ground, and reaching it wins", () => {
    const state = createGame(3, { mode: "flood", floodGoal: 60 });
    const flood = state.flood!;
    expect(flood.goal).toBe(60);
    const home = homeOnMap(state)!;
    expect(home.x).toBe(royal(state).at.x + 60);
    expect(isFloodHome(state, home.x + 1, home.y + 1)).toBe(true);
    expect(tilesToGoal(flood)).toBe(59);
    // Walk him there with the fog off, and the swarms out of the way.
    state.fog = false;
    state.enemies = [];
    flood.front = -Infinity;
    flag(state, { x: home.x - 1, y: home.y + 1 });
    for (let i = 0; i < 200 * TICK_RATE && !state.gameOver; i++) tick(state);
    expect(state.won).toBe(true);
  });

  it("comes in with new land when it's further than the map", () => {
    const state = blankFlood();
    state.flood!.goal = state.width + 30;
    expect(homeOnMap(state)).toBeNull();
    // Until all of it's on the map.
    const onMap = () => {
      const home = homeOnMap(state);
      return home !== null && home.x + 3 <= state.width;
    };
    for (let i = 0; i < 3 * FLOOD.chunkColumns && !onMap(); i++) shiftWorld(state);
    const home = homeOnMap(state)!;
    expect(home).not.toBeNull();
    expect(home.x + state.flood!.shifted - state.flood!.start.x).toBeGreaterThan(state.width);
    // On open ground.
    for (let dy = 0; dy < 3; dy++) {
      for (let dx = 0; dx < 3; dx++) {
        expect(state.terrain[tileIndex(state, home.x + dx, home.y + dy)]).toBe("ground");
      }
    }
  });
});

describe("swarms", () => {
  it("wait round the map, clear of the king's start, tougher further on", () => {
    const state = floodGame();
    const king = state.flood!.start;
    const swarmers = state.enemies.filter((e) => e.swarm?.post);
    expect(new Set(swarmers.map((e) => e.swarm!.id)).size).toBeGreaterThan(3);
    for (const e of swarmers) {
      expect(Math.hypot(e.x - king.x, e.y - king.y)).toBeGreaterThan(FLOOD.swarm.clearOfStart - 3);
    }
    expect(swarmWave(state, state.width - 1)).toBeGreaterThan(swarmWave(state, 0));
  });

  it("wake when one sees him, come for him, and hit him", () => {
    const state = blankFlood();
    state.units = []; // no escort
    const { x, y } = king(state);
    const goblin = spawnEnemy(state, x + 5, y, { kind: "goblin" });
    goblin.swarm = { post: { x: x + 5, y }, id: 7, alert: 0, hp: goblin.hp };
    const friend = spawnEnemy(state, x + 20, y, { kind: "goblin" });
    friend.swarm = { post: { x: x + 20, y }, id: 7, alert: 0, hp: friend.hp };
    tick(state);
    expect(friend.swarm!.alert).toBeGreaterThan(0); // its whole swarm wakes
    run(state, 10 * TICK_RATE);
    expect(royal(state).hp).toBeLessThan(FLOOD.royalHp);
  });

  it("swarms run from a flood of water they see, but not from lava", () => {
    const fleeing = (liquid: FloodLiquid | undefined, kind: "goblin" | "zerg") => {
      const state = blankFlood(liquid);
      state.units = []; // no escort
      royal(state).at = { x: 50, y: 5 };
      state.flood!.front = -Infinity;
      // A wall of the flood's own terrain down column 20, a goblin 4 tiles from it.
      for (let y = 0; y < state.height; y++) {
        state.terrain[tileIndex(state, 20, y)] = liquid === "water" ? "floodwater" : "lava";
      }
      const enemy = spawnEnemy(state, 24, 20, { kind });
      enemy.swarm = { post: { x: 24, y: 20 }, id: 7, alert: 0, hp: enemy.hp };
      run(state, 4 * TICK_RATE);
      return enemy.x - 24;
    };
    expect(fleeing("water", "goblin")).toBeGreaterThan(2); // off away from it
    expect(fleeing("water", "zerg")).toBeGreaterThan(2);
    expect(fleeing(undefined, "goblin")).toBe(0);
  });

  it("your units keep clear of a flood of water, but not of lava", () => {
    const moved = (liquid: FloodLiquid | undefined) => {
      const state = blankFlood(liquid);
      royal(state).at = { x: 50, y: 5 };
      state.units = [];
      for (let y = 0; y < state.height; y++) {
        state.terrain[tileIndex(state, 20, y)] = liquid === "water" ? "floodwater" : "lava";
      }
      const soldier = spawnUnit(state, "soldier", ME, 21, 20)!;
      run(state, 4 * TICK_RATE);
      return soldier.x;
    };
    expect(moved("water")).toBe(20 + FLOOD.waterBerth + 1); // just clear of it
    expect(moved(undefined)).toBe(21);
  });

  it("taking all his HP loses", () => {
    const state = blankFlood();
    royal(state).hp = 0;
    tick(state);
    expect(state.gameOver).toBe(true);
    expect(state.won).toBe(false);
  });

  it("come in with new land", () => {
    const state = blankFlood();
    const before = state.enemies.length;
    for (let i = 0; i < 2 * FLOOD.chunkColumns; i++) shiftWorld(state);
    const swarmers = state.enemies.filter((e) => e.swarm?.post);
    expect(swarmers.length).toBeGreaterThan(before);
    for (const e of swarmers) expect(e.x).toBeGreaterThan(state.width - 2 * FLOOD.chunkColumns - 3);
  });

  it("move with the world, posts and all", () => {
    const state = blankFlood();
    const goblin = spawnEnemy(state, 30, 20, { kind: "goblin" });
    goblin.swarm = { post: { x: 30, y: 20 }, id: 9, alert: 0, hp: goblin.hp };
    shiftWorld(state);
    expect(goblin).toMatchObject({ x: 29, y: 20, tx: 29 });
    expect(goblin.swarm!.post).toEqual({ x: 29, y: 20 });
  });
});

describe("enclosures", () => {
  it("count when ruins alone close them in (forts are made to be)", () => {
    const state = blankFlood();
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== 2) continue;
        placeStructure(state, "ruin", 30 + dx, 20 + dy, "N", null);
      }
    }
    state.gridVersion++;
    expect(discountAt(state, 30, 20, ME)).toBe(ENCLOSURE_DISCOUNT.outer);
    expect(discountAt(state, 40, 20, ME)).toBe(0);
  });

  it("make building inside walls cheaper, as usual", () => {
    const state = blankFlood();
    // A ring of finished walls round (20, 20).
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== 2) continue;
        placeStructure(state, "wall", 20 + dx, 20 + dy, "N", ME).buildLeft = 0;
      }
    }
    state.gridVersion++;
    expect(discountAt(state, 20, 20, ME)).toBe(ENCLOSURE_DISCOUNT.outer);
    expect(discountAt(state, 30, 20, ME)).toBe(0);
    expect(priceAt(state, "archer", 20, 20, ME)).toBeLessThan(priceAt(state, "archer", 30, 20, ME));
  });
});

describe("the king's escort", () => {
  const escorts = (state: GameState) => state.units.filter((u) => u.escort && u.hp > 0);

  it("is a soldier and an archer, beside him from the start", () => {
    const state = blankFlood();
    const { x, y } = king(state);
    expect(
      escorts(state)
        .map((u) => u.kind)
        .sort(),
    ).toEqual(["archer", "soldier"]);
    for (const u of escorts(state)) {
      expect(Math.max(Math.abs(u.x - x), Math.abs(u.y - y))).toBeLessThanOrEqual(1);
      expect(u.owner).toBe(ME);
    }
  });

  it("follows him wherever he goes", () => {
    const state = blankFlood();
    const { x, y } = king(state);
    flag(state, { x: x + 8, y: y + 4 });
    run(state, walkTicks(12) + 5 * TICK_RATE);
    expect(king(state)).toEqual({ x: x + 8, y: y + 4 });
    for (const u of escorts(state)) {
      expect({ x: u.x, y: u.y }).toEqual({ x: x + 8 + u.escort!.x, y: y + 4 + u.escort!.y });
    }
  });

  it("fights for him: the soldier goes after an enemy near him", () => {
    const state = blankFlood();
    tick(state);
    const { x, y } = king(state);
    const goblin = spawnEnemy(state, x + 3, y + 2, { kind: "goblin" });
    goblin.swarm = { post: { x: x + 3, y: y + 2 }, id: 3, alert: 0, hp: goblin.hp };
    run(state, 10 * TICK_RATE);
    expect(goblin.hp).toBeLessThanOrEqual(0);
  });

  it("doesn't come back once it's fallen", () => {
    const state = blankFlood();
    const soldier = escorts(state).find((u) => u.kind === "soldier")!;
    soldier.hp = 0;
    run(state, 120 * TICK_RATE);
    expect(escorts(state).map((u) => u.kind)).toEqual(["archer"]);
  });

  it("gets fought: swarm enemies hit the units beside them", () => {
    const state = blankFlood();
    const archer = escorts(state).find((u) => u.kind === "archer")!;
    state.units = [archer];
    archer.escort = undefined; // standing still, for the test
    const goblin = spawnEnemy(state, archer.x + 1, archer.y, { kind: "goblin" });
    goblin.swarm = { post: { x: goblin.x, y: goblin.y }, id: 4, alert: 100, hp: goblin.hp };
    royal(state).at = { x: archer.x + 20, y: archer.y }; // well away
    run(state, 3 * TICK_RATE);
    expect(archer.hp).toBeLessThan(archer.maxHp);
  });
});

describe("co-op", () => {
  /** Two players: the king's (1) and the queen's (2), on open ground, no lava yet. */
  function coop(): GameState {
    const state = createGame(3, { mode: "flood", blankMap: true, players: ["Ann", "Bo"] });
    state.flood!.front = -Infinity;
    return state;
  }

  it("gives each player a royal, with an escort each", () => {
    const state = coop();
    const [king, queen] = state.flood!.royals;
    expect(king).toMatchObject({ owner: 1, title: "king" });
    expect(queen).toMatchObject({ owner: 2, title: "queen" });
    expect(queen.at.y).not.toBe(king.at.y);
    for (const owner of [1, 2]) {
      expect(state.units.filter((u) => u.escort && u.owner === owner)).toHaveLength(2);
    }
  });

  it("lets each player lead only their own royal", () => {
    const state = coop();
    const [king, queen] = state.flood!.royals;
    expect(applyCommand(state, 2, { type: "planKing", x: queen.at.x + 3, y: queen.at.y })).toEqual({
      ok: true,
    });
    expect(queen.plan).toHaveLength(1);
    expect(king.plan).toEqual([]);
  });

  it("goes on when one falls: that player still builds on land the team's seen", () => {
    const state = coop();
    const [king, queen] = state.flood!.royals;
    queen.hp = 0;
    tick(state);
    expect(queen.fallen).toBe("swarm");
    expect(state.gameOver).toBe(false);
    expect(applyCommand(state, 2, { type: "planKing", x: 5, y: 5 })).toMatchObject({
      reason: "Your royal has fallen",
    });
    // Land the king sees is the team's, so the queen's player can build there.
    expect(canBuild(state, 2, "wall", king.at.x + 3, king.at.y).ok).toBe(true);
  });

  it("is over once every royal has fallen", () => {
    const state = coop();
    const [king, queen] = state.flood!.royals;
    queen.hp = 0;
    tick(state);
    expect(state.gameOver).toBe(false);
    king.hp = 0;
    tick(state);
    expect(state.gameOver).toBe(true);
    expect(state.won).toBe(false);
  });
});

describe("walls on lava", () => {
  it("can be built if they join on to a wall, so a line can go out across it", () => {
    const state = blankFlood();
    const { y } = king(state);
    for (let x = 0; x < 8; x++) {
      state.terrain[tileIndex(state, x, y + 5)] = "lava";
      state.terrain[tileIndex(state, x, y + 6)] = "lava";
    }
    expect(canBuild(state, ME, "wall", 6, y + 5)).toMatchObject({
      reason: "A wall on lava has to join on to a wall",
    });
    expect(canBuild(state, ME, "archer", 6, y + 5).ok).toBe(false); // only walls
    // A wall on the land beside it, then one on the lava joining it, then the next.
    state.explored = state.explored.map(() => 1);
    state.players[ME].gold = 1000;
    expect(applyCommand(state, ME, { type: "build", kind: "wall", x: 8, y: y + 5 })).toEqual({
      ok: true,
    });
    expect(applyCommand(state, ME, { type: "build", kind: "wall", x: 7, y: y + 5 })).toEqual({
      ok: true,
    });
    expect(canBuild(state, ME, "wall", 6, y + 5).ok).toBe(true);
    // Below the one on the land is lava too, but only corner to corner with the wall at (7, y + 5).
    expect(canBuild(state, ME, "wall", 6, y + 6).ok).toBe(false);
  });
});

describe("walled-off lava", () => {
  it("stops spreading and cools back to ground, from its edges in", () => {
    const state = blankFlood();
    royal(state).at = { x: 40, y: 10 };
    // A wall down column 5, but for a gap at row 20.
    for (let y = 0; y < state.height; y++) {
      if (y !== 20) placeStructure(state, "wall", 5, y, "N", ME).buildLeft = 0;
    }
    state.flood!.front = 6;
    run(state, 30 * TICK_RATE);
    state.flood!.front = 14;
    run(state, 6 * TICK_RATE);
    const beyond = () => {
      let n = 0;
      for (let y = 0; y < state.height; y++) {
        for (let x = 6; x < 30; x++) if (state.terrain[tileIndex(state, x, y)] === "lava") n++;
      }
      return n;
    };
    expect(beyond()).toBeGreaterThan(3); // through the gap, and spreading
    // Wall the gap: what's through is cut off.
    placeStructure(state, "wall", 5, 20, "N", ME).buildLeft = 0;
    state.flood!.front = 25;
    run(state, 2 * TICK_RATE);
    const cut = beyond();
    run(state, 60 * TICK_RATE);
    expect(beyond()).toBe(0);
    expect(cut).toBeGreaterThan(0);
    // The live lava on the other side is still there.
    expect(state.terrain[tileIndex(state, 2, 10)]).toBe("lava");
  });
});

/** The tiles reachable from (x, y) over land that isn't a ruin (and isn't lava). */
function reachableRoundRuins(state: GameState, from: Point): Set<number> {
  const seen = new Set([tileIndex(state, from.x, from.y)]);
  const queue = [from];
  for (let head = 0; head < queue.length; head++) {
    const { x, y } = queue[head];
    for (const [nx, ny] of [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ]) {
      if (nx < 0 || ny < 0 || nx >= state.width || ny >= state.height) continue;
      const i = tileIndex(state, nx, ny);
      if (seen.has(i) || state.structures[state.base[i]]?.kind === "ruin") continue;
      seen.add(i);
      queue.push({ x: nx, y: ny });
    }
  }
  return seen;
}

describe("ruined forts", () => {
  it("are on the starting map too, clear of the start, leaving a way on", () => {
    for (const seed of [1, 2, 3, 4]) {
      const state = createGame(seed, { mode: "flood" });
      const start = state.flood!.start;
      const edge = (i: number) => i % state.width === 0;
      const shutIn = state.features.filter((c) => ![...reachableRoundRuins(state, c)].some(edge));
      expect(shutIn.length).toBeGreaterThan(0);
      for (const chest of shutIn) {
        expect(Math.hypot(chest.x - start.x, chest.y - start.y)).toBeGreaterThan(
          FLOOD.swarm.clearOfStart,
        );
      }
      // Walkable land only: a way from the start to the right edge.
      const walkable = new Set<number>();
      const queue = [start];
      walkable.add(tileIndex(state, start.x, start.y));
      for (let head = 0; head < queue.length; head++) {
        const { x, y } = queue[head];
        for (const [nx, ny] of [
          [x + 1, y],
          [x - 1, y],
          [x, y + 1],
          [x, y - 1],
        ]) {
          if (nx < 0 || ny < 0 || nx >= state.width || ny >= state.height) continue;
          const i = tileIndex(state, nx, ny);
          if (walkable.has(i) || !isWalkable(state, nx, ny) || blocksAt(state, nx, ny)) continue;
          walkable.add(i);
          queue.push({ x: nx, y: ny });
        }
      }
      expect([...walkable].some((i) => i % state.width === state.width - 1)).toBe(true);
    }
  });

  it("come with new land: closed rings of ruins with a chest inside, which lava can't get into", () => {
    const state = blankFlood();
    for (let i = 0; i < 3 * FLOOD.chunkColumns; i++) shiftWorld(state);
    // A chest walled in: from it, over tiles not ruins, the map's left edge can't be reached.
    const shutIn = state.features.filter((chest) => {
      const seen = new Set([tileIndex(state, chest.x, chest.y)]);
      const queue = [{ x: chest.x, y: chest.y }];
      for (let head = 0; head < queue.length; head++) {
        const { x, y } = queue[head];
        if (x === 0) return false;
        for (const [nx, ny] of [
          [x + 1, y],
          [x - 1, y],
          [x, y + 1],
          [x, y - 1],
        ]) {
          if (nx < 0 || ny < 0 || nx >= state.width || ny >= state.height) continue;
          if (seen.has(tileIndex(state, nx, ny))) continue;
          if (state.structures[state.base[tileIndex(state, nx, ny)]]?.kind === "ruin") continue;
          seen.add(tileIndex(state, nx, ny));
          queue.push({ x: nx, y: ny });
        }
      }
      return true;
    });
    expect(shutIn.length).toBeGreaterThan(0);
    // Lava everywhere around: inside stays dry.
    const [chest] = shutIn;
    state.flood!.front = state.width + 10;
    state.flood!.royals = []; // nobody walking on (the world stays put), nobody to fall
    run(state, 120 * TICK_RATE);
    expect(state.terrain[tileIndex(state, chest.x - 5, chest.y - 5)]).toBe("lava");
    expect(state.terrain[tileIndex(state, chest.x, chest.y)]).not.toBe("lava");
  }, 60_000);
});
