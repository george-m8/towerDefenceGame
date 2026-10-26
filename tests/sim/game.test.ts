import { goldOf, ring } from "./helpers";
import { describe, expect, it } from "vitest";
import { spawnEnemy } from "../../src/sim/enemies";
import { isExplored } from "../../src/sim/fog";
import { applyCommand, createGame, tick } from "../../src/sim/game";
import {
  ENEMY_KIND_ORDER,
  FAST_FORWARD_SPEED,
  GRID_HEIGHT,
  GRID_WIDTH,
  MAP_SIZES,
  type MapSize,
  KEEP_HP,
  KEEP_SIZE,
  STARTING_GOLD,
} from "../../src/sim/config";
import { canBuild, isKeepTile, isSpawnTile, placeStructure } from "../../src/sim/grid";

describe("createGame", () => {
  const state = createGame(1, { blankMap: true, fog: false });

  it("creates a grid of the configured size", () => {
    expect(state.width).toBe(GRID_WIDTH);
    expect(state.height).toBe(GRID_HEIGHT);
    for (const layer of [state.terrain, state.base, state.mount]) {
      expect(layer).toHaveLength(GRID_WIDTH * GRID_HEIGHT);
    }
  });

  it("places a 3x3 keep at the centre with full HP", () => {
    const keep = state.keeps[0];
    expect(keep.size).toBe(KEEP_SIZE);
    expect(keep.hp).toBe(KEEP_HP);
    const cx = Math.floor(GRID_WIDTH / 2);
    const cy = Math.floor(GRID_HEIGHT / 2);
    expect(isKeepTile(state, cx, cy)).toBe(true);
    let count = 0;
    for (let y = 0; y < state.height; y++)
      for (let x = 0; x < state.width; x++) if (isKeepTile(state, x, y)) count++;
    expect(count).toBe(KEEP_SIZE * KEEP_SIZE);
  });

  it("marks a spawn zone on the left edge", () => {
    expect(state.spawnTiles.length).toBeGreaterThan(0);
    for (const p of state.spawnTiles) {
      expect(p.x).toBeLessThan(3);
      expect(isSpawnTile(state, p.x, p.y)).toBe(true);
    }
    expect(isSpawnTile(state, GRID_WIDTH - 1, 0)).toBe(false);
  });

  it("starts with the configured gold, unpaused", () => {
    expect(goldOf(state)).toBe(STARTING_GOLD);
    expect(state.paused).toBe(false);
    expect(state.tick).toBe(0);
  });
});

describe("tick and pause", () => {
  it("advances the tick count when not paused", () => {
    const state = createGame(1, { blankMap: true, fog: false });
    tick(state);
    tick(state);
    expect(state.tick).toBe(2);
  });

  it("does not advance while paused, and resumes after unpausing", () => {
    const state = createGame(1, { blankMap: true, fog: false });
    expect(applyCommand(state, 1, { type: "togglePause" })).toEqual({ ok: true });
    tick(state);
    expect(state.tick).toBe(0);
    applyCommand(state, 1, { type: "togglePause" });
    tick(state);
    expect(state.tick).toBe(1);
  });
});

describe("fast forward", () => {
  it("starts at normal speed and toggles between normal and fast", () => {
    const state = createGame(1, { blankMap: true, fog: false });
    expect(state.speed).toBe(1);
    expect(applyCommand(state, 1, { type: "toggleFastForward" })).toEqual({ ok: true });
    expect(state.speed).toBe(FAST_FORWARD_SPEED);
    applyCommand(state, 1, { type: "toggleFastForward" });
    expect(state.speed).toBe(1);
  });
});

describe("determinism", () => {
  it("produces identical state for the same seed and commands", () => {
    const run = () => {
      const s = createGame(99);
      for (let i = 0; i < 50; i++) tick(s);
      applyCommand(s, 1, { type: "togglePause" });
      tick(s);
      return JSON.stringify(s);
    };
    expect(run()).toBe(run());
  });

  it("stays identical over 2,000 ticks with every kind of enemy, walls and units", () => {
    const run = () => {
      const s = createGame(42);
      const keep = s.keeps[0];
      keep.hp = keep.maxHp = 1_000_000; // so the game doesn't end and freeze
      // A ring of walls round the keep, for bombers, diggers and breachers to work on.
      for (const p of ring(
        keep.x - 3,
        keep.y - 3,
        keep.x + keep.size + 2,
        keep.y + keep.size + 2,
      )) {
        if (canBuild(s, 1, "wall", p.x, p.y).ok) placeStructure(s, "wall", p.x, p.y, "N", 1);
      }
      for (const kind of ENEMY_KIND_ORDER) {
        applyCommand(s, 1, { type: "debugSpawn", count: 2, kind });
      }
      // Militia in the enemies' way, and some walking out to meet them.
      for (let i = 0; i < 6; i++) {
        applyCommand(s, 1, { type: "debugUnit", kind: "militia", x: keep.x - 6, y: keep.y + i });
      }
      for (const unit of s.units.slice(0, 3)) unit.goal = { x: keep.x - 20, y: unit.y };
      const modes = new Set<string>();
      let unitsFought = false;
      for (let i = 0; i < 2000; i++) {
        tick(s);
        for (const e of s.enemies) modes.add(e.mode);
        unitsFought ||= s.units.some((u) => u.hp < u.maxHp);
      }
      return { json: JSON.stringify(s), modes, unitsFought };
    };
    const first = run();
    expect(first.json).toBe(run().json);
    expect(first.modes).toEqual(new Set(["walking", "sprinting", "digging"]));
    expect(first.unitsFought).toBe(true);
  }, 20_000); // two long runs; slow under coverage instrumentation
});

