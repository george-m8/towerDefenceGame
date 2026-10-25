import { describe, expect, it } from "vitest";
import { ENEMY_KINDS, TICK_RATE, type EnemyKindId } from "../../src/sim/config";
import { damageEnemy, spawnEnemy } from "../../src/sim/enemies";
import { tick } from "../../src/sim/game";
import { placeStructure } from "../../src/sim/grid";
import type { Enemy, GameState, Structure, StructureKind } from "../../src/sim/types";
import { createGameWithoutWaves, goldOf } from "./helpers";

const blast = ENEMY_KINDS.dwarfBomber.ability.amount;

function run(state: GameState, ticks: number) {
  for (let i = 0; i < ticks; i++) tick(state);
}

/** A structure built by player 1, so it counts as player-built. */
function owned(state: GameState, kind: StructureKind, x: number, y: number): Structure {
  return placeStructure(state, kind, x, y, "N", 1);
}

/** Enough HP to survive a blast, so the damage can be measured. */
function sturdy(structure: Structure): Structure {
  structure.hp = structure.maxHp = 1000;
  return structure;
}

/** A tile in the keep's row, well to its left: enemies there walk straight east. */
function lane(state: GameState, dx: number) {
  return { x: state.keeps[0].x - dx, y: state.keeps[0].y + 1 };
}

describe("bomber", () => {
  it("walks normally while no target is within 3 tiles", () => {
    const state = createGameWithoutWaves();
    const p = lane(state, 20);
    owned(state, "wall", p.x, p.y - 4);
    const bomber = spawnEnemy(state, p.x, p.y, { kind: "dwarfBomber" });

    tick(state);

    expect(bomber.mode).toBe("walking");
    expect(bomber.targetId).toBeNull();
  });

  it("sprints once a player-built wall is within 3 tiles", () => {
    const state = createGameWithoutWaves();
    const p = lane(state, 20);
    const wall = owned(state, "wall", p.x, p.y + 3);
    const bomber = spawnEnemy(state, p.x, p.y, { kind: "dwarfBomber" });

    tick(state);

    expect(bomber.mode).toBe("sprinting");
    expect(bomber.targetId).toBe(wall.id);
  });

  it("goes for towers and houses too", () => {
    const state = createGameWithoutWaves();
    const p = lane(state, 20);
    const house = owned(state, "house", p.x, p.y + 2);
    const bomber = spawnEnemy(state, p.x, p.y, { kind: "dwarfBomber" });
    tick(state);
    expect(bomber.targetId).toBe(house.id);

    const q = lane(state, 40);
    const tower = owned(state, "archer", q.x, q.y - 2);
    const other = spawnEnemy(state, q.x, q.y, { kind: "dwarfBomber" });
    tick(state);
    expect(other.targetId).toBe(tower.id);
  });

  it("ignores ruins, bridges, floor spikes and the keep", () => {
    const state = createGameWithoutWaves();
    const p = lane(state, 20);
    placeStructure(state, "ruin", p.x, p.y + 2);
    owned(state, "bridge", p.x + 1, p.y - 2);
    owned(state, "floorSpikes", p.x + 2, p.y + 2);
    const bomber = spawnEnemy(state, p.x, p.y, { kind: "dwarfBomber" });
    const atKeep = spawnEnemy(state, state.keeps[0].x - 1, state.keeps[0].y, {
      kind: "dwarfBomber",
    });

    run(state, 10);

    expect(bomber.mode).toBe("walking");
    expect(atKeep.mode).toBe("walking");
    expect(state.enemies).toContain(atKeep);
  });

  it("sprints faster than it walks", () => {
    const state = createGameWithoutWaves();
    const p = lane(state, 20);
    owned(state, "wall", p.x, p.y - 3);
    const bomber = spawnEnemy(state, p.x, p.y, { kind: "dwarfBomber" });
    const walker = spawnEnemy(state, p.x, p.y + 10, { kind: "dwarfBomber" });

    run(state, 8);

    const moved = (e: Enemy, y: number) => Math.abs(e.x - p.x) + Math.abs(e.y - y);
    expect(bomber.mode).toBe("sprinting");
    expect(moved(bomber, p.y)).toBeCloseTo(2.5 * moved(walker, p.y + 10));
  });

  it("explodes next to its target, damaging the 3x3 around it and nothing else", () => {
    const state = createGameWithoutWaves();
    const p = lane(state, 20);
    const target = sturdy(owned(state, "wall", p.x + 2, p.y));
    const inside = sturdy(owned(state, "wall", p.x + 1, p.y + 1));
    const outside = sturdy(owned(state, "wall", p.x + 3, p.y + 1));
    const bomber = spawnEnemy(state, p.x, p.y, { kind: "dwarfBomber" });
    const goblin = spawnEnemy(state, p.x, p.y - 1);
    const gold = goldOf(state);

    for (let i = 0; i < 40 && state.enemies.includes(bomber); i++) tick(state);

    expect(state.enemies).not.toContain(bomber);
    expect(target.hp).toBe(1000 - blast);
    expect(inside.hp).toBe(1000 - blast);
    expect(outside.hp).toBe(1000);
    expect(goblin.hp).toBe(goblin.maxHp);
    expect(goldOf(state)).toBe(gold);
    expect(state.cues.some((c) => c.kind === "explosion")).toBe(true);
    expect(state.effects.some((e) => e.kind === "splash")).toBe(true);
  });

  it("damages the keep once when it's inside the blast", () => {
    const state = createGameWithoutWaves();
    const keep = state.keeps[0];
    sturdy(owned(state, "wall", keep.x - 1, keep.y + 1));
    spawnEnemy(state, keep.x - 1, keep.y, { kind: "dwarfBomber" });

    tick(state);

    expect(keep.hp).toBe(keep.maxHp - blast);
  });

  it("leaves the keep alone with the debug infinite keep on", () => {
    const state = createGameWithoutWaves();
    state.debug.infiniteKeep = true;
    const keep = state.keeps[0];
    sturdy(owned(state, "wall", keep.x - 1, keep.y + 1));
    spawnEnemy(state, keep.x - 1, keep.y, { kind: "dwarfBomber" });

    tick(state);

    expect(keep.hp).toBe(keep.maxHp);
  });

  it("doesn't explode if killed on the way", () => {
    const state = createGameWithoutWaves();
    const p = lane(state, 20);
    const wall = sturdy(owned(state, "wall", p.x, p.y + 3));
    const bomber = spawnEnemy(state, p.x, p.y, { kind: "dwarfBomber" });
    tick(state);
    expect(bomber.mode).toBe("sprinting");

    damageEnemy(bomber, bomber.hp, 1);
    run(state, 20);

    expect(wall.hp).toBe(1000);
    expect(state.cues.some((c) => c.kind === "explosion")).toBe(false);
  });

  it("ignores a target it can't reach within 6 tiles", () => {
    const state = createGameWithoutWaves();
    const p = lane(state, 20);
    for (let dx = -8; dx <= 8; dx++) placeStructure(state, "ruin", p.x + dx, p.y + 1);
    owned(state, "wall", p.x, p.y + 3);
    const bomber = spawnEnemy(state, p.x, p.y, { kind: "dwarfBomber" });

    tick(state);

    expect(bomber.mode).toBe("walking");
  });
});

