import { describe, expect, it } from "vitest";
import { ENEMY_KINDS, RAID, TICK_RATE, type EnemyKindId } from "../../src/sim/config";
import { spawnEnemy } from "../../src/sim/enemies";
import { applyCommand, createGame, tick } from "../../src/sim/game";
import { placeStructure } from "../../src/sim/grid";
import { enemyOf, setRole } from "../../src/sim/raiders";
import { stretchEnds } from "../../src/sim/raidPaths";
import { spawnUnit } from "../../src/sim/units";
import type { Enemy, GameState, Point, Structure, StructureKind } from "../../src/sim/types";
import { paintTerrain } from "./helpers";

const DEFENDER = 1;
const RAIDER = 2;

function run(state: GameState, ticks: number) {
  for (let i = 0; i < ticks; i++) tick(state);
}

/**
 * A blank map with a defender (1) and a raider (2), no waves, no wandering, and (unless asked)
 * no roamers, so each test places the enemies it needs.
 */
function raidGame({ roamers = false } = {}): GameState {
  const state = createGame(1, { blankMap: true, fog: false, players: ["Def", "Raid"] });
  state.wave.countdown = Infinity;
  state.wanderChance = 0;
  if (!roamers) state.roamerTimer = Infinity;
  expect(setRole(state, RAIDER, "raider")).toEqual({ ok: true });
  return state;
}

/** A tile in the keep's row, `dx` tiles to its left. */
function lane(state: GameState, dx: number): Point {
  return { x: state.keeps[0].x - dx, y: state.keeps[0].y + 1 };
}

/** An enemy of `kind` at `p`, taken over by the raider (the only enemy, so the nearest). */
function controlled(state: GameState, p: Point, kind: EnemyKindId = "goblin"): Enemy {
  const enemy = spawnEnemy(state, p.x, p.y, { kind });
  state.players[RAIDER].raid!.lastAt = p;
  tick(state);
  expect(enemy.controller).toBe(RAIDER);
  // It finishes the step it was on when taken, then stands.
  while (enemy.x !== enemy.tx || enemy.y !== enemy.ty) tick(state);
  return enemy;
}

function owned(state: GameState, kind: StructureKind, p: Point): Structure {
  return placeStructure(state, kind, p.x, p.y, "N", DEFENDER);
}

function raid(state: GameState, command: Parameters<typeof applyCommand>[2]) {
  return applyCommand(state, RAIDER, command);
}

describe("roles", () => {
  it("raiders can't build, sell, send waves or skip to night, but can vote to pause", () => {
    const state = raidGame();
    const p = lane(state, 6);
    expect(raid(state, { type: "build", kind: "wall", x: p.x, y: p.y })).toEqual({
      ok: false,
      reason: "Raiders can't build",
    });
    expect(raid(state, { type: "sell", x: p.x, y: p.y }).ok).toBe(false);
    expect(raid(state, { type: "sendWave" }).ok).toBe(false);
    expect(raid(state, { type: "voteSkipToNight" }).ok).toBe(false);
    expect(raid(state, { type: "togglePause" }).ok).toBe(true);
  });

  it("defenders can't control enemies", () => {
    const state = raidGame();
    expect(applyCommand(state, DEFENDER, { type: "steer", x: 1, y: 1 }).ok).toBe(false);
    expect(applyCommand(state, DEFENDER, { type: "switchEnemy" }).ok).toBe(false);
  });

  it("PvP has no raiders, and there are at most RAID.maxRaiders", () => {
    const pvp = createGame(1, { blankMap: true, mode: "pvp", players: ["A", "B"] });
    expect(setRole(pvp, 1, "raider").ok).toBe(false);
    const state = createGame(1, { blankMap: true, players: ["A", "B", "C", "D"] });
    for (let id = 1; id <= RAID.maxRaiders; id++)
      expect(setRole(state, id, "raider").ok).toBe(true);
    expect(setRole(state, RAID.maxRaiders + 1, "raider").ok).toBe(false);
  });

  it("going back to defending lets go of the enemy", () => {
    const state = raidGame();
    const goblin = controlled(state, lane(state, 10));
    setRole(state, RAIDER, "defender");
    expect(goblin.controller).toBeNull();
    expect(state.players[RAIDER].raid).toBeNull();
  });
});

