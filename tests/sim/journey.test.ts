import { describe, expect, it } from "vitest";
import { JOURNEY, KEEP_SIZE, TICK_RATE } from "../../src/sim/config";
import { spawnEnemy } from "../../src/sim/enemies";
import { applyCommand, createGame, tick } from "../../src/sim/game";
import { canBuild, tileIndex } from "../../src/sim/grid";
import { isHomeTile, tilesFromHome } from "../../src/sim/journey";
import type { Enemy, GameState, Point } from "../../src/sim/types";

const ME = 1;

function run(state: GameState, ticks: number) {
  for (let i = 0; i < ticks; i++) tick(state);
}

/** A generated Journey home game. */
function journeyGame(seed = 3): GameState {
  return createGame(seed, { mode: "journey" });
}

/** Open ground, no swarms or wanderers (each test adds the enemies it needs), no wandering off. */
function blankJourney(): GameState {
  const state = createGame(3, { mode: "journey", blankMap: true });
  state.enemies = [];
  state.journey!.wandererTimer = Infinity;
  state.wanderChance = 0;
  return state;
}

/** A swarm member at (x, y), its post where it stands. */
function swarmer(state: GameState, x: number, y: number, swarm = 1): Enemy {
  const enemy = spawnEnemy(state, x, y, { kind: "goblin" });
  enemy.journey = { post: { x, y }, swarm, alert: 0, hp: enemy.hp };
  return enemy;
}

const camp = (state: GameState): Point => ({ x: state.keeps[0].x, y: state.keeps[0].y });

/** Moves the camp to `to` and runs until it's set up there (or the game ends on the way). */
function travel(state: GameState, to: Point) {
  expect(applyCommand(state, ME, { type: "moveCamp", ...to })).toEqual({ ok: true });
  for (let i = 0; i < 60 * TICK_RATE && state.journey!.phase !== "camped"; i++) tick(state);
  if (!state.gameOver) expect(state.journey!.phase).toBe("camped");
}

describe("setting out", () => {
  it("starts with the camp on the left edge, home on the right, and no waves", () => {
    const state = journeyGame();
    expect(state.keeps).toHaveLength(1);
    const [campKeep] = state.keeps;
    expect(campKeep).toMatchObject({ x: 1, size: 1, hp: JOURNEY.campHp, owner: ME });
    expect(state.journey!.home.x).toBe(state.width - KEEP_SIZE - 1);
    expect(state.spawnTiles).toEqual([]);
    expect(state.wave.countdown).toBe(Infinity);
    expect(state.base[tileIndex(state, campKeep.x, campKeep.y)]).not.toBe(0); // the keep tile
    const { home } = state.journey!;
    expect(isHomeTile(state, home.x, home.y)).toBe(true);
    expect(state.explored[tileIndex(state, home.x + 1, home.y + 1)]).toBe(1); // seen from the start
  });

  it("places idle swarms clear of the start, tougher further right, and a few wanderers", () => {
    const state = journeyGame();
    const swarmers = state.enemies.filter((e) => e.journey?.post);
    const wanderers = state.enemies.filter((e) => e.journey && !e.journey.post);
    expect(new Set(swarmers.map((e) => e.journey!.swarm)).size).toBeGreaterThan(5);
    expect(wanderers).toHaveLength(JOURNEY.wanderers);
    for (const e of swarmers) {
      expect(Math.hypot(e.x - 1, e.y - state.keeps[0].y)).toBeGreaterThan(JOURNEY.clearOfStart - 3);
    }
    const left = swarmers.filter((e) => e.x < state.width / 3);
    const right = swarmers.filter((e) => e.x > (state.width * 2) / 3);
    const meanHp = (es: Enemy[]) => es.reduce((s, e) => s + e.maxHp, 0) / es.length;
    expect(meanHp(right)).toBeGreaterThan(meanHp(left));
  });

  it("is the same journey for the same seed", () => {
    const a = journeyGame(9);
    const b = journeyGame(9);
    expect(a.enemies.map((e) => [e.kind, e.x, e.y])).toEqual(
      b.enemies.map((e) => [e.kind, e.x, e.y]),
    );
    expect(a.journey!.home).toEqual(b.journey!.home);
  });

  it("leaves the swarms where they are while the camp stays out of their sight", () => {
    const state = journeyGame();
    run(state, 10 * TICK_RATE);
    for (const e of state.enemies.filter((e) => e.journey?.post)) {
      expect({ x: Math.round(e.x), y: Math.round(e.y) }).toEqual(e.journey!.post);
    }
    expect(state.keeps[0].hp).toBe(JOURNEY.campHp);
  });
});

