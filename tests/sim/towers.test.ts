import { describe, expect, it } from "vitest";
import { angleTo } from "../../src/sim/aiming";
import { AIM_TOLERANCE_DEGREES, EFFECT_TICKS, STRUCTURES, TICK_RATE } from "../../src/sim/config";
import { spawnEnemy } from "../../src/sim/enemies";
import { applyCommand } from "../../src/sim/game";
import { placeStructure, topAt } from "../../src/sim/grid";
import { canTarget, updateTowers } from "../../src/sim/towers";
import { createGameWithoutWaves } from "./helpers";

const ARCHER = STRUCTURES.archer.tower;
const TOUGH = 10_000;

describe("archer targeting", () => {
  it("hits an enemy exactly at max range but not just beyond it", () => {
    const state = createGameWithoutWaves();
    placeStructure(state, "archer", 10, 10, "E");
    const inRange = spawnEnemy(state, 10 + ARCHER.range, 10, TOUGH);
    const outOfRange = spawnEnemy(state, 10 + ARCHER.range + 0.1, 10, TOUGH);
    updateTowers(state);
    expect(inRange.hp).toBe(TOUGH - ARCHER.damage);
    expect(outOfRange.hp).toBe(TOUGH);
  });

  it("targets the in-range enemy closest to the keep by path distance", () => {
    const state = createGameWithoutWaves();
    const keep = state.keeps[0];
    const y = keep.y + 1;
    // North of both enemies and facing south, so both are inside its arc.
    placeStructure(state, "archer", keep.x - 6, y - 4, "S");
    const far = spawnEnemy(state, keep.x - 8, y, TOUGH);
    const near = spawnEnemy(state, keep.x - 4, y, TOUGH);
    updateTowers(state);
    expect(near.hp).toBe(TOUGH - ARCHER.damage);
    expect(far.hp).toBe(TOUGH);
  });

  it("fires at most once per fire interval", () => {
    const state = createGameWithoutWaves();
    placeStructure(state, "archer", 10, 10, "E");
    const enemy = spawnEnemy(state, 12, 10, TOUGH);
    const interval = ARCHER.fireIntervalSeconds * TICK_RATE;
    for (let i = 0; i < interval; i++) updateTowers(state);
    expect(enemy.hp).toBe(TOUGH - ARCHER.damage);
    updateTowers(state);
    expect(enemy.hp).toBe(TOUGH - 2 * ARCHER.damage);
  });

  it("does not waste its shot when no enemy is in range", () => {
    const state = createGameWithoutWaves();
    placeStructure(state, "archer", 10, 10, "E");
    updateTowers(state);
    const enemy = spawnEnemy(state, 12, 10, TOUGH);
    updateTowers(state);
    expect(enemy.hp).toBe(TOUGH - ARCHER.damage);
  });

  it("records a shot effect for the renderer", () => {
    const state = createGameWithoutWaves();
    placeStructure(state, "archer", 10, 10, "E");
    spawnEnemy(state, 12, 10, TOUGH);
    updateTowers(state);
    expect(state.effects).toContainEqual(
      expect.objectContaining({ kind: "shot", fromX: 10, fromY: 10, toX: 12, toY: 10 }),
    );
  });
});