describe("shaman", () => {
  const heal = ENEMY_KINDS.shaman.ability;
  const interval = heal.interval * TICK_RATE;

  /** An enemy that stays put, so distances don't change while the test runs. */
  function still(state: GameState, x: number, y: number, kind: EnemyKindId = "goblin"): Enemy {
    const enemy = spawnEnemy(state, x, y, { kind });
    enemy.speed = 0;
    return enemy;
  }

  it("is the spec's shaman", () => {
    expect(ENEMY_KINDS.shaman).toMatchObject({
      glyph: "s",
      hp: 30,
      speed: 1.2,
      damage: 3,
      bounty: 6,
      threat: 4,
      firstWave: 8,
      behaviour: "healer",
    });
    expect(heal).toMatchObject({ radius: 2.5, amount: 6, interval: 2 });
  });

  it("heals others in range every 2 s, up to max HP, but not itself or anyone out of range", () => {
    const state = createGameWithoutWaves();
    const p = lane(state, 20);
    const shaman = still(state, p.x, p.y, "shaman");
    const near = still(state, p.x + 2, p.y);
    const far = still(state, p.x, p.y + 3);
    shaman.hp -= 10;
    near.hp -= 10;
    far.hp -= 10;

    tick(state);
    expect(near.hp).toBe(near.maxHp - 10 + heal.amount);
    expect(far.hp).toBe(far.maxHp - 10);
    expect(shaman.hp).toBe(shaman.maxHp - 10);

    run(state, interval - 1);
    expect(near.hp).toBe(near.maxHp - 10 + heal.amount);

    tick(state);
    expect(near.hp).toBe(near.maxHp);
  });

  it("shows a heal effect only on enemies it actually healed", () => {
    const state = createGameWithoutWaves();
    const p = lane(state, 20);
    still(state, p.x, p.y, "shaman");
    const hurt = still(state, p.x + 1, p.y);
    still(state, p.x - 1, p.y);
    hurt.hp -= 10;

    tick(state);

    const heals = state.effects.filter((e) => e.kind === "heal");
    expect(heals).toEqual([expect.objectContaining({ x: hurt.x, y: hurt.y })]);
  });
});