describe("roaming goblins", () => {
  it("keep RAID.roamers alive, one every RAID.roamerSpawnSeconds, at spawn tiles", () => {
    const state = raidGame({ roamers: true });
    run(state, 1);
    expect(state.enemies.filter((e) => e.roamer)).toHaveLength(1);
    run(state, RAID.roamerSpawnSeconds * TICK_RATE * (RAID.roamers + 2));
    const roamers = state.enemies.filter((e) => e.roamer);
    expect(roamers).toHaveLength(RAID.roamers);
    expect(roamers.every((e) => e.kind === "goblin" && e.maxHp === ENEMY_KINDS.goblin.hp)).toBe(
      true,
    );
  });

  it("a game without raiders has none", () => {
    const state = createGame(1, { blankMap: true, fog: false });
    state.wave.countdown = Infinity;
    run(state, TICK_RATE * 20);
    expect(state.enemies).toHaveLength(0);
  });

  it("the raider starts in one", () => {
    const state = raidGame({ roamers: true });
    run(state, 1);
    const enemy = enemyOf(state, state.players[RAIDER]);
    expect(enemy?.roamer).toBe(true);
    expect(enemy?.controller).toBe(RAIDER);
  });

  it("left alone they roam about and never attack", () => {
    const state = raidGame();
    state.players[RAIDER].connected = false; // away, so nobody takes it
    const p = lane(state, 20);
    const roamer = spawnEnemy(state, p.x, p.y);
    roamer.roamer = true;
    const walls = [-1, 1].map((d) => owned(state, "wall", { x: roamer.x + d, y: roamer.y }));
    const start = { x: roamer.x, y: roamer.y };
    run(state, TICK_RATE * 20);
    expect(walls.every((w) => w.hp === w.maxHp)).toBe(true);
    expect(state.keeps[0].hp).toBe(state.keeps[0].maxHp);
    expect(roamer.x !== start.x || roamer.y !== start.y).toBe(true);
  });

  it("don't stop a level's last wave being beaten", () => {
    const state = raidGame({ roamers: true });
    state.lastWave = 1;
    state.wave.number = 1;
    state.wave.threatLeft = 0;
    run(state, 1);
    expect(state.enemies.some((e) => e.roamer)).toBe(true);
    expect(state.won).toBe(true);
  });
});