describe("cannon and catapult", () => {
  it("splash damages every enemy within the radius of the target, and no others", () => {
    const state = createGameWithoutWaves();
    const cannon = STRUCTURES.cannon.tower;
    placeStructure(state, "cannon", 10, 10, "E");
    // All three are equally close to the keep; the first spawned is the target.
    const target = spawnEnemy(state, 12, 10, TOUGH);
    const neighbour = spawnEnemy(state, 11, 11, TOUGH); // diagonal, within radius 1
    const outside = spawnEnemy(state, 10, 12, TOUGH); // 2 tiles from the target
    updateTowers(state);
    expect(target.hp).toBe(TOUGH - cannon.damage);
    expect(neighbour.hp).toBe(TOUGH - cannon.damage);
    expect(outside.hp).toBe(TOUGH);
    expect(state.effects).toContainEqual(
      expect.objectContaining({ kind: "splash", x: 12, y: 10, radius: cannon.splashRadius }),
    );
  });

  it("each tower's shot flies for its own time, and splash shows when it lands", () => {
    const state = createGameWithoutWaves();
    placeStructure(state, "catapult", 10, 10, "E");
    placeStructure(state, "cannon", 10, 30, "E");
    placeStructure(state, "archer", 10, 50, "E");
    spawnEnemy(state, 15, 10, TOUGH);
    spawnEnemy(state, 12, 30, TOUGH);
    spawnEnemy(state, 12, 50, TOUGH);
    updateTowers(state);
    const shots = state.effects.filter((e) => e.kind === "shot");
    for (const [y, kind] of [
      [10, "catapult"],
      [30, "cannon"],
      [50, "archer"],
    ] as const) {
      const tower = STRUCTURES[kind].tower;
      expect(shots.find((e) => e.fromY === y)).toMatchObject({
        projectile: tower.projectile,
        flight: tower.flightTicks,
        ttl: tower.flightTicks,
      });
    }
    const splashes = state.effects.filter((e) => e.kind === "splash");
    const flight = (kind: "catapult" | "cannon") => STRUCTURES[kind].tower.flightTicks;
    expect(splashes.find((e) => e.y === 10)?.ttl).toBe(flight("catapult") + EFFECT_TICKS);
    expect(splashes.find((e) => e.y === 30)?.ttl).toBe(flight("cannon") + EFFECT_TICKS);
  });

  it("the catapult never targets enemies inside its minimum range", () => {
    const state = createGameWithoutWaves();
    const catapult = STRUCTURES.catapult.tower;
    placeStructure(state, "catapult", 10, 10);
    const tooClose = spawnEnemy(state, 10 + catapult.minRange - 1, 10, TOUGH);
    updateTowers(state);
    expect(tooClose.hp).toBe(TOUGH);

    const atMinRange = spawnEnemy(state, 10, 10 - catapult.minRange, TOUGH);
    updateTowers(state);
    expect(atMinRange.hp).toBe(TOUGH - catapult.damage);
  });

  it.each(["archer", "cannon", "catapult"] as const)("%s respects its fire interval", (kind) => {
    const state = createGameWithoutWaves();
    const tower = STRUCTURES[kind].tower;
    placeStructure(state, kind, 10, 10, "S");
    const enemy = spawnEnemy(state, 10, 14, TOUGH); // 4 tiles: in range of all three
    for (let i = 0; i < tower.fireIntervalSeconds * TICK_RATE; i++) updateTowers(state);
    expect(enemy.hp).toBe(TOUGH - tower.damage);
    updateTowers(state);
    expect(enemy.hp).toBe(TOUGH - 2 * tower.damage);
  });
});

describe("facing and arcs", () => {
  it("records the facing every tower was built with, and turning towers aim along it", () => {
    const state = createGameWithoutWaves();
    applyCommand(state, 1, { type: "build", kind: "archer", x: 10, y: 10, facing: "E" });
    applyCommand(state, 1, { type: "build", kind: "cannon", x: 12, y: 10, facing: "S" });
    expect(topAt(state, 10, 10)?.facing).toBe("E");
    expect(topAt(state, 12, 10)?.facing).toBe("S");
    expect(topAt(state, 12, 10)?.aim).toBe(180);
    expect(topAt(state, 10, 10)?.aim).toBeUndefined(); // fixed towers never turn
  });

  it("an archer only fires inside its arc, even at a less urgent target", () => {
    const state = createGameWithoutWaves();
    const keep = state.keeps[0];
    const y = keep.y + 1;
    const towerX = keep.x + keep.size + 6; // east of the keep
    placeStructure(state, "archer", towerX, y, "E");
    const west = spawnEnemy(state, towerX - 2, y, TOUGH); // closer to the keep, but behind
    const east = spawnEnemy(state, towerX + 2, y, TOUGH);
    updateTowers(state);
    expect(east.hp).toBe(TOUGH - ARCHER.damage);
    expect(west.hp).toBe(TOUGH);
  });

  it("an enemy exactly on the arc edge counts as inside", () => {
    const state = createGameWithoutWaves();
    placeStructure(state, "archer", 10, 10, "E");
    const onEdge = spawnEnemy(state, 12, 8, TOUGH); // 45 degrees off the facing
    updateTowers(state);
    expect(onEdge.hp).toBe(TOUGH - ARCHER.damage);
  });
});