/** A wall across the whole map `dx` tiles left of the keep, open only at the top row. */
function barrier(state: GameState, dx: number, hp: number): Structure[] {
  const x = state.keeps[0].x - dx;
  const walls: Structure[] = [];
  for (let y = 1; y < state.height; y++) walls.push(placeStructure(state, "wall", x, y));
  for (const wall of walls) wall.hp = wall.maxHp = hp;
  return walls;
}

describe("battering ram", () => {
  it("is the spec's ram", () => {
    expect(ENEMY_KINDS.batteringRam).toMatchObject({
      glyph: "R",
      hp: 400,
      speed: 0.5,
      damage: 60,
      attackInterval: 2.5,
      bounty: 30,
      threat: 18,
      firstWave: 12,
      profile: "breacher",
      behaviour: "siege",
    });
  });

  it("breaks through a maze wall, hitting for 60 every 2.5 s", () => {
    const state = createGameWithoutWaves();
    const walls = barrier(state, 5, 300);
    const p = lane(state, 6);
    const wall = walls.find((w) => w.y === p.y)!;
    spawnEnemy(state, p.x, p.y, { kind: "batteringRam" });

    tick(state);
    expect(wall.hp).toBe(300 - 60);
    run(state, 2.5 * TICK_RATE - 1);
    expect(wall.hp).toBe(300 - 60);
    tick(state);
    expect(wall.hp).toBe(300 - 120);
  });
});

describe("digger", () => {
  it("is the spec's digger", () => {
    expect(ENEMY_KINDS.digger).toMatchObject({
      glyph: "n",
      hp: 20,
      speed: 1.2,
      damage: 6,
      attackInterval: 1,
      bounty: 4,
      threat: 3,
      firstWave: 9,
      behaviour: "digger",
    });
  });

  it("digs under the nearest wall within 4 tiles, brings it down with its tower, then walks on", () => {
    const state = createGameWithoutWaves();
    const p = lane(state, 30);
    const wall = owned(state, "wall", p.x + 1, p.y + 3);
    const tower = owned(state, "archer", wall.x, wall.y);
    const further = owned(state, "wall", p.x - 2, p.y - 3);
    const digger = spawnEnemy(state, p.x, p.y, { kind: "digger" });
    digger.hp = digger.maxHp = 10_000; // the archer on the wall shoots back

    let dug = false;
    for (let i = 0; i < 600 && state.structures[wall.id]; i++) {
      tick(state);
      if (digger.mode === "digging") {
        dug = true;
        expect(digger.targetId).toBe(wall.id);
        expect(Math.abs(digger.x - wall.x) + Math.abs(digger.y - wall.y)).toBe(1);
      }
    }

    expect(dug).toBe(true);
    expect(state.structures[wall.id]).toBeUndefined();
    expect(state.structures[tower.id]).toBeUndefined();
    expect(state.structures[further.id]).toBeDefined();
    const at = digger.x;
    run(state, 40);
    expect(digger.mode).toBe("walking");
    expect(digger.x).toBeGreaterThan(at);
  });

  it("ignores ruins, and walls further than 4 tiles", () => {
    const state = createGameWithoutWaves();
    const p = lane(state, 30);
    placeStructure(state, "ruin", p.x, p.y + 2);
    owned(state, "wall", p.x, p.y - 5);
    const digger = spawnEnemy(state, p.x, p.y, { kind: "digger" });

    tick(state);

    expect(digger.targetId).toBeNull();
  });

  it("can still be hit by towers and traps while it digs", () => {
    const state = createGameWithoutWaves();
    const p = lane(state, 30);
    const wall = sturdy(owned(state, "wall", p.x, p.y + 2));
    const digger = spawnEnemy(state, p.x, p.y, { kind: "digger" });
    digger.hp = digger.maxHp = 10_000;
    for (let i = 0; i < 100 && digger.mode !== "digging"; i++) tick(state);
    expect(digger.mode).toBe("digging");

    owned(state, "floorSpikes", digger.x, digger.y);
    owned(state, "cannon", digger.x + 2, digger.y);
    run(state, 3 * TICK_RATE);

    expect(digger.hp).toBeLessThan(digger.maxHp);
    expect(digger.mode).toBe("digging");
    expect(wall.hp).toBeLessThan(1000);
  });
});