describe("respawning and switching", () => {
  it("after a death, the raider waits RAID.respawnSeconds and takes the nearest enemy", () => {
    const state = raidGame();
    const first = controlled(state, lane(state, 20));
    const near = spawnEnemy(state, first.x, first.y + 2);
    const far = spawnEnemy(state, first.x, first.y + 8);
    first.hp = 0;
    run(state, RAID.respawnSeconds * TICK_RATE);
    expect(enemyOf(state, state.players[RAIDER])).toBeUndefined();
    run(state, 1);
    expect(near.controller).toBe(RAIDER);
    expect(far.controller).toBeNull();
  });

  it("a death leaves a flag in the raider's colour for RAID.flagSeconds", () => {
    const state = raidGame();
    const goblin = controlled(state, lane(state, 20));
    spawnEnemy(state, goblin.x, goblin.y + 5);
    goblin.hp = 0;
    tick(state);
    const flag = state.effects.find((e) => e.kind === "flag");
    expect(flag).toMatchObject({ x: goblin.x, y: goblin.y, owner: RAIDER });
    run(state, RAID.flagSeconds * TICK_RATE);
    expect(state.effects.some((e) => e.kind === "flag")).toBe(false);
  });

  it("the next enemy carries on to the square chosen before the death", () => {
    const state = raidGame();
    const start = lane(state, 20);
    const first = controlled(state, start);
    const next = spawnEnemy(state, start.x, start.y + 2);
    const goal = { x: start.x - 5, y: start.y + 2 };
    raid(state, { type: "steer", x: goal.x, y: goal.y });
    first.hp = 0;
    run(state, RAID.respawnSeconds * TICK_RATE + 1);
    expect(next.controller).toBe(RAIDER);
    run(state, TICK_RATE * 8);
    expect({ x: next.x, y: next.y }).toEqual(goal);
  });

  it("and keeps at what it was told to attack", () => {
    const state = raidGame();
    const start = lane(state, 20);
    const first = controlled(state, start);
    spawnEnemy(state, start.x + 2, start.y);
    const wall = owned(state, "wall", { x: start.x, y: start.y - 6 });
    raid(state, { type: "interact", x: wall.x, y: wall.y });
    first.hp = 0;
    run(state, RAID.respawnSeconds * TICK_RATE + TICK_RATE * 10);
    expect(wall.hp).toBeLessThan(wall.maxHp);
  });

  it("but not a bomber's blast on the spot", () => {
    const state = raidGame();
    const start = lane(state, 20);
    const bomber = controlled(state, start, "dwarfBomber");
    const next = spawnEnemy(state, start.x, start.y + 3, { kind: "dwarfBomber" });
    raid(state, { type: "interact", x: bomber.x, y: bomber.y });
    run(state, RAID.respawnSeconds * TICK_RATE + TICK_RATE);
    expect(next.controller).toBe(RAIDER);
    expect(next.hp).toBeGreaterThan(0);
  });

  it("switch jumps to another enemy, never the one just left while there's another", () => {
    const state = raidGame();
    const a = controlled(state, lane(state, 20));
    const b = spawnEnemy(state, a.x, a.y + 4);
    const c = spawnEnemy(state, a.x, a.y + 6);
    expect(raid(state, { type: "switchEnemy" }).ok).toBe(true);
    const second = enemyOf(state, state.players[RAIDER])!;
    expect([b, c]).toContain(second);
    expect(a.controller).toBeNull();
    for (let i = 0; i < 10; i++) {
      const before = enemyOf(state, state.players[RAIDER])!;
      raid(state, { type: "switchEnemy" });
      const after = enemyOf(state, state.players[RAIDER])!;
      expect(after).not.toBe(before);
      expect(after.controller).toBe(RAIDER);
    }
  });

  it("choosing a kind takes a random one of that kind", () => {
    const state = raidGame();
    const a = controlled(state, lane(state, 20));
    spawnEnemy(state, a.x, a.y + 4, { kind: "zerg" });
    const dwarves = [6, 8, 10].map((dy) => spawnEnemy(state, a.x, a.y + dy, { kind: "dwarf" }));
    for (let i = 0; i < 5; i++) {
      expect(raid(state, { type: "switchEnemy", kind: "dwarf" }).ok).toBe(true);
      expect(dwarves).toContain(enemyOf(state, state.players[RAIDER]));
    }
    expect(raid(state, { type: "switchEnemy", kind: "golem" })).toEqual({
      ok: false,
      reason: "No golem free to take",
    });
  });

  it("the chosen kind sticks: after a death, the nearest of that kind, not the nearest enemy", () => {
    const state = raidGame();
    const start = lane(state, 20);
    controlled(state, start);
    const first = spawnEnemy(state, start.x, start.y + 6, { kind: "dwarf" });
    raid(state, { type: "switchEnemy", kind: "dwarf" });
    expect(enemyOf(state, state.players[RAIDER])).toBe(first);
    const near = spawnEnemy(state, first.x, first.y + 1);
    const dwarf = spawnEnemy(state, first.x, first.y + 9, { kind: "dwarf" });
    first.hp = 0;
    run(state, RAID.respawnSeconds * TICK_RATE + 1);
    expect(dwarf.controller).toBe(RAIDER);
    expect(near.controller).toBeNull();
  });

  it("with none of that kind left, a stand-in until the next of that kind spawns", () => {
    const state = raidGame();
    const start = lane(state, 20);
    controlled(state, start);
    const dwarf = spawnEnemy(state, start.x, start.y + 6, { kind: "dwarf" });
    raid(state, { type: "switchEnemy", kind: "dwarf" });
    const goblin = spawnEnemy(state, start.x, start.y + 2);
    dwarf.hp = 0;
    run(state, RAID.respawnSeconds * TICK_RATE + 1);
    const standIn = enemyOf(state, state.players[RAIDER])!;
    expect(standIn.kind).toBe("goblin");
    expect(state.players[RAIDER].raid?.kind).toBe("dwarf");
    const next = spawnEnemy(state, start.x, start.y + 9, { kind: "dwarf" });
    tick(state);
    expect(next.controller).toBe(RAIDER);
    expect(goblin.controller === null || goblin === standIn).toBe(true);
    expect(standIn.controller).toBeNull();
  });

  it("a plain switch goes back to any kind", () => {
    const state = raidGame();
    const start = lane(state, 20);
    controlled(state, start);
    spawnEnemy(state, start.x, start.y + 6, { kind: "dwarf" });
    raid(state, { type: "switchEnemy", kind: "dwarf" });
    raid(state, { type: "switchEnemy" });
    expect(state.players[RAIDER].raid?.kind).toBeNull();
  });

  it("switch is refused with no other enemy", () => {
    const state = raidGame();
    controlled(state, lane(state, 20));
    expect(raid(state, { type: "switchEnemy" })).toEqual({
      ok: false,
      reason: "No other enemy to take",
    });
  });

  it("the enemy left behind walks its field to the keep again", () => {
    const state = raidGame();
    const a = controlled(state, lane(state, 20));
    spawnEnemy(state, a.x, a.y - 8);
    raid(state, { type: "switchEnemy" });
    expect(a.steer).toBeNull();
    const before = a.x;
    run(state, TICK_RATE * 3);
    expect(a.x).toBeGreaterThan(before);
  });

  it("a dropped raider's enemy acts on its own again", () => {
    const state = raidGame();
    const a = controlled(state, lane(state, 20));
    state.players[RAIDER].connected = false;
    tick(state);
    expect(a.controller).toBeNull();
  });
});