describe("moving the camp", () => {
  it("packs up, travels to a tile in sight, explores as it goes, and sets up again", () => {
    const state = blankJourney();
    const explored = state.explored.filter(Boolean).length;
    const to = { x: camp(state).x + 6, y: camp(state).y };
    expect(applyCommand(state, ME, { type: "moveCamp", ...to })).toEqual({ ok: true });
    expect(state.journey!.phase).toBe("packing");
    run(state, JOURNEY.packSeconds * TICK_RATE);
    expect(state.journey!.phase).toBe("moving");
    expect(camp(state)).toEqual({ x: 1, y: to.y }); // not moved while packing
    travel(state, to);
    expect(camp(state)).toEqual(to);
    expect(state.base[tileIndex(state, 1, to.y)]).toBe(0); // the old tile is open again
    expect(state.explored.filter(Boolean).length).toBeGreaterThan(explored);
  });

  it("only goes somewhere in sight that it can stand on", () => {
    const state = blankJourney();
    const far = { x: camp(state).x + JOURNEY.campSight.inner + 3, y: camp(state).y };
    expect(applyCommand(state, ME, { type: "moveCamp", ...far })).toEqual({
      ok: false,
      reason: "The camp can only move somewhere in sight",
    });
    expect(applyCommand(state, ME, { type: "moveCamp", ...camp(state) }).ok).toBe(false);
    const wall = { x: camp(state).x + 2, y: camp(state).y };
    expect(applyCommand(state, ME, { type: "build", kind: "wall", ...wall }).ok).toBe(true);
    run(state, 5 * TICK_RATE); // built
    expect(applyCommand(state, ME, { type: "moveCamp", ...wall })).toEqual({
      ok: false,
      reason: "The camp can't stand there",
    });
  });

  it("crosses a bridge, leaving it standing, and can't have it sold from under it", () => {
    const state = blankJourney();
    const y = camp(state).y;
    const bridge = { x: camp(state).x + 2, y };
    state.terrain[tileIndex(state, bridge.x, y)] = "river";
    expect(applyCommand(state, ME, { type: "build", kind: "bridge", ...bridge }).ok).toBe(true);
    run(state, 10 * TICK_RATE); // built
    const id = state.base[tileIndex(state, bridge.x, y)];
    expect(id).toBeGreaterThan(0);
    travel(state, bridge);
    expect(camp(state)).toEqual(bridge);
    expect(state.base[tileIndex(state, bridge.x, y)]).toBe(id); // still the bridge
    expect(applyCommand(state, ME, { type: "sell", ...bridge })).toEqual({
      ok: false,
      reason: "Can't sell the keep",
    });
    travel(state, { x: bridge.x + 2, y });
    expect(state.base[tileIndex(state, bridge.x, y)]).toBe(id);
    expect(state.base[tileIndex(state, bridge.x + 2, y)]).toBe(-1); // the keep tile
  });

  it("picks up treasure it moves over", () => {
    const state = blankJourney();
    const chest = { kind: "chest" as const, x: camp(state).x + 2, y: camp(state).y, gold: 40 };
    state.features = [chest];
    const gold = state.players[ME].gold;
    travel(state, { x: chest.x + 2, y: chest.y });
    expect(state.features).toEqual([]);
    expect(state.players[ME].gold).toBe(gold + 40);
  });

  it("sells only round the camp", () => {
    const state = blankJourney();
    const near = { x: camp(state).x + 2, y: camp(state).y };
    expect(applyCommand(state, ME, { type: "build", kind: "wall", ...near }).ok).toBe(true);
    run(state, 5 * TICK_RATE);
    travel(state, { x: camp(state).x, y: camp(state).y + JOURNEY.campSight.inner - 1 });
    travel(state, { x: camp(state).x, y: camp(state).y + JOURNEY.campSight.inner - 1 });
    expect(applyCommand(state, ME, { type: "sell", ...near })).toEqual({
      ok: false,
      reason: "Too far from your camp",
    });
  });

  it("builds only round the camp, and only while it's camped", () => {
    const state = blankJourney();
    const near = { x: camp(state).x + JOURNEY.buildRadius, y: camp(state).y };
    const far = { x: camp(state).x + JOURNEY.buildRadius + 1, y: camp(state).y };
    expect(canBuild(state, ME, "wall", near.x, near.y).ok).toBe(true);
    expect(canBuild(state, ME, "wall", far.x, far.y)).toEqual({
      ok: false,
      reason: "Too far from your camp",
    });
    applyCommand(state, ME, { type: "moveCamp", x: camp(state).x, y: camp(state).y + 3 });
    expect(canBuild(state, ME, "wall", near.x, near.y)).toEqual({
      ok: false,
      reason: "Set up camp first",
    });
  });
});

