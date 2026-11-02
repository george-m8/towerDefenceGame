import { describe, expect, it } from "vitest";
import { ENCLOSURE_DISCOUNT, FLOOD, TICK_RATE } from "../../src/sim/config";
import { discountAt, priceAt } from "../../src/sim/enclosures";
import { spawnEnemy } from "../../src/sim/enemies";
import { swarmWave } from "../../src/sim/floodSwarms";
import { applyCommand, createGame, tick } from "../../src/sim/game";
import { canBuild, placeStructure, removeStructure, tileIndex } from "../../src/sim/grid";
import { getSight, IN_SIGHT } from "../../src/sim/fog";
import {
  distanceTravelled,
  lavaBehindKing,
  lavaEdge,
  lavaSpeed,
  lavaWarning,
  shiftWorld,
  homeOnMap,
  isFloodHome,
  tilesToGoal,
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
    const flood = state.flood!;
    expect(flood.king.x).toBe(1);
    expect(flood.owner).toBe(ME);
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
    const lavaIn = (y: number) =>
      Array.from({ length: state.width }, (_, x) => state.terrain[tileIndex(state, x, y)]).filter(
        (t) => t === "lava",
      ).length;
    const counts = Array.from({ length: state.height }, (_, y) => lavaIn(y));
    expect(new Set(counts).size).toBeGreaterThan(3);
  });

  it("glows over what it'll take soon, not beyond, and not walls or what they shut in", () => {
    const state = blankFlood();
    state.flood!.king = { x: 40, y: 10 };
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
    state.flood!.king = { x: x + 20, y }; // out of the way
    // Far enough on that every row's edge, however ragged, is past them.
    state.flood!.front = x + 2 + FLOOD.edge.reach + FLOOD.edge.rough;
    run(state, 10 * TICK_RATE);
    expect(state.structures[tower.id]).toBeUndefined();
    expect(state.flood!.plan).toEqual([]);
    expect(state.terrain[tileIndex(state, x + 1, y)]).toBe("lava");
  });

  it("doesn't take walls: it flows round them, and what they shut in stays dry", () => {
    const state = blankFlood();
    state.flood!.king = { x: 30, y: 10 };
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
    state.flood!.king = { x: 40, y: 10 };
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
    state.flood!.king = { x: 40, y: 10 };
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
    const { x, y } = state.flood!.king;
    state.flood!.front = x - 6;
    expect(lavaBehindKing(state)).toBe(Math.floor(x + 1 - lavaEdge(state, y)));
    expect(lavaBehindKing(state)).toBeGreaterThan(0);
    state.flood!.front = x + 1 + FLOOD.edge.reach + FLOOD.edge.rough;
    run(state, 10 * TICK_RATE);
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
    for (let i = 0; i < n; i++) shiftWorld(state);
    expect(state.flood!.king).toEqual({ x: 50 - n, y });
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
    state.flood!.kingHp = Infinity; // swarms come with the land; this is about the land
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

describe("a goal", () => {
  it("puts a keep that far on, on open ground, and reaching it wins", () => {
    const state = createGame(3, { mode: "flood", floodGoal: 60 });
    const flood = state.flood!;
    expect(flood.goal).toBe(60);
    const home = homeOnMap(state)!;
    expect(home.x).toBe(flood.king.x + 60);
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
    expect(home.x + state.flood!.shifted - state.flood!.startX).toBeGreaterThan(state.width);
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
    const { king } = state.flood!;
    const swarmers = state.enemies.filter((e) => e.swarm?.post);
    expect(new Set(swarmers.map((e) => e.swarm!.id)).size).toBeGreaterThan(3);
    for (const e of swarmers) {
      expect(Math.hypot(e.x - king.x, e.y - king.y)).toBeGreaterThan(FLOOD.swarm.clearOfStart - 3);
    }
    expect(swarmWave(state, state.width - 1)).toBeGreaterThan(swarmWave(state, 0));
  });

  it("wake when one sees him, come for him, and hit him", () => {
    const state = blankFlood();
    state.flood!.escortTimers = state.flood!.escortTimers.map(() => Infinity); // no escort
    const { x, y } = king(state);
    const goblin = spawnEnemy(state, x + 5, y, { kind: "goblin" });
    goblin.swarm = { post: { x: x + 5, y }, id: 7, alert: 0, hp: goblin.hp };
    const friend = spawnEnemy(state, x + 20, y, { kind: "goblin" });
    friend.swarm = { post: { x: x + 20, y }, id: 7, alert: 0, hp: friend.hp };
    tick(state);
    expect(friend.swarm!.alert).toBeGreaterThan(0); // its whole swarm wakes
    run(state, 10 * TICK_RATE);
    expect(state.flood!.kingHp).toBeLessThan(FLOOD.kingHp);
  });

  it("taking all his HP loses", () => {
    const state = blankFlood();
    state.flood!.kingHp = 0;
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
    tick(state);
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

  it("comes back a while after falling", () => {
    const state = blankFlood();
    tick(state);
    const soldier = escorts(state).find((u) => u.kind === "soldier")!;
    soldier.hp = 0;
    run(state, 2);
    expect(escorts(state).map((u) => u.kind)).toEqual(["archer"]);
    run(state, FLOOD.escortReturnSeconds * TICK_RATE);
    expect(
      escorts(state)
        .map((u) => u.kind)
        .sort(),
    ).toEqual(["archer", "soldier"]);
  });
});