describe("steering", () => {
  it("a controlled enemy stands still until steered, and never walks its field", () => {
    const state = raidGame();
    const goblin = controlled(state, lane(state, 20));
    const at = { x: goblin.x, y: goblin.y };
    run(state, TICK_RATE * 3);
    expect({ x: goblin.x, y: goblin.y }).toEqual(at);
  });

  it("walks to the pointed tile round a wall", () => {
    const state = raidGame();
    const start = lane(state, 20);
    const goblin = controlled(state, start);
    const goal = { x: start.x - 6, y: start.y };
    for (let dy = -2; dy <= 2; dy++) owned(state, "wall", { x: start.x - 3, y: start.y + dy });
    raid(state, { type: "steer", x: goal.x, y: goal.y });
    run(state, TICK_RATE * 15);
    expect({ x: goblin.x, y: goblin.y }).toEqual(goal);
  });

  it("only its own terrain: a goblin stops at water, a marine crosses it", () => {
    const state = raidGame();
    const start = lane(state, 20);
    const river = Array.from({ length: state.height }, (_, y) => ({ x: start.x - 3, y }));
    paintTerrain(state, river, "river");
    state.gridVersion++;
    const goal = { x: start.x - 6, y: start.y };
    const goblin = controlled(state, start);
    raid(state, { type: "steer", x: goal.x, y: goal.y });
    run(state, TICK_RATE * 10);
    expect(goblin.x).toBe(start.x - 2); // as near as it gets
    setRole(state, RAIDER, "defender");
    setRole(state, RAIDER, "raider");
    goblin.hp = 0;
    tick(state);
    const marine = controlled(state, start, "marine");
    raid(state, { type: "steer", x: goal.x, y: goal.y });
    run(state, TICK_RATE * 15);
    expect({ x: marine.x, y: marine.y }).toEqual(goal);
  });

  it("a bomber holding sprint moves faster", () => {
    const state = raidGame();
    const start = lane(state, 25);
    const bomber = controlled(state, start, "dwarfBomber");
    raid(state, { type: "steer", x: start.x, y: start.y - 20 });
    run(state, TICK_RATE * 2);
    const walked = start.y - bomber.y;
    raid(state, { type: "sprint", on: true });
    const from = bomber.y;
    run(state, TICK_RATE * 2);
    expect(from - bomber.y).toBeGreaterThan(walked * 2);
  });
});