describe("swarms", () => {
  it("wake together when one sees the camp, and come for it", () => {
    const state = blankJourney();
    const c = camp(state);
    const seer = swarmer(state, c.x + JOURNEY.enemySight - 1, c.y);
    const mate = swarmer(state, c.x + 30, c.y);
    const other = swarmer(state, c.x + 30, c.y + 10, 2);
    run(state, 2 * TICK_RATE);
    expect(seer.journey!.alert).toBeGreaterThan(0);
    expect(mate.journey!.alert).toBeGreaterThan(0);
    expect(mate.x).toBeLessThan(c.x + 30); // on its way
    expect(other.journey!.alert).toBe(0);
    expect(other.x).toBe(c.x + 30);
  });

  it("wake when one is hurt", () => {
    const state = blankJourney();
    const a = swarmer(state, 60, 10);
    const b = swarmer(state, 62, 12);
    a.hp -= 1;
    tick(state);
    expect(b.journey!.alert).toBeGreaterThan(0);
  });

  it("give up once they've lost sight of the camp a while, and go back to their post", () => {
    const state = blankJourney();
    const c = camp(state);
    // Far enough that a few seconds' chase doesn't bring the camp into its sight.
    const post = { x: c.x + 30, y: c.y };
    const enemy = swarmer(state, post.x, post.y);
    enemy.hp -= 1; // hurt: it wakes and heads for the camp
    tick(state);
    expect(enemy.journey!.alert).toBeGreaterThan(0);
    run(state, JOURNEY.giveUpSeconds * TICK_RATE);
    expect(enemy.journey!.alert).toBe(0);
    expect(enemy.x).toBeLessThan(post.x - 3); // it did come
    run(state, 15 * TICK_RATE);
    expect({ x: enemy.x, y: enemy.y }).toEqual(post);
  });

  it("keeps a few goblins wandering, topped up out of sight", () => {
    const state = blankJourney();
    state.journey!.wandererTimer = 0;
    run(state, JOURNEY.wandererSpawnSeconds * TICK_RATE * (JOURNEY.wanderers + 1));
    const wanderers = state.enemies.filter((e) => e.journey && !e.journey.post);
    expect(wanderers).toHaveLength(JOURNEY.wanderers);
  });
});

describe("journey's end", () => {
  it("is won when the camp reaches home", () => {
    const state = blankJourney();
    const { home } = state.journey!;
    // Hop the camp across the open map, a tile in sight at a time.
    for (let i = 0; i < 40 && tilesFromHome(state) > 1; i++) {
      const c = camp(state);
      const step = Math.min(JOURNEY.campSight.inner - 1, home.x - 1 - c.x);
      const dy = Math.sign(home.y - c.y) * Math.min(Math.abs(home.y - c.y), 3);
      travel(state, { x: c.x + step, y: c.y + dy });
    }
    run(state, 1);
    expect(state.gameOver).toBe(true);
    expect(state.won).toBe(true);
  });

  it("is lost when the camp falls", () => {
    const state = blankJourney();
    state.keeps[0].hp = 0;
    tick(state);
    expect(state.gameOver).toBe(true);
    expect(state.won).toBe(false);
  });

  it("has no waves to send", () => {
    const state = blankJourney();
    expect(applyCommand(state, ME, { type: "sendWave" }).ok).toBe(false);
  });
});