describe("ownership", () => {
  it("structures built by command belong to the player; generated ruins to no one", () => {
    const state = createGame(7);
    const ruins = Object.values(state.structures).filter((s) => s.kind === "ruin");
    expect(ruins.length).toBeGreaterThan(0);
    expect(ruins.every((r) => r.owner === null)).toBe(true);

    const blank = createGame(1, { blankMap: true, fog: false });
    expect(applyCommand(blank, 1, { type: "build", kind: "wall", x: 5, y: 5 })).toEqual({
      ok: true,
    });
    expect(Object.values(blank.structures).map((s) => s.owner)).toEqual([1]);
  });
});

describe("map sizes", () => {
  it("every size makes a map of that size, M by default, in both modes", () => {
    expect(createGame(1, { blankMap: true }).width).toBe(MAP_SIZES.M.width);
    for (const size of Object.keys(MAP_SIZES) as MapSize[]) {
      for (const mode of ["endless", "pvp"] as const) {
        const state = createGame(1, { size, mode, players: ["A", "B"] });
        expect([state.width, state.height]).toEqual([
          MAP_SIZES[size].width,
          MAP_SIZES[size].height,
        ]);
        expect(state.terrain).toHaveLength(state.width * state.height);
        for (const keep of state.keeps) {
          expect(keep.x + keep.size).toBeLessThanOrEqual(state.width);
          expect(keep.y + keep.size).toBeLessThanOrEqual(state.height);
        }
      }
    }
  });
});

describe("debugSpawn", () => {
  it("spawns the given kind, or goblins when none is given", () => {
    const state = createGame(1, { blankMap: true, fog: false });
    expect(applyCommand(state, 1, { type: "debugSpawn", count: 2, kind: "golem" })).toEqual({
      ok: true,
    });
    applyCommand(state, 1, { type: "debugSpawn", count: 1 });
    expect(state.enemies.map((e) => e.kind)).toEqual(["golem", "golem", "goblin"]);
  });
});

describe("debug: infinite keep health", () => {
  it("keeps take no damage from enemies or rival towers while it's on", () => {
    const state = createGame(1, { blankMap: true, fog: false });
    expect(
      applyCommand(state, 1, { type: "debugOption", option: "infiniteKeep", on: true }),
    ).toEqual({ ok: true });
    const keep = state.keeps[0];
    for (let i = 0; i < 20; i++) spawnEnemy(state, keep.x - 1, keep.y);
    state.wave.countdown = Infinity;
    for (let t = 0; t < 30 * 20; t++) tick(state);
    expect(keep.hp).toBe(keep.maxHp);

    const pvp = createGame(1, { blankMap: true, mode: "pvp", players: ["Ann", "Bo"] });
    pvp.debug.infiniteKeep = true;
    const rival = pvp.keeps[1];
    placeStructure(pvp, "catapult", rival.x - 6, rival.y + 1, "E", 1);
    for (let t = 0; t < 20 * 20; t++) tick(pvp);
    expect(rival.hp).toBe(rival.maxHp);

    applyCommand(state, 1, { type: "debugOption", option: "infiniteKeep", on: false });
    for (let t = 0; t < 30 * 20 && keep.hp === keep.maxHp; t++) tick(state);
    expect(keep.hp).toBeLessThan(keep.maxHp);
  });
});

describe("debug: infinite money", () => {
  it("lets you build anything without gold, and charges nothing", () => {
    const state = createGame(1, { blankMap: true, fog: false });
    state.players[1].gold = 0;
    const keep = state.keeps[0];
    const build = () =>
      applyCommand(state, 1, { type: "build", kind: "catapult", x: keep.x - 4, y: keep.y });
    expect(build()).toEqual({ ok: false, reason: "Not enough gold" });
    applyCommand(state, 1, { type: "debugOption", option: "infiniteGold", on: true });
    expect(build()).toEqual({ ok: true });
    expect(state.players[1].gold).toBe(0);
  });
});

describe("debug: fog of war", () => {
  it("turns fog off and on again", () => {
    const state = createGame(1, { blankMap: true });
    expect(isExplored(state, 0, 0)).toBe(false);
    applyCommand(state, 1, { type: "debugFog", on: false });
    expect(isExplored(state, 0, 0)).toBe(true);
    applyCommand(state, 1, { type: "debugFog", on: true });
    expect(isExplored(state, 0, 0)).toBe(false);
  });
});