describe("interacting", () => {
  it("a follower walks up to a wall and hits it with its own damage", () => {
    const state = raidGame();
    const start = lane(state, 20);
    const goblin = controlled(state, start);
    const wall = owned(state, "wall", { x: start.x, y: start.y - 4 });
    raid(state, { type: "interact", x: wall.x, y: wall.y });
    run(state, TICK_RATE * 6);
    expect(wall.hp).toBeLessThan(wall.maxHp);
    expect((wall.maxHp - wall.hp) % goblin.damage).toBe(0);
  });

  it("attacking a tower's tile hits the wall under it first", () => {
    const state = raidGame();
    const start = lane(state, 20);
    controlled(state, start);
    const p = { x: start.x, y: start.y - 3 };
    const wall = owned(state, "wall", p);
    const tower = owned(state, "archer", p);
    tower.buildLeft = wall.buildLeft = 0;
    raid(state, { type: "interact", x: p.x, y: p.y });
    run(state, TICK_RATE * 6);
    expect(wall.hp).toBeLessThan(wall.maxHp);
    expect(tower.hp).toBe(tower.maxHp);
  });

  it("a bomber sprints to its target and explodes", () => {
    const state = raidGame();
    const start = lane(state, 20);
    const bomber = controlled(state, start, "dwarfBomber");
    const wall = owned(state, "wall", { x: start.x, y: start.y - 8 });
    wall.hp = wall.maxHp = 1000;
    raid(state, { type: "interact", x: wall.x, y: wall.y });
    run(state, TICK_RATE * 6);
    expect(bomber.hp <= 0 || !state.enemies.includes(bomber)).toBe(true);
    expect(wall.hp).toBe(1000 - ENEMY_KINDS.dwarfBomber.ability.amount!);
  });

  it("a bomber acting on its own tile explodes on the spot", () => {
    const state = raidGame();
    const start = lane(state, 20);
    const bomber = controlled(state, start, "dwarfBomber");
    const wall = owned(state, "wall", { x: start.x + 1, y: start.y });
    wall.hp = wall.maxHp = 1000;
    raid(state, { type: "interact", x: bomber.x, y: bomber.y });
    tick(state);
    expect(state.enemies).not.toContain(bomber);
    expect(wall.hp).toBeLessThan(1000);
  });

  it("a digger digs under a wall until it falls", () => {
    const state = raidGame();
    const start = lane(state, 20);
    const digger = controlled(state, start, "digger");
    const wall = owned(state, "wall", { x: start.x, y: start.y - 3 });
    raid(state, { type: "interact", x: wall.x, y: wall.y });
    run(state, TICK_RATE * 3);
    expect(digger.mode).toBe("digging");
    run(state, TICK_RATE * 30);
    expect(state.structures[wall.id]).toBeUndefined();
    expect(digger.mode).toBe("walking");
  });

  it("walks up to the keep and attacks it", () => {
    const state = raidGame();
    const start = lane(state, 6);
    controlled(state, start);
    const keep = state.keeps[0];
    raid(state, { type: "interact", x: keep.x, y: keep.y });
    run(state, TICK_RATE * 8);
    expect(keep.hp).toBeLessThan(keep.maxHp);
  });

  it("rams refuse units; ruins and bridges aren't targets", () => {
    const state = raidGame();
    const start = lane(state, 20);
    controlled(state, start, "batteringRam");
    const at = { x: start.x, y: start.y - 3 };
    spawnUnit(state, "militia", DEFENDER, at.x, at.y);
    expect(raid(state, { type: "interact", x: at.x, y: at.y })).toEqual({
      ok: false,
      reason: "Rams don't fight units",
    });
    const ruin = placeStructure(state, "ruin", start.x + 3, start.y, "N", null);
    expect(raid(state, { type: "interact", x: ruin.x, y: ruin.y }).ok).toBe(false);
  });

  it("stopping the interaction stops the attack", () => {
    const state = raidGame();
    const start = lane(state, 20);
    controlled(state, start);
    const wall = owned(state, "wall", { x: start.x, y: start.y - 1 });
    raid(state, { type: "interact", x: wall.x, y: wall.y });
    run(state, TICK_RATE * 2);
    raid(state, { type: "stopInteract" });
    const hp = wall.hp;
    run(state, TICK_RATE * 4);
    expect(wall.hp).toBe(hp);
  });
});