describe("turning towers", () => {
  const stepFor = (kind: "cannon" | "catapult") =>
    STRUCTURES[kind].tower.turnDegreesPerSecond / TICK_RATE;
  /** Largest aim error at which a shell landing at `distance` still lands within `splash` of the target. */
  const splashTolerance = (distance: number, splash: number) =>
    (2 * Math.asin(Math.min(1, splash / (2 * distance))) * 180) / Math.PI;
  const ticksUntilInBlast = (kind: "cannon" | "catapult", degrees: number, distance: number) =>
    Math.ceil(
      (degrees - splashTolerance(distance, STRUCTURES[kind].tower.splashRadius)) / stepFor(kind),
    );

  it("a cannon turns onto a target behind it, firing once its blast would catch it", () => {
    const state = createGameWithoutWaves();
    const cannon = placeStructure(state, "cannon", 10, 10, "N");
    const enemy = spawnEnemy(state, 10, 13, TOUGH); // due south, 3 tiles
    const turn = ticksUntilInBlast("cannon", 180, 3);
    for (let i = 0; i < turn - 1; i++) updateTowers(state);
    expect(enemy.hp).toBe(TOUGH);
    updateTowers(state);
    expect(enemy.hp).toBe(TOUGH - STRUCTURES.cannon.tower.damage);
    expect(turn).toBeGreaterThan(TICK_RATE * 1.5); // still a real swing: well over 1.5 s
    expect(cannon.aim).toBeGreaterThan(150);
  });

  it("a catapult takes about three times as long, and keeps its minimum range", () => {
    const state = createGameWithoutWaves();
    placeStructure(state, "catapult", 10, 10, "N");
    const enemy = spawnEnemy(state, 10, 15, TOUGH);
    const turn = ticksUntilInBlast("catapult", 180, 5);
    expect(turn).toBeGreaterThanOrEqual(ticksUntilInBlast("cannon", 180, 3) * 2.5);
    for (let i = 0; i < turn - 1; i++) updateTowers(state);
    expect(enemy.hp).toBe(TOUGH);
    updateTowers(state);
    expect(enemy.hp).toBe(TOUGH - STRUCTURES.catapult.tower.damage);
  });

  it("fires at an off-axis target sooner than an exact line-up would allow", () => {
    const state = createGameWithoutWaves();
    placeStructure(state, "cannon", 10, 10, "N");
    const enemy = spawnEnemy(state, 12, 7, TOUGH); // about 34 degrees off, 3.6 tiles
    const offset = 33.69;
    const exactLineUp = Math.ceil((offset - AIM_TOLERANCE_DEGREES) / stepFor("cannon"));
    const inBlast = ticksUntilInBlast("cannon", offset, Math.hypot(2, 3));
    expect(inBlast).toBeLessThan(exactLineUp);
    for (let i = 0; i < inBlast; i++) updateTowers(state);
    expect(enemy.hp).toBe(TOUGH - STRUCTURES.cannon.tower.damage);
  });

  it("centres the blast where the shell lands, along the barrel", () => {
    const state = createGameWithoutWaves();
    const cannon = placeStructure(state, "cannon", 10, 10, "N");
    spawnEnemy(state, 12, 7, TOUGH);
    for (let i = 0; i < 20 && !state.effects.some((e) => e.kind === "splash"); i++) {
      updateTowers(state);
    }
    const splash = state.effects.find((e) => e.kind === "splash");
    if (splash?.kind !== "splash") throw new Error("cannon never fired");
    const distance = Math.hypot(2, 3);
    const landing = angleTo({ x: 10, y: 10 }, splash);
    expect(landing).toBeCloseTo(cannon.aim!, 6);
    expect(Math.hypot(splash.x - 10, splash.y - 10)).toBeCloseTo(distance, 6);
  });

  it("prefers the enemy nearest its barrel over a more urgent one behind it", () => {
    const state = createGameWithoutWaves();
    placeStructure(state, "cannon", 10, 10, "N");
    const behind = spawnEnemy(state, 10, 13, TOUGH); // due south: closer to the keep
    const ahead = spawnEnemy(state, 11, 7, TOUGH); // just off the barrel
    for (let i = 0; i < 10; i++) updateTowers(state);
    expect(ahead.hp).toBeLessThan(TOUGH);
    expect(behind.hp).toBe(TOUGH);
  });

  it("turns the shorter way round", () => {
    const state = createGameWithoutWaves();
    const cannon = placeStructure(state, "cannon", 10, 10, "N");
    spawnEnemy(state, 7, 10, TOUGH); // due west: anticlockwise is shorter
    updateTowers(state);
    expect(cannon.aim).toBeCloseTo(360 - stepFor("cannon"), 9);
  });

  it("fires straight away at a target it is already facing", () => {
    const state = createGameWithoutWaves();
    placeStructure(state, "cannon", 10, 10, "S");
    const enemy = spawnEnemy(state, 10, 13, TOUGH);
    updateTowers(state);
    expect(enemy.hp).toBe(TOUGH - STRUCTURES.cannon.tower.damage);
  });
});