describe("raider paths", () => {
  /** Paints every tile from a to b (a straight line along a row or a column). */
  function paint(state: GameState, a: Point, b: Point) {
    const steps = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    for (let i = 0; i <= steps; i++) {
      const x = a.x + Math.sign(b.x - a.x) * i;
      const y = a.y + Math.sign(b.y - a.y) * i;
      expect(raid(state, { type: "paintPath", x, y }).ok).toBe(true);
    }
  }

  const onPath = (state: GameState, e: Enemy) => state.raidPaths.includes(e.y * state.width + e.x);

  /** A wave enemy at `p`, with the raider busy in a goblin out of the way. */
  function waveEnemy(state: GameState, p: Point): Enemy {
    controlled(state, { x: p.x, y: p.y + 10 });
    return spawnEnemy(state, p.x, p.y);
  }

  it("free enemies on a path keep to it, to its end nearest the keep, then their field", () => {
    const state = raidGame();
    const start = lane(state, 20);
    const corner = { x: start.x, y: start.y - 5 };
    const end = { x: start.x + 10, y: start.y - 5 };
    paint(state, start, corner);
    paint(state, corner, end);
    const wave = waveEnemy(state, start);
    const off: Point[] = [];
    const leftEnd = () => wave.px === end.x && wave.py === end.y;
    for (let t = 0; t < TICK_RATE * 20 && !leftEnd(); t++) {
      tick(state);
      if (wave.x === wave.tx && wave.y === wave.ty && !onPath(state, wave)) off.push(tileOf(wave));
    }
    expect(off).toEqual([]);
    expect(leftEnd()).toBe(true);
    run(state, TICK_RATE * 3);
    expect(wave.x).toBeGreaterThan(end.x); // its own field, on to the keep
  });

  it("enemies that never step on a path don't go out of their way for one", () => {
    const state = raidGame();
    const start = lane(state, 20);
    paint(state, { x: start.x, y: start.y - 6 }, { x: start.x + 4, y: start.y - 6 });
    const wave = waveEnemy(state, start);
    run(state, TICK_RATE * 4);
    expect(wave.y).toBe(start.y); // straight on along its field
    expect(wave.x).toBeGreaterThan(start.x + 2);
  });

  it("an enemy that stumbles onto a path partway follows it", () => {
    const state = raidGame();
    const start = lane(state, 20);
    const join = { x: start.x + 3, y: start.y };
    const end = { x: join.x + 8, y: join.y - 6 };
    paint(state, join, { x: join.x, y: end.y });
    paint(state, { x: join.x, y: end.y }, end);
    const wave = waveEnemy(state, start);
    let top = start.y;
    for (let t = 0; t < TICK_RATE * 20; t++) {
      tick(state);
      top = Math.min(top, wave.y);
    }
    expect(top).toBe(end.y); // turned up the path, not on along its row
  });

  it("a wall on a path: they break through it rather than leave the path", () => {
    const state = raidGame();
    const start = lane(state, 20);
    paint(state, start, { x: start.x + 8, y: start.y });
    const wall = owned(state, "wall", { x: start.x + 4, y: start.y });
    waveEnemy(state, start);
    run(state, TICK_RATE * 8);
    expect(wall.hp).toBeLessThan(wall.maxHp);
  });

  it("the end is the tile painted last, even past where the path is nearest the keep", () => {
    const state = raidGame();
    const start = lane(state, 20);
    const bend = { x: start.x + 12, y: start.y };
    const end = { x: bend.x, y: bend.y - 8 };
    paint(state, start, bend);
    paint(state, bend, end); // on from the bend, away from the keep
    const wave = waveEnemy(state, start);
    const leftEnd = () => wave.px === end.x && wave.py === end.y;
    for (let t = 0; t < TICK_RATE * 30 && !leftEnd(); t++) tick(state);
    expect(leftEnd()).toBe(true);
    expect(wave.pathDone).toBe(true);
    // Its own field leads back down the path to the keep, but it doesn't take the path again.
    run(state, TICK_RATE * 10);
    expect(wave.y).toBeGreaterThan(end.y + 3);
    expect(wave.pathDone).toBe(true);
  });

  it("a bomber on a path keeps to it rather than go for a wall in sight", () => {
    const state = raidGame();
    const start = lane(state, 20);
    const end = { x: start.x, y: start.y - 8 };
    paint(state, start, end);
    const wall = owned(state, "wall", { x: start.x + 3, y: start.y + 1 });
    const bomber = waveEnemy(state, start);
    bomber.kind = "dwarfBomber";
    run(state, TICK_RATE * 2);
    expect(bomber.mode).toBe("walking");
    expect(bomber.x).toBe(start.x);
    expect(wall.hp).toBe(wall.maxHp);
  });

  it("each stretch of path ends at its tile painted last", () => {
    const state = raidGame();
    const p = lane(state, 20);
    const at = (q: Point) => q.y * state.width + q.x;
    paint(state, p, { x: p.x + 3, y: p.y });
    paint(state, { x: p.x, y: p.y - 5 }, { x: p.x, y: p.y - 8 }); // a second, apart
    raid(state, { type: "paintPath", x: p.x + 1, y: p.y + 1 }); // added to the first, last
    expect(stretchEnds(state).sort((a, b) => a - b)).toEqual(
      [at({ x: p.x, y: p.y - 8 }), at({ x: p.x + 1, y: p.y + 1 })].sort((a, b) => a - b),
    );
  });

  it("rubbing out, the most tiles, clearing, and only raiders paint", () => {
    const state = raidGame();
    const p = lane(state, 20);
    raid(state, { type: "paintPath", x: p.x, y: p.y });
    raid(state, { type: "paintPath", x: p.x, y: p.y }); // already painted
    expect(state.raidPaths).toEqual([p.y * state.width + p.x]);
    raid(state, { type: "paintPath", x: p.x, y: p.y, erase: true });
    expect(state.raidPaths).toEqual([]);
    state.raidPaths = Array.from({ length: RAID.maxPathTiles }, (_, i) => i);
    expect(raid(state, { type: "paintPath", x: p.x, y: p.y })).toEqual({
      ok: false,
      reason: "No more path to paint",
    });
    raid(state, { type: "clearPaths" });
    expect(state.raidPaths).toEqual([]);
    expect(applyCommand(state, DEFENDER, { type: "paintPath", x: 1, y: 1 }).ok).toBe(false);
    expect(raid(state, { type: "paintPath", x: -1, y: 1 }).ok).toBe(false);
  });

  it("roamers don't follow them", () => {
    const state = raidGame({ roamers: true });
    state.players[RAIDER].connected = false;
    const p = lane(state, 20);
    const roamer = spawnEnemy(state, p.x, p.y);
    roamer.roamer = true;
    paint(state, p, { x: p.x, y: p.y - 9 });
    run(state, TICK_RATE * 3);
    expect(roamer.steer?.by).toBe("roam");
  });
});