describe("canTarget (shared by targeting and the overlay)", () => {
  const at = { x: 10, y: 10 };
  it("limits a fixed archer to range and its arc", () => {
    expect(canTarget(ARCHER, at, "E", { x: 15, y: 10 })).toBe(true);
    expect(canTarget(ARCHER, at, "E", { x: 12, y: 8 })).toBe(true); // arc edge
    expect(canTarget(ARCHER, at, "E", { x: 10, y: 15 })).toBe(false); // outside the arc
    expect(canTarget(ARCHER, at, "E", { x: 16, y: 10 })).toBe(false); // out of range
  });

  it("lets turning towers reach all round, but keeps minimum range", () => {
    const catapult = STRUCTURES.catapult.tower;
    expect(canTarget(catapult, at, "N", { x: 10, y: 15 })).toBe(true); // behind it
    expect(canTarget(catapult, at, "N", { x: 11, y: 10 })).toBe(false); // too close
  });
});

describe("kill credit", () => {
  it("a single-target kill is credited to the tower's owner", () => {
    const state = createGameWithoutWaves();
    placeStructure(state, "archer", 10, 10, "E", 2);
    const enemy = spawnEnemy(state, 12, 10, ARCHER.damage);
    updateTowers(state);
    expect(enemy.killedBy).toBe(2);
  });

  it("every enemy killed by a splash is credited to the tower's owner", () => {
    const state = createGameWithoutWaves();
    const cannon = STRUCTURES.cannon.tower;
    placeStructure(state, "cannon", 10, 10, "E", 3); // already aimed at the target
    const target = spawnEnemy(state, 12, 10, cannon.damage);
    const neighbour = spawnEnemy(state, 12, 11, cannon.damage);
    updateTowers(state);
    expect(target.killedBy).toBe(3);
    expect(neighbour.killedBy).toBe(3);
  });

  it("a splash landing on an already-dead enemy doesn't take the credit", () => {
    const state = createGameWithoutWaves();
    const cannon = STRUCTURES.cannon.tower;
    // The archer (built first, so it fires first) faces east and kills `enemy`, the nearer of
    // the two to the keep. The cannon faces north along x = 13, so it targets the neighbour
    // without turning, and its splash also covers the dead enemy's tile.
    placeStructure(state, "archer", 10, 10, "E", 1);
    placeStructure(state, "cannon", 13, 14, "N", 2);
    const enemy = spawnEnemy(state, 13, 11, ARCHER.damage);
    const neighbour = spawnEnemy(state, 13, 10, cannon.damage * 10);
    updateTowers(state);
    expect(enemy.killedBy).toBe(1);
    expect(neighbour.hp).toBe(cannon.damage * 9);
  });

  it("structures built on behalf of no one credit nobody", () => {
    const state = createGameWithoutWaves();
    placeStructure(state, "archer", 10, 10, "E");
    const enemy = spawnEnemy(state, 12, 10, ARCHER.damage);
    updateTowers(state);
    expect(enemy.hp).toBeLessThanOrEqual(0);
    expect(enemy.killedBy).toBeNull();
  });
});