function tileOf(e: Enemy): Point {
  return { x: e.x, y: e.y };
}

describe("pathing flags", () => {
  it("Shift-queued flags are done in order", () => {
    const state = raidGame();
    const start = lane(state, 20);
    const goblin = controlled(state, start);
    const a = { x: start.x, y: start.y - 4 };
    const b = { x: start.x - 4, y: start.y - 4 };
    raid(state, { type: "steer", x: a.x, y: a.y });
    expect(raid(state, { type: "steer", x: b.x, y: b.y, queue: true }).ok).toBe(true);
    expect(state.players[RAIDER].raid?.plan.map((f) => ({ x: f.x, y: f.y }))).toEqual([a, b]);
    const seen: string[] = [];
    for (let t = 0; t < TICK_RATE * 10; t++) {
      tick(state);
      const at = `${goblin.x},${goblin.y}`;
      if (at === `${a.x},${a.y}` || at === `${b.x},${b.y}`) seen.push(at);
    }
    expect([...new Set(seen)]).toEqual([`${a.x},${a.y}`, `${b.x},${b.y}`]);
  });

  it("a queued attack flag attacks once it gets there", () => {
    const state = raidGame();
    const start = lane(state, 20);
    controlled(state, start);
    const wall = owned(state, "wall", { x: start.x - 6, y: start.y });
    raid(state, { type: "steer", x: start.x, y: start.y - 3 });
    raid(state, { type: "interact", x: wall.x, y: wall.y, queue: true });
    run(state, TICK_RATE * 12);
    expect(wall.hp).toBeLessThan(wall.maxHp);
  });

  it("an enemy left behind keeps following its flags, then goes back to its field", () => {
    const state = raidGame();
    const start = lane(state, 20);
    const goblin = controlled(state, start);
    spawnEnemy(state, start.x, start.y + 9);
    const a = { x: start.x - 3, y: start.y - 3 };
    const b = { x: start.x - 6, y: start.y - 3 };
    raid(state, { type: "steer", x: a.x, y: a.y });
    raid(state, { type: "steer", x: b.x, y: b.y, queue: true });
    raid(state, { type: "switchEnemy" });
    expect(goblin.controller).toBeNull();
    let reached = false;
    for (let t = 0; t < TICK_RATE * 10 && !reached; t++) {
      tick(state);
      reached = goblin.x === b.x && goblin.y === b.y;
    }
    expect(reached).toBe(true);
    run(state, TICK_RATE * 3);
    expect(goblin.steer).toBeNull();
    expect(goblin.x).toBeGreaterThan(b.x); // its field, on to the keep
  });

  it("the next enemy after a death carries on with the flags", () => {
    const state = raidGame();
    const start = lane(state, 20);
    const goblin = controlled(state, start);
    const next = spawnEnemy(state, start.x, start.y + 2);
    raid(state, { type: "steer", x: start.x, y: start.y - 3 });
    raid(state, { type: "steer", x: start.x - 4, y: start.y - 3, queue: true });
    goblin.hp = 0;
    run(state, TICK_RATE * (RAID.respawnSeconds + 1));
    expect(next.controller).toBe(RAIDER);
    expect(next.steer?.queue.length ?? 0).toBeGreaterThan(0);
  });

  it("no more than RAID.maxFlags can be queued", () => {
    const state = raidGame();
    const start = lane(state, 20);
    controlled(state, start);
    raid(state, { type: "steer", x: start.x, y: start.y - 3 });
    for (let i = 0; i < RAID.maxFlags; i++) {
      expect(raid(state, { type: "steer", x: start.x - i, y: start.y - 4, queue: true }).ok).toBe(
        true,
      );
    }
    expect(raid(state, { type: "steer", x: start.x, y: start.y - 5, queue: true }).ok).toBe(false);
  });

  it("Esc drops the flags", () => {
    const state = raidGame();
    const start = lane(state, 20);
    controlled(state, start);
    raid(state, { type: "steer", x: start.x, y: start.y - 3 });
    raid(state, { type: "steer", x: start.x, y: start.y - 6, queue: true });
    raid(state, { type: "stopInteract" });
    tick(state);
    expect(state.players[RAIDER].raid?.plan).toEqual([]);
  });
});

describe("determinism", () => {
  it("the same seed and raider commands give the same game", () => {
    const play = () => {
      const state = createGame(7, { fog: false, players: ["Def", "Raid"] });
      setRole(state, RAIDER, "raider");
      for (let t = 0; t < 2000; t++) {
        if (t % 97 === 0) raid(state, { type: "switchEnemy" });
        if (t % 40 === 0) {
          const k = state.keeps[0];
          raid(state, { type: "interact", x: k.x, y: k.y });
        }
        tick(state);
      }
      return JSON.stringify({ enemies: state.enemies, keeps: state.keeps, rng: state.rngState });
    };
    expect(play()).toBe(play());
  });
});
